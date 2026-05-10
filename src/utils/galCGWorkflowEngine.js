/**
 * GalCG叙事工作流引擎
 * 流程：故事文档 → 故事大纲 → 角色提取 → 角色立绘 → 分批CG计划 → CG生成 → 输出
 */

import { callLLM, recordLlmParseFail, recordLlmParseSuccess } from '@/utils/workflowEngine'
import { generateImage, toDataUrl, downloadImageAsBase64 } from '@/utils/imageApi'
import { saveImage, deleteImage, readImageAsBase64 } from '@/utils/imageStorage'

// ===== 常量 =====
const MAX_CONSECUTIVE_FAILS = 3
const MAX_PLAN_REJECTS = 5
const MAX_PARSE_FAILS = 3
const MAX_IMAGE_ITERATIONS = 10
const CHAR_PARALLEL_SLOTS = 4
const CG_BATCH_SIZE = 10
const MAX_TOTAL_CG = 70

function findCharRef(charRefMap, charName) {
  // 1. 精确匹配
  if (charRefMap[charName]) return charRefMap[charName]

  // 2. 模糊匹配：找包含关系中最短的 key（最精确的匹配）
  const candidates = Object.keys(charRefMap).filter(k =>
    k.includes(charName) || charName.includes(k)
  )
  if (candidates.length === 0) return null
  // 选最短的 key（越短越不容易误匹配其他角色）
  candidates.sort((a, b) => a.length - b.length)
  return charRefMap[candidates[0]]
}

function getStyleText(store) {
  const preset = store.config?.galCGStylePreset || ''
  if (!preset) return ''
  const map = {
    'anime-cel': '日系赛璐珞风格，清晰线条，色块分明，鲜艳配色',
    'anime-soft': '日系柔光风格，柔和光影，淡雅配色，朦胧感',
    'galgame': 'Galgame CG风格，精致角色立绘，细腻光影，视觉小说插画',
    'watercolor': '水彩画风格，柔和笔触，色彩晕染，纸质纹理感',
    'realistic': '半写实风格，真实光影，细腻质感，偏写实的二次元',
    'pixel': '像素风格，复古像素画，低分辨率像素点阵艺术',
  }
  if (preset === 'custom') return store.config?.galCGStyleCustom?.trim() || ''
  return map[preset] || ''
}

// ===== 停止检查 =====
async function checkStopped(store, myWorkflowId) {
  if (store.workflowId !== myWorkflowId) throw new Error('WORKFLOW_STOPPED')
  if (store.status === 'stopped') throw new Error('WORKFLOW_STOPPED')
  if (store.pendingStop) {
    const result = await new Promise(resolve => {
      const interval = setInterval(() => {
        if (store.workflowId !== myWorkflowId) { clearInterval(interval); resolve('stop') }
        else if (store.status === 'stopped') { clearInterval(interval); resolve('stop') }
        else if (!store.pendingStop) { clearInterval(interval); resolve('continue') }
      }, 100)
    })
    if (result === 'stop') throw new Error('WORKFLOW_STOPPED')
  }
}

// ===== 时间检查 =====
const MAX_TOTAL_MINUTES = 72 * 60

async function checkTimeUp(store, myWorkflowId) {
  if (!store.startTime) return false
  const elapsed = Date.now() - store.startTime - (store.pausedDuration || 0)
  const isOver = elapsed >= store.config.timeLimitMinutes * 60 * 1000

  if (!isOver) return false

  if (store.config.timeLimitMinutes >= MAX_TOTAL_MINUTES) {
    store.addTimeline('error', '工作流总时长已超过 48 小时硬上限，自动终止')
    throw new Error('WORKFLOW_STOPPED')
  }

  // 如果页面层已经弹出了超时弹窗，等待它被处理
  if (store.pendingConfirm?.type === 'time-extend') {
    // 等待当前弹窗被用户处理完
    while (store.pendingConfirm?.type === 'time-extend') {
      await new Promise(r => setTimeout(r, 200))
      if (store.workflowId !== myWorkflowId || store.status === 'stopped') throw new Error('WORKFLOW_STOPPED')
    }
    // 弹窗已被处理，重新检查时间是否仍然超限
    const recheckElapsed = Date.now() - store.startTime - (store.pausedDuration || 0)
    if (recheckElapsed < store.config.timeLimitMinutes * 60 * 1000) return false
    // 仍然超限说明用户选了终止
    throw new Error('WORKFLOW_STOPPED')
  }

  store.addTimeline('warn', '已超过设定的时间上限，等待用户决定...')
  const result = await store.requestConfirm('time-extend', {})
  await checkStopped(store, myWorkflowId)

  if (result.action === 'extend') {
    return false
  } else {
    throw new Error('WORKFLOW_STOPPED')
  }
}

// ===== JSON 提取工具 =====
function safeJSONParse(text) {
  // 第一次：直接解析
  try { return JSON.parse(text) } catch {}

  // 第二次：尝试修复字符串值中的非法内容
  try {
    // 找到 JSON 的有效范围
    const firstBrace = text.indexOf('{')
    const lastBrace = text.lastIndexOf('}')
    if (firstBrace === -1 || lastBrace <= firstBrace) return null
    let jsonStr = text.slice(firstBrace, lastBrace + 1)

    // 逐字符状态机修复：追踪是否在字符串内部，修复非法字符
    let fixed = ''
    let inString = false
    let escaped = false

    for (let i = 0; i < jsonStr.length; i++) {
      const ch = jsonStr[i]

      if (escaped) {
        fixed += ch
        escaped = false
        continue
      }

      if (ch === '\\' && inString) {
        escaped = true
        fixed += ch
        continue
      }

      if (ch === '"') {
        if (!inString) {
          inString = true
          fixed += ch
        } else {
          // 判断这个引号是字符串结束还是未转义的内嵌引号
          // 往后看：如果后面紧跟 , 或 } 或 ] 或 : 或空白+这些，就是字符串结束
          const remaining = jsonStr.slice(i + 1).trimStart()
          if (remaining.length === 0 || /^[,\}\]\:]/.test(remaining)) {
            inString = false
            fixed += ch
          } else {
            // 这是字符串内部的未转义引号，加转义
            fixed += '\\"'
          }
        }
        continue
      }

      // 字符串内部的控制字符修复
      if (inString) {
        if (ch === '\n') { fixed += '\\n'; continue }
        if (ch === '\r') { fixed += '\\r'; continue }
        if (ch === '\t') { fixed += '\\t'; continue }
        const code = ch.charCodeAt(0)
        if (code < 0x20) { fixed += ''; continue } // 删除其他控制字符
      }

      fixed += ch
    }

    return JSON.parse(fixed)
  } catch {}

  return null
}

function extractJSON(text, requiredKey) {
  // 第一步：从 markdown 代码块中提取
  const codeBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/g
  let match, lastJson = null
  while ((match = codeBlockRegex.exec(text)) !== null) {
    const parsed = safeJSONParse(match[1].trim())
    if (parsed && parsed[requiredKey]) lastJson = parsed
  }
  if (lastJson) return lastJson

  // 第二步：括号平衡匹配
  const startPattern = new RegExp(`\\{[^{}]*"${requiredKey}"`)
  const startMatch = startPattern.exec(text)
  if (startMatch) {
    const startIdx = startMatch.index
    let depth = 0
    for (let i = startIdx; i < text.length; i++) {
      if (text[i] === '{') depth++
      else if (text[i] === '}') {
        depth--
        if (depth === 0) {
          const parsed = safeJSONParse(text.slice(startIdx, i + 1))
          if (parsed && parsed[requiredKey]) return parsed
          break
        }
      }
    }
  }

  return null
}

// ===== 生图调用（带故障转移） =====
async function callImageModel(store, prompt, referenceImages, myWorkflowId) {
  const queue = store.imageQueue
  while (true) {
    await checkStopped(store, myWorkflowId)
    const model = queue.find(m => !m.isDeprecated)
    if (!model) {
      store.addTimeline('error', '所有生图模型均已停用')
      throw new Error('ALL_IMAGE_MODELS_EXHAUSTED')
    }
    try {
      store.addTimeline('image', `调用生图模型: ${model.modelName} (${model.siteName})`)
      const result = await generateImage({
        baseUrl: model.baseUrl, apiKey: model.apiKey, model: model.modelName,
        prompt, referenceImages, size: store.config.imageSize,
        apiType: model.apiType, customEndpoint: model.endpoint, quality: store.config.imageQuality,
      })
      model.consecutiveFails = 0
      model.successCount++
      return result
    } catch (err) {
      if (store.status === 'stopped' || store.workflowId !== myWorkflowId) throw new Error('WORKFLOW_STOPPED')
      await checkStopped(store, myWorkflowId)
      model.consecutiveFails++
      model.totalFails++
      store.addTimeline('warn', `生图模型 ${model.modelName} 失败 (连续 ${model.consecutiveFails}/${MAX_CONSECUTIVE_FAILS}): ${err.message}`)
      if (model.consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
        model.isDeprecated = true
        store.addTimeline('error', `生图模型 ${model.modelName} 连续失败 ${MAX_CONSECUTIVE_FAILS} 次，已被停用`)
      }
    }
  }
}

// 角色立绘专用（竖图，先尝试2K再fallback）
async function callImageModelPortrait(store, prompt, referenceImages, myWorkflowId) {
  const queue = store.imageQueue
  while (true) {
    await checkStopped(store, myWorkflowId)
    const model = queue.find(m => !m.isDeprecated)
    if (!model) {
      store.addTimeline('error', '所有生图模型均已停用')
      throw new Error('ALL_IMAGE_MODELS_EXHAUSTED')
    }
    try {
      store.addTimeline('image', `调用生图模型(竖图): ${model.modelName} (${model.siteName})`)
      const result = await generateImage({
        baseUrl: model.baseUrl, apiKey: model.apiKey, model: model.modelName,
        prompt, referenceImages, size: '1440x2560',
        apiType: model.apiType, customEndpoint: model.endpoint, quality: store.config.imageQuality,
      })
      model.consecutiveFails = 0
      model.successCount++
      return result
    } catch (firstErr) {
      if (store.status === 'stopped' || store.workflowId !== myWorkflowId) throw new Error('WORKFLOW_STOPPED')
      store.addTimeline('info', '2K竖图请求失败，尝试 auto 尺寸...')
      try {
        const portraitPrompt = prompt + '，竖构图，9:16竖图比例，全身立绘'
        const result = await generateImage({
          baseUrl: model.baseUrl, apiKey: model.apiKey, model: model.modelName,
          prompt: portraitPrompt, referenceImages, size: 'auto',
          apiType: model.apiType, customEndpoint: model.endpoint, quality: store.config.imageQuality,
        })
        model.consecutiveFails = 0
        model.successCount++
        return result
      } catch (secondErr) {
        if (store.status === 'stopped' || store.workflowId !== myWorkflowId) throw new Error('WORKFLOW_STOPPED')
        await checkStopped(store, myWorkflowId)
        model.consecutiveFails++
        model.totalFails++
        store.addTimeline('warn', `生图模型 ${model.modelName} 失败 (连续 ${model.consecutiveFails}/${MAX_CONSECUTIVE_FAILS}): ${secondErr.message}`)
        if (model.consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
          model.isDeprecated = true
          store.addTimeline('error', `生图模型 ${model.modelName} 连续失败 ${MAX_CONSECUTIVE_FAILS} 次，已被停用`)
        }
      }
    }
  }
}

// CG专用横图生图（先尝试2K横图再fallback）
async function callImageModelLandscape(store, prompt, referenceImages, myWorkflowId) {
  const queue = store.imageQueue
  while (true) {
    await checkStopped(store, myWorkflowId)
    const model = queue.find(m => !m.isDeprecated)
    if (!model) {
      store.addTimeline('error', '所有生图模型均已停用')
      throw new Error('ALL_IMAGE_MODELS_EXHAUSTED')
    }
    try {
      store.addTimeline('image', `调用生图模型(2K横图): ${model.modelName} (${model.siteName})`)
      const result = await generateImage({
        baseUrl: model.baseUrl, apiKey: model.apiKey, model: model.modelName,
        prompt, referenceImages, size: '2560x1440',
        apiType: model.apiType, customEndpoint: model.endpoint, quality: store.config.imageQuality,
      })
      model.consecutiveFails = 0
      model.successCount++
      return result
    } catch (firstErr) {
      if (store.status === 'stopped' || store.workflowId !== myWorkflowId) throw new Error('WORKFLOW_STOPPED')
      store.addTimeline('info', '2K横图尺寸请求失败，尝试 auto 尺寸...')
      try {
        const landscapePrompt = prompt + '，横构图，16:9横图比例，二次元风格CG插画'
        const result = await generateImage({
          baseUrl: model.baseUrl, apiKey: model.apiKey, model: model.modelName,
          prompt: landscapePrompt, referenceImages, size: 'auto',
          apiType: model.apiType, customEndpoint: model.endpoint, quality: store.config.imageQuality,
        })
        model.consecutiveFails = 0
        model.successCount++
        return result
      } catch (secondErr) {
        if (store.status === 'stopped' || store.workflowId !== myWorkflowId) throw new Error('WORKFLOW_STOPPED')
        await checkStopped(store, myWorkflowId)
        model.consecutiveFails++
        model.totalFails++
        store.addTimeline('warn', `生图模型 ${model.modelName} 失败 (连续 ${model.consecutiveFails}/${MAX_CONSECUTIVE_FAILS}): ${secondErr.message}`)
        if (model.consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
          model.isDeprecated = true
          store.addTimeline('error', `生图模型 ${model.modelName} 连续失败 ${MAX_CONSECUTIVE_FAILS} 次，已被停用`)
        }
      }
    }
  }
}

