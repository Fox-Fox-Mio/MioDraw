<template>
  <div class="gallery-page">
    <!-- 左侧侧边栏 -->
    <div class="sidebar" :class="{ 'sidebar--collapsed': sidebarCollapsed }">
      <div class="sidebar-header">
        <span v-if="!sidebarCollapsed" class="sidebar-title">相册</span>
        <button class="sidebar-toggle" @click="toggleSidebar">
          <el-icon>
            <DArrowLeft v-if="!sidebarCollapsed" />
            <DArrowRight v-else />
          </el-icon>
        </button>
      </div>

      <div v-if="!sidebarCollapsed" class="sidebar-content">
        <!-- 内置分类 -->
        <div
          class="sidebar-item"
          :class="{ active: filterAlbum === '' && currentTab === 'generated' }"
          @click="selectFilter('generated', '')"
        >
          <el-icon><PictureFilled /></el-icon>
          <span>全部生成</span>
          <span class="sidebar-count">{{ galleryStore.generatedImages.length }}</span>
        </div>

        <div
          class="sidebar-item"
          :class="{ active: filterAlbum === '__favorite__' }"
          @click="selectFilter('generated', '__favorite__')"
        >
          <el-icon><Star /></el-icon>
          <span>收藏</span>
          <span class="sidebar-count">{{ favoriteCount }}</span>
        </div>

        <div
          class="sidebar-item"
          :class="{ active: currentTab === 'imported' }"
          @click="selectFilter('imported', '')"
        >
          <el-icon><Upload /></el-icon>
          <span>导入图片</span>
          <span class="sidebar-count">{{ galleryStore.importedImages.length }}</span>
        </div>

        <!-- 分割线 -->
        <div class="sidebar-divider"></div>

        <!-- 用户相册 -->
        <div class="sidebar-section-header">
          <span>我的相册</span>
          <button class="sidebar-add-btn" @click="showAlbumDialog = true">
            <el-icon><Plus /></el-icon>
          </button>
        </div>

        <div v-if="albums.length === 0" class="sidebar-empty">
          暂无相册
        </div>

        <div
          v-for="album in albums"
          :key="album"
          class="sidebar-item"
          :class="{ active: filterAlbum === album && currentTab === 'generated' }"
          @click="selectFilter('generated', album)"
        >
          <el-icon><Folder /></el-icon>
          <span>{{ album }}</span>
          <span class="sidebar-count">{{ getAlbumCount(album) }}</span>
          <button class="sidebar-item-del" @click.stop="deleteAlbum(album)">
            <el-icon :size="12"><Close /></el-icon>
          </button>
        </div>
      </div>
    </div>

    <!-- 右侧主内容 -->
    <div class="gallery-main">
          <!-- 性能提示条 -->
    <div v-if="showThumbNotice" class="thumb-notice">
      <div class="notice-content">
        <el-icon><WarningFilled /></el-icon>
        为保证图库页面流畅，超过一定分辨率的图片使用了缩略图进行模糊，但不影响详情页面和真实下载的分辨率，请放心。
      </div>
      <div class="notice-actions">
        <button class="notice-btn" @click="dismissThumbNotice(true)">不再显示</button>
        <button class="notice-close" @click="dismissThumbNotice(false)">
          <el-icon><Close /></el-icon>
        </button>
      </div>
    </div>
      <div class="page-header">
        <div class="header-left">
          <h2>{{ currentTitle }}</h2>
        </div>
      </div>

      <!-- 图片网格 -->
      <div
        v-if="displayImages.length > 0"
        :class="['gallery-grid', themeStore.galleryDisplayMode === 'masonry' ? 'gallery-grid--masonry' : 'gallery-grid--square']"
      >
        <div :class="{ 'masonry-inner': themeStore.galleryDisplayMode === 'masonry' }">
          <div
            v-for="img in displayImages"
            :key="img.id"
            class="gallery-item"
            @click="openDetail(img)"
          >
            <div class="item-img">
              <img :src="galleryStore.getDisplayUrl(img, true)" :alt="img.name" loading="lazy" />
              <span v-if="img.favorite" class="fav-badge">⭐</span>
            </div>
            <div class="item-info">
              <span class="item-name">{{ img.name }}</span>
              <span class="item-date">{{ formatDate(img.createdAt || img.importedAt) }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="empty-state">
        <el-icon :size="64" color="var(--text-muted)"><PictureFilled /></el-icon>
        <p>{{ currentTab === 'generated' ? '还没有生成过图片' : '还没有导入过图片' }}</p>
      </div>
    </div>

    <!-- 图片详情弹窗 -->
    <ImageDetail
      v-model:visible="detailVisible"
      :image="detailImage"
      :type="currentTab"
      @update:image="detailImage = $event"
      @moveAlbum="handleMoveAlbum"
    />

    <!-- 新建相册弹窗 -->
    <el-dialog v-model="showAlbumDialog" title="新建相册" width="400px">
      <el-input v-model="newAlbumName" placeholder="输入相册名称" @keyup.enter="createAlbum" />
      <template #footer>
        <el-button @click="showAlbumDialog = false">取消</el-button>
        <el-button type="primary" @click="createAlbum">创建</el-button>
      </template>
    </el-dialog>

    <!-- 移动到相册弹窗 -->
    <el-dialog v-model="showMoveDialog" title="移动到相册" width="400px">
      <el-select v-model="moveTargetAlbum" placeholder="选择相册" style="width: 100%">
        <el-option label="（不归属相册）" value="" />
        <el-option
          v-for="album in albums"
          :key="album"
          :label="album"
          :value="album"
        />
      </el-select>
      <template #footer>
        <el-button @click="showMoveDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmMove">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { loadValue, saveValue } from '@/utils/storage'
import { useGalleryStore } from '@/stores/gallery'
import { useThemeStore } from '@/stores/theme'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  PictureFilled, Edit, Star, Folder, FolderAdd,
  Download, Delete, Plus, Close, Upload,
  DArrowLeft, DArrowRight, WarningFilled,
} from '@element-plus/icons-vue'
import ImageDetail from '@/components/ImageDetail.vue'

