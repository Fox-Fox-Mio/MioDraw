/**
 * 统一生图入口
 */
export async function generateImage({ baseUrl, apiKey, model, prompt, referenceImages, size, apiType, customEndpoint, quality }) {
  const firstRef = referenceImages && referenceImages.length > 0 ? referenceImages[0] : null
  const refData = firstRef ? (firstRef.file || firstRef.dataUrl) : null

  if (apiType === 'responses') {
    return await generateViaResponses({ baseUrl, apiKey, model, prompt, referenceImages, size, customEndpoint, quality })
  } else if (apiType === 'chat') {
    return await generateViaChat({ baseUrl, apiKey, model, prompt, referenceImage: refData, size, customEndpoint })
  } else {
    if (refData) {
      return await generateImageEdit({ baseUrl, apiKey, model, prompt, referenceImage: refData, size, customEndpoint })
    }
    return await generateImageDirect({ baseUrl, apiKey, model, prompt, size, customEndpoint })
  }
}

/**
 * 通过 Electron 主进程发送 JSON 请求
 */
async function proxyRequest(url, apiKey, body) {
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
    timeout: 250000,
  })

  console.log('===== 收到响应 =====')
  console.log('Status:', response.status)
  console.log('Data:', typeof response.data === 'object' ? JSON.stringify(response.data, null, 2) : response.data)

  if (response.status >= 400) {
    const errData = typeof response.data === 'object' ? response.data : { message: response.data }
    const errMsg = errData.error?.message || errData.message || `HTTP ${response.status}`
    throw { response: { status: response.status, data: errData }, message: errMsg }
  }

  return response.data
}

/**
 * 通过 Electron 主进程发送 FormData 请求
 */
async function proxyFormDataRequest(url, apiKey, fields, files) {
  const response = await window.electronAPI.apiRequestFormData({
    url,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    fields,
    files,
    timeout: 250000,
  })

  if (response.status >= 400) {
    const errData = typeof response.data === 'object' ? response.data : { message: response.data }
    const errMsg = errData.error?.message || errData.message || `HTTP ${response.status}`
    throw { response: { status: response.status, data: errData }, message: errMsg }
  }

  return response.data
}

/**
 * 方式一：/images/generations
 */
async function generateImageDirect({ baseUrl, apiKey, model, prompt, size, customEndpoint }) {
  const url = `${baseUrl}${customEndpoint || '/images/generations'}`
  const body = {
    model,
    prompt,
    n: 1,
    size: size || '1024x1024',
    response_format: 'b64_json',
  }
  return await proxyRequest(url, apiKey, body)
}

/**
 * 方式一补充：/images/edits 带参考图
 */
async function generateImageEdit({ baseUrl, apiKey, model, prompt, referenceImage, size, customEndpoint }) {
  const url = `${baseUrl}${customEndpoint || '/chat/completions'}`

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
  ])
}

/**
 * 方式二：/chat/completions
 */
async function generateViaChat({ baseUrl, apiKey, model, prompt, referenceImage, size, customEndpoint }) {
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

  const data = await proxyRequest(url, apiKey, body)
  return parseChatResponse(data)
}

/**
 * 方式三：/responses（支持多张参考图）
 */
async function generateViaResponses({ baseUrl, apiKey, model, prompt, referenceImages, size, customEndpoint, quality }) {
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

  const data = await proxyRequest(url, apiKey, body)
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
  if (image instanceof File) {
    return await fileToBase64(image)
  }
  if (typeof image === 'string') {
    return image.includes(',') ? image.split(',')[1] : image
  }
  return ''
}

async function getImageDataUrl(image) {
  if (image instanceof File) {
    return await fileToBase64DataUrl(image)
  }
  if (typeof image === 'string') {
    return image.startsWith('data:') ? image : `data:image/png;base64,${image}`
  }
  return ''
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