// ===== 图片评审 =====
function buildReviewPrompt(scoreThreshold, context) {
  return `你是一位专业的CG插画评审专家。${context}

评分标准（满分100分）：
- 画面质量和清晰度 (20分)
- 与需求描述的匹配程度 (20分)
- 角色特征一致性 (20分)
- 画面是否有局部崩坏 (20分)
- 色彩、光影和整体美感 (20分)

评分 >= ${scoreThreshold} 分视为通过。

请直接给出以下JSON，不要有任何废话：

\`\`\`json
{
  "score": 数字,
  "passed": true或false,
  "comment": "一句话评价",
  "improvedPrompt": "如果不通过，给出改进后的完整提示词；通过则留空"
}
\`\`\``
}

function parseReviewResult(text) {
  // 第一步：从代码块提取
  const codeBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/g
  let match, lastResult = null
  while ((match = codeBlockRegex.exec(text)) !== null) {
    const parsed = safeJSONParse(match[1].trim())
    if (parsed && typeof parsed.score === 'number') lastResult = parsed
  }
  if (lastResult) return lastResult

  // 第二步：括号平衡匹配
  const startPattern = /\{[^{}]*"score"\s*:/
  const startMatch = startPattern.exec(text)
  if (startMatch) {
    const startIdx = startMatch.index
    let depth = 0
    for (let i = startIdx; i < text.length; i++) {
      if (text[i] === '{') depth++
      else if (text[i] === '}') {
        depth--
        if (depth === 0) {
          const parsed = safeJSONParse(text.slice(startIdx, i + 1))
          if (parsed && typeof parsed.score === 'number') return parsed
          break
        }
      }
    }
  }

  return null
}

async function reviewImage(store, imageDataUrl, description, currentPrompt, context, myWorkflowId) {
  const messages = [
    { role: 'system', content: buildReviewPrompt(store.config.scoreThreshold, context) },
    { role: 'user', content: [
      { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
      { type: 'text', text: `需求描述：${description}\n当前提示词：${currentPrompt}\n请评审。` },
    ] },
  ]
  const fullText = await callLLM(store, messages, null, myWorkflowId)
  const result = parseReviewResult(fullText)
  if (!result) return { score: 0, passed: false, comment: '评审解析失败', improvedPrompt: currentPrompt }
  result.passed = result.score >= store.config.scoreThreshold
  if (!result.improvedPrompt) result.improvedPrompt = ''
  if (!result.comment) result.comment = ''
  return result
}

// 多参考图对比评审（CG用）
async function reviewCGWithRefs(store, refDataUrls, imageDataUrl, description, currentPrompt, myWorkflowId) {
  const content = []
  for (const ref of refDataUrls) {
    content.push({ type: 'image_url', image_url: { url: ref, detail: 'high' } })
  }
  content.push({ type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } })
  content.push({ type: 'text', text: `前${refDataUrls.length}张图是角色参考立绘。最后一张是需要评审的CG。\n需求描述：${description}\n当前提示词：${currentPrompt}\n请评审最后一张CG，确保角色与参考图一致。` })

  const messages = [
    { role: 'system', content: buildReviewPrompt(store.config.scoreThreshold, '请评审这张剧情CG，对比角色参考立绘确保角色外貌一致性，同时评估画面质量、剧情表现和对话文字清晰度。') },
    { role: 'user', content },
  ]
  const fullText = await callLLM(store, messages, null, myWorkflowId)
  const result = parseReviewResult(fullText)
  if (!result) return { score: 0, passed: false, comment: '评审解析失败', improvedPrompt: currentPrompt }
  result.passed = result.score >= store.config.scoreThreshold
  if (!result.improvedPrompt) result.improvedPrompt = ''
  if (!result.comment) result.comment = ''
  return result
}

// ===== 审核互斥锁 =====
class ReviewMutex {
  constructor() { this._queue = []; this._locked = false }
  async acquire() {
    if (!this._locked) { this._locked = true; return }
    return new Promise(resolve => this._queue.push(resolve))
  }
  release() {
    if (this._queue.length > 0) { this._queue.shift()() }
    else { this._locked = false }
  }
}

// ===== Canvas 侧边栏渲染 =====

async function renderImageWithSidebar(imageDataUrl, captionText) {
  return new Promise((resolve) => {
    // 30秒超时保护，防止 Image 加载卡死
    const timeout = setTimeout(() => {
      console.warn('renderImageWithSidebar: 渲染超时，返回原图')
      resolve(imageDataUrl)
    }, 30000)

    const img = new Image()
    img.onload = () => {
      clearTimeout(timeout)
      const origW = img.naturalWidth
      const origH = img.naturalHeight
      const sidebarW = Math.round(origW * 0.25)
      const totalW = origW + sidebarW

      const canvas = document.createElement('canvas')
      canvas.width = totalW
      canvas.height = origH
      const ctx = canvas.getContext('2d')

      // 绘制原图
      ctx.drawImage(img, 0, 0, origW, origH)

      // 绘制黑色侧边栏
      ctx.fillStyle = '#000000'
      ctx.fillRect(origW, 0, sidebarW, origH)

      // 文字配置
      const padding = Math.round(sidebarW * 0.08)
      const maxTextW = sidebarW - padding * 2
      let fontSize = Math.max(12, Math.round(origH * 0.025))
      const lineHeightRatio = 1.7
      const fontFamily = '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", sans-serif'

      // 自动换行函数
      function wrapText(text, maxWidth, size) {
        ctx.font = `${size}px ${fontFamily}`
        const lines = []
        const paragraphs = text.split('\n')
        for (const para of paragraphs) {
          if (para.trim() === '') { lines.push(''); continue }
          let currentLine = ''
          for (const char of para) {
            const testLine = currentLine + char
            if (ctx.measureText(testLine).width > maxWidth && currentLine) {
              lines.push(currentLine)
              currentLine = char
            } else {
              currentLine = testLine
            }
          }
          if (currentLine) lines.push(currentLine)
        }
        return lines
      }

      // 自动缩小字号直到能放下
      let lines = wrapText(captionText, maxTextW, fontSize)
      const availableH = origH - padding * 2
      while (lines.length * fontSize * lineHeightRatio > availableH && fontSize > 10) {
        fontSize -= 1
        lines = wrapText(captionText, maxTextW, fontSize)
      }

      // 垂直居中
      const totalTextH = lines.length * fontSize * lineHeightRatio
      const startY = Math.max(padding, (origH - totalTextH) / 2)

      // 绘制白色文字
      ctx.fillStyle = '#ffffff'
      ctx.font = `${fontSize}px ${fontFamily}`
      ctx.textBaseline = 'top'
      for (let i = 0; i < lines.length; i++) {
        const y = startY + i * fontSize * lineHeightRatio
        if (y + fontSize > origH - padding) break
        ctx.fillText(lines[i], origW + padding, y)
      }

      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => { clearTimeout(timeout); resolve(imageDataUrl) }
    img.src = imageDataUrl
  })
}

// ===== 详细配文生成（sidebar模式） =====

function buildDetailedCaptionSystemPrompt(originalText, allCGSpecs) {
  const cgList = allCGSpecs.map(cg => {
    const parts = [`第${cg.index}张「${cg.title}」: ${cg.description}`]
    if (cg.timeOfDay) parts.push(`时间：${cg.timeOfDay}`)
    if (cg.weather) parts.push(`天气：${cg.weather}`)
    if (cg.dialogue) parts.push(`对话：${cg.dialogue}`)
    return parts.join(' | ')
  }).join('\n')

  return `你是一个专业的视觉小说文本编辑师。

以下是故事原文：
${originalText}

以下是按剧情顺序排列的全部CG画面：
${cgList}

你的任务是为每张CG撰写配套的剧情文字，这些文字将显示在CG图片右侧的独立阅读区域中。

要求：
1. 每张CG的剧情文字控制在100-200个中文字之间，绝对不能超过200字
2. 文字应结合故事原文内容，忠实还原对应场景的剧情
3. 可以适当保留关键对话（用「」包裹）
4. 前后CG的剧情文字必须连贯衔接，像阅读一本视觉小说
5. 文字风格应与原文一致，保持叙事节奏
6. 只输出JSON，不要任何额外解释`
}

async function generateDetailedCaptions(store, originalText, allCGSpecs, myWorkflowId) {
  store.addTimeline('llm', '正在为CG生成详细剧情配文...')

  const systemPrompt = buildDetailedCaptionSystemPrompt(originalText, allCGSpecs)
  const allCaptions = []
  let conversationHistory = [{ role: 'system', content: systemPrompt }]
  const CAPTION_BATCH_SIZE = 10

  // 4并发生成配文（每个并发处理一批）
  const CAPTION_CONCURRENCY = 4
  const totalSpecs = allCGSpecs.length
  let batchStart = 1
  const batchQueue = []

  // 构建所有批次任务
  while (batchStart <= totalSpecs) {
    const batchEnd = Math.min(batchStart + CAPTION_BATCH_SIZE - 1, totalSpecs)
    batchQueue.push({ batchStart, batchEnd })
    batchStart = batchEnd + 1
  }

  const batchTaskQueue = [...batchQueue]

  async function captionWorker() {
    while (batchTaskQueue.length > 0) {
      await checkStopped(store, myWorkflowId)
      const batch = batchTaskQueue.shift()
      if (!batch) break

      const { batchStart: bs, batchEnd: be } = batch
      const userMsg = `请为第${bs}~${be}张CG生成配套剧情文字，确保与整体故事连贯。\n\n\`\`\`json\n{\n  "captions": [\n    { "index": ${bs}, "caption": "剧情文字（100-200字）" }\n  ]\n}\n\`\`\``

      const messages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }]

      let parsed = null
      let consecutiveFails = 0

      while (!parsed) {
        await checkStopped(store, myWorkflowId)
        try {
          const fullText = await callLLM(store, messages, null, myWorkflowId)
          const data = extractJSON(fullText, 'captions')
          if (data?.captions?.length > 0) {
            parsed = data.captions
            recordLlmParseSuccess(store)
            break
          }
          consecutiveFails++
          recordLlmParseFail(store)
          store.addTimeline('warn', `配文批次(${bs}~${be})解析失败 (连续 ${consecutiveFails}/3)`)
        } catch (err) {
          if (err.message === 'WORKFLOW_STOPPED' || err.message === 'ALL_LLM_MODELS_EXHAUSTED') throw err
          consecutiveFails++
          store.addTimeline('warn', `配文生成出错 (连续 ${consecutiveFails}/3): ${err.message}`)
        }

        if (consecutiveFails >= 3) {
          store.addTimeline('error', `配文批次(${bs}~${be})连续失败 ${consecutiveFails} 次，等待用户决定`)
          const pauseResult = await store.requestConfirm('plan-pause', {
            reason: 'parse-failed',
            message: `AI 已连续 ${consecutiveFails} 次未能为第${bs}~${be}张CG生成有效配文。可以选择继续尝试或终止（终止后将跳过此批配文）。`,
            count: consecutiveFails,
          })
          await checkStopped(store, myWorkflowId)
          if (pauseResult.abort) {
            store.addTimeline('warn', `跳过第${bs}~${be}张配文`)
            break
          }
          consecutiveFails = 0
        }
      }

      if (parsed) {
        allCaptions.push(...parsed)
        store.addTimeline('info', `已生成第${bs}~${be}张CG的配文`)
      }
    }
  }

  const numWorkers = Math.min(CAPTION_CONCURRENCY, batchQueue.length)
  const workers = []
  for (let i = 0; i < numWorkers; i++) workers.push(captionWorker())
  try {
    await Promise.all(workers)
  } catch (err) {
    if (err.message === 'WORKFLOW_STOPPED' || err.message === 'ALL_LLM_MODELS_EXHAUSTED') throw err
    store.addTimeline('warn', `配文生成异常: ${err.message}`)
  }
  await checkStopped(store, myWorkflowId)

  if (allCaptions.length > 0) {
    store.addTimeline('success', `已为 ${allCaptions.length}/${allCGSpecs.length} 张CG生成详细配文`)
  } else {
    store.addTimeline('warn', '详细配文全部生成失败，将跳过配文环节')
  }
  return allCaptions.length > 0 ? allCaptions : null
}

