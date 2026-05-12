import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useGenerationStore = defineStore('generation', () => {
  const isGenerating = ref(false)
  const tasks = ref([])
  const batchStartTime = ref(null)
  const batchEndTime = ref(null)
  const generationToken = ref(0)
  const completedCount = ref(0)
  const totalCount = ref(0)

  // 表单状态（切换页面也保留）
  const prompt = ref('')
  const selectedCharacterId = ref(null)
  const referenceImages = ref([]) // { id, dataUrl, file? }

  // === 累计任务模式 ===
  const batches = ref([])

  const allBatchTasks = computed(() => batches.value.flatMap(b => b.tasks))

  const taskStats = computed(() => {
    const s = { total: 0, running: 0, success: 0, failed: 0 }
    const taskList = batches.value.length > 0 ? allBatchTasks.value : tasks.value
    for (const t of taskList) {
      s.total++
      if (t.status === 'running') s.running++
      else if (t.status === 'success') s.success++
      else if (t.status === 'failed' || t.status === 'stopped') s.failed++
    }
    return s
  })

  const hasSuccess = computed(() => {
    const taskList = batches.value.length > 0 ? allBatchTasks.value : tasks.value
    return taskList.some(t => t.status === 'success')
  })

  const totalRunningCount = computed(() => {
    return batches.value.reduce((sum, b) => {
      return sum + b.tasks.filter(t => t.status === 'running').length
    }, 0)
  })

  const hasRunningBatches = computed(() => {
    return batches.value.some(b => b.isRunning)
  })

  // === 单批次模式方法 ===

  function startBatch(count) {
    batches.value = []
    generationToken.value++
    isGenerating.value = true
    completedCount.value = 0
    totalCount.value = count
    tasks.value = Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      status: 'pending',
      startTime: null,
      endTime: null,
      error: null,
    }))
    batchStartTime.value = Date.now()
    batchEndTime.value = null
    return generationToken.value
  }

  function endBatch() {
    isGenerating.value = false
    batchEndTime.value = Date.now()
  }

  function stopBatch() {
    generationToken.value++
    isGenerating.value = false
    for (const t of tasks.value) {
      if (t.status === 'pending' || t.status === 'running') {
        t.status = 'stopped'
        t.endTime = Date.now()
      }
    }
    batchEndTime.value = Date.now()
  }

  function isCancelled(token) {
    return token !== generationToken.value
  }

  // === 累计任务模式方法 ===

  function createMultiBatch(count, promptText, siteName, modelName) {
    const batchId = Date.now().toString() + Math.random().toString(36).slice(2, 6)
    const batch = {
      id: batchId,
      prompt: promptText,
      siteName: siteName || '',
      modelName: modelName || '',
      tasks: Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        status: 'pending',
        startTime: null,
        endTime: null,
        error: null,
      })),
      startTime: Date.now(),
      endTime: null,
      isRunning: true,
      isStopped: false,
    }
    batches.value.push(batch)
    return batches.value[batches.value.length - 1]
  }

  function endMultiBatch(batchId) {
    const batch = batches.value.find(b => b.id === batchId)
    if (batch) {
      batch.isRunning = false
      batch.endTime = Date.now()
    }
  }

  function stopMultiBatch(batchId) {
    const batch = batches.value.find(b => b.id === batchId)
    if (batch) {
      batch.isStopped = true
      batch.isRunning = false
      for (const t of batch.tasks) {
        if (t.status === 'pending' || t.status === 'running') {
          t.status = 'stopped'
          t.endTime = Date.now()
        }
      }
      batch.endTime = Date.now()
    }
  }

  function isMultiBatchStopped(batchId) {
    const batch = batches.value.find(b => b.id === batchId)
    return !batch || batch.isStopped
  }

  function clearBatches() {
    batches.value = []
  }

  return {
    isGenerating, tasks, batchStartTime, batchEndTime,
    generationToken, completedCount, totalCount,
    prompt, selectedCharacterId, referenceImages,
    taskStats, hasSuccess,
    startBatch, endBatch, stopBatch, isCancelled,
    batches, totalRunningCount, hasRunningBatches,
    createMultiBatch, endMultiBatch, stopMultiBatch, isMultiBatchStopped, clearBatches,
  }
})