<template>
  <el-dialog
    v-model="visible"
    :title="image?.name || '图片详情'"
    width="800px"
    top="5vh"
    :close-on-click-modal="true"
  >
    <div class="detail-content" v-if="image">
      <div class="detail-img">
        <img :src="galleryStore.getDisplayUrl(image)" :alt="image.name" />
        <button class="detail-img-zoom" @click="openFullPreview">
          <el-icon :size="18"><ZoomIn /></el-icon>
        </button>
      </div>

      <!-- 大图预览 -->
      <el-dialog
        v-model="fullPreviewVisible"
        title="图片预览"
        width="auto"
        top="3vh"
        append-to-body
        :close-on-click-modal="true"
      >
        <div class="full-preview-content">
          <img :src="galleryStore.getDisplayUrl(image)" :alt="image.name" />
        </div>
      </el-dialog>
      <div class="detail-meta">
        <div class="meta-section" v-if="type === 'generated'">
          <h4>生成信息</h4>
          <!-- 工作流生成的图片简化显示 -->
          <template v-if="image.isFromWorkflow || image.planDescription || image.workflowScore">
            <div class="meta-row">
              <span class="meta-label">来源</span>
              <span class="meta-value">通过工作流生成</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">生成时间</span>
              <span class="meta-value">{{ formatDateTime(image.createdAt) }}</span>
            </div>
          </template>
          <!-- 普通生成的图片完整显示 -->
          <template v-else>
            <div class="meta-row">
              <span class="meta-label">模型</span>
              <span class="meta-value">{{ image.model || '-' }}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">站点</span>
              <span class="meta-value">{{ image.siteName || '-' }}</span>
            </div>
            
            <!-- 常规尺寸显示 -->
            <div class="meta-row" v-if="!image.isUpscaled">
              <span class="meta-label">尺寸</span>
              <span class="meta-value">{{ image.size || '-' }}</span>
            </div>
            <!-- 超分后的尺寸显示 -->
            <template v-else>
              <div class="meta-row">
                <span class="meta-label">原图分辨率</span>
                <span class="meta-value">{{ image.originalSize || '-' }}</span>
              </div>
              <div class="meta-row">
                <span class="meta-label">超分后分辨率</span>
                <span class="meta-value" style="color: var(--accent-color)">{{ image.size || '-' }}</span>
              </div>
            </template>

            <div class="meta-row">
              <span class="meta-label">参考图</span>
              <span class="meta-value">{{ image.hasReference ? '是' : '否' }}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">生成时间</span>
              <span class="meta-value">{{ formatDateTime(image.createdAt) }}</span>
            </div>
          </template>
        </div>
        <div class="meta-section" v-else>
          <h4>图片信息</h4>
          <div class="meta-row">
            <span class="meta-label">导入时间</span>
            <span class="meta-value">{{ formatDateTime(image.importedAt) }}</span>
          </div>
        </div>

        <div class="meta-section" v-if="image.prompt">
          <h4>提示词</h4>
          <div class="prompt-box">{{ image.prompt }}</div>
        </div>

        <div class="detail-actions">
          <el-button v-if="type === 'generated'" @click="handleRename">
            <el-icon><Edit /></el-icon> 重命名
          </el-button>
          <el-button
            v-if="type === 'generated'"
            :type="image.favorite ? 'warning' : 'default'"
            @click="handleToggleFav"
          >
            <el-icon><Star /></el-icon> {{ image.favorite ? '取消收藏' : '收藏' }}
          </el-button>
          <el-button v-if="type === 'generated'" @click="$emit('moveAlbum', image)">
            <el-icon><Folder /></el-icon> 移动到相册
          </el-button>

          <!-- 高清超分组合按钮 -->
          <div class="upscale-row" v-if="type === 'generated' && !image.isUpscaled">
            <el-button 
              type="primary" 
              plain 
              class="upscale-btn-main"
              @click="handleUpscale" 
              :loading="isUpscaling"
            >
              <el-icon v-if="!isUpscaling"><MagicStick /></el-icon> 
              {{ isUpscaling ? '正在超分...' : `高清超分 (${upscaleConfig.scale}x)` }}
            </el-button>
            <el-button 
              type="primary" 
              plain 
              class="upscale-btn-setting" 
              @click="showUpscaleSettings = true" 
              :disabled="isUpscaling"
            >
              <el-icon><Setting /></el-icon>
            </el-button>
          </div>

          <!-- 背景去除按钮 -->
          <div class="upscale-row" v-if="type === 'generated'">
            <el-button
              type="success"
              plain
              class="upscale-btn-main"
              @click="handleRemoveBg"
              :loading="isRemovingBg"
            >
              <el-icon v-if="!isRemovingBg"><MagicStick /></el-icon>
              {{ isRemovingBg ? '正在去除背景...' : '一键去除背景' }}
            </el-button>
            <el-button
              type="success"
              plain
              class="upscale-btn-setting"
              @click="showBgRemoveSettings = true"
              :disabled="isRemovingBg"
            >
              <el-icon><Setting /></el-icon>
            </el-button>
          </div>

          <el-button @click="handleExport">
            <el-icon><Download /></el-icon> 导出
          </el-button>
          <el-button type="danger" @click="handleDelete">
            <el-icon><Delete /></el-icon> 删除
          </el-button>
        </div>
      </div>
    </div>
    <!-- 超分设置弹窗 -->
    <el-dialog v-model="showUpscaleSettings" title="超分模型配置" width="420px" append-to-body>
      <el-form label-position="top">
        <el-form-item label="选择超分模型">
          <el-select v-model="tempUpscaleConfig.model" @change="onModelSelectChange" style="width: 100%">
            <el-option label="realesrgan-x4plus-anime (4x分辨率plus - 二次元插画推荐)" value="realesrgan-x4plus-anime" />
            <el-option label="realesrgan-x4plus (4x分辨率 - 真实照片推荐)" value="realesrgan-x4plus" />
            <el-option label="realesr-animevideov3-x4 (4x分辨率 - 二次元插画/视频适用)" value="realesr-animevideov3-x4" />
            <el-option label="realesr-animevideov3-x3 (3x分辨率 - 二次元插画/视频适用)" value="realesr-animevideov3-x3" />
            <el-option label="realesr-animevideov3-x2 (2x分辨率 - 二次元插画/视频适用)" value="realesr-animevideov3-x2" />
          </el-select>
        </el-form-item>
        <el-form-item label="放大倍率 (自动识别)">
          <el-input-number v-model="tempUpscaleConfig.scale" disabled />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showUpscaleSettings = false">取消</el-button>
        <el-button type="primary" @click="saveUpscaleSettings">保存</el-button>
      </template>
    </el-dialog>
    <!-- 背景去除设置弹窗 -->
    <el-dialog v-model="showBgRemoveSettings" title="背景去除模型配置" width="420px" append-to-body>
      <el-form label-position="top">
        <el-form-item label="选择背景去除模型">
          <el-select v-model="bgRemoveModel" style="width: 100%">
            <el-option label="isnet-anime (二次元插画推荐)" value="isnet-anime" />
            <el-option label="isnet-general-use (通用场景推荐)" value="isnet-general-use" />
            <el-option label="u2net (经典通用模型)" value="u2net" />
            <el-option label="u2netp (轻量快速版)" value="u2netp" />
            <el-option label="u2net_human_seg (真人分割专用)" value="u2net_human_seg" />
            <el-option label="silueta (超轻量模型)" value="silueta" />
          </el-select>
        </el-form-item>
        <div style="font-size: 12px; color: var(--text-muted); line-height: 1.5;">
          二次元插画/Logo 推荐使用 isnet-anime，真人照片推荐 u2net_human_seg，通用场景推荐 isnet-general-use。
        </div>
        <el-button
          size="small"
          style="margin-top: 12px;"
          @click="openModelDownloadDialog"
        >
          <el-icon><Download /></el-icon> 下载 / 删除模型
        </el-button>
      </el-form>
      <template #footer>
        <el-button @click="showBgRemoveSettings = false">取消</el-button>
        <el-button type="primary" @click="saveBgRemoveSettings">保存</el-button>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<script setup>