const galleryStore = useGalleryStore()
const themeStore = useThemeStore()

const currentTab = ref('generated')
const filterAlbum = ref('')
const detailVisible = ref(false)
const detailImage = ref(null)
const sidebarCollapsed = ref(false)
const savedAlbums = ref([]) // 用户创建的空相册也需要记录
const showThumbNotice = ref(localStorage.getItem('hide-thumb-notice') !== 'true')

function dismissThumbNotice(permanent) {
  showThumbNotice.value = false
  if (permanent) {
    localStorage.setItem('hide-thumb-notice', 'true')
  }
}

const showAlbumDialog = ref(false)
const newAlbumName = ref('')
const showMoveDialog = ref(false)
const moveTargetAlbum = ref('')
const moveTargetImage = ref(null)

onMounted(async () => {
  const collapsed = await loadValue('gallery-sidebar-collapsed', 'false')
  sidebarCollapsed.value = collapsed === 'true' || collapsed === true

  const albums = await loadValue('albums', [])
  savedAlbums.value = Array.isArray(albums) ? albums : []
})

const albums = computed(() => {
  const set = new Set()
  for (const img of galleryStore.generatedImages) {
    if (img.album) set.add(img.album)
  }
  for (const a of savedAlbums.value) set.add(a)
  return Array.from(set).sort()
})

const favoriteCount = computed(() => {
  return galleryStore.generatedImages.filter(img => img.favorite).length
})

const currentTitle = computed(() => {
  if (currentTab.value === 'imported') return '导入图片'
  if (filterAlbum.value === '__favorite__') return '收藏'
  if (filterAlbum.value) return `相册: ${filterAlbum.value}`
  return '全部生成'
})

const displayImages = computed(() => {
  if (currentTab.value === 'imported') {
    return galleryStore.importedImages
  }
  let list = galleryStore.generatedImages
  if (filterAlbum.value === '__favorite__') {
    list = list.filter(img => img.favorite)
  } else if (filterAlbum.value) {
    list = list.filter(img => img.album === filterAlbum.value)
  }
  return list
})

function selectFilter(tab, album) {
  currentTab.value = tab
  filterAlbum.value = tab === 'imported' ? '' : album
}

function getAlbumCount(album) {
  return galleryStore.generatedImages.filter(img => img.album === album).length
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return d.toLocaleString('zh-CN')
}

function openDetail(img) {
  detailImage.value = img
  detailVisible.value = true
}

function handleMoveAlbum(img) {
  moveTargetImage.value = img
  moveTargetAlbum.value = img.album || ''
  showMoveDialog.value = true
}

function confirmMove() {
  if (moveTargetImage.value) {
    const img = galleryStore.generatedImages.find(i => i.id === moveTargetImage.value.id)
    if (img) {
      img.album = moveTargetAlbum.value
      galleryStore.saveGenerated()
      detailImage.value.album = moveTargetAlbum.value
      ElMessage.success(moveTargetAlbum.value ? `已移动到「${moveTargetAlbum.value}」` : '已移出相册')
    }
  }
  showMoveDialog.value = false
}

function createAlbum() {
  const name = newAlbumName.value.trim()
  if (!name) {
    ElMessage.warning('请输入相册名称')
    return
  }
  if (albums.value.includes(name)) {
    ElMessage.warning('相册已存在')
    return
  }
  savedAlbums.value.push(name)
  saveValue('albums', savedAlbums.value)
  newAlbumName.value = ''
  showAlbumDialog.value = false
  ElMessage.success(`相册「${name}」已创建`)
}

async function deleteAlbum(album) {
  try {
    await ElMessageBox.confirm(`确定要删除相册「${album}」吗？相册内的图片不会被删除。`, '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    // 清除图片的相册标记
    for (const img of galleryStore.generatedImages) {
      if (img.album === album) img.album = ''
    }
    galleryStore.saveGenerated()
    // 从持久化存储删除
    savedAlbums.value = savedAlbums.value.filter(a => a !== album)
    saveValue('albums', savedAlbums.value)
    if (filterAlbum.value === album) filterAlbum.value = ''
    ElMessage.success('已删除相册')
  } catch { /* 取消 */ }
}

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
  saveValue('gallery-sidebar-collapsed', sidebarCollapsed.value.toString())
}
</script>