// ===== LLM 阶段1：故事大纲压缩 =====

function buildOutlineSystemPrompt() {
  return `你是一个专业的故事编辑，擅长提炼故事精华。

请将用户提供的故事/文档压缩为一份精炼的故事大纲，要求：
1. 必须保留所有重要情节、转折点、角色互动和情感变化，不能丢失任何关键剧情
2. 保留重要的对话内容（至少保留核心对话的大意）
3. 保持故事的连贯性和因果关系，按照故事的时间线或章节顺序组织大纲
4. 大纲字数要求：1000字~3000字之间。如果原文较短（低于3000字），大纲可以接近原文长度。如果原文较长，请尽量写满2000字以上，宁可多写也不要遗漏重要情节
5. 生成一个简短的故事标题
6. 不要添加原文没有的内容

重要提醒：
- 大纲绝对不能低于800字！这是硬性要求
- 每个重要场景都应该有2-3句话的描述，而不是一笔带过
- 关键对话至少要保留大意

请直接输出以下JSON，不要任何废话，并且确保返回的json是可以被解析的完整格式：

\`\`\`json
{
  "title": "故事标题",
  "outline": "完整的故事大纲文本（3000字以内，1000字以上，不能太短）",
  "totalChapters": 故事大致可分为几个章节/段落（数字）
}
\`\`\``
}

async function generateOutline(store, feedback, previousText, myWorkflowId) {
  store.planningText = ''

  const docText = store.config.galCGDocumentText || store.config.initialPrompt
  const messages = [{ role: 'system', content: buildOutlineSystemPrompt() }]

  if (feedback && previousText) {
    messages.push({ role: 'user', content: docText })
    messages.push({ role: 'assistant', content: previousText })
    messages.push({ role: 'user', content: `我对上面的大纲不满意，请根据以下意见修改：\n${feedback}` })
  } else {
    let userMsg = docText
    if (store.config.initialPrompt && store.config.galCGDocumentText && store.config.initialPrompt.trim()) {
      userMsg = `${store.config.galCGDocumentText}\n\n【用户补充说明】${store.config.initialPrompt}`
    }
    messages.push({ role: 'user', content: userMsg })
  }

  const fullText = await callLLM(store, messages, t => { store.planningText = t }, myWorkflowId)
  store.planningText = fullText

  const data = extractJSON(fullText, 'title')
  if (!data || !data.outline) {
    store.addTimeline('warn', '未能解析故事大纲')
    recordLlmParseFail(store)
    throw new Error('PLAN_PARSE_FAILED')
  }
  // 如果大纲过短，要求重新生成
  if (data.outline.length < 600) {
    store.addTimeline('warn', `大纲仅 ${data.outline.length} 字，过于简短，将要求AI重新生成更详细的版本`)
    recordLlmParseFail(store)
    throw new Error('PLAN_PARSE_FAILED')
  }
  recordLlmParseSuccess(store)
  store.addTimeline('info', `故事大纲已生成：「${data.title}」(${data.outline.length}字)`)
  return { fullText, data }
}

// ===== LLM 阶段2：角色提取 =====

function buildCharacterExtractPrompt(outline, presetCharacters) {
  let presetInfo = ''
  if (presetCharacters && presetCharacters.length > 0) {
    const presetNames = presetCharacters.map(c => `「${c.name}」`).join('、')
    presetInfo = `

【重要】用户已预设以下角色：${presetNames}
这些角色已有参考图（将在用户消息中提供）和名称，对于这些角色：
- 必须使用用户提供的名字，不要修改
- portraitPrompt 填空字符串即可（因为已有参考图）
- 只需要结合参考图和故事大纲内容生成 appearance、role、appearanceKeywords
- 如果某个预设角色在故事大纲中完全没有出现，请直接忽略该角色，不要输出

你仍然需要从故事中提取其他未被预设的主要角色（完整输出所有字段，包括 portraitPrompt）。`
  }

  return `你是一个专业的角色分析师。

以下是故事大纲：
${outline}

请从大纲中提取所有主要角色（出场次数多、对剧情有重要影响的角色），为每个角色生成：
1. 角色名
2. 外貌描述：如果原文中明确描述了角色外貌（发色、发型、瞳色、体型、标志性服装等），请如实提取；**如果原文中没有给出该角色的外貌信息，appearance 字段必须留空字符串""，绝对不允许自行编造外貌特征**
3. 角色在故事中的身份/角色定位
4. 一句话的外貌关键词摘要（用于参考图提示词），原文无外貌描述时留空字符串""

【重要规则】
- 你必须严格区分"原文明确描述的外貌"和"你自己推测/编造的外貌"
- 如果原文只提到角色名字和身份，但完全没有描述长相、发色、服装等，appearance 和 appearanceKeywords 必须为空字符串""
- 宁可留空，也不要编造任何原文中不存在的外貌信息
- portraitPrompt 也是一样，如果 appearance 为空，portraitPrompt 也必须为空字符串""

注意：只提取主要角色，路人和仅出场一次的次要角色不需要提取。${presetInfo}

请仅仅输出以下格式的JSON，不要无关的废话，并且确保返回的json是可以被解析的完整格式：

\`\`\`json
{
  "characters": [
    {
      "index": 1,
      "name": "角色名",
      "appearance": "详细的外貌描述",
      "role": "角色定位/身份",
      "appearanceKeywords": "外貌关键词摘要（尽量简短，用于提示词）",
      "portraitPrompt": "用于生成该角色正面全身立绘的完整中文提示词（包含外貌、服装、正面站姿、纯色背景、画风），预设角色填空字符串"
    }
  ]
}
\`\`\``
}

function buildCharListUserMessage(presetCharacters) {
  if (!presetCharacters || presetCharacters.length === 0) {
    return { role: 'user', content: '请提取故事中的主要角色。' }
  }

  const content = []
  for (const ch of presetCharacters) {
    if (ch.dataUrl) {
      content.push({ type: 'image_url', image_url: { url: ch.dataUrl, detail: 'high' } })
      content.push({ type: 'text', text: `上面这张图是预设角色「${ch.name}」的参考图。` })
    }
  }
  content.push({ type: 'text', text: '请结合以上预设角色的参考图和故事大纲，提取所有主要角色。' })
  return { role: 'user', content }
}

async function generateCharacterList(store, outline, presetCharacters, feedback, previousText, myWorkflowId) {
  store.planningText = ''
  const messages = [{ role: 'system', content: buildCharacterExtractPrompt(outline, presetCharacters) }]

  if (feedback && previousText) {
    messages.push(buildCharListUserMessage(presetCharacters))
    messages.push({ role: 'assistant', content: previousText })
    messages.push({ role: 'user', content: `我对上面的角色清单不满意，请根据以下意见修改：\n${feedback}` })
  } else {
    messages.push(buildCharListUserMessage(presetCharacters))
  }

  const fullText = await callLLM(store, messages, t => { store.planningText = t }, myWorkflowId)
  store.planningText = fullText

  const data = extractJSON(fullText, 'characters')
  if (!data || !data.characters || data.characters.length === 0) {
    store.addTimeline('warn', '未能解析角色清单')
    recordLlmParseFail(store)
    throw new Error('PLAN_PARSE_FAILED')
  }
  recordLlmParseSuccess(store)
  store.addTimeline('info', `角色清单已生成：共 ${data.characters.length} 个角色`)
  return { fullText, data }
}

// ===== 角色处理辅助函数（新迭代流程用） =====

async function generateAppearanceFromRef(store, char, outline, myWorkflowId) {
  const messages = [
    { role: 'system', content: `你是一个专业的二次元角色外貌分析师。请观察用户提供的角色参考图，结合故事大纲中对该角色的描述，生成一段详细的外貌描述。

故事大纲：
${outline}

角色名：${char.name}
角色定位：${char.role || '未知'}

要求：
1. 仔细观察参考图中角色的发色、发型、瞳色、体型、服装、配饰等特征
2. 结合故事大纲中对该角色的描述（如果有的话）
3. 输出一段完整的外貌描述，包含所有视觉特征，但是不能字太多，要求精炼（100中文字以内）
4. 只输出外貌描述文本，不要任何额外解释` },
    { role: 'user', content: [
      { type: 'image_url', image_url: { url: char.refDataUrl, detail: 'high' } },
      { type: 'text', text: `请为角色「${char.name}」生成详细的外貌描述。` },
    ] },
  ]
  const result = await callLLM(store, messages, null, myWorkflowId)
  return result.trim()
}

async function generateAppearanceForced(store, charName, charRole, outline, myWorkflowId) {
  const messages = [
    { role: 'system', content: `你是一个专业的二次元角色设定师。故事原文中没有给出角色的详细外貌描述，请你根据角色名称、身份和故事背景，合理推测并生成一段角色外貌描述。

故事大纲：
${outline}

要求：
1. 外貌描述要包含发色、发型、瞳色、体型、服装等
2. 要符合故事的世界观和角色身份
3. 只输出外貌描述文本，不要任何额外解释` },
    { role: 'user', content: `角色名：${charName}\n角色身份：${charRole || '未知'}\n\n请为这个角色生成一段合理的外貌描述。` },
  ]
  const result = await callLLM(store, messages, null, myWorkflowId)
  return result.trim()
}

async function generateCharPortraitSingle(store, char, myWorkflowId) {
  const styleText = getStyleText(store)
  const prompt = `${char.appearance}，${char.name}，正面全身站姿，纯色背景，${styleText ? styleText + '风格角色立绘' : '高质量二次元角色立绘'}`
  // 不传参考图（用户要求：有参考图也不发给生图AI）
  const result = await callImageModelPortrait(store, prompt, null, myWorkflowId)

  if (result?.data) {
    for (const item of result.data) {
      if (item.b64_json) return toDataUrl(item.b64_json)
      if (item.url) {
        try { return await downloadImageAsBase64(item.url) } catch { continue }
      }
    }
  }
  return null
}

// ===== LLM 阶段3：分批生成CG计划 =====

