const MAX_LOGS = 500

const logs = []

/**
 * 尝试解码 base64 字符串
 */
function tryDecodeBase64(str) {
  if (typeof str !== 'string') return str
  // 检测是否像 base64（只包含合法字符且长度合理）
  if (/^[A-Za-z0-9+/=]{4,}$/.test(str) && str.length % 4 <= 1) {
    try {
      const decoded = atob(str)
      // 检查解码结果是否为可读文本
      if (/^[\x20-\x7E\u4e00-\u9fff\s]+$/.test(decoded)) {
        return decoded
      }
    } catch {
      // 不是合法 base64，返回原文
    }
  }
  return str
}

/**
 * 递归解码对象中所有 base64 字符串
 */
function decodeDetail(obj) {
  if (typeof obj === 'string') {
    return tryDecodeBase64(obj)
  }
  if (Array.isArray(obj)) {
    return obj.map(item => decodeDetail(item))
  }
  if (obj && typeof obj === 'object') {
    const result = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = decodeDetail(value)
    }
    return result
  }
  return obj
}

export function addLog(level, message, detail = null) {
  // 解码 message
  const decodedMessage = tryDecodeBase64(message)

  // 解码 detail
  let decodedDetail = null
  if (detail) {
    if (typeof detail === 'string') {
      decodedDetail = tryDecodeBase64(detail)
    } else {
      const decoded = decodeDetail(detail)
      decodedDetail = JSON.stringify(decoded, null, 2)
    }
  }

  const entry = {
    id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
    time: new Date().toISOString(),
    level,
    message: decodedMessage,
    detail: decodedDetail,
  }
  logs.unshift(entry)
  if (logs.length > MAX_LOGS) logs.pop()

  try {
    localStorage.setItem('app-logs', JSON.stringify(logs.slice(0, 200)))
  } catch {
    // 存储满了就忽略
  }

  return entry
}

export function getLogs() {
  if (logs.length === 0) {
    try {
      const saved = localStorage.getItem('app-logs')
      if (saved) {
        const parsed = JSON.parse(saved)
        logs.push(...parsed)
      }
    } catch {
      // ignore
    }
  }
  return logs
}

export function clearLogs() {
  logs.length = 0
  localStorage.removeItem('app-logs')
}