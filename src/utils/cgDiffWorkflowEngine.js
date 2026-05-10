/**
 * CG及差分绘制工作流引擎
 *
 * CG+差分模式：CG大纲 → 底CG生成 → 差分大纲 → 差分并行生成 → 完成
 * 仅差分模式：  差分大纲 → 差分并行生成 → 完成
 */

import { callLLM, recordLlmParseFail, recordLlmParseSuccess } from '@/utils/workflowEngine'
import { generateImage, toDataUrl, downloadImageAsBase64 } from '@/utils/imageApi'
import { saveImage, deleteImage, readImageAsBase64 } from '@/utils/imageStorage'

// ===== 常量 =====
const MAX_CONSECUTIVE_FAILS = 3
const MAX_CG_PLAN_REJECTS = 5
const MAX_DIFF_PLAN_REJECTS = 3
const MAX_PARSE_FAILS = 3
const MAX_IMAGE_ITERATIONS = 10
const DIFF_PARALLEL_SLOTS = 4

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
const MAX_TOTAL_MINUTES = 24 * 60

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

// ===== 审核互斥锁（差分并行审核用） =====
class ReviewMutex {
  constructor() { this._queue = []; this._locked = false }
  async acquire() {
    if (!this._locked) { this._locked = true; return }
    return new Promise(resolve => this._queue.push(resolve))
  }
  release() {
    if (this._queue.length > 0) {
      const next = this._queue.shift()
      next()
    } else {
      this._locked = false
    }
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

// ===== CG大纲生成 =====

function buildCGPlanSystemPrompt(config) {
  const refCount = config.referenceImages?.length || 0
  const refInfo = refCount > 0
    ? `\n用户提供了 ${refCount} 张参考图，请结合参考图特征来规划底CG。`
    : ''

  return `你是一个专业的AI绘图项目总监，专精CG插画创作。

用户想要创作一张"底CG"（基础CG插画），之后会在这张底CG的基础上绘制多张差分（表情差分、姿势差分、光影差分等）。

你的任务是：根据用户的创作需求，为这张底CG制定详细的创作方案。${refInfo}

要求：
1. 底CG只有一张，必须构图稳定、主体明确、适合后续差分变化
2. 提示词必须包含：画面主体、姿势、表情（基准表情）、服装、场景、光影、画风、画质等要素（必须是中文）
3. 底CG的姿势和构图应当"中性"，适合衍生多种差分

请直接输出以下JSON，不要任何废话：

\`\`\`json
{
  "title": "底CG标题",
  "description": "详细描述这张底CG需要呈现的内容和效果",
  "initialPrompt": "用于生图模型的高质量中文提示词",
  "style": "风格关键词，中文",
  "referenceImageIndices": [用到的参考图编号从1开始，不需要则为空数组]
}
\`\`\``
}

function buildCGPlanUserMessage(config) {
  const content = []
  if (config.referenceImages?.length > 0) {
    for (const img of config.referenceImages) {
      if (img.dataUrl) {
        content.push({ type: 'image_url', image_url: { url: img.dataUrl, detail: 'high' } })
      }
    }
  }
  content.push({ type: 'text', text: config.initialPrompt })
  if (content.length === 1) return { role: 'user', content: config.initialPrompt }
  return { role: 'user', content }
}

async function generateCGPlan(store, feedback, previousText, myWorkflowId) {
  store.planningText = ''
  const messages = [{ role: 'system', content: buildCGPlanSystemPrompt(store.config) }]
  if (feedback && previousText) {
    messages.push(buildCGPlanUserMessage(store.config))
    messages.push({ role: 'assistant', content: previousText })
    messages.push({ role: 'user', content: `我对上面的方案不满意，请根据以下意见重新制定：\n${feedback}` })
  } else {
    messages.push(buildCGPlanUserMessage(store.config))
  }
  const fullText = await callLLM(store, messages, t => { store.planningText = t }, myWorkflowId)
  store.planningText = fullText

  const planData = extractJSON(fullText, 'initialPrompt')
  if (!planData) {
    store.addTimeline('warn', '未能解析CG大纲，将尝试重新生成')
    recordLlmParseFail(store)
    throw new Error('PLAN_PARSE_FAILED')
  }

  // 标准化为 plan 结构，兼容 UI 展示
  recordLlmParseSuccess(store)
  store.plan = {
    totalImages: 1,
    strategy: planData.title || '底CG创作',
    images: [{
      index: 1,
      title: planData.title || '底CG',
      description: planData.description || '',
      initialPrompt: planData.initialPrompt,
      style: planData.style || '',
      referenceImageIndices: planData.referenceImageIndices || [],
    }],
  }
  store.addTimeline('info', `CG大纲已生成：${planData.title}`)
  return planData
}

// ===== 差分大纲生成 =====

function buildDiffPlanSystemPrompt(baseCGPrompt) {
  return `你是一个专业的CG差分绘制规划师。

用户已经有一张"底CG"（基础CG插画），现在需要你根据用户的需求，在这张底CG的基础上规划多张差分图。

底CG的提示词为：
${baseCGPrompt}

差分类型包括但不限于：
- 表情差分（微笑、害羞、生气、哭泣等）
- 姿势差分（手部动作变化、头部朝向变化等）
- 服装差分（不同服装等）
- 光影差分（白天/夜晚、不同灯光氛围等）
- 状态差分（干净/弄脏、正常/受伤等）

要求：
1. 每张差分只做"局部变化"，保持底CG的整体构图和背景不变
2. 差分提示词必须以底CG的提示词为基础，只修改需要变化的部分，必须使用中文
3. 差分提示词中务必强调"保持与底CG一致的构图、背景和整体画风"
4. 差分数量要合理，与用户需求匹配

请直接输出以下JSON，不要任何废话：

\`\`\`json
{
  "totalDiffs": 数字,
  "strategy": "整体差分策略一句话描述",
  "diffs": [
    {
      "index": 1,
      "title": "差分标题",
      "description": "描述这张差分与底CG的区别",
      "changeType": "表情/姿势/服装/光影/状态",
      "prompt": "完整的中文生图提示词（以底CG提示词为基础，修改差异部分）"
    }
  ]
}
\`\`\``
}

function buildDiffPlanUserMessage(config, baseCGDataUrl) {
  const content = []
  if (baseCGDataUrl) {
    content.push({ type: 'image_url', image_url: { url: baseCGDataUrl, detail: 'high' } })
  }
  const text = config.initialPrompt
    ? `以下是我对差分的需求：\n${config.initialPrompt}`
    : '请根据底CG的内容，规划合理的差分。'
  content.push({ type: 'text', text })
  return { role: 'user', content }
}

async function generateDiffPlan(store, baseCGDataUrl, baseCGPrompt, feedback, previousText, myWorkflowId) {
  store.planningText = ''
  const messages = [{ role: 'system', content: buildDiffPlanSystemPrompt(baseCGPrompt) }]
  if (feedback && previousText) {
    messages.push(buildDiffPlanUserMessage(store.config, baseCGDataUrl))
    messages.push({ role: 'assistant', content: previousText })
    messages.push({ role: 'user', content: `我对上面的差分方案不满意，请根据以下意见重新制定：\n${feedback}` })
  } else {
    messages.push(buildDiffPlanUserMessage(store.config, baseCGDataUrl))
  }

  const fullText = await callLLM(store, messages, t => { store.planningText = t }, myWorkflowId)
  store.planningText = fullText

  const planData = extractJSON(fullText, 'diffs')
  if (!planData || !planData.diffs || planData.diffs.length === 0) {
    store.addTimeline('warn', '未能解析差分大纲')
    recordLlmParseFail(store)
    throw new Error('PLAN_PARSE_FAILED')
  }
  recordLlmParseSuccess(store)
  store.addTimeline('info', `差分大纲已生成：共 ${planData.diffs.length} 张差分`)
  return { fullText, planData }
}

// ===== 图片评审 =====

function buildCGReviewPrompt(scoreThreshold) {
  return `你是一位专业的CG插画评审专家。请评审这张底CG插画。

评分标准（满分100分）：
- 画面质量和清晰度 (20分)
- 与需求描述的匹配程度 (20分)
- 构图稳定性，是否适合后续差分变化 (20分)
- 画面是否有局部崩坏（三只手、三只腿等） (20分)
- 色彩、光影和整体美感 (20分)

评分 >= ${scoreThreshold} 分视为通过。

请直接给出以下JSON，不要有任何废话：

\`\`\`json
{
  "score": 数字,
  "passed": true或false,
  "comment": "一句话评价",
  "improvedPrompt": "如果不通过，给出改进后的完整中文提示词；通过则留空"
}
\`\`\``
}

function buildDiffReviewPrompt(scoreThreshold) {
  return `你是一位专业的CG差分评审专家。你将看到两张图片：第一张是"底CG"（基准图），第二张是在底CG基础上绘制的"差分图"。

评分标准（满分100分）：
- 差分图的画面质量和清晰度 (15分)
- 差分图与底CG的一致性（构图、背景、角色整体造型应保持一致） (25分)
- 差分变化是否到位（需求要求的变化是否准确体现） (25分)
- 差异度是否合理（不能和底CG完全一样，也不能差异过大） (20分)
- 画面是否有局部崩坏，如手部崩坏，超过2个手，超过2个脚等AI作画中常见的作画崩坏情况 (15分)

评分 >= ${scoreThreshold} 分视为通过。

请直接给出以下JSON，不要有任何废话：

\`\`\`json
{
  "score": 数字,
  "passed": true或false,
  "comment": "一句话评价",
  "improvedPrompt": "如果不通过，给出改进后的完整中文提示词；通过则留空"
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

async function reviewCGImage(store, imageDataUrl, description, currentPrompt, myWorkflowId) {
  const messages = [
    { role: 'system', content: buildCGReviewPrompt(store.config.scoreThreshold) },
    { role: 'user', content: [
      { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
      { type: 'text', text: `需求描述：${description}\n\n当前提示词：${currentPrompt}\n\n请评审这张底CG。` },
    ] },
  ]
  const fullText = await callLLM(store, messages, null, myWorkflowId)
  const result = parseReviewResult(fullText)
  if (!result) {
    return { score: 0, passed: false, comment: '评审结果解析失败', improvedPrompt: currentPrompt, rawText: fullText }
  }
  result.passed = result.score >= store.config.scoreThreshold
  result.rawText = fullText
  if (!result.improvedPrompt) result.improvedPrompt = ''
  if (!result.comment) result.comment = ''
  return result
}

async function reviewDiffImage(store, baseCGDataUrl, diffDataUrl, diffDesc, currentPrompt, myWorkflowId) {
  const messages = [
    { role: 'system', content: buildDiffReviewPrompt(store.config.scoreThreshold) },
    { role: 'user', content: [
      { type: 'image_url', image_url: { url: baseCGDataUrl, detail: 'high' } },
      { type: 'image_url', image_url: { url: diffDataUrl, detail: 'high' } },
      { type: 'text', text: `底CG已在第一张图中展示。\n差分要求：${diffDesc}\n当前提示词：${currentPrompt}\n\n请评审第二张图（差分图），对比底CG判断差分质量。` },
    ] },
  ]
  const fullText = await callLLM(store, messages, null, myWorkflowId)
  const result = parseReviewResult(fullText)
  if (!result) {
    return { score: 0, passed: false, comment: '评审结果解析失败', improvedPrompt: currentPrompt, rawText: fullText }
  }
  result.passed = result.score >= store.config.scoreThreshold
  result.rawText = fullText
  if (!result.improvedPrompt) result.improvedPrompt = ''
  if (!result.comment) result.comment = ''
  return result
}

// ===== 底CG生成（串行） =====

async function processBaseCG(store, cgSpec, myWorkflowId) {
  const progress = store.imageProgress[0]
  progress.status = 'generating'
  let currentPrompt = cgSpec.initialPrompt
  let attempt = 0
  let maxAttempts = MAX_IMAGE_ITERATIONS
  let lastScore = null
  let bestRelPath = null
  let bestScore = -1

  while (attempt < maxAttempts) {
    await checkStopped(store, myWorkflowId)
    if (await checkTimeUp(store, myWorkflowId)) {
      store.addTimeline('warn', `时间耗尽，底CG未完成`)
      progress.status = 'timeout'
      return null
    }

    attempt++
    progress.currentPrompt = currentPrompt
    progress.currentAttempt = attempt
    store.addTimeline('image', `底CG 第 ${attempt} 轮生成 (并发 ${store.config.concurrency})`)

    const refImgs = store.config.referenceImages.length > 0 && cgSpec.referenceImageIndices?.length > 0
      ? cgSpec.referenceImageIndices.map(i => store.config.referenceImages[i - 1]).filter(Boolean)
      : null

    const promises = []
    for (let c = 0; c < store.config.concurrency; c++) {
      promises.push(
        callImageModel(store, currentPrompt, refImgs?.length > 0 ? refImgs : null, myWorkflowId).catch(err => {
          if (err.message === 'WORKFLOW_STOPPED' || err.message === 'ALL_IMAGE_MODELS_EXHAUSTED') throw err
          return null
        })
      )
    }

    let results = await Promise.all(promises)
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
      store.addTimeline('warn', `底CG 第 ${attempt} 轮未生成有效图片`)
      continue
    }

    progress.status = 'reviewing'
    let passedImage = null
    let lastReview = null
    const requestFailCount = results.filter(r => r === null).length

    if (store.config.confirmMode === 'confirm-all') {
      const enableAiReview = store.config.enableAiReview !== false
      let reviewedCandidates = []
      let bestReviewIdx = 0

      if (enableAiReview) {
        for (let gi = 0; gi < candidates.length; gi++) {
          await checkStopped(store, myWorkflowId)
          store.addTimeline('llm', `AI 评审底CG 候选图 ${gi + 1}/${candidates.length}`)
          const review = await reviewCGImage(store, candidates[gi].dataUrl, cgSpec.description, currentPrompt, myWorkflowId)

          if (review.score > bestScore) {
            if (bestRelPath) deleteImage(bestRelPath).catch(() => {})
            try {
              const saved = await saveImage(candidates[gi].dataUrl, 'workflow')
              bestRelPath = saved.relPath
              bestScore = review.score
            } catch { }
          }
          reviewedCandidates.push({
            dataUrl: candidates[gi].dataUrl, score: review.score, comment: review.comment,
            passed: review.passed, improvedPrompt: review.improvedPrompt || ''
          })
          store.addTimeline(review.passed ? 'success' : 'info', `候选图 ${gi + 1}: ${review.score}分 - ${review.comment}`)
        }
        bestReviewIdx = reviewedCandidates.reduce((best, c, i) => c.score > reviewedCandidates[best].score ? i : best, 0)
      } else {
        reviewedCandidates = candidates.map(c => ({ dataUrl: c.dataUrl, score: null, comment: '', passed: false, improvedPrompt: '' }))
        bestReviewIdx = null
      }

      await checkStopped(store, myWorkflowId)
      progress.status = 'waiting-confirm'
      store.addTimeline('info', `展示 ${reviewedCandidates.length} 张底CG给用户选择`)

      const confirmResult = await store.requestConfirm('batch-image-review', {
        imageSpec: cgSpec, candidates: reviewedCandidates, attempt,
        totalRequested: store.config.concurrency, failedCount: requestFailCount, recommendedIndex: bestReviewIdx
      })

      await checkStopped(store, myWorkflowId)

      if (confirmResult.approved && confirmResult.selectedIndices && confirmResult.selectedIndices.length > 0) {
        const primaryIdx = confirmResult.selectedIndices[0]
        passedImage = candidates[primaryIdx]
        lastReview = { score: reviewedCandidates[primaryIdx].score, passed: true, comment: '用户手动通过', improvedPrompt: '' }
        lastScore = reviewedCandidates[primaryIdx].score
      } else {
        const feedback = confirmResult.feedback || ''
        store.addTimeline('info', `用户打回底CG${feedback ? ': ' + feedback : ''}`)
        if (enableAiReview && bestReviewIdx !== null) {
          const bestReview = reviewedCandidates[bestReviewIdx]
          let finalImprovedPrompt = bestReview.improvedPrompt || currentPrompt
          if (feedback) {
            try {
              store.addTimeline('llm', '融合评审建议与用户反馈...')
              const merged = await callLLM(store, [
                { role: 'system', content: '你是AI绘图提示词优化专家。现在需要融合AI建议和用户意见生成新的完整中文提示词，只输出提示词。' },
                { role: 'user', content: `当前提示词：\n${finalImprovedPrompt}\nAI建议：${bestReview.comment}\n用户意见：${feedback}\n请输出新提示词：` }
              ], null, myWorkflowId)
              if (merged && merged.trim()) finalImprovedPrompt = merged.trim()
            } catch (err) { if (err.message === 'WORKFLOW_STOPPED') throw err }
          }
          lastReview = { score: bestReview.score, passed: false, comment: feedback || bestReview.comment, improvedPrompt: finalImprovedPrompt }
        } else {
          let newPrompt = ''
          if (feedback) {
            try {
              store.addTimeline('llm', '融合用户反馈...')
              const merged = await callLLM(store, [
                { role: 'system', content: '你是AI绘图提示词优化专家。现在需要融合用户意见生成新的完整中文提示词。' },
                { role: 'user', content: `原始提示词：\n${currentPrompt}\n用户意见：\n${feedback}\n请输出新提示词：` }
              ], null, myWorkflowId)
              if (merged && merged.trim()) newPrompt = merged.trim()
            } catch (err) { if (err.message === 'WORKFLOW_STOPPED') throw err }
          }
          lastReview = { score: null, passed: false, comment: feedback || '用户打回', improvedPrompt: newPrompt }
        }
      }
    } else {
      // 纯AI / 用户仅确认大纲：并发评审，全部评完选最高分
      store.addTimeline('llm', `并发评审底CG 第 ${attempt} 轮 (${candidates.length} 张)...`)

      const reviewPromises = candidates.map(async (candidate, gi) => {
        await checkStopped(store, myWorkflowId)
        try {
          const review = await reviewCGImage(store, candidate.dataUrl, cgSpec.description, currentPrompt, myWorkflowId)
          await checkStopped(store, myWorkflowId)
          return { gi, review }
        } catch (err) {
          if (err.message === 'WORKFLOW_STOPPED' || err.message === 'ALL_LLM_MODELS_EXHAUSTED') throw err
          if (store.status === 'stopped' || store.workflowId !== myWorkflowId) throw new Error('WORKFLOW_STOPPED')
          return { gi, review: { score: 0, passed: false, comment: '评审失败: ' + err.message, improvedPrompt: '', rawText: '' } }
        }
      })

      let reviewResults
      try {
        reviewResults = await Promise.all(reviewPromises)
      } catch (err) {
        if (err.message === 'WORKFLOW_STOPPED') throw err
        throw err
      }
      await checkStopped(store, myWorkflowId)

      let bestPassedIdx = -1
      let bestPassedScore = -1

      for (const { gi, review } of reviewResults) {
        if (review.score > bestScore) {
          if (bestRelPath) deleteImage(bestRelPath).catch(() => {})
          try {
            const saved = await saveImage(candidates[gi].dataUrl, 'workflow')
            bestRelPath = saved.relPath
            bestScore = review.score
          } catch { }
        }

        store.addTimeline(
          review.passed ? 'success' : 'info',
          `候选图 ${gi + 1}: ${review.score}分 ${review.passed ? '通过' : '未通过'} - ${review.comment}`
        )

        if (review.passed && review.score > bestPassedScore) {
          bestPassedScore = review.score
          bestPassedIdx = gi
          lastReview = review
          lastScore = review.score
        }

        if (!lastReview || review.score > (lastReview.score || 0)) {
          lastReview = review
          lastScore = review.score
        }
      }

      if (bestPassedIdx >= 0) {
        passedImage = candidates[bestPassedIdx]
        store.addTimeline('success', `选取最高分候选图 #${bestPassedIdx + 1} (${bestPassedScore}分) 通过`)
      }
    }

