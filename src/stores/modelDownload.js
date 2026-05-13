import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// 模型下载地址配置
const GITHUB_BASE = 'https://github.com/danielgatis/rembg/releases/download/v0.0.0'
const MIRROR_BASE = 'https://ghfast.top/https://github.com/danielgatis/rembg/releases/download/v0.0.0'

const MODEL_LIST = ['isnet-anime', 'isnet-general-use', 'u2net', 'u2netp', 'u2net_human_seg', 'silueta']

const MODEL_URLS = {
  github: Object.fromEntries(MODEL_LIST.map(m => [m, `${GITHUB_BASE}/${m}.onnx`])),
  mirror: Object.fromEntries(MODEL_LIST.map(m => [m, `${MIRROR_BASE}/${m}.onnx`])),
}

export const useModelDownloadStore = defineStore('modelDownload', () => {
  const isDownloading = ref(false)
  const showComplete = ref(false)
  const currentModelName = ref('')
  const currentIndex = ref(0)
  const totalCount = ref(0)
  const bytesDownloaded = ref(0)
  const bytesTotal = ref(0)

  const percentage = computed(() => {
    if (!bytesTotal.value) return 0
    return Math.round((bytesDownloaded.value / bytesTotal.value) * 100)
  })

  const downloadedMB = computed(() =>
    (bytesDownloaded.value / 1024 / 1024).toFixed(1)
  )

  const totalMB = computed(() =>
    (bytesTotal.value / 1024 / 1024).toFixed(1)
  )

  let currentDownloadPromise = null
  const isCanceled = ref(false)

  async function startDownload(models, source) {
    isDownloading.value = true
    showComplete.value = false
    isCanceled.value = false
    totalCount.value = models.length
    currentIndex.value = 0

    const urls = MODEL_URLS[source] || MODEL_URLS.mirror

    for (let i = 0; i < models.length; i++) {
      if (isCanceled.value) break

      currentIndex.value = i
      currentModelName.value = models[i]
      bytesDownloaded.value = 0
      bytesTotal.value = 0

      const url = urls[models[i]]
      if (!url) continue

      try {
        currentDownloadPromise = window.electronAPI.downloadModel({
          url,
          modelName: models[i],
          onProgress: (downloaded, total) => {
            bytesDownloaded.value = downloaded
            bytesTotal.value = total
          },
        })
        const result = await currentDownloadPromise
        if (result?.canceled) {
          break
        }
      } catch (err) {
        if (isCanceled.value) break
        console.error(`模型 ${models[i]} 下载失败:`, err)
      }
    }

    currentDownloadPromise = null
    isDownloading.value = false
    if (!isCanceled.value) {
      showComplete.value = true
    }
  }

  function cancelDownload() {
    isCanceled.value = true
    if (currentModelName.value) {
      window.electronAPI.cancelModelDownload(currentModelName.value)
    }
  }

  function dismiss() {
    showComplete.value = false
  }

  return {
    isDownloading, showComplete,
    currentModelName, currentIndex, totalCount,
    bytesDownloaded, bytesTotal,
    percentage, downloadedMB, totalMB,
    startDownload, dismiss, cancelDownload, isCanceled,
  }
})