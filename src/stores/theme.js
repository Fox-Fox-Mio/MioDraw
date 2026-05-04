import { defineStore } from 'pinia'
import { ref } from 'vue'
import { loadValue, saveValue } from '@/utils/storage'

export const useThemeStore = defineStore('theme', () => {
  const isDark = ref(false)
  const bgImage = ref('')
  const bgOpacity = ref(0.3)
  const imageDisplayMode = ref('square')
  const galleryDisplayMode = ref('square')
  const customSizes = ref([])
  const layoutMode = ref('horizontal')

  async function init() {
    const saved = await loadValue('theme', null)
    if (saved === 'dark' || saved === 'light') {
      isDark.value = saved === 'dark'
    } else {
      isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    applyTheme()

    bgImage.value = await loadValue('bgImage', '')
    bgOpacity.value = parseFloat(await loadValue('bgOpacity', '0.3')) || 0.3
    imageDisplayMode.value = await loadValue('imageDisplayMode', 'square')
    galleryDisplayMode.value = await loadValue('galleryDisplayMode', 'square')
    customSizes.value = await loadValue('customSizes', [])
    if (!Array.isArray(customSizes.value)) customSizes.value = []
    layoutMode.value = await loadValue('layoutMode', 'horizontal')
  }

  function applyTheme() {
    if (isDark.value) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  function toggleTheme() {
    isDark.value = !isDark.value
    saveValue('theme', isDark.value ? 'dark' : 'light')
    applyTheme()
  }

  function setBgImage(url) {
    bgImage.value = url
    saveValue('bgImage', url)
  }

  function setBgOpacity(val) {
    bgOpacity.value = val
    saveValue('bgOpacity', val.toString())
  }

  function setImageDisplayMode(mode) {
    imageDisplayMode.value = mode
    saveValue('imageDisplayMode', mode)
  }

  function setGalleryDisplayMode(mode) {
    galleryDisplayMode.value = mode
    saveValue('galleryDisplayMode', mode)
  }

  function addCustomSize(size) {
    customSizes.value.push(size)
    saveValue('customSizes', customSizes.value)
  }

  function removeCustomSize(size) {
    customSizes.value = customSizes.value.filter(s => s !== size)
    saveValue('customSizes', customSizes.value)
  }

  function setLayoutMode(mode) {
    layoutMode.value = mode
    saveValue('layoutMode', mode)
  }

  return {
    isDark, bgImage, bgOpacity, imageDisplayMode, galleryDisplayMode, customSizes, layoutMode,
    init, toggleTheme, setBgImage, setBgOpacity, setImageDisplayMode, setGalleryDisplayMode,
    addCustomSize, removeCustomSize, setLayoutMode,
  }
})