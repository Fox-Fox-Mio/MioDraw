/**
 * 全栈AI工作流引擎
 * 模块化设计，标准工作流为基础实现，未来可扩展其他工作流类型
 */

import { sendChatMessageStream } from '@/utils/chatApi'
import { generateImage, toDataUrl, downloadImageAsBase64 } from '@/utils/imageApi'
import { saveImage, deleteImage } from '@/utils/imageStorage'

// ===== 常量 =====

async function checkStopped(store, myWorkflowId) {
  if (store.workflowId !== myWorkflowId) {
    throw new Error('WORKFLOW_STOPPED')
  }
  if (store.status === 'stopped') {
    throw new Error('WORKFLOW_STOPPED')
  }
  if (store.pendingStop) {
    const result = await new Promise(resolve => {
      const interval = setInterval(() => {
        if (store.workflowId !== myWorkflowId) {
          clearInterval(interval)
          resolve('stop')
        } else if (store.status === 'stopped') {
          clearInterval(interval)
          resolve('stop')
        } else if (!store.pendingStop) {
          clearInterval(interval)
          resolve('continue')
        }
      }, 100)
    })
    if (result === 'stop') {
      throw new Error('WORKFLOW_STOPPED')
    }
  }
}

const MAX_CONSECUTIVE_FAILS = 3
const MAX_USER_REJECTS = 3
const MAX_PARSE_FAILS = 3
const MAX_IMAGE_ITERATIONS = 10

// ===== LLM 解析失败记录（JSON 解析失败也算模型响应失败） =====

export function recordLlmParseSuccess(store) {
  const model = store.llmQueue.find(m => !m.isDeprecated)
  if (model) {
    model._parseFails = 0
  }
}

export function recordLlmParseFail(store) {
  const model = store.llmQueue.find(m => !m.isDeprecated)
  if (model) {
    if (model.successCount > 0) model.successCount--
    if (model._parseFails === undefined) model._parseFails = 0
    model._parseFails++
    model.totalFails++
    store.addTimeline('warn',
      `语言模型 ${model.modelName} 返回内容无法解析 (连续 ${model._parseFails}/${MAX_CONSECUTIVE_FAILS})`
    )
    if (model._parseFails >= MAX_CONSECUTIVE_FAILS) {
      model.isDeprecated = true
      store.addTimeline('error',
        `语言模型 ${model.modelName} 连续 ${MAX_CONSECUTIVE_FAILS} 次返回无法解析的内容，已被停用`
      )
    }
  }
}

// ===== LLM 调用（带自动故障转移） =====

export async function callLLM(store, messages, onUpdate, myWorkflowId) {
  const queue = store.llmQueue

  while (true) {
  await checkStopped(store, myWorkflowId)

    const model = queue.find(m => !m.isDeprecated)
    if (!model) {
      store.addTimeline('error', '所有语言模型均无法响应，工作流被迫终止')
      throw new Error('ALL_LLM_MODELS_EXHAUSTED')
    }

    try {
      store.addTimeline('llm', `正在调用语言模型: ${model.modelName} (${model.siteName})`)

      const result = await sendChatMessageStream(
        {
          baseUrl: model.baseUrl,
          apiKey: model.apiKey,
          model: model.modelName,
          messages,
        },
        (text) => {
          if (onUpdate) onUpdate(text)
        },
        (abortFn) => {
          store.currentAbortFn = abortFn
        }
      )

      store.currentAbortFn = null
      await checkStopped(store, myWorkflowId)

      model.consecutiveFails = 0
      model.successCount++
      return result

    } catch (err) {
      store.currentAbortFn = null

      if (store.status === 'stopped' || store.workflowId !== myWorkflowId) {
        throw new Error('WORKFLOW_STOPPED')
      }

      model.consecutiveFails++
      model.totalFails++
      store.addTimeline('warn',
        `语言模型 ${model.modelName} 请求失败 (连续 ${model.consecutiveFails}/${MAX_CONSECUTIVE_FAILS}): ${err.message}`
      )

      if (model.consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
        model.isDeprecated = true
        store.addTimeline('error',
          `语言模型 ${model.modelName} 连续失败 ${MAX_CONSECUTIVE_FAILS} 次，已被停用`
        )
      }
    }
  }
}

// ===== 计划生成 =====

