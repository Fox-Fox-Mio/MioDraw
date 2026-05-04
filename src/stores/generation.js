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

  const taskStats = computed(() => {
    const s = { total: 0, running: 0, success: 0, failed: 0 }
    for (const t of tasks.value) {
      s.total++
      if (t.status === 'running') s.running++
      else if (t.status === 'success') s.success++
      else if (t.status === 'failed' || t.status === 'stopped') s.failed++
    }
    return s
  })

  const hasSuccess = computed(() => tasks.value.some(t => t.status === 'success'))

  function startBatch(count) {
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

  return {
    isGenerating, tasks, batchStartTime, batchEndTime,
    generationToken, completedCount, totalCount,
    prompt,
    taskStats, hasSuccess,
    startBatch, endBatch, stopBatch, isCancelled,
  }
})