    if (passedImage) {
      progress.status = 'passed'
      let relPath = ''
      try {
        const saved = await saveImage(passedImage.dataUrl, 'workflow')
        relPath = saved.relPath
      } catch (err) { store.addTimeline('warn', `底CG保存失败: ${err.message}`) }

      if (bestRelPath && bestRelPath !== relPath) deleteImage(bestRelPath).catch(() => {})
      for (const c of candidates) { delete c.dataUrl }

      const imageRecord = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        name: cgSpec.title || `底CG`, relPath, prompt: currentPrompt,
        planDescription: cgSpec.description, score: lastReview?.score,
        attempts: attempt, createdAt: new Date().toISOString(), cgMeta: { type: 'base' }
      }
      store.finalImages.push(imageRecord)
      progress.finalImageRecord = imageRecord
      store.addTimeline('success', `底CG「${cgSpec.title}」已通过`)
      return imageRecord
    }

    for (const c of candidates) { delete c.dataUrl }
    progress.status = 'generating'
    if (lastReview?.improvedPrompt && lastReview.improvedPrompt !== currentPrompt) {
      currentPrompt = lastReview.improvedPrompt
    }

    if (attempt >= maxAttempts) {
      if (store.config.confirmMode === 'confirm-all') {
        progress.status = 'waiting-confirm'
        const pauseResult = await store.requestConfirm('iteration-limit', { imageSpec: cgSpec, attempt, lastScore })
        await checkStopped(store, myWorkflowId)
        if (pauseResult.action === 'retry') {
          maxAttempts += MAX_IMAGE_ITERATIONS
          progress.status = 'generating'
        } else if (pauseResult.action === 'skip') {
          progress.status = 'max-attempts'
          return null
        } else {
          throw new Error('WORKFLOW_STOPPED')
        }
      } else {
        if (bestRelPath) {
          progress.status = 'passed'
          const imageRecord = {
            id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
            name: cgSpec.title || `底CG`, relPath: bestRelPath, prompt: currentPrompt,
            planDescription: cgSpec.description, score: bestScore,
            attempts: attempt, autoSelected: true, createdAt: new Date().toISOString(), cgMeta: { type: 'base' }
          }
          store.finalImages.push(imageRecord)
          progress.finalImageRecord = imageRecord
          store.addTimeline('success', `底CG达到上限，自动选取最高分(${bestScore}分)`)
          return imageRecord
        } else {
          progress.status = 'max-attempts'
          return null
        }
      }
    }
  }
  return null
}