import { useGalleryStore } from '@/stores/gallery'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Edit, Star, Folder, Download, Delete, MagicStick, Setting, ZoomIn } from '@element-plus/icons-vue'
import { ref } from 'vue'

const galleryStore = useGalleryStore()

const fullPreviewVisible = ref(false)

function openFullPreview() {
  fullPreviewVisible.value = true
}

const visible = defineModel('visible', { type: Boolean, default: false })
const props = defineProps({
  image: { type: Object, default: null },
  type: { type: String, default: 'generated' }, // 'generated' | 'imported'
})
const emit = defineEmits(['update:image', 'moveAlbum'])

function formatDateTime(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN')
}

async function handleRename() {
  try {
    const { value } = await ElMessageBox.prompt('输入新名称', '重命名', {
      inputValue: props.image.name,
      confirmButtonText: '确定',
      cancelButtonText: '取消',
    })
    if (value && value.trim()) {
      galleryStore.renameGeneratedImage(props.image.id, value.trim())
      emit('update:image', { ...props.image, name: value.trim() })
      ElMessage.success('已重命名')
    }
  } catch { /* 取消 */ }
}

function handleToggleFav() {
  galleryStore.toggleFavorite(props.image.id)
  const updated = galleryStore.generatedImages.find(i => i.id === props.image.id)
  if (updated) {
    emit('update:image', updated)
    ElMessage.success(updated.favorite ? '已收藏' : '已取消收藏')
  }
}

