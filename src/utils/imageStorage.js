/**
 * 图片存储工具：把 base64 存成 PNG 文件，返回可访问的 URL
 */

// 生成唯一 ID
export function genImageId() {
  return Date.now().toString() + Math.random().toString(36).slice(2, 8)
}

/**
 * 保存图片，返回 { id, fileUrl, relPath }
 */
export async function saveImage(base64DataUrl, subfolder = 'generated') {
  const id = genImageId()
  const result = await window.electronAPI.saveImageFile({
    id,
    base64: base64DataUrl,
    subfolder,
  })
  if (!result.success) {
    throw new Error(result.error || '保存图片失败')
  }
  return {
    id,
    relPath: result.path,
    fileUrl: relPathToUrl(result.path),
  }
}

/**
 * 把相对路径转为 miodraw:// 可访问的 URL
 */
export function relPathToUrl(relPath) {
  if (!relPath) return ''
  // 加时间戳避免缓存问题（编辑时）
  return `miodraw://image/${relPath}`
}

/**
 * 删除图片文件
 */
export async function deleteImage(relPath) {
  if (!relPath) return
  try {
    await window.electronAPI.deleteImageFile(relPath)
  } catch { /* ignore */ }
}

/**
 * 读取图片为 base64（用于复用为参考图等场景）
 */
export async function readImageAsBase64(relPath) {
  const result = await window.electronAPI.readImageFile(relPath)
  if (!result.success) throw new Error(result.error)
  return `data:image/png;base64,${result.base64}`
}

/**
 * 导出图片到用户选择的位置
 */
export async function exportImage(relPath, suggestedName) {
  const result = await window.electronAPI.exportImageFile({
    relPath,
    suggestedName: (suggestedName || 'image') + '.png',
  })
  return result
}

/**
 * AI 高清放大
 * options: { relPath: string, modelName: string, scale: number }
 */
export async function upscaleImage(relPath, modelName = 'realesrgan-x4plus', scale = 4) {
  if (!relPath) throw new Error('无效的图片路径')
  
  const result = await window.electronAPI.upscaleImage({
    relPath,
    modelName,
    scale
  })
  
  if (!result.success) {
    throw new Error(result.error || '放大处理失败')
  }
  
  return {
    relPath: result.path,
    fileUrl: relPathToUrl(result.path)
  }
}

/**
 * 背景去除
 */
export async function removeBgImage(relPath, modelName = 'u2net') {
  if (!relPath) throw new Error('无效的图片路径')

  const result = await window.electronAPI.removeBg({
    relPath,
    modelName,
  })

  if (!result.success) {
    throw new Error(result.error || '背景去除失败')
  }

  return {
    relPath: result.path,
    fileUrl: relPathToUrl(result.path),
  }
}