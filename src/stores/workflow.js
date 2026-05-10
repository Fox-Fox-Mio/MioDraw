import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { loadValue, saveValue } from '@/utils/storage'

export const useWorkflowStore = defineStore('workflow', () => {
  // ========== UI 状态 ==========
  const sidebarCollapsed = ref(false)
  const activeWorkflowType = ref('standard')

  // 工作流类型注册表（未来在此扩展新类型）
  const workflowTypes = [
    { id: 'standard', name: '标准通用生图工作流', desc: 'AI 规划 → 自动生图 → 智能评审', beta: false },
    { id: 'cg-diff', name: 'CG及差分绘制(支持立绘差分绘制)', desc: '底CG生成 → 差分规划 → 差分并行生成', beta: false },
    { id: 'char-design', name: '人物设定生成', desc: '角色设定 → 多角度立绘 → 场景插图 → 角色卡', beta: true },
    { id: 'gal-cg', name: '使用GalCG叙事', desc: '故事文档 → 角色立绘 → 分批CG生成 → 剧情CG集', beta: true },
    { id: 'comic', name: '漫画创作', desc: '故事分镜 → 角色锚定 → 逐格生成 → 排版输出', beta: false, comingSoon: true },
  ]

  // ========== 配置 ==========
  const config = ref({
    llmModels: [],            // [{ siteId, siteName, modelId, modelName, baseUrl, apiKey }]
    imageModels: [],          // [{ siteId, siteName, modelId, modelName, baseUrl, apiKey, apiType, endpoint }]
    initialPrompt: '',
    referenceImages: [],      // [{ id, dataUrl }]
    timeLimitMinutes: 60,
    concurrency: 1,
    confirmMode: 'confirm-start',  // 'pure-ai' | 'confirm-start' | 'confirm-all'
    scoreThreshold: 90,
    enableAiReview: true,
    imageSize: '1024x1024',
    imageQuality: 'auto',

    // CG及差分绘制工作流专属配置
    cgDiffMode: 'full',          // 'full' | 'diff-only'
    cgDiffBaseCG: null,          // 仅差分模式: { id, dataUrl, width, height }
    cgDiffAutoSize: 'auto',

    // 人物设定生成工作流专属配置
    charDesignName: '',                 // 用户指定角色名（留空则AI生成）
    charDesignEnableExpressions: false, // 是否生成表情差分
    charDesignExpressionCount: 4,       // 表情差分数量 1-8
    charDesignEnableAngles: true,       // 是否生成侧面与背面立绘
    charDesignEnableScenes: true,       // 是否开启AI生成剧情与插图
    charDesignConfirmMode: 'confirm-all', // 'pure-ai' | 'confirm-non-image' | 'confirm-image' | 'confirm-all'

    // GalCG叙事工作流专属配置
    galCGConfirmMode: 'confirm-all',     // 'pure-ai' | 'confirm-non-image' | 'confirm-image' | 'confirm-all'
    galCGDocumentText: '',               // 用户上传/输入的故事文档内容
    galCGDocumentTitle: '',              // 文档文件名（用于展示）
    galCGPresetCharacters: [],           // [{ id, name, dataUrl }] 用户预设角色，最多8个
    galCGPureCGMode: false,              // 仅生成不带任何文字的纯CG
    galCGEnableNarration: true,          // 是否开启CG剧情衔接旁白（推荐开启）
    galCGNarrationStyle: 'sidebar',      // 'embed' = 简要文本嵌入图片 | 'sidebar' = 右侧添加详细文本
    galCGStylePreset: '',                // 画风预设标签：'' | 'anime-cel' | 'anime-soft' | 'galgame' | 'watercolor' | 'realistic' | 'custom'
    galCGStyleCustom: '',                // 自定义画风文本（仅 galCGStylePreset === 'custom' 时生效）

    // 效率优先模式
    efficiencyMode: false,
  })

  // ========== 执行状态 ==========
  // idle → planning → confirming-plan → running → completed | failed | stopped
  const status = ref('idle')
  const plan = ref(null)          // LLM 生成的大纲
  const currentImageIndex = ref(-1)
  const currentAttempt = ref(0)
  const startTime = ref(null)
  const endTime = ref(null)
  const timeline = ref([])        // 事件时间线

  // ========== 模型队列（运行时工作副本） ==========
  const llmQueue = ref([])        // [{ ...modelConfig, consecutiveFails: 0 }]
  const imageQueue = ref([])      // [{ ...modelConfig, consecutiveFails: 0 }]

  // ========== 结果 ==========
  const finalImages = ref([])          // 已通过的最终图片
  const currentRoundImages = ref([])   // 当前轮次待评审图片
  const imageProgress = ref([])
  const batchHistory = ref([])
  const lastModelConfig = ref(null)

  // ========== 用户确认机制 ==========
  let pendingConfirmResolve = null
  const pendingConfirm = ref(null)     // { type, data } → 弹窗读取此值
  const planningText = ref('')
  const lastCharDesignName = ref('')
  const currentAbortFn = ref(null)
  const pendingStop = ref(false)
  const pausedDuration = ref(0)
  const pauseStartTime = ref(null)
  const workflowId = ref(0)
  const _galOutlineDone = ref(false)
  const _galCharsDone = ref(false)
  const _galCharImgDone = ref(false)
  const _galFinalCharsDone = ref(false)
  const _galCGPlanDone = ref(false)
  const _galNarrationDone = ref(false)

  // ========== 计算属性 ==========
  const isRunning = computed(() =>
    ['planning', 'confirming-plan', 'running'].includes(status.value)
  )

  const activeLlmModel = computed(() =>
    llmQueue.value.find(m => m.consecutiveFails < 3) || null
  )

  const activeImageModel = computed(() =>
    imageQueue.value.find(m => m.consecutiveFails < 3) || null
  )

  const elapsedMs = computed(() => {
    if (!startTime.value) return 0
    if (endTime.value) return endTime.value - startTime.value
    return Date.now() - startTime.value
  })

  const remainingMs = computed(() => {
    if (!startTime.value) return config.value.timeLimitMinutes * 60 * 1000
    return Math.max(0, config.value.timeLimitMinutes * 60 * 1000 - elapsedMs.value)
  })

  const isTimeUp = computed(() =>
    remainingMs.value <= 0 && isRunning.value
  )

  // ========== 初始化 ==========
  async function init() {
    sidebarCollapsed.value = await loadValue('workflow-sidebar-collapsed', false)
    activeWorkflowType.value = await loadValue('workflow-active-type', 'standard')

    try {
      const saved = await window.electronAPI?.loadData('workflow-final-images')
      if (saved?.success && saved.data) {
        finalImages.value = saved.data
      }
    } catch {}
    try {
      const savedHistory = await window.electronAPI?.loadData('workflow-batch-history')
      if (savedHistory?.success && savedHistory.data) {
        batchHistory.value = savedHistory.data
      }
    } catch {}
    const savedLastConfig = await loadValue('workflow-last-config', null)
    if (savedLastConfig) {
      lastModelConfig.value = savedLastConfig
    }
  }

  // ========== 侧边栏 ==========
  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
    saveValue('workflow-sidebar-collapsed', sidebarCollapsed.value)
  }

  function setWorkflowType(type) {
    activeWorkflowType.value = type
    saveValue('workflow-active-type', type)
  }

  // ========== 时间线 ==========
  function addTimeline(type, message, detail = null) {
    timeline.value.push({
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      time: new Date().toISOString(),
      type,       // 'info' | 'success' | 'warn' | 'error' | 'llm' | 'image'
      message,
      detail,
    })
  }

  // ========== 用户确认 ==========
  function requestConfirm(type, data) {
    // 如果工作流已停止，不再弹出确认弹窗
    if (status.value === 'stopped') {
      return Promise.resolve({ approved: false, feedback: '' })
    }
    pendingConfirm.value = { type, data }
    // 任何需要用户操作的弹窗弹出时都暂停计时
    pauseStartTime.value = Date.now()
    return new Promise(resolve => {
      pendingConfirmResolve = resolve
    })
  }

  function extendTimeLimit(additionalMinutes) {
    config.value.timeLimitMinutes += additionalMinutes
    addTimeline('info', `用户延长了 ${additionalMinutes} 分钟，总时限现为 ${config.value.timeLimitMinutes} 分钟`)
  }

  function resolveConfirm(result) {
    // 累加暂停时长
    if (pauseStartTime.value) {
      pausedDuration.value += Date.now() - pauseStartTime.value
      pauseStartTime.value = null
    }
    if (pendingConfirmResolve) {
      pendingConfirmResolve(result)
      pendingConfirmResolve = null
    }
    pendingConfirm.value = null
  }

  function initQueues() {
    llmQueue.value = config.value.llmModels.map(m => ({
      ...JSON.parse(JSON.stringify(m)),
      consecutiveFails: 0,
      successCount: 0,
      totalFails: 0,
      isDeprecated: false,
    }))
    imageQueue.value = config.value.imageModels.map(m => ({
      ...JSON.parse(JSON.stringify(m)),
      consecutiveFails: 0,
      successCount: 0,
      totalFails: 0,
      isDeprecated: false,
    }))
  }

  function beginPlanning() {
    // 保存当前模型配置作为"上次配置"
    lastModelConfig.value = {
      llmModels: JSON.parse(JSON.stringify(config.value.llmModels)),
      imageModels: JSON.parse(JSON.stringify(config.value.imageModels)),
      savedAt: new Date().toISOString(),
    }
    saveLastModelConfig()
    workflowId.value++
    initQueues()
    status.value = 'planning'
    startTime.value = Date.now()
    endTime.value = null
    planningText.value = ''
    plan.value = null
    timeline.value = []
    // 将上一批结果归档到历史（深拷贝，防止响应式引用污染）
    if (finalImages.value.length > 0) {
      batchHistory.value.push({
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        time: new Date().toISOString(),
        prompt: config.value.initialPrompt,
        images: JSON.parse(JSON.stringify(finalImages.value)),
      })
    }
    finalImages.value = []
    // 立即持久化归档结果，防止新工作流运行中旧数据未落盘导致混合
    saveFinalImages()
    currentRoundImages.value = []
    imageProgress.value = []
    pausedDuration.value = 0
    pauseStartTime.value = null
    pendingConfirm.value = null
    pendingConfirmResolve = null
    // GalCG 阶段追踪标记
    _galOutlineDone.value = false
    _galCharsDone.value = false
    _galCharImgDone.value = false
    _galFinalCharsDone.value = false
    _galCGPlanDone.value = false
    _galNarrationDone.value = false
    addTimeline('info', '工作流已启动，正在生成创作计划...')
  }

  let stopResolve = null

  function requestStop() {
    pendingStop.value = true
    return new Promise(resolve => {
      stopResolve = resolve
    })
  }

  function cancelStop() {
    pendingStop.value = false
    if (stopResolve) {
      stopResolve(false)  // false = 不停止
      stopResolve = null
    }
  }

  function confirmStop() {
    if (stopResolve) {
      stopResolve(true)  // true = 确认停止
      stopResolve = null
    }
    stopWorkflow()
  }

  function stopWorkflow() {
    status.value = 'stopped'
    pendingStop.value = false
    workflowId.value++  // 递增 workflowId，让所有残留异步操作立即失效
    if (currentAbortFn.value) {
      currentAbortFn.value()
      currentAbortFn.value = null
    }
    endTime.value = Date.now()
    addTimeline('warn', '工作流已被用户手动停止')
    if (pendingConfirmResolve) {
      pendingConfirmResolve({ approved: false, feedback: '' })
      pendingConfirmResolve = null
    }
    pendingConfirm.value = null

    // 延迟再清一次，防止异步残留的 requestConfirm 在 stopWorkflow 之后瞬间赋值
    setTimeout(() => {
      if (status.value === 'stopped') {
        if (pendingConfirmResolve) {
          pendingConfirmResolve({ approved: false, feedback: '' })
          pendingConfirmResolve = null
        }
        pendingConfirm.value = null
      }
    }, 200)
    if (lastModelConfig.value) {
      saveLastModelConfig()
    }
  }

  function isStopping() {
    return status.value === 'stopped' || pendingStop.value
  }


  function deprecateModel(type, index) {
    const queue = type === 'llm' ? llmQueue.value : imageQueue.value
    const model = queue[index]
    if (model && !model.isDeprecated) {
      model.isDeprecated = true
      model._manuallyDeprecated = true
      addTimeline('warn', `用户手动停用了${type === 'llm' ? '语言' : '生图'}模型: ${model.modelName}`)
    }
  }

  function restoreModel(type, index) {
    const queue = type === 'llm' ? llmQueue.value : imageQueue.value
    const model = queue[index]
    if (model && model.isDeprecated) {
      model.isDeprecated = false
      model.consecutiveFails = 0
      if (model._parseFails !== undefined) model._parseFails = 0
      model._manuallyDeprecated = false
      addTimeline('info', `用户手动恢复了${type === 'llm' ? '语言' : '生图'}模型: ${model.modelName}`)
    }
  }
  // ========== 重置 ==========
  function resetWorkflow() {
    status.value = 'idle'
    plan.value = null
    planningText.value = ''
    currentAbortFn.value = null
    pendingStop.value = false
    currentImageIndex.value = -1
    currentAttempt.value = 0
    startTime.value = null
    endTime.value = null
    timeline.value = []
    llmQueue.value = []
    imageQueue.value = []
    currentRoundImages.value = []
    pausedDuration.value = 0
    pauseStartTime.value = null
    pendingConfirm.value = null
    pendingConfirmResolve = null
  }

  async function clearFinalImages(alsoDeleteFiles = false) {
    if (alsoDeleteFiles) {
      const { deleteImage } = await import('@/utils/imageStorage')
      const allImages = [...finalImages.value]
      for (const batch of batchHistory.value) {
        allImages.push(...batch.images)
      }
      for (const img of allImages) {
        if (img.relPath) {
          deleteImage(img.relPath).catch(() => {})
        }
      }
    }
    finalImages.value = []
    batchHistory.value = []
    saveFinalImages()
  }

  function saveLastModelConfig() {
    saveValue('workflow-last-config', lastModelConfig.value)
  }

  // ========== 持久化 ==========

  async function saveFinalImages() {
    try {
      const toSave = JSON.parse(JSON.stringify(
        finalImages.value.map(img => {
          const { dataUrl, ...rest } = img
          return rest
        })
      ))
      const historyToSave = JSON.parse(JSON.stringify(
        batchHistory.value.map(batch => ({
          ...batch,
          images: batch.images.map(img => {
            const { dataUrl, ...rest } = img
            return rest
          }),
        }))
      ))
      await window.electronAPI?.saveData('workflow-final-images', toSave)
      await window.electronAPI?.saveData('workflow-batch-history', historyToSave)
    } catch {}
  }

  function exportToGalleryDone(batchId = null) {
    if (batchId) {
      batchHistory.value = batchHistory.value.filter(b => b.id !== batchId)
    } else {
      finalImages.value = []
    }
    saveFinalImages()
  }

  return {
    // UI
    sidebarCollapsed, activeWorkflowType, workflowTypes,
    // 配置
    config,
    // 执行状态
    status, plan, planningText, currentAbortFn,
    currentImageIndex, currentAttempt, startTime, endTime, timeline,
    // 模型队列
    llmQueue, imageQueue,
    // 结果
    finalImages, currentRoundImages, imageProgress, batchHistory,
    // 用户确认
    pendingConfirm,
    // 计算属性
    isRunning, activeLlmModel, activeImageModel, elapsedMs, remainingMs, isTimeUp,
    // 方法
    init, toggleSidebar, setWorkflowType,
    addTimeline, requestConfirm, resolveConfirm,
    initQueues, beginPlanning, requestStop, cancelStop, confirmStop, stopWorkflow, isStopping, pendingStop, workflowId,
    pausedDuration, pauseStartTime,
    deprecateModel, restoreModel,
    extendTimeLimit,
    resetWorkflow, clearFinalImages, saveFinalImages, exportToGalleryDone,
    lastModelConfig, lastCharDesignName,
    _galOutlineDone, _galCharsDone, _galCharImgDone, _galFinalCharsDone, _galCGPlanDone, _galNarrationDone,
  }
})