<style scoped>
.gallery-page {
  height: 100%;
  display: flex;
  gap: 0;
}

/* ===== 侧边栏 ===== */
.sidebar {
  width: 220px;
  flex-shrink: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  margin-right: 16px;
  transition: width var(--transition);
  overflow: hidden;
}

.sidebar--collapsed {
  width: auto;
  border: none;
  background: transparent;
  margin-right: 8px;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-color);
}

.sidebar--collapsed .sidebar-header {
  justify-content: center;
  padding: 4px;
  border-bottom: none;
}

.sidebar--collapsed .sidebar-toggle {
  width: 32px;
  height: 32px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
}

.sidebar-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.sidebar-toggle {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition);
}

.sidebar-toggle:hover {
  background: var(--bg-hover);
  color: var(--accent-color);
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
  transition: all var(--transition);
  position: relative;
}

.sidebar-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.sidebar-item.active {
  background: var(--accent-light);
  color: var(--accent-color);
}

.sidebar-count {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-secondary);
  padding: 1px 6px;
  border-radius: 10px;
}

.sidebar-item.active .sidebar-count {
  background: var(--accent-color);
  color: white;
}

.sidebar-item-del {
  display: none;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  align-items: center;
  justify-content: center;
  margin-left: 4px;
  flex-shrink: 0;
}

.sidebar-item:hover .sidebar-item-del {
  display: flex;
}

.sidebar-item-del:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.sidebar-divider {
  height: 1px;
  background: var(--border-color);
  margin: 8px 0;
}

.sidebar-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px;
  margin-bottom: 4px;
}

.sidebar-section-header span {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.sidebar-add-btn {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sidebar-add-btn:hover {
  background: var(--bg-hover);
  color: var(--accent-color);
}

.sidebar-empty {
  padding: 8px 10px;
  font-size: 12px;
  color: var(--text-muted);
}

/* ===== 主内容区 ===== */
.gallery-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* 性能提示条 */
.thumb-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(245, 158, 11, 0.15); /* 半透明黄色 */
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  margin-bottom: 16px;
  color: #d97706; /* 暗色主题下也清晰的黄色 */
}

/* 如果是暗色主题，文字颜色亮一点 */
:root.dark .thumb-notice {
  color: #fbbf24;
}

.notice-content {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  line-height: 1.4;
}

.notice-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  margin-left: 16px;
}

.notice-btn {
  background: transparent;
  border: none;
  color: currentColor;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  opacity: 0.8;
  transition: opacity var(--transition);
  text-decoration: underline;
  padding: 0;
}

.notice-btn:hover {
  opacity: 1;
}

.notice-close {
  background: transparent;
  border: none;
  color: currentColor;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 4px;
  opacity: 0.7;
  transition: all var(--transition);
}

.notice-close:hover {
  opacity: 1;
  background: rgba(245, 158, 11, 0.2);
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.header-left h2 {
  font-size: 22px;
}

/* 图库网格 - 方格模式 */
.gallery-grid--square {
  flex: 1;
  overflow-y: auto;
}

.gallery-grid--square > div {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 14px;
}

.gallery-grid--square .gallery-item {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  overflow: hidden;
  cursor: pointer;
  transition: all var(--transition);
}

.gallery-grid--square .gallery-item:hover {
  border-color: var(--accent-color);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.gallery-grid--square .item-img {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
}

.gallery-grid--square .item-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 图库网格 - 瀑布流模式 */
.gallery-grid--masonry {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.gallery-grid--masonry > div {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-start;
}

.gallery-grid--masonry .gallery-item {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  overflow: hidden;
  cursor: pointer;
  transition: all var(--transition);
  height: 200px;
  flex-shrink: 0;
  max-width: 300px;
}

.gallery-grid--masonry .item-info {
  max-width: 100%;
  overflow: hidden;
}

.gallery-grid--masonry .gallery-item:hover {
  border-color: var(--accent-color);
  box-shadow: var(--shadow-md);
}

.gallery-grid--masonry .item-img {
  position: relative;
  height: 160px;
  overflow: hidden;
}

.gallery-grid--masonry .item-img img {
  height: 100%;
  width: auto;
  display: block;
}

/* 通用 */
.fav-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  font-size: 16px;
}

.item-info {
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  width: 0;
  min-width: 100%;
}

.item-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

.item-date {
  font-size: 11px;
  color: var(--text-muted);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 16px;
  color: var(--text-muted);
  font-size: 15px;
}

/* 详情弹窗 */
.detail-content {
  display: flex;
  gap: 20px;
}

.detail-img {
  flex: 1;
  min-width: 0;
}

.detail-img img {
  width: 100%;
  border-radius: var(--radius-sm);
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

.meta-label {
  color: var(--text-muted);
}

.meta-value {
  color: var(--text-primary);
  font-weight: 500;
}

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
  flex-wrap: wrap;
  gap: 8px;
  margin-top: auto;
}

.detail-actions .el-button {
  flex: 1;
  min-width: calc(50% - 4px);
}
</style>