function buildCGPlanPrompt(store, outline, characters, batchStart, batchSize, totalPlanned, isFirst, timeLimitMinutes) {
  const charDesc = characters.map(c => `- ${c.name}: ${c.appearanceKeywords}`).join('\n')

  const pureCGMode = store?.config?.galCGPureCGMode || false

  const styleText = getStyleText(store)

  const dialogueJsonField = pureCGMode
    ? `      "dialogue": "",`
    : `      "dialogue": "该CG中的对话文本内容（必须是中文！不能带有任何日文等其他文字！！）",`

  const dialogueJsonPromptHint = pureCGMode
    ? `"prompt": "完整的中文生图提示词（包含角色外貌、场景、时间光影、天气氛围、画风、对AI禁止复制参考图的限制，以及【画面中不得出现任何文字、对话框、气泡框、字幕】）"`
    : `"prompt": "完整的中文生图提示词（包含角色外貌、场景、时间光影、天气氛围、气泡式对话框文字、画风以及对AI禁止复制参考图的限制）"`

  if (isFirst) {
    const dialogueRequirement = pureCGMode
      ? `注意：用户要求生成纯画面CG，画面中【绝对不要】包含任何对话框、气泡框、文字、字幕、旁白文本。只保留纯粹的视觉画面。`
      : `2. 包含对话框和对话文字（直接写在提示词中让AI渲染,例如：人物旁边有一个气泡式对话框，里面写着"这可不行"，一张图只有一个气泡对话框！）`

    const dialoguePromptRule = pureCGMode
      ? `- 提示词末尾必须强调"画面中不得出现任何文字、对话框、气泡框、字幕"`
      : `- 提示词中必须包含对话框内容（建议使用气泡式对话框），格式示例："画面中有一个气泡式对话框，文字内容为'你好啊'"`

    return `你是一个专业的二次元CG策划师。

故事大纲：
${outline}

出场角色：
${charDesc}

请根据故事大纲，策划一系列连贯的剧情CG。每张CG需要：
1. 展现一个具体的剧情场景
${dialogueRequirement}
3. 指定该CG中出场的角色（用于传递参考图）
4. 保持前后CG的剧情连贯性
5. 【重要】为每张CG明确标注当前的时间段和天气状况

要求：
- 用户设定的总任务时限为 ${timeLimitMinutes >= 60 ? Math.floor(timeLimitMinutes / 60) + '小时' + (timeLimitMinutes % 60 > 0 ? timeLimitMinutes % 60 + '分钟' : '') : timeLimitMinutes + '分钟'}，每张CG可能需要几轮迭代，请根据时限合理规划CG数量（最多${MAX_TOTAL_CG}张，时间较短时应减少数量）
- 提示词中必须包含角色的外貌关键词
- 【非常非常非常重要】characters 数组中的角色名必须与上方"出场角色"列表中的名字完全一致，不要简化、缩写或修改角色名，例如角色叫"Tia (暮雪)"就必须写"Tia (暮雪)"而不是"Tia"
${dialoguePromptRule}
- 提示词要描述场景、角色动作、表情、光影氛围${styleText ? `，统一使用以下画风：${styleText}` : '并限制为二次元风格'}
- 提示词的末尾一定要限制生图模型严禁直接复制参考图，严禁角色动作/整体构图和参考图一致
- 【时间与天气连贯性规则】：
  · 每张CG必须指定 timeOfDay（如：清晨、上午、中午、下午、傍晚、夜晚、深夜）和 weather（如：晴天、多云、阴天、小雨、大雨、雷暴、雪、雾）
  · 相邻CG之间的时间自然推进，不允许无理由跳跃（例如不能从上午直接跳到深夜，除非剧情中间有明确的时间过渡需求）
  · 天气变化也要合理过渡（例如晴天不能突然变暴雨，应经历多云→阴天→小雨的渐变，除非剧情需要突变天气作为转折）
  · 如果剧情跨越较长时间，可以用"几天后""翌日清晨"等方式衔接，但需要在 description 中交代
  · 提示词中必须包含对应的时间光影描述（如清晨的柔和金色光线、夜晚的月光等）和天气氛围描述（如雨滴、乌云、阳光等）

请先输出前 ${batchSize} 张CG的计划（第${batchStart}~${batchStart + batchSize - 1}张），直接输出以下JSON格式，严禁任何形式的废话，并且确保返回的json是可以被解析的完整格式：

\`\`\`json
{
  "totalPlanned": 计划总CG数量(数字),
  "batch": [
    {
      "index": ${batchStart},
      "title": "CG标题/场景名",
      "timeOfDay": "时间段（如：清晨、上午、傍晚、夜晚等）",
      "weather": "天气状况（如：晴天、多云、小雨等）",
${dialogueJsonField}
      "characters": ["出场角色名1", "出场角色名2"],
      "description": "画面描述（含时间天气交代）",
      ${dialogueJsonPromptHint}
    }
  ]
}
\`\`\``
  } else {
    return `请继续输出第 ${batchStart} ~ ${batchStart + batchSize - 1} 张CG的计划（总计划 ${totalPlanned} 张），保持与前面已计划内容的剧情连贯性。

【重要提醒】时间和天气必须与上一张CG自然衔接，不允许无理由跳跃。如需时间推进，请在 description 中交代。${pureCGMode ? '\n【重要提醒】画面中【绝对不要】包含任何对话框、气泡框、文字、字幕。' : ''}

请直接给出以下JSON，不要有任何废话：

\`\`\`json
{
  "batch": [
    {
      "index": ${batchStart},
      "title": "CG标题/场景名",
      "timeOfDay": "时间段",
      "weather": "天气状况",
${dialogueJsonField}
      "characters": ["出场角色名1", "出场角色名2"],
      "description": "画面描述（含时间天气交代）",
      ${dialogueJsonPromptHint}
    }
  ]
}
\`\`\``
  }
}

// ===== CG剧情衔接旁白生成 =====

function buildNarrationPrompt(outline, allCGSpecs) {
  const cgSummary = allCGSpecs.map(cg => {
    const parts = [`第${cg.index}张「${cg.title}」: ${cg.description}`]
    if (cg.timeOfDay) parts.push(`时间：${cg.timeOfDay}`)
    if (cg.weather) parts.push(`天气：${cg.weather}`)
    if (cg.dialogue) parts.push(`对话：${cg.dialogue}`)
    return parts.join(' | ')
  }).join('\n')

  return `你是一个专业的二次元视觉小说旁白撰写师。你的任务是为一系列按剧情顺序排列的CG画面撰写旁白文字，用于增强前后CG之间的剧情连贯性。

故事大纲：
${outline}

全部CG画面（按剧情顺序）：
${cgSummary}

要求：
1. 为每张CG配上1-2句旁白，起到剧情衔接的作用，旁白可以直白一点，不能晦涩难懂。
2. 旁白主要应描述场景转换/情节过渡
3. 旁白是叙述性文字（类似视觉小说中的旁白/独白），不是角色对话
4. 每段旁白控制在20-60个中文字之间
5. 特别注意相邻CG之间的过渡要自然流畅，不能有突兀跳跃感，因此旁边主要解释情节过渡
6. 只输出以下格式的JSON，不要任何额外解释和废话！

\`\`\`json
{
  "narrations": [
    { "index": 1, "narration": "旁白文字" },
    { "index": 2, "narration": "旁白文字" }
  ]
}
\`\`\``
}

async function generateNarrations(store, outline, allCGSpecs, myWorkflowId) {
  store.addTimeline('llm', '正在为CG生成剧情衔接旁白...')

  const messages = [
    { role: 'system', content: buildNarrationPrompt(outline, allCGSpecs) },
    { role: 'user', content: '请为每张CG生成剧情衔接旁白，只输出JSON，不要多余解释。' },
  ]

  let consecutiveFails = 0

  while (true) {
    await checkStopped(store, myWorkflowId)
    try {
      const fullText = await callLLM(store, messages, null, myWorkflowId)
      const data = extractJSON(fullText, 'narrations')
      if (data?.narrations?.length > 0) {
        recordLlmParseSuccess(store)
        store.addTimeline('success', `已为 ${data.narrations.length} 张CG生成剧情衔接旁白`)
        return data.narrations
      }
      consecutiveFails++
      recordLlmParseFail(store)
      store.addTimeline('warn', `旁白解析失败 (连续 ${consecutiveFails}/3)`)
    } catch (err) {
      if (err.message === 'WORKFLOW_STOPPED' || err.message === 'ALL_LLM_MODELS_EXHAUSTED') throw err
      consecutiveFails++
      store.addTimeline('warn', `旁白生成出错 (连续 ${consecutiveFails}/3): ${err.message}`)
    }

    if (consecutiveFails >= 3) {
      store.addTimeline('error', `旁白生成连续失败 ${consecutiveFails} 次，等待用户决定`)
      const pauseResult = await store.requestConfirm('plan-pause', {
        reason: 'parse-failed',
        message: `AI 已连续 ${consecutiveFails} 次未能生成有效的剧情衔接旁白。可以选择继续尝试或终止（终止后将跳过旁白环节，直接开始生图）。`,
        count: consecutiveFails,
      })
      await checkStopped(store, myWorkflowId)
      if (pauseResult.abort) {
        store.addTimeline('warn', '用户选择跳过旁白环节，直接开始生图')
        return null
      }
      consecutiveFails = 0
      store.addTimeline('info', '用户选择继续尝试生成旁白')
    }
  }
}

async function generateCGPlanBatch(store, outline, characters, batchStart, batchSize, totalPlanned, conversationHistory, myWorkflowId) {
  store.planningText = ''
  const isFirst = batchStart === 1 && conversationHistory.length === 0

  const systemPrompt = buildCGPlanPrompt(store, outline, characters, batchStart, batchSize, totalPlanned, isFirst, store.config.timeLimitMinutes)

  let messages = []
  if (isFirst) {
    messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: '请开始策划CG计划。' },
    ]
  } else {
    // 携带上下文
    messages = [
      ...conversationHistory,
      { role: 'user', content: systemPrompt },
    ]
  }

  const fullText = await callLLM(store, messages, t => { store.planningText = t }, myWorkflowId)
  store.planningText = fullText

  // 解析
  const data = extractJSON(fullText, 'batch')
  if (!data || !data.batch || data.batch.length === 0) {
    store.addTimeline('warn', `CG计划批次(${batchStart}~)解析失败`)
    recordLlmParseFail(store)
    throw new Error('PLAN_PARSE_FAILED')
  }

  // 第一批需要获取 totalPlanned
  let total = totalPlanned
  if (isFirst && data.totalPlanned) {
    total = Math.min(data.totalPlanned, MAX_TOTAL_CG)
  }
  recordLlmParseSuccess(store)
  store.addTimeline('info', `CG计划批次已生成：第${batchStart}~${batchStart + data.batch.length - 1}张`)

  // 更新对话历史
  const newHistory = [
    ...messages,
    { role: 'assistant', content: fullText },
  ]

  return { fullText, batch: data.batch, totalPlanned: total, conversationHistory: newHistory }
}

// ===== 单张CG生成处理 =====

