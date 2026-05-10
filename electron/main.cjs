const { app, BrowserWindow, ipcMain, net, dialog, protocol, shell, nativeImage } = require('electron')
const path = require('path')
const crypto = require('crypto')

// ⚠️ 专属密钥：必须是刚好 32 个字符！你可以随意修改，但加密和解密必须保持一致
const ENCRYPTION_KEY = 'MioDraw_Super_Secret_Key_1234567' 

// 解密函数
function decryptKey(encryptedText) {
  try {
    if (!encryptedText.startsWith('miokey-')) return encryptedText; // 如果不是加密key，直接返回原值
    const parts = encryptedText.replace('miokey-', '').split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedTextBuffer = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedTextBuffer);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (e) {
    console.error('API Key 解密失败', e);
    return encryptedText;
  }
}
const fs = require('fs')

const { execFile } = require('child_process')
const mammoth = require('mammoth')

const isDev = !app.isPackaged

let mainWindow = null

let splashWindow = null

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 460,
    height: 380,
    frame: false,
    transparent: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: true,
  })

  if (isDev) {
    splashWindow.loadFile(path.join(__dirname, '../public/splash.html'))
  } else {
    splashWindow.loadFile(path.join(__dirname, '../dist/splash.html'))
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'MioDraw',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    backgroundColor: '#1a1a2e',
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    // 延迟一点确保渲染完成
    setTimeout(() => {
      mainWindow.show()
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close()
        splashWindow = null
      }
    }, 500)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}


// 退出应用
ipcMain.on('quit-app', () => {
  app.quit()
})
// ========== API 代理请求 ==========

ipcMain.handle('api-request', async (event, options) => {
  const { url, method, headers, body, timeout } = options

  try {
    const controller = new AbortController()
    const timer = timeout ? setTimeout(() => controller.abort(), timeout) : null

    // 拦截并解密 Authorization
    const finalHeaders = { ...(headers || {}) }
    if (finalHeaders['Authorization'] && finalHeaders['Authorization'].includes('Bearer miokey-')) {
      const token = finalHeaders['Authorization'].replace('Bearer ', '')
      finalHeaders['Authorization'] = `Bearer ${decryptKey(token)}`
    }

    const response = await net.fetch(url, {
      method: method || 'POST',
      headers: finalHeaders,
      body: body || undefined,
      signal: controller.signal,
    })

    if (timer) clearTimeout(timer)

    const contentType = response.headers.get('content-type') || ''
    let data
    if (contentType.includes('application/json')) {
      data = await response.json()
    } else {
      const buffer = await response.arrayBuffer()
      data = Buffer.from(buffer).toString('base64')
    }

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      data,
    }
  } catch (err) {
    throw { message: err.message || '请求失败' }
  }
})

// ========== API 流式代理请求 (Streaming) ==========