// ===== 单张差分生成（1并发生成，加入队列审核） =====

async function processOneDiff(store, diffSpec, baseCGDataUrl, diffIndex, globalReviewMutex, myWorkflowId) {
  const progress = store.imageProgress[diffIndex]
  progress.status = 'generating'
  let currentPrompt = diffSpec.prompt
  let attempt = 0
  let maxAttempts = MAX_IMAGE_ITERATIONS
  let lastScore = null
  let bestRelPath = null
  let bestScore = -1

  while (attempt < maxAttempts) {
    await checkStopped(store, myWorkflowId)
    if (await checkTimeUp(store, myWorkflowId)) {
      progress.status = 'timeout'
      store.addTimeline('warn', `时间耗尽，差分 #${diffSpec.index} 未完成`)
      return null
    }

    attempt++
    progress.currentPrompt = currentPrompt
    progress.currentAttempt = attempt
    store.addTimeline('image', `差分 #${diffSpec.index} 第 ${attempt} 轮生成`)

    // 差分只用底CG作为参考图
    const refImgs = [{ dataUrl: baseCGDataUrl }]

    // 始终1并发请求
    let result = null
    try {
      result = await callImageModel(store, currentPrompt, refImgs, myWorkflowId)
    } catch (err) {
      if (err.message === 'WORKFLOW_STOPPED' || err.message === 'ALL_IMAGE_MODELS_EXHAUSTED') throw err
    }

    await checkStopped(store, myWorkflowId)

    const candidates = []
    if (result && result.data) {
      for (const item of result.data) {
        let dataUrl = ''
        if (item.b64_json) dataUrl = toDataUrl(item.b64_json)
        else if (item.url) try { dataUrl = await downloadImageAsBase64(item.url) } catch { continue }
        if (dataUrl) candidates.push({ dataUrl })
      }
    }

    if (candidates.length === 0) {
      store.addTimeline('warn', `差分 #${diffSpec.index} 第 ${attempt} 轮未生成有效图片`)
      continue
    }

    progress.status = 'reviewing'
    let passedImage = null
    let lastReview = null

    if (store.config.confirmMode === 'confirm-all') {
      const enableAiReview = store.config.enableAiReview !== false
      let reviewedCandidates = []
      let bestReviewIdx = 0

      if (enableAiReview) {
        for (let gi = 0; gi < candidates.length; gi++) {
          await checkStopped(store, myWorkflowId)
          store.addTimeline('llm', `AI 评审差分 #${diffSpec.index} 候选图 ${gi + 1}/${candidates.length}`)
          const review = await reviewDiffImage(store, baseCGDataUrl, candidates[gi].dataUrl, diffSpec.description, currentPrompt, myWorkflowId)

          if (review.score > bestScore) {
            if (bestRelPath) deleteImage(bestRelPath).catch(() => {})
            try {
              const saved = await saveImage(candidates[gi].dataUrl, 'workflow')
              bestRelPath = saved.relPath
              bestScore = review.score
            } catch { }
          }
          reviewedCandidates.push({
            dataUrl: candidates[gi].dataUrl, score: review.score, comment: review.comment,
            passed: review.passed, improvedPrompt: review.improvedPrompt || ''
          })
          store.addTimeline(review.passed ? 'success' : 'info', `差分 #${diffSpec.index} 候选图 ${gi + 1}: ${review.score}分 - ${review.comment}`)
        }
        bestReviewIdx = reviewedCandidates.reduce((best, c, i) => c.score > reviewedCandidates[best].score ? i : best, 0)
      } else {
        reviewedCandidates = candidates.map(c => ({ dataUrl: c.dataUrl, score: null, comment: '', passed: false, improvedPrompt: '' }))
        bestReviewIdx = null
      }

      await checkStopped(store, myWorkflowId)
      progress.status = 'waiting-confirm'
      
      // 队列式审核：请求锁
      store.addTimeline('info', `差分 #${diffSpec.index} 准备就绪，等待排队审核...`)
      await globalReviewMutex.acquire()
      await checkStopped(store, myWorkflowId)

      store.addTimeline('info', `展示差分 #${diffSpec.index} 给用户选择`)

      const confirmResult = await store.requestConfirm('batch-image-review', {
        imageSpec: diffSpec, candidates: reviewedCandidates, attempt,
        totalRequested: 1, failedCount: 0, recommendedIndex: bestReviewIdx
      })

      // 释放锁
      globalReviewMutex.release()
      await checkStopped(store, myWorkflowId)

      if (confirmResult.approved && confirmResult.selectedIndices && confirmResult.selectedIndices.length > 0) {
        const primaryIdx = confirmResult.selectedIndices[0]
        passedImage = candidates[primaryIdx]
        lastReview = { score: reviewedCandidates[primaryIdx].score, passed: true, comment: '用户手动通过', improvedPrompt: '' }
        lastScore = reviewedCandidates[primaryIdx].score
      } else {
        const feedback = confirmResult.feedback || ''
        store.addTimeline('info', `用户打回差分 #${diffSpec.index}`)
        if (enableAiReview && bestReviewIdx !== null) {
          const bestReview = reviewedCandidates[bestReviewIdx]
          let finalImprovedPrompt = bestReview.improvedPrompt || currentPrompt
          if (feedback) {
            try {
              store.addTimeline('llm', '融合评审建议与用户反馈...')
              const merged = await callLLM(store, [
                { role: 'system', content: '你是AI绘图提示词优化专家。现在需要融合AI建议和用户意见生成新的完整中文提示词，只输出提示词。' },
                { role: 'user', content: `当前提示词：\n${finalImprovedPrompt}\nAI建议：${bestReview.comment}\n用户意见：${feedback}\n请输出新提示词：` }
              ], null, myWorkflowId)
              if (merged && merged.trim()) finalImprovedPrompt = merged.trim()
            } catch (err) { if (err.message === 'WORKFLOW_STOPPED') throw err }
          }
          lastReview = { score: bestReview.score, passed: false, comment: feedback || bestReview.comment, improvedPrompt: finalImprovedPrompt }
        } else {
          let newPrompt = ''
          if (feedback) {
            try {
              store.addTimeline('llm', '融合用户反馈...')
              const merged = await callLLM(store, [
                { role: 'system', content: '你是AI绘图提示词优化专家。现在需要融合用户意见生成新的完整中文提示词。' },
                { role: 'user', content: `原始提示词：\n${currentPrompt}\n用户意见：\n${feedback}\n请输出新提示词：` }
              ], null, myWorkflowId)
              if (merged && merged.trim()) newPrompt = merged.trim()
            } catch (err) { if (err.message === 'WORKFLOW_STOPPED') throw err }
          }
          lastReview = { score: null, passed: false, comment: feedback || '用户打回', improvedPrompt: newPrompt }
        }
      }
    } else {
      // 纯AI / 用户仅确认大纲
      for (let gi = 0; gi < candidates.length; gi++) {
        await checkStopped(store, myWorkflowId)
        store.addTimeline('llm', `评审差分 #${diffSpec.index} 第 ${attempt} 轮 (${gi + 1}/${candidates.length})`)
        const review = await reviewDiffImage(store, baseCGDataUrl, candidates[gi].dataUrl, diffSpec.description, currentPrompt, myWorkflowId)
        lastReview = review
        if (review.score > bestScore) {
          if (bestRelPath) deleteImage(bestRelPath).catch(() => {})
          try {
            const saved = await saveImage(candidates[gi].dataUrl, 'workflow')
            bestRelPath = saved.relPath
            bestScore = review.score
          } catch { }
        }
        store.addTimeline(review.passed ? 'success' : 'info', `评审: ${review.score}分 ${review.passed ? '通过' : '未通过'} - ${review.comment}`)
        if (review.passed) { passedImage = candidates[gi]; break }
      }
    }

    if (passedImage) {
      progress.status = 'passed'
      let relPath = ''
      try {
        const saved = await saveImage(passedImage.dataUrl, 'workflow')
        relPath = saved.relPath
      } catch (err) { store.addTimeline('warn', `差分保存失败: ${err.message}`) }

      if (bestRelPath && bestRelPath !== relPath) deleteImage(bestRelPath).catch(() => {})
      for (const c of candidates) { delete c.dataUrl }

      const imageRecord = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        name: diffSpec.title || `差分 #${diffSpec.index}`, relPath, prompt: currentPrompt,
        planDescription: diffSpec.description, score: lastReview?.score,
        attempts: attempt, createdAt: new Date().toISOString(), cgMeta: { type: 'diff', changeType: diffSpec.changeType }
      }
      store.finalImages.push(imageRecord)
      progress.finalImageRecord = imageRecord
      store.addTimeline('success', `差分 #${diffSpec.index}「${diffSpec.title}」已通过`)
      return imageRecord
    }

    for (const c of candidates) { delete c.dataUrl }
    progress.status = 'generating'
    if (lastReview?.improvedPrompt && lastReview.improvedPrompt !== currentPrompt) {
      currentPrompt = lastReview.improvedPrompt
    }

    if (attempt >= maxAttempts) {
      if (store.config.confirmMode === 'confirm-all') {
        progress.status = 'waiting-confirm'
        await globalReviewMutex.acquire()
        const pauseResult = await store.requestConfirm('iteration-limit', { imageSpec: diffSpec, attempt, lastScore })
        globalReviewMutex.release()
        await checkStopped(store, myWorkflowId)
        if (pauseResult.action === 'retry') {
          maxAttempts += MAX_IMAGE_ITERATIONS
          progress.status = 'generating'
        } else if (pauseResult.action === 'skip') {
          progress.status = 'max-attempts'
          return null
        } else {
          throw new Error('WORKFLOW_STOPPED')
        }
      } else {
        if (bestRelPath) {
          progress.status = 'passed'
          const imageRecord = {
            id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
            name: diffSpec.title || `差分 #${diffSpec.index}`, relPath: bestRelPath, prompt: currentPrompt,
            planDescription: diffSpec.description, score: bestScore,
            attempts: attempt, autoSelected: true, createdAt: new Date().toISOString(), cgMeta: { type: 'diff', changeType: diffSpec.changeType }
          }
          store.finalImages.push(imageRecord)
          progress.finalImageRecord = imageRecord
          store.addTimeline('success', `差分 #${diffSpec.index} 达到上限，自动选取最高分(${bestScore}分)`)
          return imageRecord
        } else {
          progress.status = 'max-attempts'
          return null
        }
      }
    }
  }
  return null
}