async function processOneCG(store, cgSpec, progressIndex, charRefMap, storyTitle, confirmMode, myWorkflowId) {
  const progress = store.imageProgress[progressIndex]
  progress.status = 'generating'
  let currentPrompt = cgSpec.prompt
  let attempt = 0
  let maxAttempts = MAX_IMAGE_ITERATIONS
  let bestRelPath = null
  let bestScore = -1

  const needUserConfirm = (confirmMode === 'confirm-all' || confirmMode === 'confirm-image')

  // 构建参考图列表 + 提示词前缀（模糊匹配角色名）
  const refImages = []
  const refDescParts = []
  for (const charName of (cgSpec.characters || [])) {
    const ref = findCharRef(charRefMap, charName)
    if (ref?.dataUrl) {
      refImages.push({ dataUrl: ref.dataUrl })
      refDescParts.push(`${ref.keywords || charName}的是${charName}`)
    }
  }

  // 在提示词开头拼接时间天气信息和角色参考说明
  const pureCGMode = store.config?.galCGPureCGMode || false
  const styleText = getStyleText(store)
  let promptPrefix = '【画面要求】' + (styleText ? `${styleText}风格CG插画` : '必须是二次元风格CG插画(包括场景风格)') + '，16:9横构图，电影级宽幅画面。' + (pureCGMode ? '画面中不得出现任何文字、对话框、气泡框、字幕、旁白。' : '') + '\n'
  if (cgSpec.timeOfDay || cgSpec.weather) {
    const timePart = cgSpec.timeOfDay ? `时间：${cgSpec.timeOfDay}` : ''
    const weatherPart = cgSpec.weather ? `天气：${cgSpec.weather}` : ''
    promptPrefix += `【场景环境】${[timePart, weatherPart].filter(Boolean).join('，')}。请确保画面光影和氛围与此时间天气一致。\n`
  }
  if (refDescParts.length > 0) {
    promptPrefix += `参考图中，${refDescParts.join('，')}。\n`
  }
  if (promptPrefix) {
    currentPrompt = promptPrefix + currentPrompt
  }

  // 注入旁白文本框指令（纯CG模式下跳过）
  if (cgSpec.narration && !pureCGMode) {
    currentPrompt += `\n最后在这张图的左上角或右上角（禁止遮挡人物）生成一个方形的白底黑字文本框，里面写着标准的中文："${cgSpec.narration}"。`
  }

  const refDataUrls = refImages.map(r => r.dataUrl)

  while (attempt < maxAttempts) {
    await checkStopped(store, myWorkflowId)
    if (await checkTimeUp(store, myWorkflowId)) {
      progress.status = 'timeout'
      store.addTimeline('warn', `时间耗尽，CG #${cgSpec.index} 未完成`)
      return null
    }

    attempt++
    progress.currentPrompt = currentPrompt
    progress.currentAttempt = attempt
    store.addTimeline('image', `CG #${cgSpec.index} 第 ${attempt} 轮生成 (并发 ${store.config.concurrency})`)

    // 并发生成
    const promises = []
    for (let c = 0; c < store.config.concurrency; c++) {
      promises.push(
        callImageModelLandscape(store, currentPrompt, refImages.length > 0 ? refImages : null, myWorkflowId).catch(err => {
          if (err.message === 'WORKFLOW_STOPPED' || err.message === 'ALL_IMAGE_MODELS_EXHAUSTED') throw err
          return null
        })
      )
    }

    let results
    try { results = await Promise.all(promises) }
    catch (err) {
      if (store.status === 'stopped' || store.workflowId !== myWorkflowId) throw new Error('WORKFLOW_STOPPED')
      throw err
    }
    await checkStopped(store, myWorkflowId)

    const candidates = []
    for (const result of results) {
      if (!result || !result.data) continue
      for (const item of result.data) {
        let dataUrl = ''
        if (item.b64_json) dataUrl = toDataUrl(item.b64_json)
        else if (item.url) try { dataUrl = await downloadImageAsBase64(item.url) } catch { continue }
        if (dataUrl) candidates.push({ dataUrl })
      }
    }

    if (candidates.length === 0) {
      store.addTimeline('warn', `CG #${cgSpec.index} 第 ${attempt} 轮未生成有效图片`)
      continue
    }

    progress.status = 'reviewing'
    let passedImage = null
    let lastReview = null

    if (needUserConfirm) {
      const enableAiReview = store.config.enableAiReview !== false
      let reviewedCandidates = []
      let bestReviewIdx = null

      if (enableAiReview) {
        store.addTimeline('llm', `并发评审 CG #${cgSpec.index} ${candidates.length} 张候选图...`)

        const reviewPromises = candidates.map(async (candidate, gi) => {
          await checkStopped(store, myWorkflowId)
          try {
            const review = refDataUrls.length > 0
              ? await reviewCGWithRefs(store, refDataUrls, candidate.dataUrl, cgSpec.description, currentPrompt, myWorkflowId)
              : await reviewImage(store, candidate.dataUrl, cgSpec.description, currentPrompt, '请评审这张剧情CG的画面质量和剧情表现。', myWorkflowId)
            await checkStopped(store, myWorkflowId)
            return { gi, review }
          } catch (err) {
            if (err.message === 'WORKFLOW_STOPPED' || err.message === 'ALL_LLM_MODELS_EXHAUSTED') throw err
            if (store.status === 'stopped' || store.workflowId !== myWorkflowId) throw new Error('WORKFLOW_STOPPED')
            return { gi, review: { score: 0, passed: false, comment: '评审失败: ' + err.message, improvedPrompt: '' } }
          }
        })

        let reviewResults
        try { reviewResults = await Promise.all(reviewPromises) }
        catch (err) { if (store.status === 'stopped' || store.workflowId !== myWorkflowId) throw new Error('WORKFLOW_STOPPED'); throw err }
        await checkStopped(store, myWorkflowId)

        for (const { gi, review } of reviewResults) {
          if (review.score > bestScore) {
            if (bestRelPath) deleteImage(bestRelPath).catch(() => {})
            try { const saved = await saveImage(candidates[gi].dataUrl, 'workflow'); bestRelPath = saved.relPath; bestScore = review.score } catch {}
          }
          reviewedCandidates.push({ dataUrl: candidates[gi].dataUrl, score: review.score, comment: review.comment, passed: review.passed, improvedPrompt: review.improvedPrompt || '' })
          store.addTimeline(review.passed ? 'success' : 'info', `CG #${cgSpec.index} 候选图 ${gi + 1}: ${review.score}分 - ${review.comment}`)
        }
        bestReviewIdx = reviewedCandidates.reduce((best, c, i) => c.score > reviewedCandidates[best].score ? i : best, 0)
      } else {
        reviewedCandidates = candidates.map(c => ({ dataUrl: c.dataUrl, score: null, comment: '', passed: false, improvedPrompt: '' }))
      }

      await checkStopped(store, myWorkflowId)

      // 详细配文模式：在展示给用户之前，渲染侧边栏到所有候选图上
      if (cgSpec.detailedCaption) {
        store.addTimeline('info', `为 CG #${cgSpec.index} 候选图渲染剧情配文...`)
        for (let i = 0; i < candidates.length; i++) {
          candidates[i].dataUrl = await renderImageWithSidebar(candidates[i].dataUrl, cgSpec.detailedCaption)
        }
        for (let i = 0; i < reviewedCandidates.length; i++) {
          reviewedCandidates[i].dataUrl = candidates[i].dataUrl
        }
      }

      progress.status = 'waiting-confirm'

      if (store.status === 'stopped' || store.workflowId !== myWorkflowId) throw new Error('WORKFLOW_STOPPED')

      const confirmResult = await store.requestConfirm('batch-image-review', {
        imageSpec: { index: cgSpec.index, title: cgSpec.title },
        candidates: reviewedCandidates, attempt,
        totalRequested: store.config.concurrency, failedCount: results.filter(r => r === null).length,
        recommendedIndex: bestReviewIdx
      })

      await checkStopped(store, myWorkflowId)

      if (confirmResult.approved && confirmResult.selectedIndices?.length > 0) {
        passedImage = candidates[confirmResult.selectedIndices[0]]
        lastReview = { score: reviewedCandidates[confirmResult.selectedIndices[0]]?.score, passed: true, improvedPrompt: '' }
      } else {
        const feedback = confirmResult.feedback || ''
        if (enableAiReview && bestReviewIdx !== null) {
          const best = reviewedCandidates[bestReviewIdx]
          let fp = best.improvedPrompt || currentPrompt
          if (feedback) {
            try {
              const merged = await callLLM(store, [
                { role: 'system', content: '你是AI提示词优化专家。融合AI建议和用户意见生成新提示词，只输出提示词。' },
                { role: 'user', content: `当前：\n${fp}\nAI建议：${best.comment}\n用户意见：${feedback}\n请输出新提示词：` }
              ], null, myWorkflowId)
              if (merged?.trim()) fp = merged.trim()
            } catch (err) { if (err.message === 'WORKFLOW_STOPPED') throw err }
          }
          lastReview = { score: best.score, passed: false, improvedPrompt: fp }
        } else {
          let np = ''
          if (feedback) {
            try {
              const merged = await callLLM(store, [
                { role: 'system', content: '你是AI提示词优化专家。融合用户意见生成新提示词，只输出提示词。' },
                { role: 'user', content: `原始提示词：\n${currentPrompt}\n用户意见：\n${feedback}\n请输出新提示词：` }
              ], null, myWorkflowId)
              if (merged?.trim()) np = merged.trim()
            } catch (err) { if (err.message === 'WORKFLOW_STOPPED') throw err }
          }
          lastReview = { score: null, passed: false, improvedPrompt: np }
        }
      }
    } else {
      // 纯AI / 仅确认非图片：并发评审选最高分
      store.addTimeline('llm', `并发评审 CG #${cgSpec.index} (${candidates.length} 张)...`)

      const reviewPromises = candidates.map(async (candidate, gi) => {
        await checkStopped(store, myWorkflowId)
        try {
          const review = refDataUrls.length > 0
            ? await reviewCGWithRefs(store, refDataUrls, candidate.dataUrl, cgSpec.description, currentPrompt, myWorkflowId)
            : await reviewImage(store, candidate.dataUrl, cgSpec.description, currentPrompt, '请评审这张剧情CG。', myWorkflowId)
          await checkStopped(store, myWorkflowId)
          return { gi, review }
        } catch (err) {
          if (err.message === 'WORKFLOW_STOPPED' || err.message === 'ALL_LLM_MODELS_EXHAUSTED') throw err
          if (store.status === 'stopped' || store.workflowId !== myWorkflowId) throw new Error('WORKFLOW_STOPPED')
          return { gi, review: { score: 0, passed: false, comment: '评审失败: ' + err.message, improvedPrompt: '' } }
        }
      })

      let reviewResults
      try { reviewResults = await Promise.all(reviewPromises) }
      catch (err) { if (store.status === 'stopped' || store.workflowId !== myWorkflowId) throw new Error('WORKFLOW_STOPPED'); throw err }
      await checkStopped(store, myWorkflowId)

      let bestPassedIdx = -1
      let bestPassedScore = -1

      for (const { gi, review } of reviewResults) {
        if (review.score > bestScore) {
          if (bestRelPath) deleteImage(bestRelPath).catch(() => {})
          try { const saved = await saveImage(candidates[gi].dataUrl, 'workflow'); bestRelPath = saved.relPath; bestScore = review.score } catch {}
        }
        store.addTimeline(review.passed ? 'success' : 'info', `CG #${cgSpec.index} 候选图 ${gi + 1}: ${review.score}分 - ${review.comment}`)
        if (review.passed && review.score > bestPassedScore) {
          bestPassedScore = review.score
          bestPassedIdx = gi
          lastReview = review
        }
        if (!lastReview || review.score > (lastReview.score || 0)) lastReview = review
      }

      if (bestPassedIdx >= 0) passedImage = candidates[bestPassedIdx]

      // 详细配文模式：渲染侧边栏到选中的图片上
      if (passedImage && cgSpec.detailedCaption) {
        store.addTimeline('info', `为 CG #${cgSpec.index} 渲染剧情配文...`)
        passedImage.dataUrl = await renderImageWithSidebar(passedImage.dataUrl, cgSpec.detailedCaption)
      }
    }

    if (passedImage) {
      progress.status = 'passed'
      let relPath = ''
      try { const saved = await saveImage(passedImage.dataUrl, 'workflow'); relPath = saved.relPath } catch {}
      if (bestRelPath && bestRelPath !== relPath) deleteImage(bestRelPath).catch(() => {})
      for (const c of candidates) { delete c.dataUrl }

      // 命名：故事标题_001
      const indexStr = String(cgSpec.index).padStart(3, '0')
      const imageName = `${storyTitle}_${indexStr}`

      const imageRecord = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        name: imageName, relPath, prompt: currentPrompt,
        planDescription: cgSpec.description, score: lastReview?.score,
        attempts: attempt, createdAt: new Date().toISOString(),
        galMeta: { type: 'cg', cgIndex: cgSpec.index, title: cgSpec.title, dialogue: cgSpec.dialogue, timeOfDay: cgSpec.timeOfDay || '', weather: cgSpec.weather || '', narration: cgSpec.narration || '' },
      }
      store.finalImages.push(imageRecord)
      progress.finalImageRecord = imageRecord
      store.addTimeline('success', `CG #${cgSpec.index}「${cgSpec.title}」已通过`)
      return imageRecord
    }

    for (const c of candidates) { delete c.dataUrl }
    progress.status = 'generating'
    if (lastReview?.improvedPrompt && lastReview.improvedPrompt !== currentPrompt) {
      currentPrompt = lastReview.improvedPrompt
    }

    if (attempt >= maxAttempts) {
      if (needUserConfirm) {
        progress.status = 'waiting-confirm'
        const pauseResult = await store.requestConfirm('iteration-limit', { imageSpec: { index: cgSpec.index, title: cgSpec.title }, attempt, lastScore: bestScore })
        await checkStopped(store, myWorkflowId)
        if (pauseResult.action === 'retry') { maxAttempts += MAX_IMAGE_ITERATIONS; progress.status = 'generating' }
        else if (pauseResult.action === 'skip') { progress.status = 'max-attempts'; return null }
        else throw new Error('WORKFLOW_STOPPED')
      } else {
        if (bestRelPath) {
          // 详细配文模式：为兜底选取的图片渲染侧边栏
          if (cgSpec.detailedCaption) {
            try {
              const cleanUrl = await readImageAsBase64(bestRelPath)
              const renderedUrl = await renderImageWithSidebar(cleanUrl, cgSpec.detailedCaption)
              deleteImage(bestRelPath).catch(() => {})
              const newSaved = await saveImage(renderedUrl, 'workflow')
              bestRelPath = newSaved.relPath
            } catch (renderErr) {
              store.addTimeline('warn', `兜底图片配文渲染失败: ${renderErr.message}，使用原图`)
            }
          }
          progress.status = 'passed'
          const indexStr = String(cgSpec.index).padStart(3, '0')
          const imageRecord = {
            id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
            name: `${storyTitle}_${indexStr}`, relPath: bestRelPath, prompt: currentPrompt,
            planDescription: cgSpec.description, score: bestScore,
            attempts: attempt, autoSelected: true, createdAt: new Date().toISOString(),
            galMeta: { type: 'cg', cgIndex: cgSpec.index, title: cgSpec.title, dialogue: cgSpec.dialogue, timeOfDay: cgSpec.timeOfDay || '', weather: cgSpec.weather || '', narration: cgSpec.narration || '' },
          }
          store.finalImages.push(imageRecord)
          progress.finalImageRecord = imageRecord
          store.addTimeline('info', `CG #${cgSpec.index} 达到上限，自动选取(${bestScore}分)`)
          return imageRecord
        }
        progress.status = 'max-attempts'
        return null
      }
    }
  }
  return null
}

// ===== 模型槽位管理器（效率优先模式用，每个模型最多2并发） =====

class ModelSlotManager {
  constructor(maxPerModel = 2) {
    this._active = new Map()
    this._waiters = []
    this.maxPerModel = maxPerModel
  }

  _key(m) { return `${m.siteId}_${m.modelId}` }

  _count(m) { return this._active.get(this._key(m)) || 0 }

  async acquire(imageQueue) {
    // 尝试找到有空闲槽位的模型
    for (const m of imageQueue) {
      if (m.isDeprecated) continue
      if (this._count(m) < this.maxPerModel) {
        const key = this._key(m)
        this._active.set(key, (this._active.get(key) || 0) + 1)
        return m
      }
    }
    // 所有模型都满了，等待释放
    return new Promise(resolve => {
      this._waiters.push({ resolve, imageQueue })
    })
  }

