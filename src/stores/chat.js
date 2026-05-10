import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { loadValue, saveValue } from '@/utils/storage'

export const useChatStore = defineStore('chat', () => {
  const chatSites = ref([])
  const activeChatSiteId = ref(null)
  const activeChatModelId = ref(null)

  const sessions = ref([])
  const activeSessionId = ref(null)
  const sidebarCollapsed = ref(false)

  function genId(prefix) {
    return prefix + '-' + Date.now().toString() + Math.random().toString(36).slice(2, 6)
  }

  async function init() {
    const loadedSites = await loadValue('chat-sites', [])
    chatSites.value = migrateSites(loadedSites)

    activeChatSiteId.value = await loadValue('chat-active-site', null)
    activeChatModelId.value = await loadValue('chat-active-model', null)

    sessions.value = await loadValue('chat-sessions', [])
    activeSessionId.value = await loadValue('chat-active-session', null)
    sidebarCollapsed.value = await loadValue('chat-sidebar-collapsed', false)

    if (sessions.value.length === 0) createSession()

    if (chatSites.value.length > 0) {
      if (!activeChatSiteId.value || !chatSites.value.find(s => s.id === activeChatSiteId.value)) {
        activeChatSiteId.value = chatSites.value[0].id
      }
      const site = chatSites.value.find(s => s.id === activeChatSiteId.value)
      if (site && site.models.length > 0 && !site.models.find(m => m.id === activeChatModelId.value)) {
        activeChatModelId.value = site.models[0].id
      }
    }
  }

  // 老数据迁移：单 apiKey → keys 数组
  function migrateSites(data) {
    return data.map(site => {
      if (site.keys) return site
      const keyId = genId('key')
      // 旧格式：{ id, name, baseUrl, apiKey, models/model }
      let models = []
      if (site.models && Array.isArray(site.models)) {
        models = site.models.map(m => ({
          id: m.id || genId('model'),
          name: m.name || '',
          keyId: m.keyId || keyId,
        }))
      } else if (site.model) {
        models = [{ id: genId('model'), name: site.model, keyId }]
      }
      return {
        id: site.id,
        name: site.name,
        baseUrl: site.baseUrl,
        keys: [{ id: keyId, name: '默认', apiKey: site.apiKey || '' }],
        models,
      }
    })
  }

  function saveConfig() {
    saveValue('chat-sites', chatSites.value)
    saveValue('chat-active-site', activeChatSiteId.value || '')
    saveValue('chat-active-model', activeChatModelId.value || '')
  }

  function saveSessions() {
    saveValue('chat-sessions', sessions.value)
    saveValue('chat-active-session', activeSessionId.value || '')
  }

  // --- 站点管理 ---
  function addChatSite(data) {
    const site = {
      id: genId('site'),
      name: data.name,
      baseUrl: data.baseUrl.replace(/\/+$/, ''),
      keys: [],
      models: [],
    }
    chatSites.value.push(site)
    if (!activeChatSiteId.value) activeChatSiteId.value = site.id
    saveConfig()
    return site
  }

  function updateChatSite(id, data) {
    const site = chatSites.value.find(s => s.id === id)
    if (site) {
      site.name = data.name
      site.baseUrl = data.baseUrl.replace(/\/+$/, '')
      saveConfig()
    }
  }

  function deleteChatSite(id) {
    chatSites.value = chatSites.value.filter(s => s.id !== id)
    if (activeChatSiteId.value === id) {
      activeChatSiteId.value = chatSites.value.length > 0 ? chatSites.value[0].id : null
      const activeSite = chatSites.value.find(s => s.id === activeChatSiteId.value)
      activeChatModelId.value = activeSite?.models[0]?.id || null
    }
    saveConfig()
  }

  // --- Key 管理 ---
  function addChatKey(siteId, data) {
    const site = chatSites.value.find(s => s.id === siteId)
    if (!site) return
    site.keys.push({ id: genId('key'), name: data.name || '', apiKey: data.apiKey || '' })
    saveConfig()
  }

  function updateChatKey(siteId, keyId, data) {
    const site = chatSites.value.find(s => s.id === siteId)
    const key = site?.keys.find(k => k.id === keyId)
    if (key) {
      if (data.name !== undefined) key.name = data.name
      if (data.apiKey !== undefined) key.apiKey = data.apiKey
      saveConfig()
    }
  }

  function deleteChatKey(siteId, keyId) {
    const site = chatSites.value.find(s => s.id === siteId)
    if (!site) return
    site.keys = site.keys.filter(k => k.id !== keyId)
    for (const m of site.models) {
      if (m.keyId === keyId) m.keyId = site.keys[0]?.id || null
    }
    saveConfig()
  }

  // --- 模型管理 ---
  function addChatModel(siteId, data) {
    const site = chatSites.value.find(s => s.id === siteId)
    if (site) {
      const newModel = {
        id: genId('model'),
        name: data.name || data,
        keyId: data.keyId || site.keys[0]?.id || null,
      }
      site.models.push(newModel)
      if (!activeChatModelId.value && activeChatSiteId.value === siteId) {
        activeChatModelId.value = newModel.id
      }
      saveConfig()
    }
  }

  function updateChatModel(siteId, modelId, data) {
    const site = chatSites.value.find(s => s.id === siteId)
    const model = site?.models.find(m => m.id === modelId)
    if (model) {
      if (typeof data === 'string') {
        model.name = data
      } else {
        if (data.name !== undefined) model.name = data.name
        if (data.keyId !== undefined) model.keyId = data.keyId
      }
      saveConfig()
    }
  }

  function deleteChatModel(siteId, modelId) {
    const site = chatSites.value.find(s => s.id === siteId)
    if (site) {
      site.models = site.models.filter(m => m.id !== modelId)
      if (activeChatModelId.value === modelId) {
        activeChatModelId.value = site.models[0]?.id || null
      }
      saveConfig()
    }
  }

  // --- 获取完整配置 ---
  function getChatConfig(siteId, modelId) {
    const site = chatSites.value.find(s => s.id === siteId)
    const model = site?.models.find(m => m.id === modelId)
    if (!site || !model) return null
    const key = site.keys.find(k => k.id === model.keyId)
    if (!key) return null
    return {
      baseUrl: site.baseUrl,
      apiKey: key.apiKey,
      model: model.name,
      siteName: site.name,
    }
  }

  function getChatKeyName(site, keyId) {
    const k = site.keys.find(k => k.id === keyId)
    return k ? (k.name || '(未命名)') : '无'
  }

  // --- 会话管理 ---
  function createSession(title = '新对话') {
    const id = Date.now().toString()
    sessions.value.push({ id, title, messages: [] })
    activeSessionId.value = id
    saveSessions()
    return id
  }

  function deleteSession(id) {
    sessions.value = sessions.value.filter(s => s.id !== id)
    if (activeSessionId.value === id) {
      activeSessionId.value = sessions.value.length > 0 ? sessions.value[0].id : null
    }
    if (sessions.value.length === 0) createSession()
    saveSessions()
  }

  function renameSession(id, newTitle) {
    const session = sessions.value.find(s => s.id === id)
    if (session) {
      session.title = newTitle
      saveSessions()
    }
  }

  function addMessage(sessionId, role, content) {
    const session = sessions.value.find(s => s.id === sessionId)
    if (session) {
      session.messages.push({ role, content })
      saveSessions()
    }
  }

  function deleteMessage(sessionId, msgIndex) {
    const session = sessions.value.find(s => s.id === sessionId)
    if (session && session.messages) {
      session.messages.splice(msgIndex, 1)
      saveSessions()
    }
  }

  function updateLastMessage(sessionId, content) {
    const session = sessions.value.find(s => s.id === sessionId)
    if (session && session.messages.length > 0) {
      session.messages[session.messages.length - 1].content = content
    }
  }

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
    saveValue('chat-sidebar-collapsed', sidebarCollapsed.value)
  }

  return {
    chatSites, activeChatSiteId, activeChatModelId, sessions, activeSessionId, sidebarCollapsed,
    init, createSession, deleteSession, renameSession, addMessage, deleteMessage, updateLastMessage,
    addChatSite, updateChatSite, deleteChatSite,
    addChatKey, updateChatKey, deleteChatKey,
    addChatModel, updateChatModel, deleteChatModel,
    getChatConfig, getChatKeyName,
    saveConfig, toggleSidebar, saveSessions,
  }
})