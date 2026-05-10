/**
 * 人物设定生成工作流引擎
 * 流程：角色设定 → 锚定图 → 多角度立绘 → 场景插图(可选) → 结构化文档 → 导入角色卡
 */

import { callLLM, recordLlmParseFail, recordLlmParseSuccess } from '@/utils/workflowEngine'
import { generateImage, toDataUrl, downloadImageAsBase64 } from '@/utils/imageApi'
import { saveImage, deleteImage, readImageAsBase64 } from '@/utils/imageStorage'

// ===== 常量 =====
const MAX_CONSECUTIVE_FAILS = 3
const MAX_PLAN_REJECTS = 5
const MAX_PARSE_FAILS = 3
const MAX_IMAGE_ITERATIONS = 10

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

// ===== 立绘专用生图（自动竖图尺寸） =====
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
      // 先尝试 2K 竖图
      const result = await generateImage({
        baseUrl: model.baseUrl, apiKey: model.apiKey, model: model.modelName,
        prompt, referenceImages, size: '1440x2560',
        apiType: model.apiType, customEndpoint: model.endpoint, quality: store.config.imageQuality,
      })
      model.consecutiveFails = 0
      model.successCount++
      return result
    } catch (firstErr) {
      if (store.status === 'stopped' || store.workflowId !== myWorkflowId) {
        throw new Error('WORKFLOW_STOPPED')
      }
      // 2K 失败，尝试 auto + 提示词要求竖图
      store.addTimeline('info', `2K竖图尺寸请求失败，尝试使用 auto 尺寸...`)
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
        if (store.status === 'stopped' || store.workflowId !== myWorkflowId) {
          throw new Error('WORKFLOW_STOPPED')
        }
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

// ===== 图片评审 =====
function buildReviewPrompt(scoreThreshold, context) {
  return `你是一位专业的角色设定画评审专家。${context}

评分标准（满分100分）：
- 画面质量和清晰度 (20分)
- 与需求描述的匹配程度 (20分)
- 角色特征一致性 (20分)
- 画面是否有局部崩坏（三只手、三只腿等） (20分)
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

async function reviewImage(store, imageDataUrl, description, currentPrompt, reviewContext, myWorkflowId) {
  const messages = [
    { role: 'system', content: buildReviewPrompt(store.config.scoreThreshold, reviewContext) },
    { role: 'user', content: [
      { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
      { type: 'text', text: `需求描述：${description}\n\n当前提示词：${currentPrompt}\n\n请评审这张图片。` },
    ] },
  ]
  const fullText = await callLLM(store, messages, null, myWorkflowId)
  const result = parseReviewResult(fullText)
  if (!result) {
    return { score: 0, passed: false, comment: '评审结果解析失败', improvedPrompt: currentPrompt }
  }
  result.passed = result.score >= store.config.scoreThreshold
  if (!result.improvedPrompt) result.improvedPrompt = ''
  if (!result.comment) result.comment = ''
  return result
}

// 带参考图对比的评审（多角度/场景用）
async function reviewImageWithRef(store, refDataUrl, imageDataUrl, description, currentPrompt, reviewContext, myWorkflowId) {
  const messages = [
    { role: 'system', content: buildReviewPrompt(store.config.scoreThreshold, reviewContext) },
    { role: 'user', content: [
      { type: 'image_url', image_url: { url: refDataUrl, detail: 'high' } },
      { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
      { type: 'text', text: `第一张图是正面锚定图（参考基准）。第二张图是需要评审的图。\n需求描述：${description}\n当前提示词：${currentPrompt}\n\n请评审第二张图，确保角色特征与锚定图一致。` },
    ] },
  ]
  const fullText = await callLLM(store, messages, null, myWorkflowId)
  const result = parseReviewResult(fullText)
  if (!result) {
    return { score: 0, passed: false, comment: '评审结果解析失败', improvedPrompt: currentPrompt }
  }
  result.passed = result.score >= store.config.scoreThreshold
  if (!result.improvedPrompt) result.improvedPrompt = ''
  if (!result.comment) result.comment = ''
  return result
}

// ===== LLM 阶段1：丰富角色设定 =====

function buildCharSettingSystemPrompt(config) {
  const refCount = config.referenceImages?.length || 0
  const refInfo = refCount > 0 ? `\n用户提供了 ${refCount} 张参考图，请结合参考图特征。` : ''

  return `你是一个专业的角色设定师，擅长创建丰富详细的原创角色。

根据用户的简短描述，请创建一个完整的角色设定，包括：
1. 角色名（如果用户已指定角色名则必须使用该名字，否则请起一个合适的名字）
2. 外貌详细描述（发色、发型、瞳色、肤色、体型、标志性特征）
3. 服装描述（日常服装的详细描述）
4. 基础设定（年龄、身高、种族等）
5. 性格特点（性格类型、行为习惯、说话方式）
6. 背景故事（简要的角色经历和背景）
7. 标志性物品（如果有的话）
8. 推荐画风关键词${refInfo}

请直接给出以下JSON，不要有任何废话：

\`\`\`json
{
  "name": "角色名",
  "appearance": "详细的外貌描述",
  "outfit": "详细的服装描述",
  "basicInfo": "年龄、身高、种族等基础信息",
  "personality": "性格特点描述",
  "backstory": "背景故事",
  "signatureItems": "标志性物品描述（没有则为空字符串）",
  "styleKeywords": "推荐画风关键词",
  "frontPrompt": "用于生成正面全身立绘的高质量中文提示词（必须包含：角色完整外貌、服装、正面全身站姿、纯色背景、画风关键词）"
}
\`\`\``
}

function buildCharSettingUserMessage(config) {
  const content = []
  if (config.referenceImages?.length > 0) {
    for (const img of config.referenceImages) {
      if (img.dataUrl) {
        content.push({ type: 'image_url', image_url: { url: img.dataUrl, detail: 'high' } })
      }
    }
  }
  let text = config.initialPrompt
  if (config.charDesignName?.trim()) {
    text = `【指定角色名：${config.charDesignName.trim()}】\n${text}`
  }
  content.push({ type: 'text', text })
  if (content.length === 1) return { role: 'user', content: text }
  return { role: 'user', content }
}

async function generateCharSetting(store, feedback, previousText, myWorkflowId) {
  store.planningText = ''
  const messages = [{ role: 'system', content: buildCharSettingSystemPrompt(store.config) }]
  if (feedback && previousText) {
    messages.push(buildCharSettingUserMessage(store.config))
    messages.push({ role: 'assistant', content: previousText })
    messages.push({ role: 'user', content: `我对上面的设定不满意，请根据以下意见修改：\n${feedback}` })
  } else {
    messages.push(buildCharSettingUserMessage(store.config))
  }
  const fullText = await callLLM(store, messages, t => { store.planningText = t }, myWorkflowId)
  store.planningText = fullText

  const data = extractJSON(fullText, 'name')
  if (!data || !data.frontPrompt) {
    store.addTimeline('warn', '未能解析角色设定')
    recordLlmParseFail(store)
    throw new Error('PLAN_PARSE_FAILED')
  }
  recordLlmParseSuccess(store)
  store.addTimeline('info', `角色设定已生成：${data.name}`)
  return { fullText, data }
}

// ===== 通用单张图片处理循环 =====

async function processOneImageGeneric(store, spec, progressIndex, referenceImages, reviewContext, confirmMode, myWorkflowId) {
  const progress = store.imageProgress[progressIndex]
  progress.status = 'generating'
  let currentPrompt = spec.prompt
  let attempt = 0
  let maxAttempts = MAX_IMAGE_ITERATIONS
  let lastScore = null
  let bestRelPath = null
  let bestScore = -1

  // 确定此图是否需要用户确认
  const needUserConfirm = (confirmMode === 'confirm-all' || confirmMode === 'confirm-image')
  const enableAiReview = store.config.enableAiReview !== false

  while (attempt < maxAttempts) {
    await checkStopped(store, myWorkflowId)
    if (await checkTimeUp(store, myWorkflowId)) {
      progress.status = 'timeout'
      store.addTimeline('warn', `时间耗尽，${spec.title} 未完成`)
      return null
    }

    attempt++
    progress.currentPrompt = currentPrompt
    progress.currentAttempt = attempt
    store.addTimeline('image', `${spec.title} 第 ${attempt} 轮生成 (并发 ${store.config.concurrency})`)

    // 并发生成（立绘使用竖图专用函数）
    const isPortrait = spec.meta?.type === 'anchor' || spec.meta?.type === 'angle'
    const imageGenFn = isPortrait ? callImageModelPortrait : callImageModel
    const promises = []
    for (let c = 0; c < store.config.concurrency; c++) {
      promises.push(
        imageGenFn(store, currentPrompt, referenceImages, myWorkflowId).catch(err => {
          if (err.message === 'WORKFLOW_STOPPED' || err.message === 'ALL_IMAGE_MODELS_EXHAUSTED') throw err
          return null
        })
      )
    }

    let results = await Promise.all(promises)
    await checkStopped(store, myWorkflowId)

    // 收集有效图片
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
      store.addTimeline('warn', `${spec.title} 第 ${attempt} 轮未生成有效图片`)
      continue
    }

    progress.status = 'reviewing'
    let passedImage = null
    let lastReview = null
    const requestFailCount = results.filter(r => r === null).length

    if (needUserConfirm) {
      // 用户确认图片模式
      let reviewedCandidates = []
      let bestReviewIdx = 0

      if (enableAiReview) {
        store.addTimeline('llm', `并发评审 ${spec.title} ${candidates.length} 张候选图...`)

        const reviewPromises = candidates.map(async (candidate, gi) => {
          await checkStopped(store, myWorkflowId)
          try {
            const review = referenceImages && referenceImages.length > 0 && spec.useRefReview
              ? await reviewImageWithRef(store, referenceImages[0].dataUrl, candidate.dataUrl, spec.description, currentPrompt, reviewContext, myWorkflowId)
              : await reviewImage(store, candidate.dataUrl, spec.description, currentPrompt, reviewContext, myWorkflowId)
            await checkStopped(store, myWorkflowId)
            return { gi, review }
          } catch (err) {
            if (err.message === 'WORKFLOW_STOPPED') throw err
            return { gi, review: { score: 0, passed: false, comment: '评审失败: ' + err.message, improvedPrompt: '' } }
          }
        })

        let reviewResults
        try { reviewResults = await Promise.all(reviewPromises) }
        catch (err) { if (err.message === 'WORKFLOW_STOPPED') throw err; throw err }
        await checkStopped(store, myWorkflowId)

        for (const { gi, review } of reviewResults) {
          if (review.score > bestScore) {
            if (bestRelPath) deleteImage(bestRelPath).catch(() => {})
            try {
              const saved = await saveImage(candidates[gi].dataUrl, 'workflow')
              bestRelPath = saved.relPath
              bestScore = review.score
            } catch {}
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

      const confirmResult = await store.requestConfirm('batch-image-review', {
        imageSpec: spec, candidates: reviewedCandidates, attempt,
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
        store.addTimeline('info', `用户打回 ${spec.title}${feedback ? ': ' + feedback : ''}`)
        if (enableAiReview && bestReviewIdx !== null) {
          const bestReview = reviewedCandidates[bestReviewIdx]
          let finalPrompt = bestReview.improvedPrompt || currentPrompt
          if (feedback) {
            try {
              const merged = await callLLM(store, [
                { role: 'system', content: '你是AI提示词优化专家。融合AI建议和用户意见生成新的完整中文提示词，只输出提示词。' },
                { role: 'user', content: `当前提示词：\n${finalPrompt}\nAI建议：${bestReview.comment}\n用户意见：${feedback}\n请输出新提示词：` }
              ], null, myWorkflowId)
              if (merged?.trim()) finalPrompt = merged.trim()
            } catch (err) { if (err.message === 'WORKFLOW_STOPPED') throw err }
          }
          lastReview = { score: bestReview.score, passed: false, comment: feedback || bestReview.comment, improvedPrompt: finalPrompt }
        } else {
          let newPrompt = ''
          if (feedback) {
            try {
              const merged = await callLLM(store, [
                { role: 'system', content: '你是AI提示词优化专家。融合用户意见生成新的完整中文提示词。' },
                { role: 'user', content: `原始提示词：\n${currentPrompt}\n用户意见：\n${feedback}\n请输出新提示词：` }
              ], null, myWorkflowId)
              if (merged?.trim()) newPrompt = merged.trim()
            } catch (err) { if (err.message === 'WORKFLOW_STOPPED') throw err }
          }
          lastReview = { score: null, passed: false, comment: feedback || '用户打回', improvedPrompt: newPrompt }
        }
      }
    } else {
      // 纯AI / 仅确认非图片节点：并发评审选最高分
      store.addTimeline('llm', `并发评审 ${spec.title} ${candidates.length} 张候选图...`)

      const reviewPromises = candidates.map(async (candidate, gi) => {
        await checkStopped(store, myWorkflowId)
        try {
          const review = referenceImages && referenceImages.length > 0 && spec.useRefReview
            ? await reviewImageWithRef(store, referenceImages[0].dataUrl, candidate.dataUrl, spec.description, currentPrompt, reviewContext, myWorkflowId)
            : await reviewImage(store, candidate.dataUrl, spec.description, currentPrompt, reviewContext, myWorkflowId)
          await checkStopped(store, myWorkflowId)
          return { gi, review }
        } catch (err) {
          if (err.message === 'WORKFLOW_STOPPED') throw err
          return { gi, review: { score: 0, passed: false, comment: '评审失败: ' + err.message, improvedPrompt: '' } }
        }
      })

      let reviewResults
      try { reviewResults = await Promise.all(reviewPromises) }
      catch (err) { if (err.message === 'WORKFLOW_STOPPED') throw err; throw err }
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
          } catch {}
        }
        store.addTimeline(review.passed ? 'success' : 'info', `候选图 ${gi + 1}: ${review.score}分 ${review.passed ? '通过' : '未通过'} - ${review.comment}`)
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
      } catch (err) { store.addTimeline('warn', `图片保存失败: ${err.message}`) }

      if (bestRelPath && bestRelPath !== relPath) deleteImage(bestRelPath).catch(() => {})
      for (const c of candidates) { delete c.dataUrl }

      const imageRecord = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        name: spec.title, relPath, prompt: currentPrompt,
        planDescription: spec.description, score: lastReview?.score,
        attempts: attempt, createdAt: new Date().toISOString(),
        charDesignMeta: spec.meta || {},
      }
      store.finalImages.push(imageRecord)
      progress.finalImageRecord = imageRecord
      store.addTimeline('success', `${spec.title} 已通过 (${lastReview?.score}分, 共${attempt}轮)`)
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
        const pauseResult = await store.requestConfirm('iteration-limit', { imageSpec: spec, attempt, lastScore })
        await checkStopped(store, myWorkflowId)
        if (pauseResult.action === 'retry') { maxAttempts += MAX_IMAGE_ITERATIONS; progress.status = 'generating' }
        else if (pauseResult.action === 'skip') { progress.status = 'max-attempts'; return null }
        else { throw new Error('WORKFLOW_STOPPED') }
      } else {
        if (bestRelPath) {
          progress.status = 'passed'
          const imageRecord = {
            id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
            name: spec.title, relPath: bestRelPath, prompt: currentPrompt,
            planDescription: spec.description, score: bestScore,
            attempts: attempt, autoSelected: true, createdAt: new Date().toISOString(),
            charDesignMeta: spec.meta || {},
          }
          store.finalImages.push(imageRecord)
          progress.finalImageRecord = imageRecord
          store.addTimeline('success', `${spec.title} 达到上限，自动选取最高分(${bestScore}分)`)
          return imageRecord
        } else { progress.status = 'max-attempts'; return null }
      }
    }
  }
  return null
}

