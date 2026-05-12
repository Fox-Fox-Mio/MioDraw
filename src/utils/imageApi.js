/**
 * 统一生图入口
 */
import { useThemeStore } from '@/stores/theme'
import { addLog } from '@/utils/logger'

function getDefaultTimeout() {
  try {
    const val = localStorage.getItem('workflowTimeoutSeconds')
    if (val) return parseInt(val) * 1000
  } catch {}
  return 250000
}

export async function generateImage({ baseUrl, apiKey, model, prompt, referenceImages, size, apiType, customEndpoint, quality, timeout }) {
  const firstRef = referenceImages && referenceImages.length > 0 ? referenceImages[0] : null
  const refData = firstRef ? (firstRef.file || firstRef.dataUrl) : null

  if (apiType === 'responses') {
    return await generateViaResponses({ baseUrl, apiKey, model, prompt, referenceImages, size, customEndpoint, quality, timeout })
  } else if (apiType === 'chat') {
    return await generateViaChat({ baseUrl, apiKey, model, prompt, referenceImage: refData, size, customEndpoint, timeout })
  } else {
    if (refData) {
      return await generateImageEdit({ baseUrl, apiKey, model, prompt, referenceImage: refData, size, customEndpoint, timeout })
    }
    return await generateImageDirect({ baseUrl, apiKey, model, prompt, size, customEndpoint, timeout })
  }
}

/**
 * 通过 Electron 主进程发送 JSON 请求
 */
async function proxyRequest(url, apiKey, body) {
  try {
    console.log('===== 发送请求 =====')
    console.log('URL:', url)
    console.log('Body:', JSON.stringify(body, null, 2))

    const response = await window.electronAPI.apiRequest({
      url,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      timeout: useThemeStore().generateTimeoutSeconds * 1000,
    })

    console.log('===== 收到响应 =====')
    console.log('Status:', response.status)
    console.log('Data:', typeof response.data === 'object' ? JSON.stringify(response.data, null, 2) : response.data)

    if (response.status >= 400) {
      const errData = typeof response.data === 'object' ? response.data : { message: response.data }
      const errMsg = errData.error?.message || errData.message || `HTTP ${response.status}`
      addLog('error', `[API] HTTP ${response.status} — ${errMsg}`, {
        请求地址: url,
        HTTP状态码: response.status,
        错误信息: errMsg,
        响应内容: errData,
      })
      throw { response: { status: response.status, data: errData }, message: errMsg }
    }

    return response.data
  } catch (err) {
    if (!err.response) {
      addLog('error', `[API] 请求异常 — ${err.message || '未知错误'}`, {
        请求地址: url,
        错误类型: err.name || '未知',
        错误信息: err.message || '未知错误',
      })
    }
    throw err
  }
}

/**
 * 通过 Electron 主进程发送 FormData 请求
 */
async function proxyFormDataRequest(url, apiKey, fields, files) {
  try {
    const response = await window.electronAPI.apiRequestFormData({
      url,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      fields,
      files,
      timeout: useThemeStore().generateTimeoutSeconds * 1000,
    })

    if (response.status >= 400) {
      const errData = typeof response.data === 'object' ? response.data : { message: response.data }
      const errMsg = errData.error?.message || errData.message || `HTTP ${response.status}`
      addLog('error', `[API] HTTP ${response.status} — ${errMsg}`, {
        请求地址: url,
        HTTP状态码: response.status,
        错误信息: errMsg,
        响应内容: errData,
        文件数量: files ? files.length : 0,
      })
      throw { response: { status: response.status, data: errData }, message: errMsg }
    }

    return response.data
  } catch (err) {
    if (!err.response) {
      addLog('error', `[API] FormData 请求异常 — ${err.message || '未知错误'}`, {
        请求地址: url,
        错误类型: err.name || '未知',
        错误信息: err.message || '未知错误',
      })
    }
    throw err
  }
}

/**
 * 方式一：/images/generations
 */
async function generateImageDirect({ baseUrl, apiKey, model, prompt, size, customEndpoint, timeout }) {
  const url = `${baseUrl}${customEndpoint || '/images/generations'}`
  const body = {
    model,
    prompt,
    n: 1,
    size: size || '1024x1024',
    response_format: 'b64_json',
  }
  return await proxyRequest(url, apiKey, body, timeout)
}

/**
 * 方式一补充：/images/edits 带参考图
 */
async function generateImageEdit({ baseUrl, apiKey, model, prompt, referenceImage, size, customEndpoint, timeout }) {
  const url = `${baseUrl}${customEndpoint || '/images/edits'}`

  const base64Data = await getImageBase64(referenceImage)

  return await proxyFormDataRequest(url, apiKey, {
    model,
    prompt,
    n: '1',
    size: size || '1024x1024',
    response_format: 'b64_json',
  }, [
    {
      fieldName: 'image[]',
      fileName: 'reference.png',
      mimeType: 'image/png',
      base64Data,
    },
  ], timeout)
}