ipcMain.on('api-request-stream', async (event, options) => {
  const { url, method, headers, body, requestId } = options
  
  // 同样需要拦截并解密 Authorization (我们之前加过的加密 key 逻辑)
  const finalHeaders = { ...(headers || {}) }
  if (finalHeaders['Authorization'] && finalHeaders['Authorization'].includes('Bearer miokey-')) {
    const token = finalHeaders['Authorization'].replace('Bearer ', '')
    // 假设 decryptKey 函数在文件顶部定义好了
    finalHeaders['Authorization'] = `Bearer ${decryptKey(token)}`
  }

  let isTimedOut = false
  try {
    const controller = new AbortController()
    
    // 监听前端发来的中止请求
    const abortListener = () => controller.abort()
    ipcMain.once(`abort-stream-${requestId}`, abortListener)

    // 空闲超时：120秒内未收到任何数据则中止
    const STREAM_IDLE_TIMEOUT = 120000
    let idleTimer = setTimeout(() => { isTimedOut = true; controller.abort() }, STREAM_IDLE_TIMEOUT)

    const response = await net.fetch(url, {
      method: method || 'POST',
      headers: finalHeaders,
      body: body || undefined,
      signal: controller.signal,
    })

    if (response.status >= 400) {
      clearTimeout(idleTimer)
      ipcMain.removeListener(`abort-stream-${requestId}`, abortListener)
      const errText = await response.text()
      event.sender.send(`stream-error-${requestId}`, errText || `HTTP ${response.status}`)
      return
    }

    // 连接成功，重置空闲计时器
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => { isTimedOut = true; controller.abort() }, STREAM_IDLE_TIMEOUT)

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      // 收到数据，重置空闲计时器
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => { isTimedOut = true; controller.abort() }, STREAM_IDLE_TIMEOUT)
      const chunk = decoder.decode(value, { stream: true })
      // 把每一块数据发给前端
      event.sender.send(`stream-data-${requestId}`, chunk)
    }
    clearTimeout(idleTimer)
    ipcMain.removeListener(`abort-stream-${requestId}`, abortListener)
    event.sender.send(`stream-end-${requestId}`)
    
  } catch (err) {
    if (err.name === 'AbortError') {
      if (isTimedOut) {
        // 空闲超时，作为错误返回，让工作流引擎进行故障转移
        event.sender.send(`stream-error-${requestId}`, '流式请求超时：120秒内未收到数据')
      } else {
        event.sender.send(`stream-end-${requestId}`) // 被用户中止，算作正常结束
      }
    } else {
      event.sender.send(`stream-error-${requestId}`, err.message)
    }
  }
})

// ========== FormData 代理请求（用于图片上传） ==========

ipcMain.handle('api-request-formdata', async (event, options) => {
  const { url, headers, fields, files, timeout } = options

  try {
    const controller = new AbortController()
    const timer = timeout ? setTimeout(() => controller.abort(), timeout) : null
    
    // 构建 FormData
    const boundary = '----MioDrawBoundary' + Date.now().toString(36)
    const parts = []

    if (fields) {
      for (const [key, value] of Object.entries(fields)) {
        parts.push(
          `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
          `${value}\r\n`
        )
      }
    }

    const fileBuffers = []
    if (files) {
      for (const file of files) {
        const header =
          `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.fileName}"\r\n` +
          `Content-Type: ${file.mimeType || 'image/png'}\r\n\r\n`
        fileBuffers.push({
          header: Buffer.from(header, 'utf-8'),
          data: Buffer.from(file.base64Data, 'base64'),
          footer: Buffer.from('\r\n', 'utf-8'),
        })
      }
    }

    const ending = Buffer.from(`--${boundary}--\r\n`, 'utf-8')
    const textPart = Buffer.from(parts.join(''), 'utf-8')

    // 拼接所有部分
    const bodyParts = [textPart]
    for (const fb of fileBuffers) {
      bodyParts.push(fb.header, fb.data, fb.footer)
    }
    bodyParts.push(ending)
    const bodyBuffer = Buffer.concat(bodyParts)

    // 拦截并解密 Authorization
    const finalHeaders = { ...headers }
    if (finalHeaders['Authorization'] && finalHeaders['Authorization'].includes('Bearer miokey-')) {
      const token = finalHeaders['Authorization'].replace('Bearer ', '')
      finalHeaders['Authorization'] = `Bearer ${decryptKey(token)}`
    }

    const response = await net.fetch(url, {
      method: 'POST',
      headers: {
        ...finalHeaders,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: bodyBuffer,
      signal: controller.signal,
    })

    if (timer) clearTimeout(timer)

    let data
    try {
      data = await response.json()
    } catch {
      data = await response.text()
    }

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      data,
    }
  } catch (err) {
    throw { message: err.message || '请求失败' }
  }
})

// ========== 下载远程图片 ==========

ipcMain.handle('download-image', async (event, url) => {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 60000) // 60秒超时

    const response = await net.fetch(url, { signal: controller.signal })
    const buffer = await response.arrayBuffer()
    clearTimeout(timer)

    const mimeType = response.headers.get('content-type') || 'image/png'
    return {
      base64: Buffer.from(buffer).toString('base64'),
      mimeType,
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      throw { message: '图片下载超时（60秒）' }
    }
    throw { message: err.message || '图片下载失败' }
  }
})

// ========== 数据持久化存储 ==========

let customDataDir = null

