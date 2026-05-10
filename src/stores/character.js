import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { saveImage, deleteImage, relPathToUrl, readImageAsBase64 } from '@/utils/imageStorage'

export const useCharacterStore = defineStore('character', () => {
  const characters = ref([])
  let initialized = false

  // ========== 初始化 ==========
  async function init() {
    if (initialized) return
    try {
      const result = await window.electronAPI?.loadData('characters')
      if (result?.success && result.data) {
        characters.value = result.data
      }
    } catch {}
    initialized = true
  }

  // ========== 持久化 ==========
  async function saveCharacters() {
    try {
      const toSave = JSON.parse(JSON.stringify(
        characters.value.map(ch => {
          const clone = { ...ch }
          // 画廊图片不存 dataUrl
          if (clone.gallery) {
            clone.gallery = clone.gallery.map(img => {
              const { dataUrl, ...rest } = img
              return rest
            })
          }
          return clone
        })
      ))
      await window.electronAPI?.saveData('characters', toSave)
    } catch {}
  }

  // ========== 角色卡 CRUD ==========

  function createCharacter({ name, mainImageDataUrl, mainImageRelPath }) {
    const id = Date.now().toString() + Math.random().toString(36).slice(2, 8)
    const character = {
      id,
      name,
      mainImageRelPath: mainImageRelPath || '',
      basicInfo: '',
      appearance: '',
      personality: '',
      stories: [],       // [{ id, title, content, createdAt, updatedAt }]
      gallery: [],        // [{ id, relPath, name, createdAt, favorite }]
      favorite: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    characters.value.unshift(character)
    saveCharacters()
    return character
  }

  function getCharacter(id) {
    return characters.value.find(c => c.id === id) || null
  }

  function updateCharacter(id, updates) {
    const ch = characters.value.find(c => c.id === id)
    if (!ch) return
    Object.assign(ch, updates, { updatedAt: new Date().toISOString() })
    saveCharacters()
  }

  async function deleteCharacter(id) {
    const ch = characters.value.find(c => c.id === id)
    if (!ch) return
    // 删除主设图文件
    if (ch.mainImageRelPath) {
      await deleteImage(ch.mainImageRelPath).catch(() => {})
    }
    // 删除画廊图片文件
    if (ch.gallery) {
      for (const img of ch.gallery) {
        if (img.relPath) await deleteImage(img.relPath).catch(() => {})
      }
    }
    characters.value = characters.value.filter(c => c.id !== id)
    saveCharacters()
  }

  function toggleFavorite(id) {
    const ch = characters.value.find(c => c.id === id)
    if (!ch) return
    ch.favorite = !ch.favorite
    saveCharacters()
  }

  // ========== 批量操作 ==========

  async function batchDelete(ids) {
    for (const id of ids) {
      await deleteCharacter(id)
    }
  }

  function batchToggleFavorite(ids, value) {
    for (const id of ids) {
      const ch = characters.value.find(c => c.id === id)
      if (ch) ch.favorite = value
    }
    saveCharacters()
  }

  // ========== 故事/经历管理 ==========

  function addStory(charId, title = '新故事', content = '') {
    const ch = characters.value.find(c => c.id === charId)
    if (!ch) return null
    const story = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      title,
      content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    ch.stories.push(story)
    ch.updatedAt = new Date().toISOString()
    saveCharacters()
    return story
  }

  function updateStory(charId, storyId, updates) {
    const ch = characters.value.find(c => c.id === charId)
    if (!ch) return
    const story = ch.stories.find(s => s.id === storyId)
    if (!story) return
    Object.assign(story, updates, { updatedAt: new Date().toISOString() })
    ch.updatedAt = new Date().toISOString()
    saveCharacters()
  }

  function deleteStory(charId, storyId) {
    const ch = characters.value.find(c => c.id === charId)
    if (!ch) return
    ch.stories = ch.stories.filter(s => s.id !== storyId)
    ch.updatedAt = new Date().toISOString()
    saveCharacters()
  }

  // ========== 角色画廊 ==========

  async function addGalleryImage(charId, base64DataUrl, name = '') {
    const ch = characters.value.find(c => c.id === charId)
    if (!ch) return null
    const saved = await saveImage(base64DataUrl, `characters/${charId}`)
    const img = {
      id: saved.id,
      relPath: saved.relPath,
      name: name || `画廊图片`,
      createdAt: new Date().toISOString(),
      favorite: false,
    }
    ch.gallery.push(img)
    ch.updatedAt = new Date().toISOString()
    saveCharacters()
    return img
  }

  async function addGalleryImageFromRelPath(charId, relPath, name = '') {
    const ch = characters.value.find(c => c.id === charId)
    if (!ch) return null
    const img = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      relPath,
      name: name || '画廊图片',
      createdAt: new Date().toISOString(),
      favorite: false,
    }
    ch.gallery.push(img)
    ch.updatedAt = new Date().toISOString()
    saveCharacters()
    return img
  }

  async function deleteGalleryImage(charId, imageId) {
    const ch = characters.value.find(c => c.id === charId)
    if (!ch) return
    const img = ch.gallery.find(i => i.id === imageId)
    if (img?.relPath) {
      await deleteImage(img.relPath).catch(() => {})
    }
    ch.gallery = ch.gallery.filter(i => i.id !== imageId)
    ch.updatedAt = new Date().toISOString()
    saveCharacters()
  }

  function toggleGalleryFavorite(charId, imageId) {
    const ch = characters.value.find(c => c.id === charId)
    if (!ch) return
    const img = ch.gallery.find(i => i.id === imageId)
    if (img) img.favorite = !img.favorite
    saveCharacters()
  }

  function getDisplayUrl(img, isThumb = false) {
    if (!img) return ''
    if (img.dataUrl) return img.dataUrl
    if (img.relPath) {
      const base = relPathToUrl(img.relPath)
      return isThumb ? `${base}?thumb=400` : base
    }
    return ''
  }

  // ========== 计算属性 ==========

  const favoriteCharacters = computed(() =>
    characters.value.filter(c => c.favorite)
  )

  const characterCount = computed(() => characters.value.length)

  return {
    characters,
    init,
    saveCharacters,
    createCharacter,
    getCharacter,
    updateCharacter,
    deleteCharacter,
    toggleFavorite,
    batchDelete,
    batchToggleFavorite,
    addStory,
    updateStory,
    deleteStory,
    addGalleryImage,
    addGalleryImageFromRelPath,
    deleteGalleryImage,
    toggleGalleryFavorite,
    getDisplayUrl,
    favoriteCharacters,
    characterCount,
  }
})