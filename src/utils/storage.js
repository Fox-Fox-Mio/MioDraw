/**
 * 统一存储工具：写入会同时存 localStorage（兼容/快速读取）+ 文件系统（持久化）
 * 读取时优先从文件系统读，找不到再回退到 localStorage（兼容老数据）
 */

const writeQueue = new Map() // key -> { timer, value }

/**
 * 同步读取（用于初始化）
 * 优先从文件系统加载，加载完成后回调
 */
export async function loadValue(key, defaultValue = null) {
  // 先从文件系统读
  if (window.electronAPI?.loadData) {
    try {
      const result = await window.electronAPI.loadData(`config-${key}`)
      if (result?.success && result.data !== null && result.data !== undefined) {
        return result.data
      }
    } catch { /* ignore */ }
  }
  // 回退：从 localStorage 读
  try {
    const raw = localStorage.getItem(key)
    if (raw !== null && raw !== undefined) {
      // 尝试 JSON 解析，失败则当作字符串
      try {
        return JSON.parse(raw)
      } catch {
        return raw
      }
    }
  } catch { /* ignore */ }
  return defaultValue
}

/**
 * 异步写入（防抖 + 双写）
 */
export function saveValue(key, value) {
  // 深拷贝去掉响应式包装
  let cloned
  try {
    cloned = JSON.parse(JSON.stringify(value))
  } catch {
    cloned = value
  }

  // 立即写 localStorage
  try {
    localStorage.setItem(key, typeof cloned === 'string' ? cloned : JSON.stringify(cloned))
  } catch { /* ignore */ }

  // 防抖写文件系统
  if (writeQueue.has(key)) {
    clearTimeout(writeQueue.get(key).timer)
  }
  const timer = setTimeout(() => {
    writeQueue.delete(key)
    if (window.electronAPI?.saveData) {
      window.electronAPI.saveData(`config-${key}`, cloned).catch(() => {})
    }
  }, 200)
  writeQueue.set(key, { timer, value: cloned })
}

/**
 * 立即刷盘所有待写入数据（应用退出前调用）
 */
export async function flushAll() {
  const tasks = []
  for (const [key, item] of writeQueue.entries()) {
    clearTimeout(item.timer)
    if (window.electronAPI?.saveData) {
      tasks.push(window.electronAPI.saveData(`config-${key}`, item.value))
    }
  }
  writeQueue.clear()
  await Promise.all(tasks).catch(() => {})
}