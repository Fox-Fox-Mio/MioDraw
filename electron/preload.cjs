const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // API 代理
  apiRequest: (options) => ipcRenderer.invoke('api-request', options),
  apiRequestFormData: (options) => ipcRenderer.invoke('api-request-formdata', options),
  downloadImage: (url) => ipcRenderer.invoke('download-image', url),

  // 数据持久化
  saveData: (key, data) => ipcRenderer.invoke('save-data', key, data),
  loadData: (key) => ipcRenderer.invoke('load-data', key),

  // 图片文件
  saveImageFile: (options) => ipcRenderer.invoke('save-image-file', options),
  deleteImageFile: (relPath) => ipcRenderer.invoke('delete-image-file', relPath),
  readImageFile: (relPath) => ipcRenderer.invoke('read-image-file', relPath),
  exportImageFile: (options) => ipcRenderer.invoke('export-image-file', options),

  // AI 放大
  upscaleImage: (options) => ipcRenderer.invoke('upscale-image', options),

  // 背景去除
  removeBg: (options) => ipcRenderer.invoke('remove-bg', options),

  // 模型管理
  checkModelExists: (modelName) => ipcRenderer.invoke('check-model-exists', modelName),
  downloadModel: (options) => {
    const { url, modelName, onProgress } = options
    // 监听进度
    const progressHandler = (e, data) => {
      if (data.modelName === modelName && onProgress) {
        onProgress(data.downloaded, data.total)
      }
    }
    ipcRenderer.on('model-download-progress', progressHandler)

    return ipcRenderer.invoke('download-model', { url, modelName }).finally(() => {
      ipcRenderer.removeListener('model-download-progress', progressHandler)
    })
  },

  // 文档解析
  parseDocument: (options) => ipcRenderer.invoke('parse-document', options),

  // 批量导出图片
  batchExportImages: (options) => ipcRenderer.invoke('batch-export-images', options),

  // 数据目录
  getDataDir: () => ipcRenderer.invoke('get-data-dir'),
  selectDataDir: () => ipcRenderer.invoke('select-data-dir'),
  resetDataDir: () => ipcRenderer.invoke('reset-data-dir'),
  openDataDir: () => ipcRenderer.invoke('open-data-dir'),

  //防止回退
  onBeforeQuit: (callback) => ipcRenderer.on('app-before-quit', callback),

  //外部网页
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // 退出应用
  quitApp: () => ipcRenderer.send('quit-app'),

  // API 流式请求
  apiRequestStream: (options, onData, onEnd, onError) => {
    const reqId = Date.now().toString() + Math.random().toString(36).slice(2,6)
    options.requestId = reqId
    
    ipcRenderer.on(`stream-data-${reqId}`, (e, chunk) => onData(chunk))
    ipcRenderer.on(`stream-end-${reqId}`, () => {
      ipcRenderer.removeAllListeners(`stream-data-${reqId}`)
      ipcRenderer.removeAllListeners(`stream-end-${reqId}`)
      ipcRenderer.removeAllListeners(`stream-error-${reqId}`)
      onEnd()
    })
    ipcRenderer.on(`stream-error-${reqId}`, (e, err) => {
      ipcRenderer.removeAllListeners(`stream-data-${reqId}`)
      ipcRenderer.removeAllListeners(`stream-end-${reqId}`)
      ipcRenderer.removeAllListeners(`stream-error-${reqId}`)
      onError(err)
    })

    ipcRenderer.send('api-request-stream', options)
    
    // 返回一个可以主动中止的函数给前端
    return () => {
      ipcRenderer.send(`abort-stream-${reqId}`)
    }
  },
})