function getDataDir() {
  if (customDataDir && fs.existsSync(path.dirname(customDataDir))) {
    if (!fs.existsSync(customDataDir)) {
      fs.mkdirSync(customDataDir, { recursive: true })
    }
    return customDataDir
  }
  const dir = path.join(app.getPath('userData'), 'data')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

function copyDirRecursive(src, dst) {
  if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true })
  let count = 0
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const dstPath = path.join(dst, entry.name)
    if (entry.isDirectory()) {
      count += copyDirRecursive(srcPath, dstPath)
    } else {
      fs.copyFileSync(srcPath, dstPath)
      count++
    }
  }
  return count
}

function getImagesDir() {
  const dir = path.join(getDataDir(), 'images')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json')
}

function loadDataDirConfig() {
  try {
    const configPath = getConfigPath()
    if (fs.existsSync(configPath)) {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      if (cfg.dataDir && fs.existsSync(cfg.dataDir)) {
        customDataDir = cfg.dataDir
      }
    }
  } catch { /* ignore */ }
}

loadDataDirConfig()

ipcMain.handle('save-data', async (event, key, data) => {
  try {
    const filePath = path.join(getDataDir(), `${key}.json`)
    const tempPath = filePath + '.tmp'
    // 原子写入：先写临时文件，再重命名
    fs.writeFileSync(tempPath, JSON.stringify(data), 'utf-8')
    fs.renameSync(tempPath, filePath)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('load-data', async (event, key) => {
  try {
    const filePath = path.join(getDataDir(), `${key}.json`)
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8')
      return { success: true, data: JSON.parse(content) }
    }
    return { success: true, data: null }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ========== 图片文件管理 ==========

ipcMain.handle('save-image-file', async (event, { id, base64, subfolder }) => {
  try {
    const imagesDir = getImagesDir()
    const folder = subfolder ? path.join(imagesDir, subfolder) : imagesDir
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true })
    }
    const filename = `${id}.png`
    const filePath = path.join(folder, filename)
    const tempPath = filePath + '.tmp'
    // 去掉可能的 data: 前缀
    const pure = base64.includes(',') ? base64.split(',')[1] : base64
    const buffer = Buffer.from(pure, 'base64')
    fs.writeFileSync(tempPath, buffer)
    fs.renameSync(tempPath, filePath)
    // 返回相对路径，用于 miodraw:// 协议
    const relPath = subfolder ? `${subfolder}/${filename}` : filename
    return { success: true, path: relPath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('delete-image-file', async (event, relPath) => {
  try {
    const filePath = path.join(getImagesDir(), relPath)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('read-image-file', async (event, relPath) => {
  try {
    const filePath = path.join(getImagesDir(), relPath)
    if (!fs.existsSync(filePath)) return { success: false, error: '文件不存在' }
    const buffer = fs.readFileSync(filePath)
    return { success: true, base64: buffer.toString('base64') }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-image-file', async (event, { relPath, suggestedName }) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: suggestedName || 'image.png',
      filters: [{ name: 'PNG 图片', extensions: ['png'] }],
    })
    if (result.canceled || !result.filePath) return { success: false, canceled: true }
    const srcPath = path.join(getImagesDir(), relPath)
    fs.copyFileSync(srcPath, result.filePath)
    return { success: true, path: result.filePath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('get-data-dir', async () => {
  return getDataDir()
})

ipcMain.handle('select-data-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: '选择数据存储位置',
  })
  if (result.canceled || !result.filePaths[0]) {
    return { success: false, canceled: true }
  }
  const newDir = result.filePaths[0]
  const oldDir = getDataDir()

  if (oldDir === newDir) {
    return { success: true, path: newDir, copied: 0 }
  }

  // 复制旧数据到新目录
  let copied = 0
  try {
    if (fs.existsSync(oldDir)) {
      copied = copyDirRecursive(oldDir, newDir)
    }
  } catch (err) {
    return { success: false, error: '复制数据失败：' + err.message }
  }

  // 保存配置
  try {
    fs.writeFileSync(getConfigPath(), JSON.stringify({ dataDir: newDir }), 'utf-8')
    customDataDir = newDir
  } catch (err) {
    return { success: false, error: '保存配置失败：' + err.message }
  }

  return { success: true, path: newDir, copied }
})

ipcMain.handle('reset-data-dir', async () => {
  const defaultDir = path.join(app.getPath('userData'), 'data')
  const oldDir = getDataDir()

  let copied = 0
  try {
    if (fs.existsSync(oldDir) && oldDir !== defaultDir) {
      if (!fs.existsSync(defaultDir)) {
        fs.mkdirSync(defaultDir, { recursive: true })
      }
      copied = copyDirRecursive(oldDir, defaultDir)
    }
  } catch (err) {
    return { success: false, error: err.message }
  }

  try {
    if (fs.existsSync(getConfigPath())) {
      fs.unlinkSync(getConfigPath())
    }
    customDataDir = null
  } catch { /* ignore */ }

  return { success: true, path: defaultDir, copied }
})

// ========== AI 放大 (Upscale) ==========

ipcMain.handle('upscale-image', async (event, { relPath, modelName, scale }) => {
  return new Promise((resolve, reject) => {
    try {
      // 1. 确定输入和输出路径
      const imagesDir = getImagesDir()
      const inputPath = path.join(imagesDir, relPath)
      
      if (!fs.existsSync(inputPath)) {
        return resolve({ success: false, error: '原图不存在' })
      }

      // 输出文件名加一个后缀，比如 "123_upscaled.png"
      const parsedPath = path.parse(inputPath)
      const outputFilename = `${parsedPath.name}_upscaled${parsedPath.ext}`
      const outputPath = path.join(parsedPath.dir, outputFilename)

      // 2. 确定引擎路径 (开发环境和打包后的路径不同)
      const upscalerDir = isDev 
        ? path.join(__dirname, '../resources/upscaler')
        : path.join(process.resourcesPath, 'upscaler')
      
      const exePath = path.join(upscalerDir, 'realesrgan-ncnn-vulkan.exe')

      if (!fs.existsSync(exePath)) {
        return resolve({ success: false, error: `找不到放大引擎: ${exePath}` })
      }

      // 3. 构建命令行参数
      // -i 输入路径
      // -o 输出路径
      // -n 模型名 (比如 realesrgan-x4plus-anime)
      // -s 放大倍数 (比如 2，因为有些模型默认 4 倍，我们强制输出为 2 倍)
      const args = [
        '-i', inputPath,
        '-o', outputPath,
        '-n', modelName || 'realesrgan-x4plus', // 默认模型
        '-s', scale ? scale.toString() : '2',    // 默认放大 2 倍
        '-f', 'png'                              // 强制输出 png 格式
      ]

      // 4. 执行命令
      // execFile 比 exec 更安全，适合执行 exe 并传参数
      const child = execFile(exePath, args, { 
        cwd: upscalerDir // 设置工作目录，方便引擎找到 models 文件夹
      }, (error, stdout, stderr) => {
        if (error) {
          // 有些情况下引擎输出一些警告也会被当做 error，需要判断是否真失败了
          if (!fs.existsSync(outputPath)) {
            console.error('放大引擎报错:', error.message)
            return resolve({ success: false, error: '放大处理失败，可能显存不足' })
          }
        }
        
        // 成功的话，返回相对于 images 文件夹的新路径
        const relativeOutputDir = path.dirname(relPath)
        const relOutputPath = path.join(relativeOutputDir, outputFilename)
        
        resolve({ success: true, path: relOutputPath })
      })

    } catch (err) {
      console.error('放大执行异常:', err)
      resolve({ success: false, error: err.message })
    }
  })
})

// ========== 背景去除 (Background Removal) ==========

ipcMain.handle('remove-bg', async (event, { relPath, modelName }) => {
  return new Promise((resolve, reject) => {
    try {
      const imagesDir = getImagesDir()
      const inputPath = path.join(imagesDir, relPath)

      if (!fs.existsSync(inputPath)) {
        return resolve({ success: false, error: '原图不存在' })
      }

      const parsedPath = path.parse(inputPath)
      const outputFilename = `${parsedPath.name}_nobg${parsedPath.ext}`
      const outputPath = path.join(parsedPath.dir, outputFilename)

      const bgRemoverDir = isDev
        ? path.join(__dirname, '../resources/bg-remover')
        : path.join(process.resourcesPath, 'bg-remover')

      const pythonPath = path.join(bgRemoverDir, 'python', 'python.exe')

      if (!fs.existsSync(pythonPath)) {
        return resolve({ success: false, error: `找不到背景去除引擎: ${pythonPath}` })
      }

      const modelsDir = path.join(bgRemoverDir, 'models')
      if (!fs.existsSync(modelsDir)) {
        fs.mkdirSync(modelsDir, { recursive: true })
      }

      const scriptPath = path.join(bgRemoverDir, 'run_rembg.py')
      const args = [
        scriptPath,
        'i',
        '-m', modelName || 'u2net',
        inputPath,
        outputPath,
      ]

      const child = execFile(pythonPath, args, {
        cwd: bgRemoverDir,
        timeout: 300000,
        env: { ...process.env, U2NET_HOME: modelsDir },
      }, (error, stdout, stderr) => {
        if (error) {
          if (!fs.existsSync(outputPath)) {
            console.error('背景去除引擎报错:', error.message)
            return resolve({ success: false, error: '背景去除失败，可能是内存不足或模型文件缺失' })
          }
        }

        const relativeOutputDir = path.dirname(relPath)
        const relOutputPath = path.join(relativeOutputDir, outputFilename)

        resolve({ success: true, path: relOutputPath })
      })

    } catch (err) {
      console.error('背景去除执行异常:', err)
      resolve({ success: false, error: err.message })
    }
  })
})

// ========== 模型文件管理 ==========

ipcMain.handle('check-model-exists', async (event, modelName) => {
  const bgRemoverDir = isDev
    ? path.join(__dirname, '../resources/bg-remover')
    : path.join(process.resourcesPath, 'bg-remover')
  const modelsDir = path.join(bgRemoverDir, 'models')
  const modelPath = path.join(modelsDir, `${modelName}.onnx`)
  return { exists: fs.existsSync(modelPath) }
})

ipcMain.handle('delete-model-file', async (event, modelName) => {
  try {
    const bgRemoverDir = isDev
      ? path.join(__dirname, '../resources/bg-remover')
      : path.join(process.resourcesPath, 'bg-remover')
    const modelsDir = path.join(bgRemoverDir, 'models')
    const modelPath = path.join(modelsDir, `${modelName}.onnx`)
    if (fs.existsSync(modelPath)) {
      fs.unlinkSync(modelPath)
      return { success: true }
    }
    return { success: false, error: '模型文件不存在' }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('download-model', async (event, { url, modelName }) => {
  const bgRemoverDir = isDev
    ? path.join(__dirname, '../resources/bg-remover')
    : path.join(process.resourcesPath, 'bg-remover')
  const modelsDir = path.join(bgRemoverDir, 'models')
  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true })
  }

  const modelPath = path.join(modelsDir, `${modelName}.onnx`)
  const tempPath = modelPath + '.tmp'

  try {
    const response = await net.fetch(url)

    if (response.status >= 400) {
      throw new Error(`HTTP ${response.status}`)
    }

    const contentLength = parseInt(response.headers.get('content-length') || '0', 10)
    const reader = response.body.getReader()
    const chunks = []
    let downloaded = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      downloaded += value.length
      // 发送进度到渲染进程
      event.sender.send('model-download-progress', { modelName, downloaded, total: contentLength })
    }

    // 拼接并写入文件
    const buffer = Buffer.concat(chunks.map(c => Buffer.from(c)))
    fs.writeFileSync(tempPath, buffer)
    fs.renameSync(tempPath, modelPath)

    return { success: true }
  } catch (err) {
    // 清理临时文件
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath) } catch {}
    }
    throw { message: err.message || '下载失败' }
  }
})

// ========== 文档解析 ==========

ipcMain.handle('parse-document', async (event, { base64Data, ext }) => {
  try {
    const buffer = Buffer.from(base64Data, 'base64')

    if (ext === '.txt' || ext === '.md') {
      const text = buffer.toString('utf-8')
      if (!text.trim()) {
        return { success: false, error: '文件内容为空' }
      }
      return { success: true, text }
    }

    if (ext === '.docx') {
      const result = await mammoth.extractRawText({ buffer })
      const text = result.value
      if (!text.trim()) {
        return { success: false, error: '该文档无法提取到文本内容，可能是空文档' }
      }
      return { success: true, text }
    }

    return { success: false, error: `不支持的文件格式: ${ext}` }
  } catch (err) {
    return { success: false, error: '文档解析失败: ' + err.message }
  }
})

// ========== 批量导出图片 ==========

ipcMain.handle('batch-export-images', async (event, { relPaths, names }) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: '选择导出目标文件夹',
    })
    if (result.canceled || !result.filePaths[0]) {
      return { success: false, canceled: true }
    }

    const targetDir = result.filePaths[0]
    const imagesDir = getImagesDir()
    let exported = 0
    const errors = []

    for (let i = 0; i < relPaths.length; i++) {
      const srcPath = path.join(imagesDir, relPaths[i])
      const fileName = (names[i] || `image_${i + 1}`) + '.png'
      // 避免文件名冲突：如果已存在则加序号
      let destPath = path.join(targetDir, fileName)
      let counter = 1
      while (fs.existsSync(destPath)) {
        const baseName = (names[i] || `image_${i + 1}`) + `_${counter}`
        destPath = path.join(targetDir, baseName + '.png')
        counter++
      }

      try {
        if (fs.existsSync(srcPath)) {
          fs.copyFileSync(srcPath, destPath)
          exported++
        } else {
          errors.push(`${names[i] || relPaths[i]}: 源文件不存在`)
        }
      } catch (err) {
        errors.push(`${names[i] || relPaths[i]}: ${err.message}`)
      }
    }

    return { success: true, exported, errors }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('open-data-dir', async () => {
  const { shell } = require('electron')
  shell.openPath(getDataDir())
})

// 注册自定义协议，用于访问本地图片
protocol.registerSchemesAsPrivileged([
  { scheme: 'miodraw', privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true } }
])

app.whenReady().then(() => {
  // 注册协议处理器，把 miodraw://image/xxx.png 映射到文件系统，并支持缩略图
  protocol.handle('miodraw', async (request) => {
    const url = new URL(request.url)
    
    // URL.pathname 会自动忽略 ? 后的参数，所以不会包含 ?thumb=400
    // 例如 miodraw://image/generated/123.png，hostname 是 image，pathname 是 /generated/123.png
    let relativePath = ''
    if (url.hostname === 'image') {
      // 兼容某些情况，把开头的斜杠去掉
      relativePath = url.pathname.startsWith('/') ? url.pathname.substring(1) : url.pathname
    } else {
      // 兜底：如果不是以 image 为 hostname，就拼接起来
      relativePath = url.hostname + url.pathname
    }
    
    relativePath = decodeURIComponent(relativePath)
    const filePath = path.join(getImagesDir(), relativePath)
    const thumbSize = url.searchParams.get('thumb')

    try {
      if (fs.existsSync(filePath)) {
        if (thumbSize) {
          // 动态生成缩略图
          const size = parseInt(thumbSize, 10)
          const image = await nativeImage.createThumbnailFromPath(filePath, { width: size, height: size })
          return new Response(image.toPNG(), {
            headers: { 'Content-Type': 'image/png' },
          })
        } else {
          // 返回原图
          const buffer = fs.readFileSync(filePath)
          return new Response(buffer, {
            headers: { 'Content-Type': 'image/png' },
          })
        }
      } else {
         console.warn('图片不存在:', filePath)
      }
    } catch (err) {
      console.error('图片读取失败:', err)
    }
    return new Response('Not Found', { status: 404 })
  })
  createSplash()
  createWindow()
})

//允许跳转网页
ipcMain.handle('open-external', async (event, url) => {
  try {
    await shell.openExternal(url)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// 退出前给 renderer 一个 flush 机会
app.on('before-quit', (event) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app-before-quit')
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})