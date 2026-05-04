import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { loadValue, saveValue } from '@/utils/storage'

export const useApiStore = defineStore('api', () => {
  const sites = ref([])
  const customApiTypes = ref([])
  const activeSiteId = ref(null)
  const activeModelId = ref(null)

  const activeSite = computed(() => sites.value.find(s => s.id === activeSiteId.value) || null)
  const activeModel = computed(() => {
    if (!activeSite.value) return null
    return activeSite.value.models.find(m => m.id === activeModelId.value) || null
  })

  function genId(prefix) {
    return prefix + '-' + Date.now().toString() + Math.random().toString(36).slice(2, 6)
  }

  async function init() {
    const sitesData = await loadValue('api-sites', null)
    if (sitesData) {
      try {
        sites.value = migrateSites(sitesData)
      } catch { sites.value = [] }
    }
    const typesData = await loadValue('custom-api-types', [])
    customApiTypes.value = Array.isArray(typesData) ? typesData : []

    activeSiteId.value = await loadValue('api-active-site', null)
    activeModelId.value = await loadValue('api-active-model', null)

    if (!activeSiteId.value && sites.value.length > 0) {
      activeSiteId.value = sites.value[0].id
      activeModelId.value = sites.value[0].models[0]?.id || null
    }
    save()
  }

  // 老版本数据迁移
  function migrateSites(data) {
    return data.map(site => {
      if (site.keys && site.models) return site
      const keyId = genId('key')
      const modelId = genId('model')
      return {
        id: site.id,
        name: site.name,
        baseUrl: site.baseUrl,
        keys: [{ id: keyId, name: '默认', apiKey: site.apiKey || '' }],
        models: [{ id: modelId, name: site.model || '', keyId, apiType: site.apiType || 'images' }],
        createdAt: site.createdAt || new Date().toISOString(),
      }
    })
  }

  function save() {
    saveValue('api-sites', sites.value)
    saveValue('api-active-site', activeSiteId.value || '')
    saveValue('api-active-model', activeModelId.value || '')
  }
  function saveCustomTypes() {
    saveValue('custom-api-types', customApiTypes.value)
  }

  // 站点
  function addSite(data) {
    const site = {
      id: genId('site'),
      name: data.name,
      baseUrl: data.baseUrl.replace(/\/+$/, ''),
      keys: [],
      models: [],
      createdAt: new Date().toISOString(),
    }
    sites.value.push(site)
    save()
    return site
  }
  function updateSite(id, data) {
    const site = sites.value.find(s => s.id === id)
    if (site) {
      if (data.name !== undefined) site.name = data.name
      if (data.baseUrl !== undefined) site.baseUrl = data.baseUrl.replace(/\/+$/, '')
      save()
    }
  }
  function deleteSite(id) {
    sites.value = sites.value.filter(s => s.id !== id)
    if (activeSiteId.value === id) {
      activeSiteId.value = sites.value[0]?.id || null
      activeModelId.value = sites.value[0]?.models[0]?.id || null
    }
    save()
  }

  // Key
  function addKey(siteId, data) {
    const site = sites.value.find(s => s.id === siteId)
    if (!site) return
    site.keys.push({ id: genId('key'), name: data.name || '', apiKey: data.apiKey || '' })
    save()
  }
  function updateKey(siteId, keyId, data) {
    const site = sites.value.find(s => s.id === siteId)
    const key = site?.keys.find(k => k.id === keyId)
    if (key) {
      if (data.name !== undefined) key.name = data.name
      if (data.apiKey !== undefined) key.apiKey = data.apiKey
      save()
    }
  }
  function deleteKey(siteId, keyId) {
    const site = sites.value.find(s => s.id === siteId)
    if (!site) return
    site.keys = site.keys.filter(k => k.id !== keyId)
    for (const m of site.models) {
      if (m.keyId === keyId) m.keyId = site.keys[0]?.id || null
    }
    save()
  }

  // 模型
  function addModel(siteId, data) {
    const site = sites.value.find(s => s.id === siteId)
    if (!site) return
    site.models.push({
      id: genId('model'),
      name: data.name || '',
      keyId: data.keyId || site.keys[0]?.id || null,
      apiType: data.apiType || 'images',
    })
    save()
  }
  function updateModel(siteId, modelId, data) {
    const site = sites.value.find(s => s.id === siteId)
    const model = site?.models.find(m => m.id === modelId)
    if (model) {
      Object.assign(model, data)
      save()
    }
  }
  function deleteModel(siteId, modelId) {
    const site = sites.value.find(s => s.id === siteId)
    if (!site) return
    site.models = site.models.filter(m => m.id !== modelId)
    if (activeModelId.value === modelId) {
      activeModelId.value = site.models[0]?.id || null
    }
    save()
  }

  // 自定义接口类型
  function addCustomApiType(data) {
    customApiTypes.value.push({
      id: genId('custom'),
      name: data.name,
      baseType: data.baseType,
      endpoint: data.endpoint || '',
    })
    saveCustomTypes()
  }
  function updateCustomApiType(id, data) {
    const t = customApiTypes.value.find(t => t.id === id)
    if (t) {
      Object.assign(t, data)
      saveCustomTypes()
    }
  }
  function deleteCustomApiType(id) {
    customApiTypes.value = customApiTypes.value.filter(t => t.id !== id)
    for (const site of sites.value) {
      for (const m of site.models) {
        if (m.apiType === id) m.apiType = 'images'
      }
    }
    save()
    saveCustomTypes()
  }

  function setActive(siteId, modelId) {
    activeSiteId.value = siteId
    activeModelId.value = modelId
    save()
  }

  // 获取当前生成配置
  function getGenConfig(siteId, modelId) {
    const site = sites.value.find(s => s.id === siteId)
    const model = site?.models.find(m => m.id === modelId)
    if (!site || !model) return null
    const key = site.keys.find(k => k.id === model.keyId)
    if (!key) return null

    let apiType = model.apiType
    let endpoint = null
    if (apiType.startsWith('custom-')) {
      const ct = customApiTypes.value.find(t => t.id === apiType)
      if (ct) {
        apiType = ct.baseType
        endpoint = ct.endpoint
      } else {
        apiType = 'images'
      }
    }
    return {
      baseUrl: site.baseUrl,
      apiKey: key.apiKey,
      model: model.name,
      apiType,
      endpoint,
      siteName: site.name,
    }
  }

  function getApiTypeLabel(apiType) {
    const map = { images: '图片接口', chat: 'Chat 接口', responses: 'Responses 接口' }
    if (map[apiType]) return map[apiType]
    const ct = customApiTypes.value.find(t => t.id === apiType)
    return ct ? ct.name : apiType
  }

  return {
    sites, customApiTypes, activeSiteId, activeModelId,
    activeSite, activeModel,
    init,
    addSite, updateSite, deleteSite,
    addKey, updateKey, deleteKey,
    addModel, updateModel, deleteModel,
    addCustomApiType, updateCustomApiType, deleteCustomApiType,
    setActive, getGenConfig, getApiTypeLabel,
  }
})