function buildPlanSystemPrompt(config) {
  const timeLimit = config.timeLimitMinutes
  const hours = Math.floor(timeLimit / 60)
  const mins = timeLimit % 60
  let timeStr = ''
  if (hours > 0 && mins > 0) timeStr = `${hours}小时${mins}分钟`
  else if (hours > 0) timeStr = `${hours}小时`
  else timeStr = `${mins}分钟`

  const refCount = config.referenceImages?.length || 0
  const refInfo = refCount > 0
    ? `\n5. 用户提供了 ${refCount} 张参考图（编号为 1~${refCount}），请根据每张图片的需求决定是否使用参考图，使用哪几张。不是每张图都需要参考图，请合理分配。`
    : ''

  return `你是一个专业的AI绘图项目总监。你的任务是根据用户的创作需求，制定一份详细的图片创作计划。

要求：
1. 分析用户的需求，决定需要生成几张图片（数量要合理，与任务复杂度和时限匹配，如果时间给的较多，可以多来几张）
2. 为每张图片规划具体内容、风格和预期效果（如果用户明确要求创作故事性内容/连贯性内容，请务必在生图提示词中强调时间等的连贯性，确保这几张图之间不会看上去很不连贯！）
3. 用户设定的总任务时限为 ${timeStr}，请合理规划图片数量（每张图片可能需要多轮迭代，请预留足够时间）
4. 如果用户提供了参考图，请在规划中结合参考图的特征${refInfo}

请直接给出以下JSON，不要有任何废话（必须严格遵守以下格式）：

\`\`\`json
{
  "totalImages": 必须是数字,
  "strategy": "整体创作策略的一句话描述",
  "images": [
    {
      "index": 1,
      "title": "图片标题",
      "description": "详细描述这张图需要呈现的内容和效果",
      "initialPrompt": "用于生图模型的高质量中文提示词，包含画面主体、风格、光影、画质等要素",
      "style": "风格关键词",
      "referenceImageIndices": [1]
    }
  ]
}
\`\`\`

注意：
- initialPrompt 必须是高质量的中文绘图提示词
- 必须返回指定的JSON格式
- images 数组的长度必须等于 totalImages
- referenceImageIndices 是一个数组，表示该图片生成时需要使用的参考图编号（从1开始），如果不需要参考图则填空数组 []
- 请根据每张图片的内容需求，合理决定是否使用参考图以及使用哪些参考图
- 如果用户明确要求创作故事性内容/连贯性内容，请务必在生图提示词中强调时间等的连贯性，确保这几张图之间不会看上去很不连贯！`
}

function buildPlanUserMessage(config) {
  const content = []

  if (config.referenceImages && config.referenceImages.length > 0) {
    for (const img of config.referenceImages) {
      if (img.dataUrl) {
        content.push({
          type: 'image_url',
          image_url: { url: img.dataUrl, detail: 'high' },
        })
      }
    }
  }

  content.push({
    type: 'text',
    text: config.initialPrompt,
  })

  if (content.length === 1 && content[0].type === 'text') {
    return { role: 'user', content: config.initialPrompt }
  }

  return { role: 'user', content }
}

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

function extractPlanJSON(text) {
  // 第一步：从 markdown 代码块中提取
  const codeBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/g
  let match
  let lastJson = null

  while ((match = codeBlockRegex.exec(text)) !== null) {
    const parsed = safeJSONParse(match[1].trim())
    if (parsed && parsed.totalImages && parsed.images) {
      lastJson = parsed
    }
  }

  if (lastJson) return lastJson

  // 第二步：括号平衡匹配
  const startPattern = /\{[^{}]*"totalImages"/
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
          if (parsed && parsed.totalImages && parsed.images) return parsed
          break
        }
      }
    }
  }

  return null
}

async function generatePlan(store, feedback = null, previousPlanText = null, myWorkflowId) {
  store.planningText = ''

  const messages = [
    { role: 'system', content: buildPlanSystemPrompt(store.config) },
  ]

  if (feedback && previousPlanText) {
    messages.push(buildPlanUserMessage(store.config))
    messages.push({ role: 'assistant', content: previousPlanText })
    messages.push({
      role: 'user',
      content: `我对上面的计划不满意，请根据以下意见重新制定：\n${feedback}`,
    })
  } else {
    messages.push(buildPlanUserMessage(store.config))
  }

  const fullText = await callLLM(store, messages, (text) => {
    store.planningText = text
  }, myWorkflowId)

  store.planningText = fullText

  const planData = extractPlanJSON(fullText)
  if (!planData) {
    store.addTimeline('warn', '未能从 AI 回复中解析出结构化计划，将尝试重新生成，如果此消息反复出现，请尝试使用更高级(聪明)的AI模型')
    recordLlmParseFail(store)
    throw new Error('PLAN_PARSE_FAILED')
  }

  recordLlmParseSuccess(store)
  store.plan = planData
  store.addTimeline('info', `计划已生成：共 ${planData.totalImages} 张图片`)
  return planData
}


// ===== 生图调用（带自动故障转移） =====

async function callImageModel(store, prompt, referenceImages, myWorkflowId) {
  const queue = store.imageQueue

  while (true) {
    await checkStopped(store, myWorkflowId)

    const model = queue.find(m => !m.isDeprecated)
    if (!model) {
      store.addTimeline('error', '所有生图模型均已停用，工作流被迫终止')
      throw new Error('ALL_IMAGE_MODELS_EXHAUSTED')
    }

    try {
      store.addTimeline('image', `调用生图模型: ${model.modelName} (${model.siteName})`)

      const result = await generateImage({
        baseUrl: model.baseUrl,
        apiKey: model.apiKey,
        model: model.modelName,
        prompt,
        referenceImages,
        size: store.config.imageSize,
        apiType: model.apiType,
        customEndpoint: model.endpoint,
        quality: store.config.imageQuality,
      })

      model.consecutiveFails = 0
      model.successCount++
      return result

    } catch (err) {
      // 如果已停止，直接抛出，不累计失败次数
      if (store.status === 'stopped' || store.workflowId !== myWorkflowId) {
        throw new Error('WORKFLOW_STOPPED')
      }
      await checkStopped(store, myWorkflowId)
      model.consecutiveFails++
      model.totalFails++
      store.addTimeline('warn',
        `生图模型 ${model.modelName} 失败 (连续 ${model.consecutiveFails}/${MAX_CONSECUTIVE_FAILS}): ${err.message}`
      )

      if (model.consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
        model.isDeprecated = true
        store.addTimeline('error',
          `生图模型 ${model.modelName} 连续失败 ${MAX_CONSECUTIVE_FAILS} 次，已被停用`
        )
      }
    }
  }
}

// ===== 图片评审 =====

