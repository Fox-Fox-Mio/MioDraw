export async function sendChatMessageStream({ baseUrl, apiKey, model, messages }, onUpdate, onAbortAssign) {
  return new Promise((resolve, reject) => {
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, '')
    const url = `${normalizedBaseUrl}/chat/completions`
    
    const body = {
      model,
      messages,
      stream: true // 告诉模型使用流式输出
    }

    let fullContent = ''
    let buffer = '' // 用于拼接被截断的数据块

    const abortFn = window.electronAPI.apiRequestStream({
      url,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    }, 
    (chunk) => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() // 把最后一行可能不完整的留到下一次处理
      
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
          try {
            const data = JSON.parse(trimmed.slice(6))
            const delta = data.choices[0]?.delta?.content || ''
            fullContent += delta
            // 将拼好的文本实时发给 Vue 组件
            onUpdate(fullContent)
          } catch (e) { /* ignore */ }
        }
      }
    }, 
    () => {
      resolve(fullContent)
    },
    (err) => {
      reject(new Error(err))
    })

    // 把取消函数交给 Vue 组件管理
    if (onAbortAssign) {
      onAbortAssign(abortFn)
    }
  })
}