// ===== 场景故事大纲生成 =====

function buildScenePlanPrompt(charSetting) {
  return `你是一个专业的角色故事策划师。

以下是角色的设定信息：
- 角色名：${charSetting.name}
- 外貌：${charSetting.appearance}
- 服装：${charSetting.outfit}
- 性格：${charSetting.personality}
- 背景故事：${charSetting.backstory}

请根据角色的背景和性格，为这个角色构建 1~5 个合理的故事/经历场景，每个场景将用于生成一张全身插图。

要求：
1. 场景要与角色的背景故事和性格相符
2. 场景要有画面感，适合绘制插图
3. 每个场景的提示词要包含完整的角色外貌描述和服装描述，确保角色一致性
4. 提示词中要描述场景环境、光影氛围、角色的动作和表情

请直接输出以下JSON，不要有任何解释和废话：

\`\`\`json
{
  "scenes": [
    {
      "index": 1,
      "title": "场景标题",
      "story": "这个场景对应的故事/经历文本（2-4句话描述发生了什么）",
      "description": "画面描述",
      "prompt": "完整的中文生图提示词（包含角色完整外貌、服装、场景环境、动作表情、光影氛围、画风）"
    }
  ]
}
\`\`\``
}

// ===== 审核互斥锁（表情差分队列式审核用） =====
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