import { exportImage, upscaleImage, removeBgImage } from '@/utils/imageStorage'

async function handleExport() {
  if (props.image.relPath) {
    const result = await exportImage(props.image.relPath, props.image.name)
    if (result.canceled) return
    if (result.success) {
      ElMessage.success('已导出')
    } else {
      ElMessage.error(result.error || '导出失败')
    }
  } else if (props.image.dataUrl) {
    // 兼容老数据
    const link = document.createElement('a')
    link.href = props.image.dataUrl
    link.download = (props.image.name || 'image') + '.png'
    link.click()
    ElMessage.success('已导出')
  }
}

async function handleDelete() {
  try {
    await ElMessageBox.confirm('确定要删除这张图片吗？', '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    if (props.type === 'generated') {
      galleryStore.deleteGeneratedImage(props.image.id)
    } else {
      galleryStore.deleteImportedImage(props.image.id)
    }
    visible.value = false
    ElMessage.success('已删除')
  } catch { /* 取消 */ }
}

// --- 超分配置 ---
const showUpscaleSettings = ref(false)
const upscaleConfig = ref({ model: 'realesrgan-x4plus-anime', scale: 4 })
const tempUpscaleConfig = ref({ model: 'realesrgan-x4plus-anime', scale: 4 })

// 初始化读取本地配置
try {
  const saved = localStorage.getItem('upscale-config')
  if (saved) {
    upscaleConfig.value = JSON.parse(saved)
    tempUpscaleConfig.value = JSON.parse(saved)
  }
} catch { /* ignore */ }

// 当用户在下拉框选模型时，自动关联对应的倍数
function onModelSelectChange(val) {
  if (val.includes('-x2')) {
    tempUpscaleConfig.value.scale = 2
  } else if (val.includes('-x3')) {
    tempUpscaleConfig.value.scale = 3
  } else {
    tempUpscaleConfig.value.scale = 4
  }
}

// 保存配置
function saveUpscaleSettings() {
  upscaleConfig.value = { ...tempUpscaleConfig.value }
  localStorage.setItem('upscale-config', JSON.stringify(upscaleConfig.value))
  showUpscaleSettings.value = false
  ElMessage.success('超分配置已保存')
}
const isUpscaling = ref(false)

const isRemovingBg = ref(false)
const showBgRemoveSettings = ref(false)
const bgRemoveModel = ref('u2net')

// 初始化读取本地配置
try {
  const savedBg = localStorage.getItem('bg-remove-model')
  if (savedBg) bgRemoveModel.value = savedBg
  else bgRemoveModel.value = 'u2net'
} catch { /* ignore */ }

async function handleRemoveBg() {
  if (!props.image.relPath) {
    ElMessage.warning('这张图片无法处理 (可能数据未就绪，请稍后再试)')
    return
  }

  // 检查模型文件是否存在
  try {
    const check = await window.electronAPI.checkModelExists(bgRemoveModel.value)
    if (!check.exists) {
      ElMessage.info('首次使用需要下载模型文件')
      if (window.__triggerModelDownload) {
        window.__triggerModelDownload(bgRemoveModel.value)
      }
      return
    }
  } catch {}

  isRemovingBg.value = true

  try {
    const result = await removeBgImage(props.image.relPath, bgRemoveModel.value)

    // 获取原图尺寸信息
    const origSize = props.image.size || '未知'

    const newImageRecord = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      name: `${props.image.name}_去背景`,
      relPath: result.relPath,
      prompt: props.image.prompt || '',
      model: props.image.model || '',
      siteName: props.image.siteName || '',
      size: origSize,
      apiType: props.image.apiType || '',
      hasReference: props.image.hasReference || false,
      createdAt: new Date().toISOString(),
      favorite: props.image.favorite || false,
      album: props.image.album || '',
      isBgRemoved: true,
    }

    await galleryStore.addGeneratedImage(newImageRecord)
    ElMessage.success('背景去除成功，已保存到图库')
  } catch (err) {
    ElMessage.error(err.message || '背景去除失败，请检查引擎是否已正确安装')
    console.error('背景去除错误:', err)
  } finally {
    isRemovingBg.value = false
  }
}