/**
 * 方式二：/chat/completions
 */
async function generateViaChat({ baseUrl, apiKey, model, prompt, referenceImage, size, customEndpoint, timeout }) {
  const url = `${baseUrl}${customEndpoint || '/chat/completions'}`

  const content = []

  // 先加图片（OpenAI 推荐的顺序）
  if (referenceImage) {
    const dataUrl = await getImageDataUrl(referenceImage)
    content.push({
      type: 'image_url',
      image_url: {
        url: dataUrl,
        detail: 'high',
      },
    })
  }

  // 再加文字
  let fullPrompt = prompt
  if (size && size !== 'auto') {
    fullPrompt += `\n\nPlease generate the image with size: ${size}`
  }

  content.push({ type: 'text', text: fullPrompt })

  const body = {
    model,
    messages: [{ role: 'user', content }],
    stream: false,
  }

  const data = await proxyRequest(url, apiKey, body, timeout)
  return parseChatResponse(data)
}

/**
 * 方式三：/responses（支持多张参考图）
 */
async function generateViaResponses({ baseUrl, apiKey, model, prompt, referenceImages, size, customEndpoint, quality, timeout }) {
  const url = `${baseUrl}${customEndpoint || '/responses'}`

  let input
  if (referenceImages && referenceImages.length > 0) {
    const content = []
    for (const ref of referenceImages) {
      const source = ref.file || ref.dataUrl
      const dataUrl = await getImageDataUrl(source)
      content.push({
        type: 'input_image',
        image_url: dataUrl,
      })
    }
    content.push({
      type: 'input_text',
      text: prompt,
    })
    input = [
      {
        role: 'user',
        content,
      },
    ]
  } else {
    input = [
      {
        role: 'user',
        content: prompt,
      },
    ]
  }

  const body = {
    model,
    input,
    instructions: 'you are a helpful assistant',
    store: false,
    stream: false,
    tool_choice: 'auto',
    tools: [
      {
        type: 'image_generation',
        output_format: 'png',
        size: size || 'auto',
        quality: quality || 'auto',
      },
    ],
  }

  const data = await proxyRequest(url, apiKey, body, timeout)
  return parseResponsesApiData(data)
}

// ========== 响应解析 ==========

function parseResponsesApiData(data) {
  const result = { data: [] }

  const output = data.output || []

  for (const item of output) {
    if (item.type === 'image_generation_call') {
      if (item.result && typeof item.result === 'string') {
        result.data.push({ b64_json: item.result })
      }
      if (item.b64_json) {
        result.data.push({ b64_json: item.b64_json })
      }
      continue
    }

    if (item.type === 'message' && item.content) {
      for (const part of item.content) {
        if (part.type === 'output_image') {
          if (part.b64_json) result.data.push({ b64_json: part.b64_json })
          if (part.image_url) result.data.push(handleImageUrl(part.image_url))
          if (part.url) result.data.push(handleImageUrl(part.url))
        }
        if (part.type === 'image') {
          if (part.b64_json) result.data.push({ b64_json: part.b64_json })
          if (part.image_url) result.data.push(handleImageUrl(part.image_url))
          if (part.url) result.data.push(handleImageUrl(part.url))
        }
        if (part.type === 'output_text' && part.text) {
          const mdImages = extractMarkdownImages(part.text)
          for (const url of mdImages) result.data.push(handleImageUrl(url))
        }
      }
      continue
    }

    if (item.type === 'image') {
      if (item.b64_json) result.data.push({ b64_json: item.b64_json })
      if (item.url) result.data.push(handleImageUrl(item.url))
      if (item.image_url) result.data.push(handleImageUrl(item.image_url))
      continue
    }
  }

  if (result.data.length === 0 && data.data) {
    for (const item of data.data) {
      if (item.b64_json) result.data.push({ b64_json: item.b64_json })
      if (item.url) result.data.push(handleImageUrl(item.url))
    }
  }

  if (result.data.length === 0) {
    const debugStr = JSON.stringify(data, (key, value) => {
      if (typeof value === 'string' && value.length > 200) {
        return value.substring(0, 100) + `...[${value.length} chars]`
      }
      return value
    }, 2)
    console.log('完整返回结构（截断）:', debugStr)
    throw new Error('模型返回中未找到图片内容，请检查控制台查看原始返回数据')
  }

  return result
}