function buildReviewSystemPrompt(scoreThreshold) {
  return `你是一位专业的AI图片评审专家。请根据需求描述和使用的提示词来评审AI生成的图片，打分时要稍微严格。

评分标准（满分100分）：
- 画面质量和清晰度 (20分)
- 与需求描述的匹配程度 (20分)
- 色彩、光影和构图 (20分)
- 画面是否有局部崩坏，比如存在三只手，三只腿等AI绘图中常见的作画崩坏[很重要！] (20分)
- 整体完成度和美感 (20分)

评分 >= ${scoreThreshold} 分视为通过。

请直接给出以下JSON，不要有任何废话：

\`\`\`json
{
  "score": 数字,
  "passed": true或false,
  "comment": "一句话评价",
  "improvedPrompt": "如果不通过，给出改进后的完整中文提示词；如果通过，留空字符串"
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

async function reviewImage(store, imageDataUrl, description, currentPrompt, myWorkflowId) {
  const messages = [
    { role: 'system', content: buildReviewSystemPrompt(store.config.scoreThreshold) },
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: imageDataUrl, detail: 'high' },
        },
        {
          type: 'text',
          text: `需求描述：${description}\n\n当前提示词：${currentPrompt}\n\n请评审这张图片。`,
        },
      ],
    },
  ]

  const fullText = await callLLM(store, messages, null, myWorkflowId)
  const result = parseReviewResult(fullText)

  if (!result) {
    store.addTimeline('warn', '未能解析评审结果，视为不通过')
    return {
      score: 0,
      passed: false,
      comment: '评审结果解析失败',
      improvedPrompt: currentPrompt,
      rawText: fullText,
    }
  }

  result.passed = result.score >= store.config.scoreThreshold
  result.rawText = fullText
  if (!result.improvedPrompt) result.improvedPrompt = ''
  if (!result.comment) result.comment = ''

  return result
}

// ===== 单张图片处理循环 =====

const MAX_TOTAL_MINUTES = 72 * 60 // 72小时硬上限

async function checkTimeUp(store, myWorkflowId) {
  if (!store.startTime) return false
  const elapsed = Date.now() - store.startTime
  const effectiveElapsed = elapsed - (store.pausedDuration || 0)
  const isOver = effectiveElapsed >= store.config.timeLimitMinutes * 60 * 1000

  if (!isOver) return false

  // 超过48小时硬上限，直接终止
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
    return false // 用户延长了时间，继续运行
  } else {
    throw new Error('WORKFLOW_STOPPED')
  }
}

async function processOneImage(store, imageSpec, imageIndex, myWorkflowId) {
  const progress = store.imageProgress[imageIndex]
  try {
  progress.status = 'generating'
  let currentPrompt = imageSpec.initialPrompt
  let attempt = 0
  let maxAttempts = MAX_IMAGE_ITERATIONS
  let lastScore = null
  let bestRelPath = null
  let bestScore = -1

  while (attempt < maxAttempts) {
    await checkStopped(store, myWorkflowId)
    if (await checkTimeUp(store, myWorkflowId)) {
      store.addTimeline('warn', `时间已耗尽，图片 #${imageSpec.index} 未完成`)
      progress.status = 'timeout'
      return false
    }

    attempt++
    progress.currentPrompt = currentPrompt
    progress.currentAttempt = attempt

    const attemptData = {
      attempt,
      prompt: currentPrompt,
      status: 'generating',
      images: [],
      review: null,
    }
    progress.attempts.push(attemptData)

    store.currentImageIndex = imageIndex
    store.currentAttempt = attempt
    store.addTimeline('image',
      `图片 #${imageSpec.index} 第 ${attempt} 轮生成 (并发 ${store.config.concurrency})`
    )

    // 根据计划选择参考图
    let refImgs = null
    const allRefs = store.config.referenceImages
    if (allRefs.length > 0 && imageSpec.referenceImageIndices && imageSpec.referenceImageIndices.length > 0) {
      refImgs = imageSpec.referenceImageIndices
        .map(i => allRefs[i - 1])
        .filter(Boolean)
      if (refImgs.length === 0) refImgs = null
    }

    const promises = []
    for (let c = 0; c < store.config.concurrency; c++) {
      promises.push(
        callImageModel(store, currentPrompt, refImgs, myWorkflowId).catch(err => {
          if (err.message === 'WORKFLOW_STOPPED' || err.message === 'ALL_IMAGE_MODELS_EXHAUSTED') throw err
          return null
        })
      )
    }

    let results
    try {
      results = await Promise.all(promises)
    } catch (err) {
      // 如果工作流已停止，统一当作停止处理，不管具体是什么错误
      if (store.status === 'stopped' || store.workflowId !== myWorkflowId) {
        throw new Error('WORKFLOW_STOPPED')
      }
      throw err
    }

    await checkStopped(store, myWorkflowId)

    // 收集有效图片
    const candidates = []
    for (const result of results) {
      if (!result || !result.data) continue
      for (const item of result.data) {
        let dataUrl = ''
        if (item.b64_json) {
          dataUrl = toDataUrl(item.b64_json)
        } else if (item.url) {
          try { dataUrl = await downloadImageAsBase64(item.url) } catch { continue }
        }
        if (dataUrl) candidates.push({ dataUrl })
      }
    }

    if (candidates.length === 0) {
      store.addTimeline('warn', `图片 #${imageSpec.index} 第 ${attempt} 轮未生成有效图片`)
      attemptData.status = 'no-image'
      continue
    }

    attemptData.images = candidates
    attemptData.status = 'reviewing'
    progress.status = 'reviewing'

    let passedImage = null
    let lastReview = null
    const requestFailCount = results.filter(r => r === null).length

    if (store.config.confirmMode === 'confirm-all') {
      const enableAiReview = store.config.enableAiReview !== false

      let reviewedCandidates = []
      let bestReviewIdx = 0
      if (enableAiReview) {
        // 启用 AI 评审：并发评审打分
        progress.status = 'reviewing'

        store.addTimeline('llm',
          `AI 并发评审 ${candidates.length} 张候选图...`
        )

        // 并发调用评审
        const reviewPromises = candidates.map(async (candidate, gi) => {
          await checkStopped(store, myWorkflowId)
          try {
            const review = await reviewImage(store, candidates[gi].dataUrl, imageSpec.description, currentPrompt, myWorkflowId)
            await checkStopped(store, myWorkflowId)
            return { gi, review }
          } catch (err) {
            if (err.message === 'WORKFLOW_STOPPED' || err.message === 'ALL_LLM_MODELS_EXHAUSTED') throw err
            // 再次检查是否已停止
            if (store.status === 'stopped' || store.workflowId !== myWorkflowId) throw new Error('WORKFLOW_STOPPED')
            return { gi, review: { score: 0, passed: false, comment: '评审失败: ' + err.message, improvedPrompt: '' } }
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

        for (const { gi, review } of reviewResults) {
          if (review.score > bestScore) {
            if (bestRelPath) {
              deleteImage(bestRelPath).catch(() => {})
            }
            try {
              const saved = await saveImage(candidates[gi].dataUrl, 'workflow')
              bestRelPath = saved.relPath
              bestScore = review.score
            } catch { /* keep old */ }
          }

          reviewedCandidates.push({
            dataUrl: candidates[gi].dataUrl,
            score: review.score,
            comment: review.comment,
            passed: review.passed,
            improvedPrompt: review.improvedPrompt || '',
          })

          store.addTimeline(
            review.passed ? 'success' : 'info',
            `候选图 ${gi + 1}: ${review.score}分 - ${review.comment}`
          )
        }

        // 按原始顺序排列（reviewResults 可能乱序返回）
        reviewedCandidates.sort((a, b) => {
          const idxA = candidates.findIndex(c => c.dataUrl === a.dataUrl)
          const idxB = candidates.findIndex(c => c.dataUrl === b.dataUrl)
          return idxA - idxB
        })

        bestReviewIdx = reviewedCandidates.reduce(
          (best, c, i) => c.score > reviewedCandidates[best].score ? i : best, 0
        )
      } else {
        // 未启用 AI 评审：直接展示给用户
        reviewedCandidates = candidates.map(c => ({
          dataUrl: c.dataUrl,
          score: null,
          comment: '',
          passed: false,
          improvedPrompt: '',
        }))
        bestReviewIdx = null
      }

      await checkStopped(store, myWorkflowId)
      progress.status = 'waiting-confirm'
      store.addTimeline('info',
        enableAiReview
          ? `展示 ${reviewedCandidates.length} 张候选图给用户选择（AI 推荐 #${bestReviewIdx + 1}，${reviewedCandidates[bestReviewIdx].score}分）${requestFailCount > 0 ? `，${requestFailCount} 张生成失败` : ''}`
          : `展示 ${reviewedCandidates.length} 张候选图给用户选择（AI 评分已关闭）${requestFailCount > 0 ? `，${requestFailCount} 张生成失败` : ''}`
      )

      // 双重检查：防止停止后残留 Promise 走到弹窗
      if (store.status === 'stopped' || store.workflowId !== myWorkflowId) {
        throw new Error('WORKFLOW_STOPPED')
      }

      const confirmResult = await store.requestConfirm('batch-image-review', {
        imageSpec,
        candidates: reviewedCandidates,
        attempt,
        totalRequested: store.config.concurrency,
        failedCount: requestFailCount,
        recommendedIndex: bestReviewIdx,
      })

      await checkStopped(store, myWorkflowId)

      if (confirmResult.approved && confirmResult.selectedIndices && confirmResult.selectedIndices.length > 0) {
        const selectedList = confirmResult.selectedIndices

        const primaryIdx = selectedList[0]
        const primarySelected = reviewedCandidates[primaryIdx]
        passedImage = candidates[primaryIdx]
        lastReview = {
          score: primarySelected.score ?? null,
          passed: true,
          comment: primarySelected.comment || '用户手动通过',
          improvedPrompt: '',
        }
        lastScore = primarySelected.score ?? null

        // 额外选中的图片直接保存到 finalImages
        for (let si = 1; si < selectedList.length; si++) {
          const extraIdx = selectedList[si]
          const extraCandidate = candidates[extraIdx]
          const extraReview = reviewedCandidates[extraIdx]

          let extraRelPath = ''
          try {
            const saved = await saveImage(extraCandidate.dataUrl, 'workflow')
            extraRelPath = saved.relPath
          } catch (err) {
            store.addTimeline('warn', `额外图片保存失败: ${err.message}`)
            continue
          }

          const extraRecord = {
            id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
            name: `${imageSpec.title || '工作流图片'} #${imageSpec.index} (${si + 1})`,
            relPath: extraRelPath,
            prompt: currentPrompt,
            planDescription: imageSpec.description,
            score: extraReview.score,
            attempts: attempt,
            createdAt: new Date().toISOString(),
          }
          store.finalImages.push(extraRecord)
        }

        store.addTimeline('success',
          `用户选择了 ${selectedList.length} 张候选图通过 (${selectedList.map(i => '#' + (i + 1)).join(', ')})`
        )
      } else {
        const feedback = confirmResult.feedback || ''
        store.addTimeline('info', `用户打回全部候选图${feedback ? ': ' + feedback : ''}`)

        if (enableAiReview && bestReviewIdx !== null) {
          const bestReview = reviewedCandidates[bestReviewIdx]
          const aiSuggestion = bestReview.improvedPrompt || ''
          let finalImprovedPrompt = aiSuggestion

          if (feedback) {
            // 调用语言模型将 AI 建议 + 用户反馈融合为一个干净的提示词
            try {
              store.addTimeline('llm', '调用语言模型融合评审建议与用户反馈...')
              const basePrompt = aiSuggestion || currentPrompt
              const mergeMessages = [
                {
                  role: 'system',
                  content: '你是一个AI绘图提示词优化专家。请将AI评审的改进建议和用户的修改意见融合到提示词中，生成一个新的完整的高质量中文绘图提示词。只输出新的提示词，不要输出任何解释,新的提示词不能丢弃用户没有要求丢弃的原有内容。',
                },
                {
                  role: 'user',
                  content: `当前提示词：\n${basePrompt}\n\nAI评审建议：${bestReview.comment}\n\n用户修改意见：${feedback}\n\n请输出融合后的新提示词：`,
                },
              ]
              const merged = await callLLM(store, mergeMessages, null, myWorkflowId)
              if (merged && merged.trim()) {
                finalImprovedPrompt = merged.trim()
                store.addTimeline('info', '已生成融合后的改进提示词')
              }
            } catch (err) {
              if (err.message === 'WORKFLOW_STOPPED') throw err
              store.addTimeline('warn', `融合反馈失败: ${err.message}，使用 AI 原始建议`)
              finalImprovedPrompt = aiSuggestion || currentPrompt
            }
          }

          lastReview = {
            score: bestReview.score,
            passed: false,
            comment: feedback || bestReview.comment,
            improvedPrompt: finalImprovedPrompt,
          }
          lastScore = bestReview.score
        } else {
          let newPrompt = ''
          if (feedback) {
            // 调用语言模型将用户反馈融合进提示词
            try {
              store.addTimeline('llm', '调用语言模型融合用户反馈，生成改进提示词...')
              const mergeMessages = [
                {
                  role: 'system',
                  content: '你是一个AI绘图提示词优化专家。用户对当前生成的图片不满意，给出了修改意见。请将用户的修改意见融合到原始提示词中，生成一个新的完整的高质量中文绘图提示词。只输出新的提示词，不要输出任何解释。',
                },
                {
                  role: 'user',
                  content: `原始提示词：\n${currentPrompt}\n\n用户修改意见：\n${feedback}\n\n请输出融合后的新提示词：`,
                },
              ]
              newPrompt = await callLLM(store, mergeMessages, null, myWorkflowId)
              newPrompt = newPrompt.trim()
              if (newPrompt) {
                store.addTimeline('info', '已生成改进提示词')
              }
            } catch (err) {
              if (err.message === 'WORKFLOW_STOPPED') throw err
              store.addTimeline('warn', `语言模型融合反馈失败: ${err.message}，将直接使用原始提示词`)
            }
          }

          lastReview = {
            score: null,
            passed: false,
            comment: feedback || '用户打回',
            improvedPrompt: newPrompt || '',
          }
          lastScore = null
        }
      }
    } else {
      // pure-ai / confirm-start 模式：并发评审，选取最高分
      store.addTimeline('llm',
        `并发评审图片 #${imageSpec.index} 第 ${attempt} 轮 (${candidates.length} 张)...`
      )

      const reviewPromises = candidates.map(async (candidate, gi) => {
        await checkStopped(store, myWorkflowId)
        try {
          const review = await reviewImage(store, candidate.dataUrl, imageSpec.description, currentPrompt, myWorkflowId)
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

      // 处理所有评审结果
      let bestPassedIdx = -1
      let bestPassedScore = -1

      for (const { gi, review } of reviewResults) {
        if (review.score > bestScore) {
          if (bestRelPath) {
            deleteImage(bestRelPath).catch(() => {})
          }
          try {
            const saved = await saveImage(candidates[gi].dataUrl, 'workflow')
            bestRelPath = saved.relPath
            bestScore = review.score
          } catch { /* keep old */ }
        }

        store.addTimeline(
          review.passed ? 'success' : 'info',
          `候选图 ${gi + 1}: ${review.score}分 ${review.passed ? '通过' : '未通过'} - ${review.comment}`
        )

        // 追踪通过的最高分
        if (review.passed && review.score > bestPassedScore) {
          bestPassedScore = review.score
          bestPassedIdx = gi
          lastReview = review
          lastScore = review.score
        }

        // 记录最后一个评审结果（用于未通过时获取 improvedPrompt）
        if (!lastReview || review.score > (lastReview.score || 0)) {
          lastReview = review
          lastScore = review.score
        }
      }

      // 选取通过的最高分图片
      if (bestPassedIdx >= 0) {
        passedImage = candidates[bestPassedIdx]
        store.addTimeline('success',
          `选取最高分候选图 #${bestPassedIdx + 1} (${bestPassedScore}分) 通过`
        )
      }
    }

    attemptData.review = lastReview

    if (passedImage) {
      attemptData.status = 'passed'
      progress.status = 'passed'

      // 持久化图片文件
      let relPath = ''
      try {
        const saved = await saveImage(passedImage.dataUrl, 'workflow')
        relPath = saved.relPath
      } catch (err) {
        store.addTimeline('warn', `图片文件保存失败: ${err.message}`)
      }

      // 清理临时最高分文件
      if (bestRelPath && bestRelPath !== relPath) {
        deleteImage(bestRelPath).catch(() => {})
      }

      // 释放候选图内存
      for (const c of candidates) { delete c.dataUrl }

      const imageRecord = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        name: imageSpec.title || `工作流图片 #${imageSpec.index}`,
        relPath,
        prompt: currentPrompt,
        planDescription: imageSpec.description,
        score: lastReview?.score,
        attempts: attempt,
        planIndex: imageSpec.index,
        createdAt: new Date().toISOString(),
      }
      store.finalImages.push(imageRecord)
      progress.finalImageRecord = imageRecord
      store.addTimeline('success',
        `图片 #${imageSpec.index}「${imageSpec.title}」已通过 (${lastReview?.score}分, 共${attempt}轮)`
      )
      return true
    }

    // 释放候选图内存
    for (const c of candidates) { delete c.dataUrl }

    // 未通过，用改进提示词进入下轮
    attemptData.status = 'rejected'
    progress.status = 'generating'
    if (lastReview?.improvedPrompt && lastReview.improvedPrompt !== currentPrompt) {
      currentPrompt = lastReview.improvedPrompt
      store.addTimeline('info', `图片 #${imageSpec.index} 使用改进提示词进入第 ${attempt + 1} 轮`)
    } else {
      store.addTimeline('info', `图片 #${imageSpec.index} 保持当前提示词重试`)
    }

    // 达到上限
    if (attempt >= maxAttempts) {
      if (store.config.confirmMode === 'confirm-all') {
        // 用户确认所有节点：弹窗让用户决定
        store.addTimeline('warn',
          `图片 #${imageSpec.index} 已迭代 ${attempt} 轮未通过，等待用户决定`
        )
        progress.status = 'waiting-confirm'

        const pauseResult = await store.requestConfirm('iteration-limit', {
          imageSpec,
          attempt,
          lastScore,
        })

        await checkStopped(store, myWorkflowId)

        if (pauseResult.action === 'retry') {
          maxAttempts += MAX_IMAGE_ITERATIONS
          store.addTimeline('info', `用户选择继续尝试，上限延长到 ${maxAttempts} 轮`)
          progress.status = 'generating'
        } else if (pauseResult.action === 'skip') {
          store.addTimeline('info', `用户选择跳过图片 #${imageSpec.index}`)
          progress.status = 'max-attempts'
          return false
        } else {
          store.addTimeline('warn', '用户选择终止工作流')
          throw new Error('WORKFLOW_STOPPED')
        }
      } else {
        // 纯AI / 仅确认开始：自动选取历史最高分图片作为输出
        if (bestRelPath) {
          store.addTimeline('info',
            `图片 #${imageSpec.index} 达到 ${attempt} 轮上限，自动选取历史最高分 (${bestScore}分) 作为最终结果`
          )
          progress.status = 'passed'

          const imageRecord = {
            id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
            name: imageSpec.title || `工作流图片 #${imageSpec.index}`,
            relPath: bestRelPath,
            prompt: currentPrompt,
            planDescription: imageSpec.description,
            score: bestScore,
            attempts: attempt,
            autoSelected: true,
            planIndex: imageSpec.index,
            createdAt: new Date().toISOString(),
          }
          store.finalImages.push(imageRecord)
          progress.finalImageRecord = imageRecord
          store.addTimeline('success',
            `图片 #${imageSpec.index}「${imageSpec.title}」自动选取通过 (最高${bestScore}分, 共${attempt}轮)`
          )
          return true
        } else {
          store.addTimeline('warn',
            `图片 #${imageSpec.index} 达到 ${attempt} 轮上限且无有效候选图，跳过`
          )
          progress.status = 'max-attempts'
          return false
        }
      }
    }
  }

  progress.status = 'max-attempts'
  store.addTimeline('warn', `图片 #${imageSpec.index} 达到最大迭代次数，跳过`)
  return false

  } catch (err) {
    // 统一兜底：只要工作流已停止，无论什么错误都转为 WORKFLOW_STOPPED
    if (store.status === 'stopped' || store.workflowId !== myWorkflowId) {
      throw new Error('WORKFLOW_STOPPED')
    }
    throw err
  }
}

// ===== 执行所有图片 =====

async function executeAllImages(store, myWorkflowId) {
  const plan = store.plan

  store.imageProgress = plan.images.map(img => ({
    index: img.index,
    title: img.title,
    status: 'pending',
    currentPrompt: img.initialPrompt,
    currentAttempt: 0,
    attempts: [],
    finalImage: null,
  }))

  for (let i = 0; i < plan.images.length; i++) {
    await checkStopped(store, myWorkflowId)

    if (await checkTimeUp(store, myWorkflowId)) {
      store.addTimeline('warn', '时间已耗尽，剩余图片不再生成')
      for (let j = i; j < plan.images.length; j++) {
        store.imageProgress[j].status = 'timeout'
      }
      break
    }

    store.addTimeline('info',
      `开始处理图片 #${plan.images[i].index}: ${plan.images[i].title}`
    )

    try {
      await processOneImage(store, plan.images[i], i, myWorkflowId)
    } catch (err) {
      if (err.message === 'WORKFLOW_STOPPED') throw err
      if (store.status === 'stopped' || store.workflowId !== myWorkflowId) throw new Error('WORKFLOW_STOPPED')
      if (err.message === 'ALL_IMAGE_MODELS_EXHAUSTED') throw err
      if (err.message === 'ALL_LLM_MODELS_EXHAUSTED') throw err

      store.addTimeline('error', `图片 #${plan.images[i].index} 处理异常: ${err.message}`)
      store.imageProgress[i].status = 'error'
    }
  }
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
// ===== 效率优先模式：并行生图 + 统一评审 =====

async function executeAllImagesEfficiency(store, myWorkflowId) {
  const plan = store.plan
  const confirmMode = store.config.confirmMode
  const needUserConfirm = (confirmMode === 'confirm-all')

  // 初始化 imageProgress
  store.imageProgress = plan.images.map(img => ({
    index: img.index,
    title: img.title,
    status: 'pending',
    currentPrompt: img.initialPrompt,
    currentAttempt: 0,
    attempts: [],
    finalImageRecord: null,
  }))

  // 构建任务列表
  let pendingTasks = plan.images.map((img, i) => ({
    spec: img,
    progressIndex: i,
    currentPrompt: img.initialPrompt,
    dataUrl: null,
  }))

  // 计算并发上限 = 模型数 × 2
  const maxConcurrency = store.imageQueue.filter(m => !m.isDeprecated).length * 2
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

    store.addTimeline('info', `效率优先模式：第 ${round} 轮并行生成 ${pendingTasks.length} 张图片 (最大并发 ${maxConcurrency})`)

    // 并行生成所有待处理图片（模型槽位管理）
    const taskQueue = [...pendingTasks]
    const results = new Array(pendingTasks.length).fill(null)
    const slotManager = new ModelSlotManager(2)

    async function effWorker() {
      while (taskQueue.length > 0) {
        await checkStopped(store, myWorkflowId)
        const taskIdx = pendingTasks.length - taskQueue.length
        const task = taskQueue.shift()
        if (!task) break

        const progress = store.imageProgress[task.progressIndex]
        progress.status = 'generating'
        progress.currentPrompt = task.currentPrompt
        progress.currentAttempt = round

        // 根据计划选择参考图
        let refImgs = null
        const allRefs = store.config.referenceImages
        if (allRefs.length > 0 && task.spec.referenceImageIndices && task.spec.referenceImageIndices.length > 0) {
          refImgs = task.spec.referenceImageIndices
            .map(i => allRefs[i - 1])
            .filter(Boolean)
          if (refImgs.length === 0) refImgs = null
        }

        // 持续重试直到成功生成一张（通过槽位管理器分配模型）
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
            store.addTimeline('image', `图片 #${task.spec.index} → ${model.modelName} (${model.siteName})`)
            const result = await generateImage({
              baseUrl: model.baseUrl, apiKey: model.apiKey, model: model.modelName,
              prompt: task.currentPrompt, referenceImages: refImgs,
              size: store.config.imageSize, apiType: model.apiType,
              customEndpoint: model.endpoint, quality: store.config.imageQuality,
            })

            slotManager.release(model)

            if (result && result.data) {
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
              store.addTimeline('warn', `图片 #${task.spec.index} 返回无有效图片，重试...`)
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
          results[pendingTasks.indexOf(task)] = { task, dataUrl }
          progress.status = 'reviewing'
          store.addTimeline('success', `图片 #${task.spec.index} 已生成`)
        }
      }
    }

    // 启动 Worker（数量 = 任务数，由槽位管理器控制实际并发）
    const numWorkers = Math.min(maxConcurrency, pendingTasks.length)
    const workers = []
    for (let i = 0; i < numWorkers; i++) {
      workers.push(effWorker())
    }
    await Promise.all(workers)
    await checkStopped(store, myWorkflowId)

    // 收集成功生成的图片
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

    // 纯AI / 仅确认开始节点：直接全部通过
    if (!needUserConfirm) {
      store.addTimeline('info', `效率优先模式（纯AI）：${generatedImages.length} 张图片自动通过`)
      for (const gen of generatedImages) {
        let relPath = ''
        try {
          const saved = await saveImage(gen.dataUrl, 'workflow')
          relPath = saved.relPath
        } catch {}

        const imageRecord = {
          id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
          name: gen.task.spec.title || `工作流图片 #${gen.specIndex}`,
          relPath,
          prompt: gen.task.currentPrompt,
          planDescription: gen.task.spec.description,
          score: null,
          attempts: round,
          planIndex: gen.specIndex,
          createdAt: new Date().toISOString(),
        }
        store.finalImages.push(imageRecord)
        store.imageProgress[gen.task.progressIndex].status = 'passed'
        store.imageProgress[gen.task.progressIndex].finalImageRecord = imageRecord
      }
      pendingTasks = []
      break
    }

    // 用户确认模式：循环弹统一评审弹窗直到所有图都被处理
    store.addTimeline('info', `展示 ${generatedImages.length} 张图片给用户统一评审...`)

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

    // 保存通过的图片
    for (const gen of approvedTasks) {
      let relPath = ''
      try {
        const saved = await saveImage(gen.dataUrl, 'workflow')
        relPath = saved.relPath
      } catch {}

      const imageRecord = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        name: gen.task.spec.title || `工作流图片 #${gen.specIndex}`,
        relPath,
        prompt: gen.task.currentPrompt,
        planDescription: gen.task.spec.description,
        score: null,
        attempts: round,
        planIndex: gen.specIndex,
        createdAt: new Date().toISOString(),
      }
      store.finalImages.push(imageRecord)
      store.imageProgress[gen.task.progressIndex].status = 'passed'
      store.imageProgress[gen.task.progressIndex].finalImageRecord = imageRecord
    }

    // 释放通过图片的内存
    for (const gen of approvedTasks) { delete gen.dataUrl }

    // 处理打回的图片
    if (rejectedTasks.length > 0) {
      store.addTimeline('info', `${rejectedTasks.length} 张图片被打回，等待用户添加修改意见...`)

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
              store.addTimeline('llm', `融合图片 #${item.gen.specIndex} 的修改意见...`)
              const merged = await callLLM(store, [
                { role: 'system', content: '你是AI绘图提示词优化专家。融合用户意见生成新的完整中文提示词，只输出提示词。' },
                { role: 'user', content: `原始提示词：\n${item.gen.task.currentPrompt}\n用户意见：\n${item.feedback}\n请输出新提示词：` },
              ], null, myWorkflowId)
              if (merged?.trim()) {
                newPrompt = merged.trim()
                store.addTimeline('info', `图片 #${item.gen.specIndex} 提示词已优化`)
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
      // 清空打回展示列表（打回的图已进入重新生成流程）
      rejectedDisplay.length = 0
    } else {
      pendingTasks = []
    }
  }
}

// ===== 主流程入口 =====

export async function startWorkflow(store) {
  store.beginPlanning()
  const myWorkflowId = store.workflowId

  try {
    let planApproved = false
    let feedback = null
    let previousPlanText = null
    let consecutiveRejects = 0
    let consecutiveParseFails = 0

    while (!planApproved) {
      await checkStopped(store, myWorkflowId)

      store.status = 'planning'

      try {
        await generatePlan(store, feedback, previousPlanText, myWorkflowId)
        consecutiveParseFails = 0
      } catch (err) {
        if (err.message === 'WORKFLOW_STOPPED') throw err
        if (err.message === 'ALL_LLM_MODELS_EXHAUSTED') throw err

        if (err.message === 'PLAN_PARSE_FAILED') {
          consecutiveParseFails++
          store.addTimeline('warn',
            `计划解析失败 (连续 ${consecutiveParseFails}/${MAX_PARSE_FAILS})`
          )

          if (consecutiveParseFails >= MAX_PARSE_FAILS) {
            store.addTimeline('error',
              `连续 ${MAX_PARSE_FAILS} 次无法从 AI 回复中解析出有效计划，工作流已暂停`
            )
            const pauseResult = await store.requestConfirm('plan-pause', {
              reason: 'parse-failed',
              message: `AI 已连续 ${MAX_PARSE_FAILS} 次未能返回可解析的创作计划。可能是当前语言模型不擅长按格式输出，建议更换模型后重试。`,
              count: consecutiveParseFails,
            })
            await checkStopped(store, myWorkflowId)
            if (pauseResult.abort) {
              store.addTimeline('warn', '用户选择终止工作流')
              throw new Error('WORKFLOW_STOPPED')
            }
            consecutiveParseFails = 0
            store.addTimeline('info', '用户选择继续尝试生成计划')
          }
          continue
        }
        throw err
      }

      if (store.config.confirmMode === 'pure-ai') {
        planApproved = true
        store.addTimeline('info', '纯AI模式 - 计划自动通过')
      } else {
        store.status = 'confirming-plan'
        store.addTimeline('info', '等待用户确认计划...')

        const result = await store.requestConfirm('plan', {
          text: store.planningText,
          plan: store.plan,
        })

        await checkStopped(store, myWorkflowId)

        if (result.approved) {
          planApproved = true
          consecutiveRejects = 0
          store.addTimeline('success', '用户已确认计划')
        } else {
          consecutiveRejects++
          previousPlanText = store.planningText
          feedback = result.feedback || '请重新制定计划'
          store.addTimeline('info',
            `用户打回计划 (连续 ${consecutiveRejects}/${MAX_USER_REJECTS})，意见: ${feedback}`
          )

          if (consecutiveRejects >= MAX_USER_REJECTS) {
            store.addTimeline('error',
              `已连续 ${MAX_USER_REJECTS} 次打回计划，工作流已暂停`
            )
            const pauseResult = await store.requestConfirm('plan-pause', {
              reason: 'reject-limit',
              message: `你已连续 ${MAX_USER_REJECTS} 次打回创作计划。如果 AI 始终无法满足你的要求，建议调整初始提示词描述或更换语言模型。`,
              count: consecutiveRejects,
            })
            await checkStopped(store, myWorkflowId)
            if (pauseResult.abort) {
              store.addTimeline('warn', '用户选择终止工作流')
              throw new Error('WORKFLOW_STOPPED')
            }
            consecutiveRejects = 0
            store.addTimeline('info', '用户选择继续尝试')
          }
        }
      }
    }

    // 阶段二：执行生图
    store.status = 'running'
    store.addTimeline('info', '计划已确认，即将开始生图任务...')

    if (store.config.efficiencyMode) {
      await executeAllImagesEfficiency(store, myWorkflowId)
    } else {
      await executeAllImages(store, myWorkflowId)
    }

    await checkStopped(store, myWorkflowId)

    // 按计划顺序排列最终输出
    store.finalImages.sort((a, b) => (a.planIndex || 0) - (b.planIndex || 0))

    store.status = 'completed'
    store.endTime = Date.now()

    const passedCount = store.finalImages.length
    const totalCount = store.plan.totalImages
    store.addTimeline('success', `工作流完成: ${passedCount}/${totalCount} 张图片通过`)

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