// ===== 主流程入口 =====

export async function startCgDiffWorkflow(store) {
  store.beginPlanning()
  const myWorkflowId = store.workflowId

  try {
    let baseCGDataUrl = null
    let baseCGPrompt = ''
    let baseCgRelPath = null

    // ==========================================
    // 模式分支1：从零绘制 CG + 差分
    // ==========================================
    if (store.config.cgDiffMode === 'full') {
      // ----- 1. 生成并确认底CG大纲 -----
      let cgPlanApproved = false
      let cgFeedback = null
      let previousCgText = null
      let consecutiveCgRejects = 0
      let consecutiveCgParseFails = 0

      while (!cgPlanApproved) {
        await checkStopped(store, myWorkflowId)
        store.status = 'planning'

        let planData
        try {
          planData = await generateCGPlan(store, cgFeedback, previousCgText, myWorkflowId)
          consecutiveCgParseFails = 0
        } catch (err) {
          if (err.message === 'WORKFLOW_STOPPED') throw err
          if (err.message === 'ALL_LLM_MODELS_EXHAUSTED') throw err

          if (err.message === 'PLAN_PARSE_FAILED') {
            consecutiveCgParseFails++
            store.addTimeline('warn', `CG大纲解析失败 (连续 ${consecutiveCgParseFails}/${MAX_PARSE_FAILS})`)
            if (consecutiveCgParseFails >= MAX_PARSE_FAILS) {
              const pauseResult = await store.requestConfirm('plan-pause', {
                reason: 'parse-failed',
                message: `AI 已连续 ${MAX_PARSE_FAILS} 次未能返回可解析的CG大纲，建议更换语言模型后重试。`,
                count: consecutiveCgParseFails,
              })
              await checkStopped(store, myWorkflowId)
              if (pauseResult.abort) throw new Error('WORKFLOW_STOPPED')
              consecutiveCgParseFails = 0
            }
            continue
          }
          throw err
        }

        if (store.config.confirmMode === 'pure-ai') {
          cgPlanApproved = true
          store.addTimeline('info', '纯AI模式 - 底CG大纲自动通过')
        } else {
          store.status = 'confirming-plan'
          store.addTimeline('info', '等待用户确认底CG大纲...')
          const result = await store.requestConfirm('plan', { text: store.planningText, plan: store.plan })
          await checkStopped(store, myWorkflowId)

          if (result.approved) {
            cgPlanApproved = true
            store.addTimeline('success', '用户已确认底CG大纲')
          } else {
            consecutiveCgRejects++
            previousCgText = store.planningText
            cgFeedback = result.feedback || '请重新制定'
            store.addTimeline('info', `用户打回底CG大纲 (${consecutiveCgRejects}/${MAX_CG_PLAN_REJECTS})`)

            if (consecutiveCgRejects >= MAX_CG_PLAN_REJECTS) {
              const pauseResult = await store.requestConfirm('plan-pause', {
                reason: 'reject-limit',
                message: `连续 ${MAX_CG_PLAN_REJECTS} 次打回底CG大纲，工作流已暂停。`,
                count: consecutiveCgRejects
              })
              await checkStopped(store, myWorkflowId)
              if (pauseResult.abort) throw new Error('WORKFLOW_STOPPED')
              consecutiveCgRejects = 0
            }
          }
        }
      }

      // ----- 2. 生成底CG -----
      store.status = 'running'
      store.addTimeline('info', '开始生成底CG...')

      store.imageProgress = [{
        index: '底CG',
        title: store.plan.images[0].title,
        status: 'pending',
        currentPrompt: store.plan.images[0].initialPrompt,
        currentAttempt: 0,
        attempts: [],
        finalImageRecord: null
      }]

      const cgResult = await processBaseCG(store, store.plan.images[0], myWorkflowId)
      if (!cgResult) {
        throw new Error('底CG生成失败或被跳过，无法继续绘制差分')
      }

      baseCgRelPath = cgResult.relPath
      baseCGPrompt = cgResult.prompt
      // 读取底CG的 dataUrl 用于后续差分规划和生成的参考图
      baseCGDataUrl = await readImageAsBase64(baseCgRelPath)
    }
    // ==========================================
    // 模式分支2：仅绘制差分
    // ==========================================
    else {
      if (!store.config.cgDiffBaseCG || !store.config.cgDiffBaseCG.dataUrl) {
        throw new Error('仅绘制差分模式下，必须提供底CG图片')
      }
      baseCGDataUrl = store.config.cgDiffBaseCG.dataUrl
      baseCGPrompt = store.config.initialPrompt || '基础角色CG'
      store.addTimeline('info', '已读取用户上传的底CG，开始差分规划...')
    }

    // ==========================================
    // 共同阶段：生成并确认差分大纲
    // ==========================================
    let diffPlanApproved = false
    let diffFeedback = null
    let previousDiffText = null
    let consecutiveDiffRejects = 0
    let consecutiveDiffParseFails = 0
    let diffPlanData = null

    while (!diffPlanApproved) {
      await checkStopped(store, myWorkflowId)
      store.status = 'planning'

      let result
      try {
        result = await generateDiffPlan(store, baseCGDataUrl, baseCGPrompt, diffFeedback, previousDiffText, myWorkflowId)
        consecutiveDiffParseFails = 0
      } catch (err) {
        if (err.message === 'WORKFLOW_STOPPED') throw err
        if (err.message === 'ALL_LLM_MODELS_EXHAUSTED') throw err

        if (err.message === 'PLAN_PARSE_FAILED') {
          consecutiveDiffParseFails++
          store.addTimeline('warn', `差分大纲解析失败 (连续 ${consecutiveDiffParseFails}/${MAX_PARSE_FAILS})`)
          if (consecutiveDiffParseFails >= MAX_PARSE_FAILS) {
            const pauseResult = await store.requestConfirm('plan-pause', {
              reason: 'parse-failed',
              message: `AI 已连续 ${MAX_PARSE_FAILS} 次未能返回可解析的差分大纲，建议更换语言模型后重试。`,
              count: consecutiveDiffParseFails,
            })
            await checkStopped(store, myWorkflowId)
            if (pauseResult.abort) throw new Error('WORKFLOW_STOPPED')
            consecutiveDiffParseFails = 0
          }
          continue
        }
        throw err
      }
      diffPlanData = result.planData

      // 构建展示用的 plan
      const displayPlan = {
        totalImages: diffPlanData.totalDiffs,
        strategy: diffPlanData.strategy || '差分绘制',
        images: diffPlanData.diffs.map((d, i) => ({
          index: i + 1,
          title: d.title,
          description: d.description,
          initialPrompt: d.prompt,
        }))
      }
      store.plan = displayPlan

      if (store.config.confirmMode === 'pure-ai') {
        diffPlanApproved = true
        store.addTimeline('info', '纯AI模式 - 差分大纲自动通过')
      } else {
        store.status = 'confirming-plan'
        store.addTimeline('info', '等待用户确认差分大纲...')
        const confirmResult = await store.requestConfirm('plan', { text: result.fullText, plan: displayPlan })
        await checkStopped(store, myWorkflowId)

        if (confirmResult.approved) {
          diffPlanApproved = true
          store.addTimeline('success', '用户已确认差分大纲')
        } else {
          consecutiveDiffRejects++
          previousDiffText = result.fullText
          diffFeedback = confirmResult.feedback || '请重新制定'
          store.addTimeline('info', `用户打回差分大纲 (${consecutiveDiffRejects}/${MAX_DIFF_PLAN_REJECTS})`)

          if (consecutiveDiffRejects >= MAX_DIFF_PLAN_REJECTS) {
            const pauseResult = await store.requestConfirm('plan-pause', {
              reason: 'reject-limit',
              message: `连续 ${MAX_DIFF_PLAN_REJECTS} 次打回差分大纲，工作流已暂停。`,
              count: consecutiveDiffRejects
            })
            await checkStopped(store, myWorkflowId)
            if (pauseResult.abort) throw new Error('WORKFLOW_STOPPED')
            consecutiveDiffRejects = 0
          }
        }
      }
    }

    // ==========================================
    // 共同阶段：并行生成差分
    // ==========================================
    store.status = 'running'
    store.addTimeline('info', '开始并行生成差分...')

    const diffs = diffPlanData.diffs
    const startIndex = store.imageProgress ? store.imageProgress.length : 0

    // 初始化 imageProgress
    const diffProgresses = diffs.map((d, i) => ({
      index: d.index || (i + 1),
      title: d.title,
      status: 'pending',
      currentPrompt: d.prompt,
      currentAttempt: 0,
      attempts: [],
      finalImageRecord: null
    }))

    if (!store.imageProgress) store.imageProgress = []
    store.imageProgress.push(...diffProgresses)

    // 任务队列和互斥锁
    const taskQueue = diffs.map((d, i) => ({ spec: d, pIndex: startIndex + i }))
    const globalReviewMutex = new ReviewMutex()

    // Worker 函数
    async function diffWorker(workerId) {
      while (taskQueue.length > 0) {
        await checkStopped(store, myWorkflowId)
        const task = taskQueue.shift() // 取出任务
        if (!task) break

        store.addTimeline('info', `[Worker ${workerId}] 开始处理差分 #${task.spec.index}: ${task.spec.title}`)
        try {
          await processOneDiff(store, task.spec, baseCGDataUrl, task.pIndex, globalReviewMutex, myWorkflowId)
        } catch (err) {
          if (err.message === 'WORKFLOW_STOPPED' || err.message === 'ALL_IMAGE_MODELS_EXHAUSTED' || err.message === 'ALL_LLM_MODELS_EXHAUSTED') throw err
          store.addTimeline('error', `差分 #${task.spec.index} 处理异常: ${err.message}`)
          store.imageProgress[task.pIndex].status = 'error'
        }
      }
    }

    // 启动最大 DIFF_PARALLEL_SLOTS (4) 个 Worker 并行执行
    const numWorkers = Math.min(DIFF_PARALLEL_SLOTS, diffs.length)
    const workers = []
    for (let i = 0; i < numWorkers; i++) {
      workers.push(diffWorker(i + 1))
    }

    // 等待所有 Worker 完成
    await Promise.all(workers)
    await checkStopped(store, myWorkflowId)

    // ==========================================
    // 结束
    // ==========================================
    store.status = 'completed'
    store.endTime = Date.now()

    const passedCount = store.finalImages.filter(img => img.cgMeta?.type === 'diff').length
    store.addTimeline('success', `工作流完成: 成功生成 ${passedCount}/${diffs.length} 张差分`)

    await store.saveFinalImages()

  } catch (err) {
    // 如果 workflowId 不匹配，说明是旧工作流的残留，直接静默退出
    if (store.workflowId !== myWorkflowId) {
      return
    }
    // 如果已经是停止状态，静默退出，不做任何 store 操作
    if (store.status === 'stopped') {
      return
    }
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