// ===== 表情差分大纲生成 =====

function buildExpressionPlanPrompt(charSetting, count) {
  return `你是一个专业的角色表情设计师。

以下是角色的设定信息：
- 角色名：${charSetting.name}
- 外貌：${charSetting.appearance}
- 服装：${charSetting.outfit}
- 性格：${charSetting.personality}

请为这个角色设计 ${count} 个不同的表情差分。每个表情差分将以正面全身立绘为基础，只改变面部表情和相关的细微动作（如手部小动作），保持整体构图、服装、背景不变。

要求：
1. 表情要丰富多样，涵盖不同情绪
2. 每个提示词必须包含完整的角色外貌、服装描述，确保角色一致性
3. 提示词中必须强调"保持与正面立绘一致的构图、服装、纯色背景"
4. 只修改表情和相关的细微肢体语言

请直接输出以下JSON，不要任何废话：

\`\`\`json
{
  "expressions": [
    {
      "index": 1,
      "title": "表情名称（如：微笑）",
      "description": "这个表情的描述",
      "prompt": "完整的中文生图提示词（以正面立绘提示词为基础，修改表情部分）"
    }
  ]
}
\`\`\``
}

async function generateExpressionPlan(store, charSetting, count, feedback, previousText, myWorkflowId) {
  store.planningText = ''
  const messages = [{ role: 'system', content: buildExpressionPlanPrompt(charSetting, count) }]
  if (feedback && previousText) {
    messages.push({ role: 'user', content: `请为角色「${charSetting.name}」设计 ${count} 个表情差分。` })
    messages.push({ role: 'assistant', content: previousText })
    messages.push({ role: 'user', content: `我对上面的方案不满意，请根据以下意见修改：\n${feedback}` })
  } else {
    messages.push({ role: 'user', content: `请为角色「${charSetting.name}」设计 ${count} 个表情差分。` })
  }
  const fullText = await callLLM(store, messages, t => { store.planningText = t }, myWorkflowId)
  store.planningText = fullText

  const data = extractJSON(fullText, 'expressions')
  if (!data || !data.expressions || data.expressions.length === 0) {
    store.addTimeline('warn', '未能解析表情差分大纲')
    recordLlmParseFail(store)
    throw new Error('PLAN_PARSE_FAILED')
  }
  recordLlmParseSuccess(store)
  store.addTimeline('info', `表情差分大纲已生成：共 ${data.expressions.length} 个表情`)
  return { fullText, data }
}

// ===== 单张表情差分处理（1并发+队列审核） =====