function saveBgRemoveSettings() {
  localStorage.setItem('bg-remove-model', bgRemoveModel.value)
  showBgRemoveSettings.value = false
  ElMessage.success('背景去除配置已保存')
}

function openModelDownloadDialog() {
  showBgRemoveSettings.value = false
  if (window.__triggerModelDownload) {
    window.__triggerModelDownload('')
  }
}

async function handleUpscale() {
  if (!props.image.relPath) {
    ElMessage.warning('这张图片无法超分 (可能数据未就绪，请稍后再试)')
    return
  }

  isUpscaling.value = true
  const modelName = upscaleConfig.value.model
  const scale = upscaleConfig.value.scale
  
  try {
    const result = await upscaleImage(props.image.relPath, modelName, scale)
    
    // 计算新的分辨率
    let origSize = props.image.size || '未知'
    let newSize = '未知'
    if (origSize.includes('x')) {
       const parts = origSize.split('x')
       if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
           newSize = `${parseInt(parts[0]) * scale}x${parseInt(parts[1]) * scale}`
       }
    }

    // 创建一张继承原图属性的新图片记录
    const newImageRecord = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      name: `${props.image.name}_超分${scale}x`,
      relPath: result.relPath, // 指向新生成的文件
      prompt: props.image.prompt || '',
      model: props.image.model || '',
      siteName: props.image.siteName || '',
      size: newSize,               // 新分辨率
      originalSize: origSize,      // 记录老分辨率
      isUpscaled: true,            // 标记为已超分
      apiType: props.image.apiType || '',
      hasReference: props.image.hasReference || false,
      createdAt: new Date().toISOString(),
      favorite: props.image.favorite || false, // 继承收藏状态
      album: props.image.album || '',          // 继承相册归属
    }
    
    // 添加到图库中（由于已经有 relPath，store 不会再去保存 base64，直接存 JSON 记录）
    await galleryStore.addGeneratedImage(newImageRecord)

    ElMessage.success('超分成功，超分后的图已保存在图库中')
    
    // （可选）如果想在超分后直接切换显示这张新图，可以取消注释下面这行：
    // emit('update:image', newImageRecord)

  } catch (err) {
    ElMessage.error(err.message || '超分处理失败，可能是显存不足或引擎错误')
    console.error('超分错误:', err)
  } finally {
    isUpscaling.value = false
  }
}
</script>

<style scoped>
.detail-content {
  display: flex;
  gap: 20px;
}

.detail-img {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.detail-img img {
  max-width: 100%;
  max-height: 70vh;
  border-radius: var(--radius-sm);
  display: block;
}

.detail-meta {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.meta-section h4 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.meta-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 13px;
}

.meta-label { color: var(--text-muted); }
.meta-value { color: var(--text-primary); font-weight: 500; }

.prompt-box {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 10px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  max-height: 120px;
  overflow-y: auto;
  word-break: break-all;
}

.detail-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: auto;
}

.detail-actions .el-button {
  width: 100%;
  margin: 0;
}

.upscale-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.upscale-row .upscale-btn-main {
  flex: 1;
  margin: 0 !important;
}

.upscale-row .upscale-btn-setting {
  width: 40px;
  min-width: 40px;
  padding: 0;
  margin: 0 !important;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* 放大按钮 */
.detail-img {
  position: relative;
}

.detail-img-zoom {
  position: absolute;
  bottom: 12px;
  right: 12px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.55);
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  z-index: 2;
}

.detail-img-zoom:hover {
  background: rgba(0, 0, 0, 0.8);
  color: #fff;
  transform: scale(1.1);
}

/* 大图预览 */
.full-preview-content {
  display: flex;
  align-items: center;
  justify-content: center;
}

.full-preview-content img {
  max-width: 90vw;
  max-height: 80vh;
  border-radius: var(--radius-sm);
  object-fit: contain;
}
</style>