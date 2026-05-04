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
    // 兼容老数据结构迁移
    chatSites.value = loadedSites.map(site => {
      if (site.models) return site
      return {
        id: site.id,
        name: site.name,
        baseUrl: site.baseUrl,
        apiKey: site.apiKey,
        models: site.model ? [{ id: genId('model'), name: site.model }] : []
      }
    })

    activeChatSiteId.value = await loadValue('chat-active-site', null)
    activeChatModelId.value = await loadValue('chat-active-model', null)

    sessions.value = await loadValue('chat-sessions', [])
    activeSessionId.value = await loadValue('chat-active-session', null)
    sidebarCollapsed.value = await loadValue('chat-sidebar-collapsed', false)

    if (sessions.value.length === 0) createSession()
    
    // 初始化默认选择
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
      apiKey: data.apiKey,
      models: []
    }
    chatSites.value.push(site)
    if (!activeChatSiteId.value) activeChatSiteId.value = site.id
    saveConfig()
  }

  function updateChatSite(id, data) {
    const site = chatSites.value.find(s => s.id === id)
    if (site) {
      site.name = data.name
      site.baseUrl = data.baseUrl.replace(/\/+$/, '')
      site.apiKey = data.apiKey
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

  // --- 模型管理 ---
  function addChatModel(siteId, modelName) {
    const site = chatSites.value.find(s => s.id === siteId)
    if (site) {
      const newModel = { id: genId('model'), name: modelName }
      site.models.push(newModel)
      if (!activeChatModelId.value && activeChatSiteId.value === siteId) {
        activeChatModelId.value = newModel.id
      }
      saveConfig()
    }
  }

  function updateChatModel(siteId, modelId, modelName) {
    const site = chatSites.value.find(s => s.id === siteId)
    const model = site?.models.find(m => m.id === modelId)
    if (model) {
      model.name = modelName
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
      // 注意：这里为了不卡顿，不调用 saveSessions()，我们在页面上流式结束后统一存一次盘
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
    addChatModel, updateChatModel, deleteChatModel,
    saveConfig, toggleSidebar, saveSessions 
  }
})