  release(m) {
    const key = this._key(m)
    const count = this._active.get(key) || 0
    if (count > 0) this._active.set(key, count - 1)

    // 唤醒等待的 Worker
    for (let i = 0; i < this._waiters.length; i++) {
      const waiter = this._waiters[i]
      for (const wm of waiter.imageQueue) {
        if (wm.isDeprecated) continue
        if (this._count(wm) < this.maxPerModel) {
          this._waiters.splice(i, 1)
          const wkey = this._key(wm)
          this._active.set(wkey, (this._active.get(wkey) || 0) + 1)
          waiter.resolve(wm)
          return
        }
      }
    }
  }
}
// ===== 效率优先模式：CG并行生图 + 统一评审（GalCG引擎用） =====

async function executeCGsEfficiency(store, allCGSpecs, cgStartIdx, charRefMap, storyTitle, confirmMode, myWorkflowId) {
  const needUserConfirm = (confirmMode === 'confirm-all' || confirmMode === 'confirm-image')
  const maxConcurrency = store.imageQueue.filter(m => !m.isDeprecated).length * 2

  let pendingTasks = allCGSpecs.map((cg, i) => ({
    spec: cg,
    progressIndex: cgStartIdx + i,
    currentPrompt: null, // 将在生成时构建
    dataUrl: null,
  }))

  // 为每个任务构建完整提示词（含参考图前缀、时间天气、配文等）
  for (const task of pendingTasks) {
    const cgSpec = task.spec
    let prompt = cgSpec.prompt

    // 时间天气前缀
    const pureCGMode = store.config?.galCGPureCGMode || false
    const styleText = getStyleText(store)
    let promptPrefix = '【画面要求】' + (styleText ? `${styleText}风格CG插画` : '二次元风格CG插画') + '，16:9横构图，电影级宽幅画面。' + (pureCGMode ? '画面中不得出现任何文字、对话框、气泡框、字幕、旁白。' : '') + '\n'
    if (cgSpec.timeOfDay || cgSpec.weather) {
      const timePart = cgSpec.timeOfDay ? `时间：${cgSpec.timeOfDay}` : ''
      const weatherPart = cgSpec.weather ? `天气：${cgSpec.weather}` : ''
      promptPrefix += `【场景环境】${[timePart, weatherPart].filter(Boolean).join('，')}。请确保画面光影和氛围与此时间天气一致。\n`
    }

    // 角色参考说明（模糊匹配角色名）
    const refDescParts = []
    for (const charName of (cgSpec.characters || [])) {
      const ref = findCharRef(charRefMap, charName)
      if (ref?.dataUrl) {
        refDescParts.push(`${ref.keywords || charName}的是${charName}`)
      }
    }
    if (refDescParts.length > 0) {
      promptPrefix += `参考图中，${refDescParts.join('，')}。\n`
    }

    prompt = promptPrefix + prompt

    // 简要嵌入旁白（纯CG模式下跳过）
    if (cgSpec.narration && !pureCGMode) {
      prompt += `\n最后在这张图的左上角或者右上角（禁止遮挡人物）生成一个方形的白底黑字文本框，里面写着标准的中文："${cgSpec.narration}"。`
    }

    task.currentPrompt = prompt
  }

  const approvedDisplay = []
  const rejectedDisplay = []
  let round = 0

  while (pendingTasks.length > 0) {
    round++
    await checkStopped(store, myWorkflowId)

    if (await checkTimeUp(store, myWorkflowId)) {
      store.addTimeline('warn', '时间耗尽，剩余CG不再生成')
      for (const task of pendingTasks) {
        store.imageProgress[task.progressIndex].status = 'timeout'
      }
      break
    }

    store.addTimeline('info', `效率优先：第 ${round} 轮并行生成 ${pendingTasks.length} 张CG (最大并发 ${maxConcurrency})`)

    // 任务队列
    const taskQueue = [...pendingTasks]
    const results = new Array(pendingTasks.length).fill(null)

    const slotManager = new ModelSlotManager(2)

    async function effCGWorker() {
      while (taskQueue.length > 0) {
        await checkStopped(store, myWorkflowId)
        const taskIdx = pendingTasks.indexOf(taskQueue[0])
        const task = taskQueue.shift()
        if (!task) break

        const progress = store.imageProgress[task.progressIndex]
        progress.status = 'generating'
        progress.currentPrompt = task.currentPrompt
        progress.currentAttempt = round

        // 构建参考图（模糊匹配角色名）
        const refImages = []
        for (const charName of (task.spec.characters || [])) {
          const ref = findCharRef(charRefMap, charName)
          if (ref?.dataUrl) refImages.push({ dataUrl: ref.dataUrl })
        }
        const refs = refImages.length > 0 ? refImages : null

        // 重试直到成功（通过槽位管理器分配模型）
        let dataUrl = null
        while (!dataUrl) {
          await checkStopped(store, myWorkflowId)
          if (store.config.timeLimitMinutes * 60 * 1000 <= (Date.now() - store.startTime - (store.pausedDuration || 0))) { progress.status = 'timeout'; break }

          if (!store.imageQueue.some(m => !m.isDeprecated)) {
            throw new Error('ALL_IMAGE_MODELS_EXHAUSTED')
          }

          const model = await slotManager.acquire(store.imageQueue)
          await checkStopped(store, myWorkflowId)

          try {
            store.addTimeline('image', `CG #${task.spec.index} → ${model.modelName}`)
            let result = null

            // 横图：先尝试2K再fallback
            try {
              result = await generateImage({
                baseUrl: model.baseUrl, apiKey: model.apiKey, model: model.modelName,
                prompt: task.currentPrompt, referenceImages: refs, size: '2560x1440',
                apiType: model.apiType, customEndpoint: model.endpoint, quality: store.config.imageQuality,
              })
            } catch (firstErr) {
              if (store.status === 'stopped' || store.workflowId !== myWorkflowId) throw new Error('WORKFLOW_STOPPED')
              const landscapePrompt = task.currentPrompt + '，横构图，16:9横图比例，二次元风格CG插画'
              result = await generateImage({
                baseUrl: model.baseUrl, apiKey: model.apiKey, model: model.modelName,
                prompt: landscapePrompt, referenceImages: refs, size: 'auto',
                apiType: model.apiType, customEndpoint: model.endpoint, quality: store.config.imageQuality,
              })
            }

            slotManager.release(model)

            if (result?.data) {
              for (const item of result.data) {
                if (item.b64_json) { dataUrl = toDataUrl(item.b64_json); break }
                if (item.url) { try { dataUrl = await downloadImageAsBase64(item.url) } catch { continue }; break }
              }
            }
            if (!dataUrl) {
              model.consecutiveFails++
              model.totalFails++
              if (model.consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
                model.isDeprecated = true
                store.addTimeline('error', `生图模型 ${model.modelName} 连续返回无效结果 ${MAX_CONSECUTIVE_FAILS} 次，已被停用`)
              }
              store.addTimeline('warn', `${task.spec.title} 返回无有效图片，重试...`)
            } else {
              model.consecutiveFails = 0
              model.successCount++
            }
          } catch (err) {
            slotManager.release(model)
            if (store.status === 'stopped' || store.workflowId !== myWorkflowId) throw new Error('WORKFLOW_STOPPED')
            model.consecutiveFails++
            model.totalFails++
            store.addTimeline('warn', `生图模型 ${model.modelName} 失败 (连续 ${model.consecutiveFails}/${MAX_CONSECUTIVE_FAILS}): ${err.message}`)
            if (model.consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
              model.isDeprecated = true
              store.addTimeline('error', `生图模型 ${model.modelName} 连续失败 ${MAX_CONSECUTIVE_FAILS} 次，已被停用`)
            }
          }
        }

        if (dataUrl) {
          // 详细配文模式：渲染侧边栏
          if (task.spec.detailedCaption) {
            try {
              dataUrl = await renderImageWithSidebar(dataUrl, task.spec.detailedCaption)
            } catch { /* 渲染失败用原图 */ }
          }
          results[taskIdx] = { task, dataUrl }
          progress.status = 'reviewing'
          store.addTimeline('success', `CG #${task.spec.index}「${task.spec.title}」已生成`)
        }
      }
    }

    const numWorkers = Math.min(maxConcurrency, pendingTasks.length)
    const workers = []
    for (let i = 0; i < numWorkers; i++) workers.push(effCGWorker())
    await Promise.all(workers)
    await checkStopped(store, myWorkflowId)

    // 收集成功的
    const generatedImages = []
    for (let i = 0; i < pendingTasks.length; i++) {
      if (results[i]) {
        generatedImages.push({
          taskIndex: i,
          task: results[i].task,
          dataUrl: results[i].dataUrl,
          specIndex: results[i].task.spec.index,
        })
      }
    }

    if (generatedImages.length === 0) {
      store.addTimeline('warn', '本轮无CG成功生成')
      break
    }

    // 纯AI / 仅确认非图片：直接通过
    if (!needUserConfirm) {
      store.addTimeline('info', `效率优先（纯AI）：${generatedImages.length} 张CG自动通过`)
      for (const gen of generatedImages) {
        let relPath = ''
        try { const saved = await saveImage(gen.dataUrl, 'workflow'); relPath = saved.relPath } catch {}

        const indexStr = String(gen.specIndex).padStart(3, '0')
        const imageRecord = {
          id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
          name: `${storyTitle}_${indexStr}`, relPath, prompt: gen.task.currentPrompt,
          planDescription: gen.task.spec.description, score: null,
          attempts: round, createdAt: new Date().toISOString(),
          galMeta: { type: 'cg', cgIndex: gen.specIndex, title: gen.task.spec.title, dialogue: gen.task.spec.dialogue, timeOfDay: gen.task.spec.timeOfDay || '', weather: gen.task.spec.weather || '', narration: gen.task.spec.narration || '' },
        }
        store.finalImages.push(imageRecord)
        store.imageProgress[gen.task.progressIndex].status = 'passed'
        store.imageProgress[gen.task.progressIndex].finalImageRecord = imageRecord
      }
      pendingTasks = []
      break
    }

    // 用户确认：循环弹窗直到全部处理
    let remainingForReview = [...generatedImages]
    const approvedTasks = []
    const rejectedTasks = []

    while (remainingForReview.length > 0) {
      await checkStopped(store, myWorkflowId)
      const confirmResult = await store.requestConfirm('efficiency-batch-review', {
        images: remainingForReview.map(g => ({ dataUrl: g.dataUrl, specIndex: g.specIndex })),
        approvedImages: approvedDisplay.map(a => ({ dataUrl: a.dataUrl, specIndex: a.specIndex })),
        rejectedImages: rejectedDisplay.map(r => ({ dataUrl: r.dataUrl, specIndex: r.specIndex })),
        round,
      })
      await checkStopped(store, myWorkflowId)

      const selectedIndices = confirmResult.indices || []
      if (selectedIndices.length === 0) continue

      const selectedItems = selectedIndices.map(i => remainingForReview[i])
      const unselectedItems = remainingForReview.filter((_, i) => !selectedIndices.includes(i))

      if (confirmResult.action === 'approve') {
        approvedTasks.push(...selectedItems)
        for (const item of selectedItems) {
          approvedDisplay.push({ dataUrl: item.dataUrl, specIndex: item.specIndex })
        }
      } else if (confirmResult.action === 'reject') {
        rejectedTasks.push(...selectedItems)
        for (const item of selectedItems) {
          rejectedDisplay.push({ dataUrl: item.dataUrl, specIndex: item.specIndex })
        }
      }

      remainingForReview = unselectedItems
    }

    // 保存通过的
    for (const gen of approvedTasks) {
      let relPath = ''
      try { const saved = await saveImage(gen.dataUrl, 'workflow'); relPath = saved.relPath } catch {}

      const indexStr = String(gen.specIndex).padStart(3, '0')
      const imageRecord = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        name: `${storyTitle}_${indexStr}`, relPath, prompt: gen.task.currentPrompt,
        planDescription: gen.task.spec.description, score: null,
        attempts: round, createdAt: new Date().toISOString(),
        galMeta: { type: 'cg', cgIndex: gen.specIndex, title: gen.task.spec.title, dialogue: gen.task.spec.dialogue, timeOfDay: gen.task.spec.timeOfDay || '', weather: gen.task.spec.weather || '', narration: gen.task.spec.narration || '' },
      }
      store.finalImages.push(imageRecord)
      store.imageProgress[gen.task.progressIndex].status = 'passed'
      store.imageProgress[gen.task.progressIndex].finalImageRecord = imageRecord
      delete gen.dataUrl
    }

    // 处理打回
    if (rejectedTasks.length > 0) {
      store.addTimeline('info', `${rejectedTasks.length} 张CG被打回，等待修改意见...`)
      const feedbackResult = await store.requestConfirm('efficiency-reject-feedback', {
        images: rejectedTasks.map(g => ({ dataUrl: g.dataUrl, specIndex: g.specIndex })),
      })
      await checkStopped(store, myWorkflowId)

      const feedbacks = feedbackResult.feedbacks || []
      const newPendingTasks = []

      // 4并发融合意见
      const MERGE_CONCURRENCY = 4
      const mergeQueue = rejectedTasks.map((gen, i) => ({ gen, feedback: feedbacks[i] || '', index: i }))
      const mergeResults = new Array(rejectedTasks.length).fill(null)

      async function mergeWorker() {
        while (mergeQueue.length > 0) {
          await checkStopped(store, myWorkflowId)
          const item = mergeQueue.shift()
          if (!item) break

          let newPrompt = item.gen.task.currentPrompt
          if (item.feedback) {
            try {
              store.addTimeline('llm', `融合 CG #${item.gen.specIndex} 的修改意见...`)
              const merged = await callLLM(store, [
                { role: 'system', content: '你是AI提示词优化专家。融合用户意见生成新提示词，只输出提示词。' },
                { role: 'user', content: `原始提示词：\n${item.gen.task.currentPrompt}\n用户意见：\n${item.feedback}\n请输出新提示词：` },
              ], null, myWorkflowId)
              if (merged?.trim()) newPrompt = merged.trim()
            } catch (err) { if (err.message === 'WORKFLOW_STOPPED') throw err }
          }
          mergeResults[item.index] = newPrompt
        }
      }

      const numMergeWorkers = Math.min(MERGE_CONCURRENCY, rejectedTasks.length)
      const mergeWorkers = []
      for (let i = 0; i < numMergeWorkers; i++) mergeWorkers.push(mergeWorker())
      try {
        await Promise.all(mergeWorkers)
      } catch (err) {
        if (err.message === 'WORKFLOW_STOPPED') throw err
      }
      await checkStopped(store, myWorkflowId)

      for (let i = 0; i < rejectedTasks.length; i++) {
        const gen = rejectedTasks[i]
        delete gen.dataUrl
        newPendingTasks.push({
          spec: gen.task.spec,
          progressIndex: gen.task.progressIndex,
          currentPrompt: mergeResults[i] || gen.task.currentPrompt,
          dataUrl: null,
        })
        store.imageProgress[gen.task.progressIndex].status = 'generating'
      }

      pendingTasks = newPendingTasks
      rejectedDisplay.length = 0
    } else {
      pendingTasks = []
    }
  }
}

