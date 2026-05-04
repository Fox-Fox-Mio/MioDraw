<template>
  <MainLayout />
  <!-- 新增：免责声明弹窗 -->
  <DisclaimerDialog ref="disclaimerRef" />
</template>

<script setup>
import { onMounted, ref } from 'vue' 
import MainLayout from '@/layouts/MainLayout.vue'
import DisclaimerDialog from '@/components/DisclaimerDialog.vue' // 👈 新增：引入免责组件
import { useThemeStore } from '@/stores/theme'
import { useApiStore } from '@/stores/api'
import { useGalleryStore } from '@/stores/gallery'
import { useChatStore } from '@/stores/chat'
import { flushAll } from '@/utils/storage'

const themeStore = useThemeStore()
const apiStore = useApiStore()
const galleryStore = useGalleryStore()
const chatStore = useChatStore() 

const disclaimerRef = ref(null) // 👈 新增：获取组件实例

onMounted(async () => {
  await Promise.all([
    themeStore.init(),
    apiStore.init(),
    galleryStore.init(),
    chatStore.init(),
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