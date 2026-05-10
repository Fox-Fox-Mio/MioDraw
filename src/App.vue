<template>
  <MainLayout />
  <DisclaimerDialog ref="disclaimerRef" />
  <WorkflowDialogs />
  <ModelDownloadProgress />
  <ModelDownloadDialog
    v-model="showModelDownload"
    :required-model="requiredModelForDownload"
    @start="handleModelDownloadStart"
  />
</template>

<script setup>
import { onMounted, ref } from 'vue' 
import MainLayout from '@/layouts/MainLayout.vue'
import DisclaimerDialog from '@/components/DisclaimerDialog.vue' // 引入免责组件
import WorkflowDialogs from '@/components/WorkflowDialogs.vue'  //工作流弹窗
import ModelDownloadProgress from '@/components/ModelDownloadProgress.vue'
import ModelDownloadDialog from '@/components/ModelDownloadDialog.vue'
import { useModelDownloadStore } from '@/stores/modelDownload'
import { useThemeStore } from '@/stores/theme'
import { useApiStore } from '@/stores/api'
import { useGalleryStore } from '@/stores/gallery'
import { useChatStore } from '@/stores/chat'
import { useWorkflowStore } from '@/stores/workflow'
import { flushAll } from '@/utils/storage'

const themeStore = useThemeStore()
const apiStore = useApiStore()
const galleryStore = useGalleryStore()
const chatStore = useChatStore()
const workflowStore = useWorkflowStore() 

const disclaimerRef = ref(null) // 获取组件实例

const showModelDownload = ref(false)
const requiredModelForDownload = ref('')
const modelDownloadStore = useModelDownloadStore()

// 全局方法：供其他组件触发下载对话框
window.__triggerModelDownload = (modelName) => {
  requiredModelForDownload.value = modelName || ''
  showModelDownload.value = true
}

function handleModelDownloadStart({ models, source }) {
  modelDownloadStore.startDownload(models, source)
}

onMounted(async () => {
  await Promise.all([
    themeStore.init(),
    apiStore.init(),
    galleryStore.init(),
    chatStore.init(),
    workflowStore.init(),
  ])

  // 👈 新增：初始化完成后，检查是否需要弹出免责声明
  if (disclaimerRef.value) {
    disclaimerRef.value.checkDisclaimer()
  }

  // 监听退出事件，确保数据写入 (完全保留你原本的代码)
  if (window.electronAPI?.onBeforeQuit) {
    window.electronAPI.onBeforeQuit(() => {
      flushAll()
    })
  }
  // 页面卸载时也尝试 flush（同步）(完全保留你原本的代码)
  window.addEventListener('beforeunload', () => {
    flushAll()
  })
})
</script>