// ===== 主流程入口 =====

export async function startGalCGWorkflow(store) {
  store.beginPlanning()
  const myWorkflowId = store.workflowId
  const confirmMode = store.config.galCGConfirmMode || 'confirm-all'
  const needConfirmNonImage = (confirmMode === 'confirm-all' || confirmMode === 'confirm-non-image')

  try {
    // ===== LLM 阶段1：故事大纲 =====
    store.addTimeline('info', '【阶段1】生成故事大纲...')
    let outlineData = null
    let outlineApproved = false
    let outlineFeedback = null
    let previousOutlineText = null
    let outlineRejects = 0
    let outlineParseFails = 0

    while (!outlineApproved) {
      await checkStopped(store, myWorkflowId)
      store.status = 'planning'

      let result
      try {
        result = await generateOutline(store, outlineFeedback, previousOutlineText, myWorkflowId)
        outlineParseFails = 0
      } catch (err) {
        if (err.message === 'WORKFLOW_STOPPED' || err.message === 'ALL_LLM_MODELS_EXHAUSTED') throw err
        if (err.message === 'PLAN_PARSE_FAILED') {
          outlineParseFails++
          if (outlineParseFails >= MAX_PARSE_FAILS) {
            const p = await store.requestConfirm('plan-pause', { reason: 'parse-failed', message: `AI 连续 ${MAX_PARSE_FAILS} 次未能返回有效大纲。`, count: outlineParseFails })
            await checkStopped(store, myWorkflowId)
            if (p.abort) throw new Error('WORKFLOW_STOPPED')
            outlineParseFails = 0
          }
          continue
        }
        throw err
      }

      outlineData = result.data
      store.plan = { totalImages: 0, strategy: `故事「${outlineData.title}」`, images: [] }

      if (needConfirmNonImage) {
        store.status = 'confirming-plan'
        const cr = await store.requestConfirm('plan', { text: result.fullText, plan: store.plan })
        await checkStopped(store, myWorkflowId)
        if (cr.approved) { outlineApproved = true; store.addTimeline('success', '故事大纲已确认') }
        else {
          outlineRejects++; previousOutlineText = result.fullText; outlineFeedback = cr.feedback || '请修改'
          if (outlineRejects >= MAX_PLAN_REJECTS) {
            const p = await store.requestConfirm('plan-pause', { reason: 'reject-limit', message: `已连续 ${MAX_PLAN_REJECTS} 次打回。`, count: outlineRejects })
            await checkStopped(store, myWorkflowId)
            if (p.abort) throw new Error('WORKFLOW_STOPPED')
            outlineRejects = 0
          }
        }
      } else { outlineApproved = true; store.addTimeline('info', '故事大纲自动通过') }
    }

    store._galOutlineDone = true
    const storyTitle = outlineData.title
    const storyOutline = outlineData.outline

    // ===== LLM 阶段2：角色提取 =====
    await checkStopped(store, myWorkflowId)
    store.addTimeline('info', '【阶段2】提取角色清单...')

    const presetCharacters = store.config.galCGPresetCharacters || []
    if (presetCharacters.length > 0) {
      store.addTimeline('info', `用户已预设 ${presetCharacters.length} 个角色：${presetCharacters.map(c => c.name).join('、')}`)
    }

    let charListData = null
    let charParseFails = 0

    while (!charListData) {
      await checkStopped(store, myWorkflowId)
      store.status = 'planning'

      try {
        const result = await generateCharacterList(store, storyOutline, presetCharacters, null, null, myWorkflowId)
        charListData = result.data
        charParseFails = 0
      } catch (err) {
        if (err.message === 'WORKFLOW_STOPPED' || err.message === 'ALL_LLM_MODELS_EXHAUSTED') throw err
        if (err.message === 'PLAN_PARSE_FAILED') {
          charParseFails++
          if (charParseFails >= MAX_PARSE_FAILS) {
            const p = await store.requestConfirm('plan-pause', { reason: 'parse-failed', message: `AI 连续 ${MAX_PARSE_FAILS} 次未能返回有效角色清单。`, count: charParseFails })
            await checkStopped(store, myWorkflowId)
            if (p.abort) throw new Error('WORKFLOW_STOPPED')
            charParseFails = 0
          }
          continue
        }
        throw err
      }
    }

    // 处理预设角色标记
    if (presetCharacters.length > 0) {
      const extractedNames = charListData.characters.map(c => c.name)
      const ignoredPresetNames = []
      for (const preset of presetCharacters) {
        if (!extractedNames.includes(preset.name)) {
          ignoredPresetNames.push(preset.name)
        }
      }
      if (ignoredPresetNames.length > 0) {
        store.addTimeline('warn', `预设角色「${ignoredPresetNames.join('、')}」未在故事中出现，已被忽略`)
      }
      for (const ch of charListData.characters) {
        const preset = presetCharacters.find(p => p.name === ch.name)
        if (preset) {
          ch.isPreset = true
          ch.uploadedDataUrl = preset.dataUrl
        }
      }
    }

    store.addTimeline('info', `角色清单已提取：共 ${charListData.characters.length} 个角色`)
    store._galCharsDone = true

    // ===== 角色处理迭代循环 =====
    store.addTimeline('info', '【阶段3】角色处理（外貌描述 + 立绘生成）...')

    // 准备角色列表
    let processChars = charListData.characters.map(ch => ({
      name: ch.name,
      appearance: ch.appearance || '',
      role: ch.role || '',
      appearanceKeywords: ch.appearanceKeywords || '',
      portraitPrompt: ch.portraitPrompt || '',
      refDataUrl: ch.isPreset ? (ch.uploadedDataUrl || '') : '',
      isPreset: ch.isPreset || false,
      status: 'pending',
      action: null,
    }))

    // 迭代循环：直到所有角色通过或被删除
    while (processChars.some(c => c.status === 'pending')) {
      await checkStopped(store, myWorkflowId)
      store.status = 'confirming-plan'

      const result = await store.requestConfirm('gal-character-process', {
        characters: JSON.parse(JSON.stringify(processChars)),
        storyOutline: storyOutline,
      })
      await checkStopped(store, myWorkflowId)

      const updatedChars = result.characters || []
      const newProcessChars = []

      // 先处理即时操作（通过、删除）
      const asyncTasks = []
      for (const ch of updatedChars) {
        if (ch.deleted) {
          store.addTimeline('info', `角色「${ch.name}」已被用户删除`)
          continue
        }
        if (ch.action === 'option3') {
          ch.status = 'passed'
          ch.action = null
          newProcessChars.push(ch)
          store.addTimeline('success', `角色「${ch.name}」已通过`)
        } else if (ch.action === 'option1' || ch.action === 'option2') {
          asyncTasks.push(ch)
          newProcessChars.push(ch)
        } else {
          newProcessChars.push(ch)
        }
      }

      // 并发处理所有需要 AI 的操作
      if (asyncTasks.length > 0) {
        store.status = 'running'
        store.addTimeline('info', `并发处理 ${asyncTasks.length} 个角色的 AI 任务...`)

        const promises = asyncTasks.map(async (ch) => {
          await checkStopped(store, myWorkflowId)

          if (ch.action === 'option1') {
            // 根据参考图重新生成描述
            store.addTimeline('llm', `根据参考图为角色「${ch.name}」生成外貌描述...`)
            try {
              const newAppearance = await generateAppearanceFromRef(store, ch, storyOutline, myWorkflowId)
              ch.appearance = newAppearance
              recordLlmParseSuccess(store)
              store.addTimeline('success', `角色「${ch.name}」外貌描述已更新`)
            } catch (err) {
              if (err.message === 'WORKFLOW_STOPPED' || err.message === 'ALL_LLM_MODELS_EXHAUSTED') throw err
              store.addTimeline('warn', `角色「${ch.name}」外貌描述生成失败: ${err.message}`)
            }

          } else if (ch.action === 'option2') {
            // 如果外貌描述为空，先强制生成一份
            if (!ch.appearance.trim()) {
              store.addTimeline('llm', `角色「${ch.name}」外貌描述为空，正在自动生成...`)
              try {
                const autoAppearance = await generateAppearanceForced(store, ch.name, ch.role, storyOutline, myWorkflowId)
                ch.appearance = autoAppearance
                recordLlmParseSuccess(store)
                store.addTimeline('info', `已为角色「${ch.name}」自动生成外貌描述`)
              } catch (err) {
                if (err.message === 'WORKFLOW_STOPPED' || err.message === 'ALL_LLM_MODELS_EXHAUSTED') throw err
                store.addTimeline('warn', `自动生成外貌描述失败: ${err.message}`)
              }
            }

            // 生成立绘
            if (ch.appearance.trim()) {
              store.addTimeline('image', `为角色「${ch.name}」生成AI立绘...`)
              try {
                const portraitDataUrl = await generateCharPortraitSingle(store, ch, myWorkflowId)
                if (portraitDataUrl) {
                  ch.refDataUrl = portraitDataUrl
                  store.addTimeline('success', `角色「${ch.name}」立绘已生成`)
                } else {
                  store.addTimeline('warn', `角色「${ch.name}」立绘生成未返回有效图片`)
                }
              } catch (err) {
                if (err.message === 'WORKFLOW_STOPPED' || err.message === 'ALL_IMAGE_MODELS_EXHAUSTED') throw err
                store.addTimeline('warn', `角色「${ch.name}」立绘生成失败: ${err.message}`)
              }
            } else {
              store.addTimeline('warn', `角色「${ch.name}」外貌描述仍为空，无法生成立绘`)
            }
          }

          ch.status = 'pending'
          ch.action = null
        })

        try {
          await Promise.all(promises)
        } catch (err) {
          if (store.status === 'stopped' || store.workflowId !== myWorkflowId) throw new Error('WORKFLOW_STOPPED')
          if (err.message === 'ALL_LLM_MODELS_EXHAUSTED' || err.message === 'ALL_IMAGE_MODELS_EXHAUSTED') throw err
          throw err
        }
        await checkStopped(store, myWorkflowId)
      }

      store.status = 'confirming-plan'
      processChars = newProcessChars
    }

    // 检查是否还有角色
    if (processChars.length === 0) {
      store.addTimeline('error', '所有角色已被删除，无法继续')
      throw new Error('WORKFLOW_STOPPED')
    }

    // 所有角色已通过，构建 charRefMap
    const charRefMap = {}
    for (const ch of processChars) {
      if (ch.refDataUrl) {
        const saved = await saveImage(ch.refDataUrl, 'workflow')
        charRefMap[ch.name] = {
          dataUrl: ch.refDataUrl,
          relPath: saved.relPath,
          keywords: ch.appearanceKeywords || ch.appearance.slice(0, 80),
        }
      }
    }

    store.plan = { ...store.plan, characters: processChars }
    store._galCharImgDone = true
    store._galFinalCharsDone = true
    store.addTimeline('success', `角色处理完成：${processChars.length} 个角色，${Object.keys(charRefMap).length} 个有参考图`)

    // ===== LLM 阶段3：分批生成CG计划 =====
    await checkStopped(store, myWorkflowId)
    store.status = 'planning'
    store.addTimeline('info', '【阶段4】生成CG计划...')

    const allCGSpecs = []
    let totalPlanned = 0
    let conversationHistory = []
    let batchStart = 1

    // 第一批
    let firstBatchDone = false
    let firstParseFails = 0

    while (!firstBatchDone) {
      await checkStopped(store, myWorkflowId)
      store.status = 'planning'

      let batchResult
      try {
        batchResult = await generateCGPlanBatch(store, storyOutline, processChars, batchStart, CG_BATCH_SIZE, totalPlanned, conversationHistory, myWorkflowId)
        firstParseFails = 0
      } catch (err) {
        if (err.message === 'WORKFLOW_STOPPED' || err.message === 'ALL_LLM_MODELS_EXHAUSTED') throw err
        if (err.message === 'PLAN_PARSE_FAILED') {
          firstParseFails++
          if (firstParseFails >= MAX_PARSE_FAILS) {
            const p = await store.requestConfirm('plan-pause', { reason: 'parse-failed', message: `AI 连续 ${MAX_PARSE_FAILS} 次未能返回有效CG计划。`, count: firstParseFails })
            await checkStopped(store, myWorkflowId)
            if (p.abort) throw new Error('WORKFLOW_STOPPED')
            firstParseFails = 0
          }
          continue
        }
        throw err
      }

      totalPlanned = batchResult.totalPlanned
      conversationHistory = batchResult.conversationHistory

      // 展示并审核这一批
      store.plan = {
        totalImages: totalPlanned,
        strategy: `故事「${storyTitle}」共 ${totalPlanned} 张CG`,
        images: batchResult.batch.map(b => ({ index: b.index, title: b.title, description: b.description, initialPrompt: b.prompt })),
      }

      if (needConfirmNonImage) {
        store.status = 'confirming-plan'
        store.addTimeline('info', `等待用户确认CG计划（第${batchStart}~${batchStart + batchResult.batch.length - 1}张）...`)
        const cr = await store.requestConfirm('plan', { text: batchResult.fullText, plan: store.plan })
        await checkStopped(store, myWorkflowId)

        if (cr.approved) {
          allCGSpecs.push(...batchResult.batch)
          firstBatchDone = true
          // 恢复原始提示词（如果打回时临时修改过）
          if (store._cgPlanOriginalPrompt) {
            store.config.initialPrompt = store._cgPlanOriginalPrompt
            delete store._cgPlanOriginalPrompt
          }
          store.addTimeline('success', `CG计划第${batchStart}~${batchStart + batchResult.batch.length - 1}张已确认`)
        } else {
          // 打回重新生成这一批 —— 清空对话历史，让 AI 完全重新开始
          store.addTimeline('info', '用户打回，重新生成这一批计划...')
          const feedback = cr.feedback || ''
          conversationHistory = []
          totalPlanned = 0
          // 如果有用户反馈，把原始提示词追加反馈信息，通过 config.initialPrompt 临时注入
          if (feedback) {
            if (!store._cgPlanOriginalPrompt) {
              store._cgPlanOriginalPrompt = store.config.initialPrompt
            }
            store.config.initialPrompt = (store._cgPlanOriginalPrompt || '') + `\n\n【用户对CG计划的修改意见】${feedback}`
          }
        }
      } else {
        allCGSpecs.push(...batchResult.batch)
        firstBatchDone = true
        if (store._cgPlanOriginalPrompt) {
          store.config.initialPrompt = store._cgPlanOriginalPrompt
          delete store._cgPlanOriginalPrompt
        }
        store.addTimeline('info', 'CG计划第一批自动通过')
      }
    }

    // 后续批次（如果 totalPlanned > CG_BATCH_SIZE）
    batchStart = allCGSpecs.length + 1

    while (allCGSpecs.length < totalPlanned) {
      await checkStopped(store, myWorkflowId)
      store.status = 'planning'

      const remaining = totalPlanned - allCGSpecs.length
      const thisBatchSize = Math.min(CG_BATCH_SIZE, remaining)
      let parseFails = 0
      let batchApproved = false

      while (!batchApproved) {
        await checkStopped(store, myWorkflowId)

        // 保存调用前的对话历史快照（打回时用于回退）
        const historyBeforeBatch = [...conversationHistory]

        let batchResult
        try {
          batchResult = await generateCGPlanBatch(store, storyOutline, processChars, batchStart, thisBatchSize, totalPlanned, conversationHistory, myWorkflowId)
          parseFails = 0
        } catch (err) {
          if (err.message === 'WORKFLOW_STOPPED' || err.message === 'ALL_LLM_MODELS_EXHAUSTED') throw err
          if (err.message === 'PLAN_PARSE_FAILED') {
            parseFails++
            if (parseFails >= MAX_PARSE_FAILS) {
              const p = await store.requestConfirm('plan-pause', { reason: 'parse-failed', message: `AI 连续 ${MAX_PARSE_FAILS} 次失败。`, count: parseFails })
              await checkStopped(store, myWorkflowId)
              if (p.abort) throw new Error('WORKFLOW_STOPPED')
              parseFails = 0
            }
            continue
          }
          throw err
        }

        conversationHistory = batchResult.conversationHistory

        store.plan = {
          totalImages: totalPlanned,
          strategy: `故事「${storyTitle}」CG计划 (第${batchStart}~${batchStart + batchResult.batch.length - 1}张)`,
          images: batchResult.batch.map(b => ({ index: b.index, title: b.title, description: b.description, initialPrompt: b.prompt })),
        }

        if (needConfirmNonImage) {
          store.status = 'confirming-plan'
          store.addTimeline('info', `等待确认CG计划（第${batchStart}~${batchStart + batchResult.batch.length - 1}张）...`)
          const cr = await store.requestConfirm('plan', { text: batchResult.fullText, plan: store.plan })
          await checkStopped(store, myWorkflowId)

          if (cr.approved) {
            allCGSpecs.push(...batchResult.batch)
            batchApproved = true
            store.addTimeline('success', `CG计划第${batchStart}~${batchStart + batchResult.batch.length - 1}张已确认`)
          } else {
            store.addTimeline('info', '用户打回，重新生成这一批...')
            const feedback = cr.feedback || ''
            // 回退对话历史到这一批生成之前的状态
            conversationHistory = historyBeforeBatch
            if (feedback) {
              conversationHistory.push({ role: 'user', content: `接下来请重新生成第${batchStart}~${batchStart + thisBatchSize - 1}张的CG计划，我对之前的版本不满意：${feedback}` })
            }
          }
        } else {
          allCGSpecs.push(...batchResult.batch)
          batchApproved = true
        }
      }

      batchStart = allCGSpecs.length + 1
    }

    store.addTimeline('success', `CG计划全部完成：共 ${allCGSpecs.length} 张`)
    store._galCGPlanDone = true

    // ===== CG剧情衔接旁白/配文（可选） =====
    if (store.config.galCGEnableNarration) {
      await checkStopped(store, myWorkflowId)
      store.status = 'planning'

      const narrationStyle = store.config.galCGNarrationStyle || 'sidebar'

      if (narrationStyle === 'sidebar') {
        // 详细配文模式：结合原文生成100-200字配文，后续Canvas渲染到图片右侧
        store.addTimeline('info', '【剧情衔接】为CG生成详细剧情配文...')
        const originalText = store.config.galCGDocumentText || store.config.initialPrompt || storyOutline
        const captions = await generateDetailedCaptions(store, originalText, allCGSpecs, myWorkflowId)
        if (captions) {
          let matchCount = 0
          for (const cap of captions) {
            const cg = allCGSpecs.find(c => c.index === cap.index)
            if (cg && cap.caption) {
              cg.detailedCaption = cap.caption
              matchCount++
            }
          }
          store.addTimeline('info', `已为 ${matchCount}/${allCGSpecs.length} 张CG匹配配文`)
        }
      } else {
        // 简要嵌入模式：生成短旁白注入提示词
        store.addTimeline('info', '【剧情衔接】为CG生成旁白文字...')
        const narrations = await generateNarrations(store, storyOutline, allCGSpecs, myWorkflowId)
        if (narrations) {
          let matchCount = 0
          for (const n of narrations) {
            const cg = allCGSpecs.find(c => c.index === n.index)
            if (cg && n.narration) {
              cg.narration = n.narration
              matchCount++
            }
          }
          store.addTimeline('info', `已为 ${matchCount}/${allCGSpecs.length} 张CG匹配旁白`)
        }
      }
      store._galNarrationDone = true
    } else {
      store._galNarrationDone = true
    }

    // ===== 生图阶段2：逐张生成CG =====
    await checkStopped(store, myWorkflowId)
    store.status = 'running'
    store.addTimeline('info', '【阶段5】开始逐张生成剧情CG...')

    const cgStartIdx = store.imageProgress ? store.imageProgress.length : 0
    for (const cg of allCGSpecs) {
      store.imageProgress.push({
        index: `CG${cg.index}`,
        title: cg.title,
        status: 'pending',
        currentPrompt: cg.prompt,
        currentAttempt: 0,
        attempts: [],
        finalImageRecord: null,
        galMeta: { type: 'cg' },
      })
    }

    if (store.config.efficiencyMode) {
      // 效率优先：并行生成所有CG + 统一评审
      await executeCGsEfficiency(store, allCGSpecs, cgStartIdx, charRefMap, storyTitle, confirmMode, myWorkflowId)
    } else {
      for (let i = 0; i < allCGSpecs.length; i++) {
        await checkStopped(store, myWorkflowId)
        if (await checkTimeUp(store, myWorkflowId)) {
          store.addTimeline('warn', '时间耗尽，剩余CG不再生成')
          for (let j = i; j < allCGSpecs.length; j++) {
            store.imageProgress[cgStartIdx + j].status = 'timeout'
          }
          break
        }

        store.addTimeline('info', `开始生成 CG #${allCGSpecs[i].index}: ${allCGSpecs[i].title}`)
        try {
          await processOneCG(store, allCGSpecs[i], cgStartIdx + i, charRefMap, storyTitle, confirmMode, myWorkflowId)
        } catch (err) {
          if (err.message === 'WORKFLOW_STOPPED') throw err
          if (store.status === 'stopped' || store.workflowId !== myWorkflowId) throw new Error('WORKFLOW_STOPPED')
          if (err.message === 'ALL_IMAGE_MODELS_EXHAUSTED' || err.message === 'ALL_LLM_MODELS_EXHAUSTED') throw err
          store.addTimeline('error', `CG #${allCGSpecs[i].index} 异常: ${err.message}`)
          store.imageProgress[cgStartIdx + i].status = 'error'
        }
      }
    }

    // ===== 完成 =====
    await checkStopped(store, myWorkflowId)

    // 按 cgIndex 排序最终图片，确保输出顺序与计划顺序一致
    store.finalImages.sort((a, b) => {
      const idxA = a.galMeta?.cgIndex ?? Infinity
      const idxB = b.galMeta?.cgIndex ?? Infinity
      return idxA - idxB
    })

    store.status = 'completed'
    store.endTime = Date.now()

    const cgDoneCount = store.finalImages.filter(img => img.galMeta?.type === 'cg').length
    store.addTimeline('success', `GalCG工作流完成：共生成 ${cgDoneCount}/${allCGSpecs.length} 张剧情CG`)
    await store.saveFinalImages()

  } catch (err) {
    if (store.workflowId !== myWorkflowId) return
    if (store.status === 'stopped') return
    if (err.message === 'WORKFLOW_STOPPED') {
      if (store.status !== 'stopped') {
        store.status = 'stopped'
        store.endTime = Date.now()
        store.addTimeline('warn', '工作流已被用户手动停止')
      }
      return
    }
    store.status = 'failed'
    store.endTime = Date.now()
    store.addTimeline('error', `工作流失败: ${err.message}`)
  }
}