async function processOneExpression(store, spec, progressIndex, anchorRef, reviewMutex, confirmMode, myWorkflowId) {
  const progress = store.imageProgress[progressIndex]
  progress.status = 'generating'
  let currentPrompt = spec.prompt
  let attempt = 0
  let maxAttempts = MAX_IMAGE_ITERATIONS
  let bestRelPath = null
  let bestScore = -1

  const needUserConfirm = (confirmMode === 'confirm-all' || confirmMode === 'confirm-image')

  while (attempt < maxAttempts) {
    await checkStopped(store, myWorkflowId)
    if (await checkTimeUp(store, myWorkflowId)) {
      progress.status = 'timeout'
      return null
    }

    attempt++
    progress.currentPrompt = currentPrompt
    progress.currentAttempt = attempt
    store.addTimeline('image', `表情「${spec.title}」第 ${attempt} 轮生成`)

    let result = null
    try {
      result = await callImageModelPortrait(store, currentPrompt, anchorRef, myWorkflowId)
    } catch (err) {
      if (err.message === 'WORKFLOW_STOPPED' || err.message === 'ALL_IMAGE_MODELS_EXHAUSTED') throw err
    }

    await checkStopped(store, myWorkflowId)

    const candidates = []
    if (result?.data) {
      for (const item of result.data) {
        let dataUrl = ''
        if (item.b64_json) dataUrl = toDataUrl(item.b64_json)
        else if (item.url) try { dataUrl = await downloadImageAsBase64(item.url) } catch { continue }
        if (dataUrl) candidates.push({ dataUrl })
      }
    }

    if (candidates.length === 0) {
      store.addTimeline('warn', `表情「${spec.title}」第 ${attempt} 轮未生成有效图片`)
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
        for (let gi = 0; gi < candidates.length; gi++) {
          await checkStopped(store, myWorkflowId)
          const review = await reviewImageWithRef(store, anchorRef[0].dataUrl, candidates[gi].dataUrl, spec.description, currentPrompt, '请评审这张表情差分，对比锚定图确保角色一致性，只有表情发生了变化。', myWorkflowId)
          if (review.score > bestScore) {
            if (bestRelPath) deleteImage(bestRelPath).catch(() => {})
            try { const saved = await saveImage(candidates[gi].dataUrl, 'workflow'); bestRelPath = saved.relPath; bestScore = review.score } catch {}
          }
          reviewedCandidates.push({ dataUrl: candidates[gi].dataUrl, score: review.score, comment: review.comment, passed: review.passed, improvedPrompt: review.improvedPrompt || '' })
        }
        bestReviewIdx = reviewedCandidates.reduce((best, c, i) => c.score > reviewedCandidates[best].score ? i : best, 0)
      } else {
        reviewedCandidates = candidates.map(c => ({ dataUrl: c.dataUrl, score: null, comment: '', passed: false, improvedPrompt: '' }))
      }

      await checkStopped(store, myWorkflowId)
      progress.status = 'waiting-confirm'

      await reviewMutex.acquire()
      await checkStopped(store, myWorkflowId)

      const confirmResult = await store.requestConfirm('batch-image-review', {
        imageSpec: spec, candidates: reviewedCandidates, attempt,
        totalRequested: 1, failedCount: 0, recommendedIndex: bestReviewIdx
      })

      reviewMutex.release()
      await checkStopped(store, myWorkflowId)

      if (confirmResult.approved && confirmResult.selectedIndices?.length > 0) {
        passedImage = candidates[confirmResult.selectedIndices[0]]
        lastReview = { score: reviewedCandidates[confirmResult.selectedIndices[0]]?.score, passed: true, comment: '用户通过', improvedPrompt: '' }
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
      // 纯AI / 仅确认非图片：AI评审
      for (let gi = 0; gi < candidates.length; gi++) {
        await checkStopped(store, myWorkflowId)
        const review = await reviewImageWithRef(store, anchorRef[0].dataUrl, candidates[gi].dataUrl, spec.description, currentPrompt, '请评审这张表情差分，对比锚定图确保角色一致性，只有表情发生了变化。', myWorkflowId)
        if (review.score > bestScore) {
          if (bestRelPath) deleteImage(bestRelPath).catch(() => {})
          try { const saved = await saveImage(candidates[gi].dataUrl, 'workflow'); bestRelPath = saved.relPath; bestScore = review.score } catch {}
        }
        store.addTimeline(review.passed ? 'success' : 'info', `表情「${spec.title}」: ${review.score}分 - ${review.comment}`)
        if (review.passed) { passedImage = candidates[gi]; lastReview = review; break }
        lastReview = review
      }
    }

    if (passedImage) {
      progress.status = 'passed'
      let relPath = ''
      try { const saved = await saveImage(passedImage.dataUrl, 'workflow'); relPath = saved.relPath } catch {}
      if (bestRelPath && bestRelPath !== relPath) deleteImage(bestRelPath).catch(() => {})
      for (const c of candidates) { delete c.dataUrl }

      const imageRecord = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        name: `表情差分：${spec.title}`, relPath, prompt: currentPrompt,
        planDescription: spec.description, score: lastReview?.score,
        attempts: attempt, createdAt: new Date().toISOString(),
        charDesignMeta: { type: 'expression', expressionName: spec.title },
      }
      store.finalImages.push(imageRecord)
      progress.finalImageRecord = imageRecord
      store.addTimeline('success', `表情「${spec.title}」已通过`)
      return imageRecord
    }

    for (const c of candidates) { delete c.dataUrl }
    progress.status = 'generating'
    if (lastReview?.improvedPrompt && lastReview.improvedPrompt !== currentPrompt) {
      currentPrompt = lastReview.improvedPrompt
    }

    if (attempt >= maxAttempts) {
      if (bestRelPath) {
        progress.status = 'passed'
        const imageRecord = {
          id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
          name: `表情差分：${spec.title}`, relPath: bestRelPath, prompt: currentPrompt,
          planDescription: spec.description, score: bestScore,
          attempts: attempt, autoSelected: true, createdAt: new Date().toISOString(),
          charDesignMeta: { type: 'expression', expressionName: spec.title },
        }
        store.finalImages.push(imageRecord)
        progress.finalImageRecord = imageRecord
        store.addTimeline('success', `表情「${spec.title}」达到上限，自动选取最高分(${bestScore}分)`)
        return imageRecord
      } else {
        progress.status = 'max-attempts'
        return null
      }
    }
  }
  return null
}

async function generateScenePlan(store, charSetting, feedback, previousText, myWorkflowId) {
  store.planningText = ''
  const messages = [{ role: 'system', content: buildScenePlanPrompt(charSetting) }]
  if (feedback && previousText) {
    messages.push({ role: 'user', content: '请为这个角色构建故事场景。' })
    messages.push({ role: 'assistant', content: previousText })
    messages.push({ role: 'user', content: `我对上面的场景方案不满意，请根据以下意见修改：\n${feedback}` })
  } else {
    messages.push({ role: 'user', content: '请为这个角色构建故事场景。' })
  }
  const fullText = await callLLM(store, messages, t => { store.planningText = t }, myWorkflowId)
  store.planningText = fullText

  const data = extractJSON(fullText, 'scenes')
  if (!data || !data.scenes || data.scenes.length === 0) {
    store.addTimeline('warn', '未能解析场景大纲')
    recordLlmParseFail(store)
    throw new Error('PLAN_PARSE_FAILED')
  }
  recordLlmParseSuccess(store)
  store.addTimeline('info', `场景大纲已生成：共 ${data.scenes.length} 个场景`)
  return { fullText, data }
}

// ===== LLM 阶段2：生成结构化文档 =====

function buildFinalDocPrompt(charSetting, scenes) {
  const sceneStories = scenes
    ? scenes.map(s => `- ${s.title}: ${s.story}`).join('\n')
    : ''

  return `你是一个专业的角色设定文档整理师。

请根据以下角色信息，整理为结构化的角色卡文档：

角色名：${charSetting.name}
外貌描述：${charSetting.appearance}
服装描述：${charSetting.outfit}
基础设定：${charSetting.basicInfo}
性格特点：${charSetting.personality}
背景故事：${charSetting.backstory}
标志性物品：${charSetting.signatureItems || '无'}
${sceneStories ? `\n角色经历/故事：\n${sceneStories}` : ''}

请整理为以下JSON格式输出（用于导入角色卡系统），仅输出JSON不需要任何其他废话：

\`\`\`json
{
  "name": "角色名",
  "basicInfo": "整合后的基础设定（包含年龄、身高、种族、职业等，分行列出）",
  "appearance": "整合后的完整外观描述（包含外貌特征和服装描述，适合用作AI绘图参考）",
  "personality": "整合后的性格特点描述",
  "stories": [
    {
      "title": "故事/经历标题",
      "content": "故事/经历完整内容"
    }
  ]
}
\`\`\`

要求：
- basicInfo 用简洁的条目式列出
- appearance 要详细完整，便于后续AI绘图时作为角色描述参考
- personality 要生动具体
- stories 包含背景故事和所有场景经历，每个独立成篇`
}

