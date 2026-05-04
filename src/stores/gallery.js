import { defineStore } from 'pinia'
import { ref } from 'vue'
import { saveImage, deleteImage, relPathToUrl } from '@/utils/imageStorage'

export const useGalleryStore = defineStore('gallery', () => {
  const generatedImages = ref([])
  const importedImages = ref([])
  let initialized = false

  async function init() {
    if (initialized) return

    // 加载生成图片
    try {
      const gen = await window.electronAPI?.loadData('generated-images')
      if (gen?.success && gen.data) {
        generatedImages.value = gen.data
      } else {
        // 从 localStorage 迁移老数据
        const saved = localStorage.getItem('generated-images')
        if (saved) {
          try {
            const old = JSON.parse(saved)
            generatedImages.value = await migrateImages(old, 'generated')
            await saveGeneratedNow()
          } catch {}
        }
      }
    } catch {}

    // 加载导入图片
    try {
      const imp = await window.electronAPI?.loadData('imported-images')
      if (imp?.success && imp.data) {
        importedImages.value = imp.data
      } else {
        const saved = localStorage.getItem('imported-images')
        if (saved) {
          try {
            const old = JSON.parse(saved)
            importedImages.value = await migrateImages(old, 'imported')
            await saveImportedNow()
          } catch {}
        }
      }
    } catch {}

    initialized = true
  }

  // 把旧 base64 数据迁移为文件存储
  async function migrateImages(list, subfolder) {
    const migrated = []
    for (const img of list) {
      if (img.relPath) {
        // 已经是新格式
        migrated.push(img)
        continue
      }
      if (img.dataUrl && img.dataUrl.startsWith('data:')) {
        try {
          const saved = await saveImage(img.dataUrl, subfolder)
          migrated.push({
            ...img,
            relPath: saved.relPath,
            dataUrl: undefined, // 不再存 base64
          })
        } catch {
          // 迁移失败就保留原数据
          migrated.push(img)
        }
      } else {
        migrated.push(img)
      }
    }
    return migrated
  }

  async function saveGeneratedNow() {
    try {
      // 保存时去掉 dataUrl 字段（只在内存中用于显示）
      const toSave = generatedImages.value.map(img => {
        const { dataUrl, ...rest } = img
        return rest
      })
      await window.electronAPI?.saveData('generated-images', toSave)
    } catch {}
  }

  async function saveImportedNow() {
    try {
      const toSave = importedImages.value.map(img => {
        const { dataUrl, ...rest } = img
        return rest
      })
      await window.electronAPI?.saveData('imported-images', toSave)
    } catch {}
  }

  function saveGenerated() { saveGeneratedNow() }
  function saveImported() { saveImportedNow() }

  /**
   * 添加生成图片
   * image 需要包含 dataUrl（base64），会自动保存为文件
   */
  async function addGeneratedImage(image) {
    if (image.dataUrl && !image.relPath) {
      try {
        const saved = await saveImage(image.dataUrl, 'generated')
        image.relPath = saved.relPath
        delete image.dataUrl // ⚠️ 关键：保存为文件后，立即删除内存中的 Base64 数据，防止内存泄漏
      } catch (err) {
        console.error('保存图片失败:', err)
      }
    }
    generatedImages.value.unshift(image)
    saveGenerated()
  }

  async function addImportedImage(image) {
    if (image.dataUrl && !image.relPath) {
      try {
        const saved = await saveImage(image.dataUrl, 'imported')
        image.relPath = saved.relPath
        delete image.dataUrl // ⚠️ 释放内存
      } catch (err) {
        console.error('保存图片失败:', err)
      }
    }
    importedImages.value.unshift(image)
    saveImported()
  }

  async function deleteGeneratedImage(id) {
    const img = generatedImages.value.find(i => i.id === id)
    if (img?.relPath) {
      await deleteImage(img.relPath)
    }
    generatedImages.value = generatedImages.value.filter(i => i.id !== id)
    saveGenerated()
  }

  async function deleteImportedImage(id) {
    const img = importedImages.value.find(i => i.id === id)
    if (img?.relPath) {
      await deleteImage(img.relPath)
    }
    importedImages.value = importedImages.value.filter(i => i.id !== id)
    saveImported()
  }

  function renameGeneratedImage(id, newName) {
    const img = generatedImages.value.find(i => i.id === id)
    if (img) {
      img.name = newName
      saveGenerated()
    }
  }

  function toggleFavorite(id) {
    const img = generatedImages.value.find(i => i.id === id)
    if (img) {
      img.favorite = !img.favorite
      saveGenerated()
    }
  }

  /**
   * 获取图片显示 URL（优先用 dataUrl，其次用 miodraw:// 协议）
   * @param {Object} img 图片对象
   * @param {Boolean} isThumb 是否请求缩略图（极大提升列表性能）
   */
  function getDisplayUrl(img, isThumb = false) {
    if (!img) return ''
    if (img.dataUrl) return img.dataUrl
    if (img.relPath) {
      const base = relPathToUrl(img.relPath)
      // 如果请求缩略图，加上 thumb 参数，最大边长限制为 400px
      return isThumb ? `${base}?thumb=400` : base
    }
    return ''
  }

  return {
    generatedImages,
    importedImages,
    init,
    saveGenerated,
    saveImported,
    addGeneratedImage,
    addImportedImage,
    deleteGeneratedImage,
    deleteImportedImage,
    renameGeneratedImage,
    toggleFavorite,
    getDisplayUrl,
  }
})