function parseChatResponse(data) {
  const result = { data: [] }

  if (!data.choices || data.choices.length === 0) {
    throw new Error('API 返回为空，未生成图片')
  }

  for (const choice of data.choices) {
    const message = choice.message

    if (Array.isArray(message?.content)) {
      for (const part of message.content) {
        if (part.type === 'image_url' && part.image_url?.url) {
          result.data.push(handleImageUrl(part.image_url.url))
        }
      }
    }

    if (typeof message?.content === 'string') {
      const mdImages = extractMarkdownImages(message.content)
      for (const url of mdImages) result.data.push(handleImageUrl(url))
    }

    if (message?.tool_calls) {
      for (const tool of message.tool_calls) {
        try {
          const args = JSON.parse(tool.function.arguments)
          if (args.url) result.data.push(handleImageUrl(args.url))
          if (args.b64_json) result.data.push({ b64_json: args.b64_json })
        } catch { /* ignore */ }
      }
    }
  }

  if (result.data.length === 0) {
    console.log('Chat API 原始返回:', JSON.stringify(data, null, 2))
    throw new Error('模型返回中未找到图片内容，请检查控制台查看原始返回数据')
  }

  return result
}

// ========== 参考图自动压缩（阈值5MB） ==========

async function compressImageIfNeeded(dataUrl) {
  const themeStore = useThemeStore()
  if (!themeStore.refImageCompressEnabled) return dataUrl

  const maxSizeBytes = themeStore.refImageCompressThreshold * 1024 * 1024
  const base64Part = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
  const estimatedSize = base64Part.length * 0.75

  if (estimatedSize <= maxSizeBytes) return dataUrl

  console.log(`参考图体积过大 (${(estimatedSize / 1024 / 1024).toFixed(1)}MB)，自动压缩中...`)

  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let { width, height } = img

      // 分辨率过大时先缩小，最大边不超过 2048
      const MAX_DIM = 2048
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }

      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)

      // 逐级降低质量直到满足大小限制
      const qualities = [0.85, 0.7, 0.5]
      for (const q of qualities) {
        const result = canvas.toDataURL('image/jpeg', q)
        const resultSize = result.split(',')[1].length * 0.75
        if (resultSize <= maxSizeBytes) {
          console.log(`参考图压缩完成：${(resultSize / 1024 / 1024).toFixed(1)}MB (quality=${q}, ${width}×${height})`)
          resolve(result)
          return
        }
      }

      // 质量降到 0.5 还不够，进一步缩小分辨率
      const SMALLER_DIM = 1024
      const ratio2 = Math.min(SMALLER_DIM / width, SMALLER_DIM / height)
      if (ratio2 < 1) {
        canvas.width = Math.round(width * ratio2)
        canvas.height = Math.round(height * ratio2)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      }
      const fallback = canvas.toDataURL('image/jpeg', 0.7)
      console.log(`参考图压缩完成（二次缩小）：${(fallback.split(',')[1].length * 0.75 / 1024 / 1024).toFixed(1)}MB (${canvas.width}×${canvas.height})`)
      resolve(fallback)
    }
    img.onerror = () => resolve(dataUrl) // 压缩失败用原图
    img.src = dataUrl.startsWith('data:') ? dataUrl : `data:image/png;base64,${dataUrl}`
  })
}

// ========== 工具函数 ==========

function handleImageUrl(url) {
  if (url.startsWith('data:')) {
    const b64 = url.split(',')[1]
    return { b64_json: b64 }
  }
  return { url }
}

function extractMarkdownImages(text) {
  const urls = []
  const mdRegex = /!\[.*?\]\((.*?)\)/g
  let match
  while ((match = mdRegex.exec(text)) !== null) {
    urls.push(match[1])
  }
  return urls
}

async function getImageBase64(image) {
  let dataUrl
  if (image instanceof File) {
    dataUrl = await fileToBase64DataUrl(image)
  } else if (typeof image === 'string') {
    dataUrl = image.startsWith('data:') ? image : `data:image/png;base64,${image}`
  } else {
    return ''
  }
  const compressed = await compressImageIfNeeded(dataUrl)
  return compressed.includes(',') ? compressed.split(',')[1] : compressed
}

async function getImageDataUrl(image) {
  let dataUrl
  if (image instanceof File) {
    dataUrl = await fileToBase64DataUrl(image)
  } else if (typeof image === 'string') {
    dataUrl = image.startsWith('data:') ? image : `data:image/png;base64,${image}`
  } else {
    return ''
  }
  return await compressImageIfNeeded(dataUrl)
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target.result
      resolve(result.includes(',') ? result.split(',')[1] : result)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function fileToBase64DataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.readAsDataURL(file)
  })
}

export async function downloadImageAsBase64(url) {
  const result = await window.electronAPI.downloadImage(url)
  return `data:${result.mimeType};base64,${result.base64}`
}

export function toDataUrl(base64, mimeType = 'image/png') {
  if (base64.startsWith('data:')) return base64
  return `data:${mimeType};base64,${base64}`
}