async function generateFinalDoc(store, charSetting, scenes, myWorkflowId) {
  store.planningText = ''
  const messages = [
    { role: 'system', content: buildFinalDocPrompt(charSetting, scenes) },
    { role: 'user', content: '请整理输出结构化角色卡文档。' },
  ]
  const fullText = await callLLM(store, messages, t => { store.planningText = t }, myWorkflowId)
  store.planningText = fullText

  const data = extractJSON(fullText, 'name')
  if (!data) {
    store.addTimeline('warn', '未能解析结构化文档，将尝试重新生成')
    recordLlmParseFail(store)
    throw new Error('PLAN_PARSE_FAILED')
  }
  recordLlmParseSuccess(store)
  store.addTimeline('info', '结构化角色卡文档已生成')
  return { fullText, data }
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
// ===== 效率优先模式：通用并行生图 + 统一评审（人物设定引擎用） =====

async function executeImagesEfficiency(store, specs, startIdx, referenceImages, confirmMode, myWorkflowId) {
  const needUserConfirm = (confirmMode === 'confirm-all' || confirmMode === 'confirm-image')
  const maxConcurrency = store.imageQueue.filter(m => !m.isDeprecated).length * 2

  let pendingTasks = specs.map((spec, i) => ({
    spec,
    progressIndex: startIdx + i,
    currentPrompt: spec.prompt,
    dataUrl: null,
  }))

  const approvedDisplay = []
  const rejectedDisplay = []
  let round = 0

  while (pendingTasks.length > 0) {
    round++
    await checkStopped(store, myWorkflowId)

    if (await checkTimeUp(store, myWorkflowId)) {
      store.addTimeline('warn', '时间耗尽，剩余图片不再生成')
      for (const task of pendingTasks) {
        store.imageProgress[task.progressIndex].status = 'timeout'
      }
      break
    }

    store.addTimeline('info', `效率优先：第 ${round} 轮并行生成 ${pendingTasks.length} 张 (最大并发 ${maxConcurrency})`)

    // 任务队列
    const taskQueue = [...pendingTasks]
    const results = new Array(pendingTasks.length).fill(null)

    const slotManager = new ModelSlotManager(2)

    async function effWorker() {
      while (taskQueue.length > 0) {
        await checkStopped(store, myWorkflowId)
        const taskIdx = pendingTasks.indexOf(taskQueue[0])
        const task = taskQueue.shift()
        if (!task) break

        const progress = store.imageProgress[task.progressIndex]
        progress.status = 'generating'
        progress.currentPrompt = task.currentPrompt
        progress.currentAttempt = round

        const isPortrait = task.spec.meta?.type === 'anchor' || task.spec.meta?.type === 'angle'

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
            store.addTimeline('image', `${task.spec.title} → ${model.modelName}`)
            let result = null

            if (isPortrait) {
              // 竖图：先尝试2K再fallback
              try {
                result = await generateImage({
                  baseUrl: model.baseUrl, apiKey: model.apiKey, model: model.modelName,
                  prompt: task.currentPrompt, referenceImages, size: '1440x2560',
                  apiType: model.apiType, customEndpoint: model.endpoint, quality: store.config.imageQuality,
                })
              } catch (firstErr) {
                if (store.status === 'stopped' || store.workflowId !== myWorkflowId) throw new Error('WORKFLOW_STOPPED')
                const portraitPrompt = task.currentPrompt + '，竖构图，9:16竖图比例，全身立绘'
                result = await generateImage({
                  baseUrl: model.baseUrl, apiKey: model.apiKey, model: model.modelName,
                  prompt: portraitPrompt, referenceImages, size: 'auto',
                  apiType: model.apiType, customEndpoint: model.endpoint, quality: store.config.imageQuality,
                })
              }
            } else {
              result = await generateImage({
                baseUrl: model.baseUrl, apiKey: model.apiKey, model: model.modelName,
                prompt: task.currentPrompt, referenceImages, size: store.config.imageSize,
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
          results[taskIdx] = { task, dataUrl }
          progress.status = 'reviewing'
          store.addTimeline('success', `${task.spec.title} 已生成`)
        }
      }
    }

    const numWorkers = Math.min(maxConcurrency, pendingTasks.length)
    const workers = []
    for (let i = 0; i < numWorkers; i++) workers.push(effWorker())
    await Promise.all(workers)
    await checkStopped(store, myWorkflowId)

    // 收集成功的图
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
      store.addTimeline('warn', '本轮无图片成功生成')
      break
    }

    // 纯AI / 仅确认非图片：直接通过
    if (!needUserConfirm) {
      for (const gen of generatedImages) {
        let relPath = ''
        try { const saved = await saveImage(gen.dataUrl, 'workflow'); relPath = saved.relPath } catch {}
        const imageRecord = {
          id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
          name: gen.task.spec.title, relPath, prompt: gen.task.currentPrompt,
          planDescription: gen.task.spec.description, score: null,
          attempts: round, createdAt: new Date().toISOString(),
          charDesignMeta: gen.task.spec.meta || {},
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
      const imageRecord = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        name: gen.task.spec.title, relPath, prompt: gen.task.currentPrompt,
        planDescription: gen.task.spec.description, score: null,
        attempts: round, createdAt: new Date().toISOString(),
        charDesignMeta: gen.task.spec.meta || {},
      }
      store.finalImages.push(imageRecord)
      store.imageProgress[gen.task.progressIndex].status = 'passed'
      store.imageProgress[gen.task.progressIndex].finalImageRecord = imageRecord
      delete gen.dataUrl
    }

    // 处理打回
    if (rejectedTasks.length > 0) {
      store.addTimeline('info', `${rejectedTasks.length} 张图被打回，等待修改意见...`)
      const feedbackResult = await store.requestConfirm('efficiency-reject-feedback', {
        images: rejectedTasks.map(g => ({ dataUrl: g.dataUrl, specIndex: g.specIndex })),
      })
      await checkStopped(store, myWorkflowId)

      const feedbacks = feedbackResult.feedbacks || []

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
              store.addTimeline('llm', `融合 #${item.gen.specIndex} 的修改意见...`)
              const merged = await callLLM(store, [
                { role: 'system', content: '你是AI提示词优化专家。融合用户意见生成新提示词，只输出提示词。' },
                { role: 'user', content: `原始提示词：\n${item.gen.task.currentPrompt}\n用户意见：\n${item.feedback}\n请输出新提示词：` },
              ], null, myWorkflowId)
              if (merged?.trim()) {
                newPrompt = merged.trim()
                store.addTimeline('info', `#${item.gen.specIndex} 提示词已优化`)
              }
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

      const newPendingTasks = []
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

export async function startCharDesignWorkflow(store) {
  store.beginPlanning()
  const myWorkflowId = store.workflowId
  const confirmMode = store.config.charDesignConfirmMode || 'confirm-all'
  const enableScenes = store.config.charDesignEnableScenes

  // 辅助：判断非图片节点是否需要用户确认
  const needConfirmNonImage = (confirmMode === 'confirm-all' || confirmMode === 'confirm-non-image')

  try {
    // ==========================================
    // LLM 阶段1：丰富角色设定
    // ==========================================
    store.addTimeline('info', '【阶段1】生成角色设定...')
    let charSetting = null
    let settingApproved = false
    let settingFeedback = null
    let previousSettingText = null
    let consecutiveRejects = 0
    let consecutiveParseFails = 0

    while (!settingApproved) {
      await checkStopped(store, myWorkflowId)
      store.status = 'planning'

      let result
      try {
        result = await generateCharSetting(store, settingFeedback, previousSettingText, myWorkflowId)
        consecutiveParseFails = 0
      } catch (err) {
        if (err.message === 'WORKFLOW_STOPPED') throw err
        if (err.message === 'ALL_LLM_MODELS_EXHAUSTED') throw err
        if (err.message === 'PLAN_PARSE_FAILED') {
          consecutiveParseFails++
          store.addTimeline('warn', `角色设定解析失败 (连续 ${consecutiveParseFails}/${MAX_PARSE_FAILS})`)
          if (consecutiveParseFails >= MAX_PARSE_FAILS) {
            const pauseResult = await store.requestConfirm('plan-pause', {
              reason: 'parse-failed',
              message: `AI 已连续 ${MAX_PARSE_FAILS} 次未能返回可解析的角色设定，建议更换语言模型。`,
              count: consecutiveParseFails,
            })
            await checkStopped(store, myWorkflowId)
            if (pauseResult.abort) throw new Error('WORKFLOW_STOPPED')
            consecutiveParseFails = 0
          }
          continue
        }
        throw err
      }

      charSetting = result.data

      // 构建展示用 plan
      store.plan = {
        totalImages: 1,
        strategy: `角色「${charSetting.name}」设定`,
        images: [{
          index: 1, title: charSetting.name,
          description: charSetting.appearance,
          initialPrompt: charSetting.frontPrompt,
        }],
      }

      if (needConfirmNonImage) {
        store.status = 'confirming-plan'
        store.addTimeline('info', '等待用户确认角色设定...')
        const confirmResult = await store.requestConfirm('plan', { text: result.fullText, plan: store.plan })
        await checkStopped(store, myWorkflowId)

        if (confirmResult.approved) {
          settingApproved = true
          store.addTimeline('success', '用户已确认角色设定')
        } else {
          consecutiveRejects++
          previousSettingText = result.fullText
          settingFeedback = confirmResult.feedback || '请修改'
          store.addTimeline('info', `用户打回角色设定 (${consecutiveRejects}/${MAX_PLAN_REJECTS})`)
          if (consecutiveRejects >= MAX_PLAN_REJECTS) {
            const pauseResult = await store.requestConfirm('plan-pause', {
              reason: 'reject-limit',
              message: `已连续 ${MAX_PLAN_REJECTS} 次打回角色设定，建议调整描述或更换模型。`,
              count: consecutiveRejects,
            })
            await checkStopped(store, myWorkflowId)
            if (pauseResult.abort) throw new Error('WORKFLOW_STOPPED')
            consecutiveRejects = 0
          }
        }
      } else {
        settingApproved = true
        store.addTimeline('info', '角色设定自动通过')
      }
    }

    // ==========================================
    // 生图阶段1：生成正面全身立绘（锚定图）
    // ==========================================
    store.status = 'running'
    store.addTimeline('info', '【阶段2】生成正面全身立绘（锚定图）...')

    store.imageProgress = [{
      index: '锚定图',
      title: '正面全身立绘',
      status: 'pending',
      currentPrompt: charSetting.frontPrompt,
      currentAttempt: 0,
      attempts: [],
      finalImageRecord: null,
    }]

    const anchorSpec = {
      index: 1,
      title: '正面全身立绘（锚定图）',
      description: `${charSetting.name} 的正面全身立绘，纯色背景`,
      prompt: charSetting.frontPrompt,
      useRefReview: false,
      meta: { type: 'anchor', angle: 'front' },
    }

    // 使用用户上传的参考图（如果有）
    const userRefs = store.config.referenceImages.length > 0 ? store.config.referenceImages : null

    const anchorResult = await processOneImageGeneric(
      store, anchorSpec, 0, userRefs,
      '请评审这张正面全身立绘，确保角色特征清晰、构图稳定、适合作为锚定参考图。',
      confirmMode, myWorkflowId
    )

    if (!anchorResult) {
      throw new Error('锚定图生成失败，无法继续工作流')
    }

    // 读取锚定图 dataUrl 用于后续参考
    const anchorDataUrl = await readImageAsBase64(anchorResult.relPath)
    const anchorRef = [{ dataUrl: anchorDataUrl }]


    // ==========================================
    // 表情差分阶段（可选）
    // ==========================================
    if (store.config.charDesignEnableExpressions) {
      const exprCount = store.config.charDesignExpressionCount || 4
      store.addTimeline('info', `【表情差分】生成 ${exprCount} 个表情差分...`)

      // 生成表情差分大纲
      let exprPlanApproved = false
      let exprFeedback = null
      let previousExprText = null
      let exprRejects = 0
      let exprParseFails = 0
      let exprData = null

      while (!exprPlanApproved) {
        await checkStopped(store, myWorkflowId)
        store.status = 'planning'

        let result
        try {
          result = await generateExpressionPlan(store, charSetting, exprCount, exprFeedback, previousExprText, myWorkflowId)
          exprParseFails = 0
        } catch (err) {
          if (err.message === 'WORKFLOW_STOPPED') throw err
          if (err.message === 'ALL_LLM_MODELS_EXHAUSTED') throw err
          if (err.message === 'PLAN_PARSE_FAILED') {
            exprParseFails++
            if (exprParseFails >= MAX_PARSE_FAILS) {
              const pauseResult = await store.requestConfirm('plan-pause', {
                reason: 'parse-failed',
                message: `AI 已连续 ${MAX_PARSE_FAILS} 次未能返回可解析的表情差分大纲。`,
                count: exprParseFails,
              })
              await checkStopped(store, myWorkflowId)
              if (pauseResult.abort) throw new Error('WORKFLOW_STOPPED')
              exprParseFails = 0
            }
            continue
          }
          throw err
        }

        exprData = result.data

        // 展示用 plan
        store.plan = {
          totalImages: exprData.expressions.length,
          strategy: `${charSetting.name} 的 ${exprData.expressions.length} 个表情差分`,
          images: exprData.expressions.map(e => ({
            index: e.index, title: e.title,
            description: e.description, initialPrompt: e.prompt,
          })),
        }

        if (needConfirmNonImage) {
          store.status = 'confirming-plan'
          store.addTimeline('info', '等待用户确认表情差分大纲...')
          const confirmResult = await store.requestConfirm('plan', { text: result.fullText, plan: store.plan })
          await checkStopped(store, myWorkflowId)

          if (confirmResult.approved) {
            exprPlanApproved = true
            store.addTimeline('success', '用户已确认表情差分大纲')
          } else {
            exprRejects++
            previousExprText = result.fullText
            exprFeedback = confirmResult.feedback || '请修改'
            store.addTimeline('info', `用户打回表情差分大纲 (${exprRejects}/3)`)
            if (exprRejects >= 3) {
              const pauseResult = await store.requestConfirm('plan-pause', {
                reason: 'reject-limit',
                message: `已连续 3 次打回表情差分大纲。`,
                count: exprRejects,
              })
              await checkStopped(store, myWorkflowId)
              if (pauseResult.abort) throw new Error('WORKFLOW_STOPPED')
              exprRejects = 0
            }
          }
        } else {
          exprPlanApproved = true
          store.addTimeline('info', '表情差分大纲自动通过')
        }
      }

      // 并行生成表情差分（固定4路，队列式审核）
      store.status = 'running'
      store.addTimeline('info', '开始并行生成表情差分...')

      const exprStartIdx = store.imageProgress.length
      for (const expr of exprData.expressions) {
        store.imageProgress.push({
          index: `表情${expr.index}`,
          title: expr.title,
          status: 'pending',
          currentPrompt: expr.prompt,
          currentAttempt: 0,
          attempts: [],
          finalImageRecord: null,
          charDesignMeta: { type: 'expression' },
        })
      }

      const exprTaskQueue = exprData.expressions.map((e, i) => ({ spec: e, pIndex: exprStartIdx + i }))
      const exprReviewMutex = new ReviewMutex()
      const EXPR_PARALLEL_SLOTS = 4

      async function exprWorker() {
        while (exprTaskQueue.length > 0) {
          await checkStopped(store, myWorkflowId)
          const task = exprTaskQueue.shift()
          if (!task) break

          const exprSpec = {
            index: task.spec.index,
            title: `表情：${task.spec.title}`,
            description: task.spec.description,
            prompt: task.spec.prompt,
            meta: { type: 'expression', expressionName: task.spec.title },
          }

          try {
            await processOneExpression(store, exprSpec, task.pIndex, anchorRef, exprReviewMutex, confirmMode, myWorkflowId)
          } catch (err) {
            if (err.message === 'WORKFLOW_STOPPED' || err.message === 'ALL_IMAGE_MODELS_EXHAUSTED' || err.message === 'ALL_LLM_MODELS_EXHAUSTED') throw err
            store.addTimeline('error', `表情「${task.spec.title}」处理异常: ${err.message}`)
            store.imageProgress[task.pIndex].status = 'error'
          }
        }
      }

      const numExprWorkers = Math.min(EXPR_PARALLEL_SLOTS, exprData.expressions.length)
      const exprWorkers = []
      for (let i = 0; i < numExprWorkers; i++) {
        exprWorkers.push(exprWorker())
      }
      await Promise.all(exprWorkers)
      await checkStopped(store, myWorkflowId)

      const exprPassedCount = store.finalImages.filter(img => img.charDesignMeta?.type === 'expression').length
      store.addTimeline('success', `表情差分完成: ${exprPassedCount}/${exprData.expressions.length} 张通过`)
    }

    // ==========================================
    // 生图阶段2：多角度立绘（侧面、背面）
    // ==========================================
    if (store.config.charDesignEnableAngles) {
    store.addTimeline('info', '【阶段3】生成多角度立绘...')

    const angleSpecs = [
      {
        index: 2,
        title: '侧面全身立绘',
        description: `${charSetting.name} 的侧面全身立绘，纯色背景，与正面锚定图角色特征一致`,
        prompt: `${charSetting.appearance}，${charSetting.outfit}，侧面全身站姿，纯色背景，${charSetting.styleKeywords}`,
        useRefReview: true,
        meta: { type: 'angle', angle: 'side' },
      },
      {
        index: 3,
        title: '背面全身立绘',
        description: `${charSetting.name} 的背面全身立绘，纯色背景，与正面锚定图角色特征一致`,
        prompt: `${charSetting.appearance}，${charSetting.outfit}，背面全身站姿，展示背部细节，纯色背景，${charSetting.styleKeywords}`,
        useRefReview: true,
        meta: { type: 'angle', angle: 'back' },
      },
    ]

    // 记录起始索引（锚定图 + 可能的表情差分之后）
    const angleStartIdx = store.imageProgress.length

    // 添加到 imageProgress
    for (const spec of angleSpecs) {
      store.imageProgress.push({
        index: spec.index,
        title: spec.title,
        status: 'pending',
        currentPrompt: spec.prompt,
        currentAttempt: 0,
        attempts: [],
        finalImageRecord: null,
      })
    }

    if (store.config.efficiencyMode) {
      // 效率优先：并行生成 + 统一评审
      await executeImagesEfficiency(store, angleSpecs, angleStartIdx, anchorRef, confirmMode, myWorkflowId)
    } else {
      // 串行处理（每张独立迭代）
      for (let i = 0; i < angleSpecs.length; i++) {
        await checkStopped(store, myWorkflowId)
        if (checkTimeUp(store)) {
          store.addTimeline('warn', '时间耗尽，剩余角度不再生成')
          break
        }

        await processOneImageGeneric(
          store, angleSpecs[i], angleStartIdx + i, anchorRef,
          '请评审这张角色立绘，对比第一张正面锚定图，确保角色外貌、服装、画风一致，且角度正确。',
          confirmMode, myWorkflowId
        )
      }
    }
    } else {
      store.addTimeline('info', '已跳过多角度立绘生成')
    }


    // ==========================================
    // 生图阶段3：场景插图（可选）
    // ==========================================
    let sceneData = null

    if (enableScenes) {
      store.addTimeline('info', '【阶段4】生成角色故事场景...')

      // 生成场景大纲
      let scenePlanApproved = false
      let sceneFeedback = null
      let previousSceneText = null
      let sceneRejects = 0
      let sceneParseFails = 0

      while (!scenePlanApproved) {
        await checkStopped(store, myWorkflowId)
        store.status = 'planning'

        let result
        try {
          result = await generateScenePlan(store, charSetting, sceneFeedback, previousSceneText, myWorkflowId)
          sceneParseFails = 0
        } catch (err) {
          if (err.message === 'WORKFLOW_STOPPED') throw err
          if (err.message === 'ALL_LLM_MODELS_EXHAUSTED') throw err
          if (err.message === 'PLAN_PARSE_FAILED') {
            sceneParseFails++
            if (sceneParseFails >= MAX_PARSE_FAILS) {
              const pauseResult = await store.requestConfirm('plan-pause', {
                reason: 'parse-failed',
                message: `AI 已连续 ${MAX_PARSE_FAILS} 次未能返回可解析的场景大纲。`,
                count: sceneParseFails,
              })
              await checkStopped(store, myWorkflowId)
              if (pauseResult.abort) throw new Error('WORKFLOW_STOPPED')
              sceneParseFails = 0
            }
            continue
          }
          throw err
        }

        sceneData = result.data

        // 更新 plan 用于展示
        store.plan = {
          totalImages: sceneData.scenes.length,
          strategy: `${charSetting.name} 的 ${sceneData.scenes.length} 个故事场景`,
          images: sceneData.scenes.map(s => ({
            index: s.index, title: s.title,
            description: s.description, initialPrompt: s.prompt,
          })),
        }

        if (needConfirmNonImage) {
          store.status = 'confirming-plan'
          store.addTimeline('info', '等待用户确认场景大纲...')
          const confirmResult = await store.requestConfirm('plan', { text: result.fullText, plan: store.plan })
          await checkStopped(store, myWorkflowId)

          if (confirmResult.approved) {
            scenePlanApproved = true
            store.addTimeline('success', '用户已确认场景大纲')
          } else {
            sceneRejects++
            previousSceneText = result.fullText
            sceneFeedback = confirmResult.feedback || '请修改'
            store.addTimeline('info', `用户打回场景大纲 (${sceneRejects}/3)`)
            if (sceneRejects >= 3) {
              const pauseResult = await store.requestConfirm('plan-pause', {
                reason: 'reject-limit',
                message: `已连续 3 次打回场景大纲，建议调整需求或更换模型。`,
                count: sceneRejects,
              })
              await checkStopped(store, myWorkflowId)
              if (pauseResult.abort) throw new Error('WORKFLOW_STOPPED')
              sceneRejects = 0
            }
          }
        } else {
          scenePlanApproved = true
          store.addTimeline('info', '场景大纲自动通过')
        }
      }

      // 生成场景插图
      store.status = 'running'
      store.addTimeline('info', '开始生成场景插图...')

      const sceneStartIdx = store.imageProgress.length
      for (const scene of sceneData.scenes) {
        store.imageProgress.push({
          index: `场景${scene.index}`,
          title: scene.title,
          status: 'pending',
          currentPrompt: scene.prompt,
          currentAttempt: 0,
          attempts: [],
          finalImageRecord: null,
        })
      }

      const sceneSpecList = sceneData.scenes.map(scene => ({
        index: scene.index,
        title: `场景：${scene.title}`,
        description: scene.description,
        prompt: scene.prompt,
        useRefReview: true,
        meta: { type: 'scene', sceneIndex: scene.index, story: scene.story },
      }))

      if (store.config.efficiencyMode) {
        // 效率优先：并行生成 + 统一评审
        await executeImagesEfficiency(store, sceneSpecList, sceneStartIdx, anchorRef, confirmMode, myWorkflowId)
      } else {
        for (let i = 0; i < sceneSpecList.length; i++) {
          await checkStopped(store, myWorkflowId)
          if (checkTimeUp(store)) {
            store.addTimeline('warn', '时间耗尽，剩余场景不再生成')
            break
          }

          await processOneImageGeneric(
            store, sceneSpecList[i], sceneStartIdx + i, anchorRef,
            '请评审这张角色场景插图，对比正面锚定图确保角色一致性，同时评估场景氛围和画面质量。',
            confirmMode, myWorkflowId
          )
        }
      }
    }

    // ==========================================
    // LLM 阶段2：生成结构化文档
    // ==========================================
    await checkStopped(store, myWorkflowId)
    store.status = 'planning'
    store.addTimeline('info', `【阶段${enableScenes ? '5' : '4'}】生成结构化角色卡文档...`)

    let finalDoc = null
    let docApproved = false
    let docParseFails = 0

    while (!docApproved) {
      await checkStopped(store, myWorkflowId)

      try {
        const result = await generateFinalDoc(store, charSetting, sceneData?.scenes || null, myWorkflowId)
        finalDoc = result.data
        docParseFails = 0

        if (needConfirmNonImage) {
          store.status = 'confirming-plan'
          store.addTimeline('info', '等待用户确认角色卡文档...')

          // 构建展示用 plan
          store.plan = {
            totalImages: 0,
            strategy: `角色「${finalDoc.name}」结构化文档`,
            images: (finalDoc.stories || []).map((s, i) => ({
              index: i + 1, title: s.title,
              description: s.content?.slice(0, 80) + '...',
              initialPrompt: '',
            })),
          }

          const confirmResult = await store.requestConfirm('plan', { text: result.fullText, plan: store.plan })
          await checkStopped(store, myWorkflowId)

          if (confirmResult.approved) {
            docApproved = true
            store.addTimeline('success', '用户已确认角色卡文档')
          } else {
            store.addTimeline('info', '用户打回文档，重新生成...')
            // 重新生成（不带反馈直接重试）
            const fb = confirmResult.feedback || ''
            if (fb) {
              // 带用户反馈重新生成
              const retryMessages = [
                { role: 'system', content: buildFinalDocPrompt(charSetting, sceneData?.scenes || null) },
                { role: 'user', content: '请整理输出结构化角色卡文档。' },
                { role: 'assistant', content: result.fullText },
                { role: 'user', content: `我对上面的文档不满意，请根据以下意见修改：\n${fb}` },
              ]
              store.planningText = ''
              const retryText = await callLLM(store, retryMessages, t => { store.planningText = t }, myWorkflowId)
              store.planningText = retryText
              const retryData = extractJSON(retryText, 'name')
              if (retryData) {
                finalDoc = retryData
                result.fullText = retryText
                result.data = retryData
              }
            }
            continue
          }
        } else {
          docApproved = true
          store.addTimeline('info', '角色卡文档自动通过')
        }
      } catch (err) {
        if (err.message === 'WORKFLOW_STOPPED') throw err
        if (err.message === 'ALL_LLM_MODELS_EXHAUSTED') throw err
        if (err.message === 'PLAN_PARSE_FAILED') {
          docParseFails++
          store.addTimeline('warn', `文档解析失败 (连续 ${docParseFails}/${MAX_PARSE_FAILS})`)
          if (docParseFails >= MAX_PARSE_FAILS) {
            const pauseResult = await store.requestConfirm('plan-pause', {
              reason: 'parse-failed',
              message: `AI 已连续 ${MAX_PARSE_FAILS} 次未能返回可解析的角色卡文档。`,
              count: docParseFails,
            })
            await checkStopped(store, myWorkflowId)
            if (pauseResult.abort) throw new Error('WORKFLOW_STOPPED')
            docParseFails = 0
          }
          continue
        }
        throw err
      }
    }

    // ==========================================
    // 最终输出：导入角色卡
    // ==========================================
    await checkStopped(store, myWorkflowId)
    store.status = 'running'
    store.addTimeline('info', '正在导入角色卡...')

    try {
      const { useCharacterStore } = await import('@/stores/character')
      const characterStore = useCharacterStore()
      await characterStore.init()

      // 创建角色卡，使用锚定图作为主设图
      const newChar = characterStore.createCharacter({
        name: finalDoc.name || charSetting.name,
        mainImageRelPath: anchorResult.relPath,
      })

      // 填充字段
      characterStore.updateCharacter(newChar.id, {
        basicInfo: finalDoc.basicInfo || charSetting.basicInfo || '',
        appearance: finalDoc.appearance || charSetting.appearance || '',
        personality: finalDoc.personality || charSetting.personality || '',
      })

      // 导入故事
      if (finalDoc.stories && finalDoc.stories.length > 0) {
        for (const story of finalDoc.stories) {
          characterStore.addStory(newChar.id, story.title || '未命名故事', story.content || '')
        }
      }

      // 将非锚定图的图片导入画廊（直接引用 relPath，不复制文件）
      const otherImages = store.finalImages.filter(img =>
        img.charDesignMeta?.type !== 'anchor' && img.relPath
      )
      for (const img of otherImages) {
        await characterStore.addGalleryImageFromRelPath(newChar.id, img.relPath, img.name || '立绘')
      }

      store.addTimeline('success', `角色「${newChar.name}」已导入角色卡`)
      store.lastCharDesignName = newChar.name
    } catch (err) {
      store.addTimeline('error', `导入角色卡失败: ${err.message}`)
    }

    // ==========================================
    // 完成
    // ==========================================
    await checkStopped(store, myWorkflowId)
    store.status = 'completed'
    store.endTime = Date.now()

    const totalImages = store.finalImages.length
    store.addTimeline('success', `工作流完成: 共生成 ${totalImages} 张图片，角色卡已自动导入「角色卡」页面`)

    // 清空 finalImages，不在历史批次中展示（已导入角色卡）
    store.finalImages = []
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