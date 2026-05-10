<template>
  <div class="generate-page" :class="`generate-page--${themeStore.layoutMode}`">
    <!-- 上半部分：生成控制区 -->
    <div class="gen-top">
      <!-- 左侧：参数面板 -->
      <div class="gen-params">
        <!-- 站点选择 -->
        <div class="param-group">
          <label class="param-label">API 站点</label>
          <el-select
            v-model="selectedSiteId"
            placeholder="请先在设置中添加站点"
            style="width: 100%"
            @change="onSiteChange"
          >
            <el-option
              v-for="site in apiStore.sites"
              :key="site.id"
              :label="site.name"
              :value="site.id"
            />
          </el-select>
        </div>

        <!-- 模型选择 -->
        <div class="param-group">
          <label class="param-label">模型</label>
          <el-select
            v-model="selectedModelId"
            placeholder="请先选择站点"
            style="width: 100%"
            :disabled="!selectedSiteId"
            @change="onModelChange"
          >
            <el-option
              v-for="model in currentSiteModels"
              :key="model.id"
              :label="`${model.name} (${apiStore.getApiTypeLabel(model.apiType)})`"
              :value="model.id"
            />
          </el-select>
        </div>

        <!-- 图片尺寸 -->
        <div class="param-group">
          <label class="param-label">图片尺寸</label>
          <el-select v-model="imageSize" style="width: 100%" filterable>
            <el-option-group label="自动">
              <el-option label="自动 (auto)" value="auto" />
            </el-option-group>
            <el-option-group label="1:1 方形">
              <el-option label="1024 × 1024 (1K)" value="1024x1024" />
              <el-option label="2048 × 2048 (2K)" value="2048x2048" />
              <el-option label="4096 × 4096 (4K)" value="4096x4096" />
            </el-option-group>
            <el-option-group label="3:2 横屏">
              <el-option label="1536 × 1024 (1K)" value="1536x1024" />
            </el-option-group>
            <el-option-group label="2:3 竖屏">
              <el-option label="1024 × 1536 (1K)" value="1024x1536" />
            </el-option-group>
            <el-option-group label="16:9 横屏">
              <el-option label="1280 × 720 (1K)" value="1280x720" />
              <el-option label="2560 × 1440 (2K)" value="2560x1440" />
              <el-option label="3840 × 2160 (4K)" value="3840x2160" />
            </el-option-group>
            <el-option-group label="9:16 竖屏">
              <el-option label="720 × 1280 (1K)" value="720x1280" />
              <el-option label="1440 × 2560 (2K)" value="1440x2560" />
              <el-option label="2160 × 3840 (4K)" value="2160x3840" />
            </el-option-group>
            <el-option-group v-if="themeStore.customSizes.length > 0" label="自定义">
              <el-option
                v-for="size in themeStore.customSizes"
                :key="size"
                :label="size"
                :value="size"
              />
            </el-option-group>
          </el-select>
        </div>

        <!-- 图片质量（仅 Responses 接口显示） -->
        <div class="param-group" v-if="isResponsesModel">
          <label class="param-label">图片质量</label>
          <el-select v-model="imageQuality" style="width: 100%">
            <el-option label="自动 (auto)" value="auto" />
            <el-option label="低 (low)" value="low" />
            <el-option label="中 (medium)" value="medium" />
            <el-option label="高 (high)" value="high" />
          </el-select>
        </div>

        <!-- 生成数量和并发 -->
        <div class="param-row">
          <div class="param-group" style="flex: 1">
            <label class="param-label">生成数量</label>
            <el-input-number v-model="generateCount" :min="1" :max="20" :step="1" style="width: 100%" />
          </div>
          <div class="param-group" style="flex: 1">
            <label class="param-label">并发数</label>
            <el-input-number v-model="concurrency" :min="1" :max="10" :step="1" style="width: 100%" />
          </div>
        </div>

        <!-- 参考图 -->
        <div class="param-group">
          <div class="param-label-row">
            <label class="param-label">参考图（可选）</label>
            <el-button
              v-if="referenceImages.length > 0"
              text
              size="small"
              type="danger"
              @click="clearAllReferences"
            >
              清空
            </el-button>
          </div>
          <div class="ref-image-area">
            <div
              v-if="referenceImages.length > 0"
              class="ref-list"
              :class="{ 'ref-list--dragover': refDragover }"
              @dragover.prevent="refDragover = true"
              @dragleave="refDragover = false"
              @drop.prevent="onRefDrop"
            >
              <div
                v-for="img in referenceImages"
                :key="img.id"
                class="ref-thumb"
              >
                <img :src="img.dataUrl" alt="参考图" />
                <button class="ref-remove" @click="removeReference(img.id)">
                  <el-icon><Close /></el-icon>
                </button>
              </div>
              <div class="ref-add" @click="selectReferenceImage">
                <el-icon :size="20"><Plus /></el-icon>
              </div>
            </div>
            <div
              v-else
              class="ref-upload"
              :class="{ 'ref-upload--dragover': refDragover }"
              @click="selectReferenceImage"
              @dragover.prevent="refDragover = true"
              @dragleave="refDragover = false"
              @drop.prevent="onRefDrop"
            >
              <el-icon :size="24"><Upload /></el-icon>
              <span>点击或拖拽上传参考图</span>
            </div>
            <input
              ref="fileInputRef"
              type="file"
              accept="image/*"
              multiple
              style="display: none"
              @change="onFileSelected"
            />
          </div>
        </div>
        <!-- 角色卡（可选） -->
        <div class="param-group">
          <div class="param-label-row">
            <label class="param-label">角色卡（可选）</label>
            <el-button
              v-if="selectedCharacter"
              text
              size="small"
              type="danger"
              @click="selectedCharacter = null"
            >
              移除
            </el-button>
          </div>
          <div v-if="selectedCharacter" class="char-selected-card">
            <img
              v-if="selectedCharacter.mainImageRelPath"
              :src="getCharImageUrl(selectedCharacter)"
              alt=""
              class="char-selected-img"
            />
            <div class="char-selected-info">
              <span class="char-selected-name">{{ selectedCharacter.name }}</span>
              <span class="char-selected-meta">
                {{ selectedCharacter.appearance ? '已有外观描述' : '无外观描述' }}
              </span>
            </div>
          </div>
          <div v-else class="char-select-area" @click="showCharSelectDialog = true">
            <el-icon :size="20"><User /></el-icon>
            <span>点击选择角色卡</span>
          </div>
        </div>
      </div>

      <!-- 右侧：提示词 + 生成按钮 + 预览 -->
      <div class="gen-main">
        <!-- 提示词输入 -->
        <div class="prompt-area">
          <el-input
            v-model="genStore.prompt"
            type="textarea"
            :rows="5"
            placeholder="描述你想生成的图片..."
            resize="none"
            maxlength="4000"
            show-word-limit
          />
          <div class="prompt-btns">
            <el-button
              v-if="themeStore.multiBatchMode || !genStore.isGenerating"
              type="primary"
              class="gen-btn"
              :disabled="!canGenerate"
              @click="handleGenerate"
            >
              <el-icon><Brush /></el-icon> 生成
            </el-button>
            <el-button
              v-else
              type="danger"
              class="gen-btn stop-btn"
              @click="handleStop"
            >
              <el-icon><CircleClose /></el-icon> 中止 ({{ genStore.completedCount }}/{{ genStore.totalCount }})
            </el-button>
            <el-button class="assist-btn" @click="showAssistant = true">
              <el-icon><ChatDotRound /></el-icon> 优化助手
            </el-button>
            <el-button class="log-btn" @click="showLogViewer = true">
              <el-icon><Document /></el-icon> 日志
            </el-button>
          </div>
        </div>

        <!-- 当前生成预览 -->
        <!-- 任务监控面板 -->
        <!-- 任务监控面板 -->
        <div class="status-area">
          <div v-if="statusIsEmpty" class="status-empty">
            <el-icon :size="48" color="var(--text-muted)"><Monitor /></el-icon>
            <p>开始生成后，这里会显示任务进度</p>
          </div>

          <div v-else class="status-content">
            <div v-if="genStore.hasSuccess && !successBannerDismissed" class="success-banner">
              <el-icon><CircleCheck /></el-icon>
              <span class="success-banner-text">已有图片生成成功，请在「最近生成」或「图库」页面查看</span>
              <button class="success-banner-close" @click="successBannerDismissed = true">
                <el-icon><Close /></el-icon>
              </button>
            </div>

            <div class="status-header">
              <div>
                <h3 class="status-title">并发任务</h3>
                <p class="status-desc">{{ themeStore.multiBatchMode ? '累计任务模式：可连续提交多批次，各批次独立运行' : '显示当前批次的执行进度，完成后的结果将自动保存到图库' }}</p>
              </div>
              <div class="status-elapsed-row">
                <span class="status-elapsed">总耗时 {{ formatElapsed(totalElapsed) }}</span>
                <el-button
                  v-if="themeStore.multiBatchMode"
                  size="small"
                  type="danger"
                  plain
                  class="clear-history-btn"
                  :disabled="genStore.hasRunningBatches"
                  @click="genStore.clearBatches()"
                >
                  <el-icon><Delete /></el-icon> 清理历史
                </el-button>
              </div>
            </div>

            <div class="stats-row">
              <div class="stat-card">
                <div class="stat-num">{{ genStore.taskStats.total }}</div>
                <div class="stat-label">总任务</div>
              </div>
              <div class="stat-card stat-card--running">
                <div class="stat-num">{{ genStore.taskStats.running }}</div>
                <div class="stat-label">执行中</div>
              </div>
              <div class="stat-card stat-card--success">
                <div class="stat-num">{{ genStore.taskStats.success }}</div>
                <div class="stat-label">已完成</div>
              </div>
              <div class="stat-card stat-card--failed">
                <div class="stat-num">{{ genStore.taskStats.failed }}</div>
                <div class="stat-label">失败/停止</div>
              </div>
            </div>

            <!-- 累计任务模式：按批次分组显示 -->
            <div v-if="themeStore.multiBatchMode" class="batch-list">
              <div
                v-for="batch in genStore.batches"
                :key="batch.id"
                class="batch-card"
                :class="{
                  'batch-card--running': batch.isRunning,
                  'batch-card--stopped': !batch.isRunning && batch.isStopped,
                  'batch-card--done': !batch.isRunning && !batch.isStopped,
                }"
              >
                <div class="batch-header">
                  <div class="batch-info">
                    <div class="batch-prompt" :title="batch.prompt">{{ batch.prompt }}</div>
                    <div class="batch-meta">{{ batch.siteName }} · {{ batch.modelName }}</div>
                    <span class="batch-elapsed">{{ formatBatchElapsed(batch) }}</span>
                  </div>
                  <el-button
                    v-if="batch.isRunning"
                    type="danger"
                    size="small"
                    class="batch-stop-btn"
                    @click="handleStopMultiBatch(batch.id)"
                  >
                    <el-icon><CircleClose /></el-icon> 中止
                  </el-button>
                  <span
                    v-else
                    class="batch-done-tag"
                    :class="batch.isStopped ? 'tag--stopped' : 'tag--done'"
                  >
                    {{ batch.isStopped ? '已停止' : '已完成' }}
                  </span>
                </div>
                <div class="batch-task-list">
                  <div
                    v-for="task in batch.tasks"
                    :key="task.id"
                    class="task-item"
                    :class="`task-item--${task.status}`"
                  >
                    <div class="task-row">
                      <div class="task-left">
                        <span class="task-num">任务 #{{ task.id }}</span>
                        <span class="task-tag">{{ statusLabel(task.status) }}</span>
                      </div>
                      <div class="task-right">
                        <span class="task-duration">{{ formatTaskDuration(task) }}</span>
                      </div>
                    </div>
                    <div v-if="task.error" class="task-error">{{ task.error }}</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 单批次模式：普通任务列表 -->
            <div v-else class="task-list">
              <div
                v-for="task in genStore.tasks"
                :key="task.id"
                class="task-item"
                :class="`task-item--${task.status}`"
              >
                <div class="task-row">
                  <div class="task-left">
                    <span class="task-num">任务 #{{ task.id }}</span>
                    <span class="task-tag">{{ statusLabel(task.status) }}</span>
                  </div>
                  <div class="task-right">
                    <span class="task-duration">{{ formatTaskDuration(task) }}</span>
                  </div>
                </div>
                <div v-if="task.error" class="task-error">{{ task.error }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 下半部分：历史 + 导入图 面板 -->
    <div class="gen-bottom">
      <!-- 左：最近生成 -->
      <div class="bottom-panel">
        <div class="panel-header">
          <span class="panel-title">最近生成</span>
          <span class="panel-count">{{ galleryStore.generatedImages.length }} 张</span>
        </div>
        <div
          :class="['panel-grid', themeStore.imageDisplayMode === 'masonry' ? 'panel-grid--masonry' : 'panel-grid--square']"
          v-if="galleryStore.generatedImages.length > 0"
        >
          <div
            v-for="img in galleryStore.generatedImages.slice(0, 20)"
            :key="img.id"
            class="panel-thumb"
            @click="openDetail(img, 'generated')"
          >
            <img :src="galleryStore.getDisplayUrl(img, true)" :alt="img.name" />
            <el-tooltip content="删除" placement="top">
              <button class="thumb-delete" @click.stop="deleteGenerated(img)">
                <el-icon><Delete /></el-icon>
              </button>
            </el-tooltip>
            <div class="thumb-actions" @click.stop>
              <el-tooltip content="复用提示词" placement="top">
                <button @click="reusePrompt(img)">
                  <el-icon><DocumentCopy /></el-icon>
                </button>
              </el-tooltip>
              <el-tooltip content="用作参考图" placement="top">
                <button @click="useAsReference(img)">
                  <el-icon><PictureFilled /></el-icon>
                </button>
              </el-tooltip>
            </div>
          </div>
        </div>
        <div v-else class="panel-empty">
          <span>暂无生成记录</span>
        </div>
      </div>

      <!-- 右：导入的参考图 -->
      <div class="bottom-panel">
        <div class="panel-header">
          <span class="panel-title">我的参考图</span>
          <el-button text size="small" @click="importReferenceImage">
            <el-icon><Plus /></el-icon> 导入
          </el-button>
        </div>
        <div
          :class="[
            'panel-grid',
            themeStore.imageDisplayMode === 'masonry' ? 'panel-grid--masonry' : 'panel-grid--square',
            importDragover ? 'panel-grid--dragover' : ''
          ]"
          v-if="galleryStore.importedImages.length > 0"
          @dragover.prevent="importDragover = true"
          @dragleave="importDragover = false"
          @drop.prevent="onImportDrop"
        >
          <div
            v-for="img in galleryStore.importedImages.slice(0, 20)"
            :key="img.id"
            class="panel-thumb"
            @click="openDetail(img, 'imported')"
          >
            <img :src="galleryStore.getDisplayUrl(img, true)" :alt="img.name" />
            <el-tooltip content="删除" placement="top">
              <button class="thumb-delete" @click.stop="deleteImportedConfirm(img)">
                <el-icon><Delete /></el-icon>
              </button>
            </el-tooltip>
            <div class="thumb-actions" @click.stop>
              <el-tooltip content="用作参考图" placement="top">
                <button @click="useAsReference(img)">
                  <el-icon><PictureFilled /></el-icon>
                </button>
              </el-tooltip>
            </div>
          </div>
        </div>
        <div
          v-else
          class="panel-empty panel-empty--droppable"
          :class="{ 'panel-empty--dragover': importDragover }"
          @dragover.prevent="importDragover = true"
          @dragleave="importDragover = false"
          @drop.prevent="onImportDrop"
        >
          <span>点击「导入」或拖拽图片到此处</span>
        </div>
        <input
          ref="importInputRef"
          type="file"
          accept="image/*"
          multiple
          style="display: none"
          @change="onImportFiles"
        />
      </div>
    </div>
    <LogViewer v-model="showLogViewer" />
    <PromptAssistant v-model="showAssistant" :ref-images="referenceImages" />
        <!-- 角色卡选择弹窗 -->
    <el-dialog v-model="showCharSelectDialog" title="选择角色卡" width="600px" :close-on-click-modal="true">
      <div class="char-select-dialog-body">
        <div v-if="characterStore.characters.length > 0" class="char-select-grid">
          <div
            v-for="ch in characterStore.characters"
            :key="ch.id"
            class="char-select-item"
            :class="{ 'char-select-item--active': selectedCharacter?.id === ch.id }"
            @click="selectCharacter(ch)"
          >
            <div class="char-select-item-img">
              <img v-if="ch.mainImageRelPath" :src="getCharImageUrl(ch, true)" :alt="ch.name" loading="lazy" />
              <div v-else class="char-select-item-placeholder">
                <el-icon :size="24"><User /></el-icon>
              </div>
            </div>
            <span class="char-select-item-name">{{ ch.name }}</span>
          </div>
        </div>
        <div v-else class="char-select-empty">
          <p>还没有角色卡，请先到「角色卡」页面创建</p>
        </div>
      </div>
    </el-dialog>
    <ImageDetail
      v-model:visible="detailVisible"
      :image="detailImage"
      :type="detailType"
      @update:image="detailImage = $event"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useApiStore } from '@/stores/api'
import { useGalleryStore } from '@/stores/gallery'
import { useThemeStore } from '@/stores/theme'
import { generateImage, toDataUrl, downloadImageAsBase64 } from '@/utils/imageApi'
import { addLog } from '@/utils/logger'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Brush, Close, Upload, Loading, PictureFilled,
  DocumentCopy, Plus, Delete, Document, CircleClose,
  Monitor, CircleCheck, ChatDotRound, User,
} from '@element-plus/icons-vue'
import LogViewer from '@/components/LogViewer.vue'
import ImageDetail from '@/components/ImageDetail.vue'
import { useGenerationStore } from '@/stores/generation'
import { readImageAsBase64 } from '@/utils/imageStorage'
import PromptAssistant from '@/components/PromptAssistant.vue'
import { useCharacterStore } from '@/stores/character'
import { relPathToUrl } from '@/utils/imageStorage'

const showAssistant = ref(false)
const showLogViewer = ref(false)
const apiStore = useApiStore()
const galleryStore = useGalleryStore()
const themeStore = useThemeStore()
const genStore = useGenerationStore()
const characterStore = useCharacterStore()

const successBannerDismissed = ref(false)
const detailVisible = ref(false)
const detailImage = ref(null)
const detailType = ref('generated')

// 生成参数
const selectedSiteId = ref(null)
const selectedModelId = ref(null)
const imageQuality = ref('auto')

const currentSiteModels = computed(() => {
  const site = apiStore.sites.find(s => s.id === selectedSiteId.value)
  return site?.models || []
})
const imageSize = ref('1024x1024')
const generateCount = ref(1)
const concurrency = ref(1)
const referenceImages = ref([]) // { id, dataUrl, file? }

// 任务监控
const currentTime = ref(Date.now())
let timeUpdateInterval = null

const totalElapsed = computed(() => {
  if (themeStore.multiBatchMode) {
    if (genStore.batches.length === 0) return 0
    const start = Math.min(...genStore.batches.map(b => b.startTime))
    if (genStore.hasRunningBatches) return currentTime.value - start
    const end = Math.max(...genStore.batches.map(b => b.endTime || b.startTime))
    return end - start
  }
  if (!genStore.batchStartTime) return 0
  const end = genStore.batchEndTime || currentTime.value
  return end - genStore.batchStartTime
})

function startTimeUpdate() {
  if (timeUpdateInterval) return
  timeUpdateInterval = setInterval(() => {
    currentTime.value = Date.now()
  }, 1000)
}

function stopTimeUpdate() {
  if (timeUpdateInterval) {
    clearInterval(timeUpdateInterval)
    timeUpdateInterval = null
  }
}

function formatElapsed(ms) {
  if (!ms || ms < 0) return '0 秒'
  const seconds = Math.floor(ms / 1000)
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins > 0) return `${mins} 分 ${secs} 秒`
  return `${secs} 秒`
}

function formatTaskDuration(task) {
  if (task.status === 'pending') return '排队中'
  if (!task.startTime) return '-'
  const end = task.endTime || currentTime.value
  return formatElapsed(end - task.startTime)
}

function statusLabel(status) {
  return {
    pending: '排队中',
    running: '执行中',
    success: '成功',
    failed: '失败',
    stopped: '已停止',
  }[status] || status
}

const statusIsEmpty = computed(() => {
  if (themeStore.multiBatchMode) return genStore.batches.length === 0
  return genStore.tasks.length === 0
})

onUnmounted(() => stopTimeUpdate())

// DOM refs
const fileInputRef = ref(null)
const importInputRef = ref(null)

const refDragover = ref(false)

function onRefDrop(e) {
  refDragover.value = false
  const files = Array.from(e.dataTransfer?.files || [])
  const imageFiles = files.filter(f => f.type.startsWith('image/'))
  if (imageFiles.length === 0) {
    ElMessage.warning('请拖入图片文件')
    return
  }
  for (const file of imageFiles) {
    const reader = new FileReader()
    reader.onload = (ev) => {
      referenceImages.value.push({
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        dataUrl: ev.target.result,
        file,
      })
    }
    reader.readAsDataURL(file)
  }
}

const importDragover = ref(false)

function onImportDrop(e) {
  importDragover.value = false
  const files = Array.from(e.dataTransfer?.files || [])
  const imageFiles = files.filter(f => f.type.startsWith('image/'))
  if (imageFiles.length === 0) {
    ElMessage.warning('请拖入图片文件')
    return
  }

  let loaded = 0
  for (const file of imageFiles) {
    const reader = new FileReader()
    reader.onload = async (ev) => {
      await galleryStore.addImportedImage({
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        name: file.name,
        dataUrl: ev.target.result,
        importedAt: new Date().toISOString(),
      })
      loaded++
      if (loaded === imageFiles.length) {
        ElMessage.success(`已导入 ${loaded} 张图片`)
      }
    }
    reader.readAsDataURL(file)
  }
}

//判断是否为responses
const isResponsesModel = computed(() => {
  const config = apiStore.getGenConfig(selectedSiteId.value, selectedModelId.value)
  return config?.apiType === 'responses'
})

const canGenerate = computed(() => {
  if (themeStore.multiBatchMode) {
    return selectedSiteId.value && selectedModelId.value && genStore.prompt.trim() && genStore.totalRunningCount < 10
  }
  return selectedSiteId.value && selectedModelId.value && genStore.prompt.trim() && !genStore.isGenerating
})

onMounted(async () => {
  await characterStore.init()

  // 阻止 Electron 默认拖拽行为（防止页面导航到文件）
  document.addEventListener('dragover', (e) => e.preventDefault())
  document.addEventListener('drop', (e) => e.preventDefault())
  if (apiStore.activeSiteId) {
    selectedSiteId.value = apiStore.activeSiteId
    selectedModelId.value = apiStore.activeModelId
  } else if (apiStore.sites.length > 0) {
    selectedSiteId.value = apiStore.sites[0].id
    selectedModelId.value = apiStore.sites[0].models[0]?.id || null
  }
  // 如果还在生成中（用户刚切回页面），恢复定时器
  if (genStore.isGenerating || genStore.hasRunningBatches) {
    startTimeUpdate()
  }
})

function onSiteChange(id) {
  const site = apiStore.sites.find(s => s.id === id)
  selectedModelId.value = site?.models[0]?.id || null
  apiStore.setActive(id, selectedModelId.value)
}

function openDetail(img, type) {
  detailImage.value = img
  detailType.value = type
  detailVisible.value = true
}

function onModelChange(id) {
  apiStore.setActive(selectedSiteId.value, id)
}

// ========== 参考图相关 ==========

function selectReferenceImage() {
  fileInputRef.value?.click()
}

function onFileSelected(e) {
  const files = Array.from(e.target.files || [])
  if (files.length === 0) return
  for (const file of files) {
    const reader = new FileReader()
    reader.onload = (ev) => {
      referenceImages.value.push({
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        dataUrl: ev.target.result,
        file,
      })
    }
    reader.readAsDataURL(file)
  }
  e.target.value = ''
}

function removeReference(id) {
  referenceImages.value = referenceImages.value.filter(img => img.id !== id)
}

function clearAllReferences() {
  referenceImages.value = []
}

async function useAsReference(img) {
  let dataUrl = img.dataUrl
  if (!dataUrl && img.relPath) {
    try {
      dataUrl = await readImageAsBase64(img.relPath)
    } catch {
      ElMessage.error('读取图片失败')
      return
    }
  }
  if (!dataUrl) {
    ElMessage.error('图片数据不可用')
    return
  }
  referenceImages.value.push({
    id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
    dataUrl,
    file: null,
  })
  ElMessage.success('已添加为参考图')
}

function reusePrompt(img) {
  if (img.prompt) {
    genStore.prompt = img.prompt
    ElMessage.success('已复用提示词')
  }
}

// ========== 角色卡选择 ==========

const selectedCharacter = ref(null)
const showCharSelectDialog = ref(false)

function getCharImageUrl(ch, isThumb = false) {
  if (!ch.mainImageRelPath) return ''
  const base = relPathToUrl(ch.mainImageRelPath)
  return isThumb ? `${base}?thumb=400` : base
}

function selectCharacter(ch) {
  selectedCharacter.value = ch
  showCharSelectDialog.value = false
  ElMessage.success(`已选择角色「${ch.name}」`)
}

function buildPromptWithCharacter(originalPrompt) {
  if (!selectedCharacter.value) return originalPrompt
  const ch = selectedCharacter.value
  let charContext = `【角色卡信息】角色名：${ch.name}`
  if (ch.basicInfo?.trim()) charContext += `；基础设定：${ch.basicInfo.trim()}`
  if (ch.appearance?.trim()) charContext += `；外观描述：${ch.appearance.trim()}`
  return `${charContext}\n\n【用户绘图需求】${originalPrompt}`
}

function getEffectiveReferenceImages() {
  const refs = [...referenceImages.value]
  // 如果选了角色卡，把主设图加到参考图最前面
  if (selectedCharacter.value?.mainImageRelPath) {
    const mainImgUrl = getCharImageUrl(selectedCharacter.value)
    // 避免重复添加
    if (!refs.some(r => r._isCharMain)) {
      refs.unshift({
        id: 'char-main-' + selectedCharacter.value.id,
        dataUrl: null,
        _isCharMain: true,
        _relPath: selectedCharacter.value.mainImageRelPath,
      })
    }
  }
  return refs
}

async function prepareRefsForGenerate() {
  const refs = [...referenceImages.value]
  // 如果选了角色卡，把主设图读取为 dataUrl 并加到参考图最前面
  if (selectedCharacter.value?.mainImageRelPath) {
    try {
      const dataUrl = await readImageAsBase64(selectedCharacter.value.mainImageRelPath)
      // 避免重复
      if (!refs.some(r => r._isCharMain)) {
        refs.unshift({
          id: 'char-main-' + selectedCharacter.value.id,
          dataUrl,
          _isCharMain: true,
        })
      }
    } catch {}
  }
  return refs.length > 0 ? refs : null
}

// ========== 导入参考图 ==========

function importReferenceImage() {
  importInputRef.value?.click()
}

function onImportFiles(e) {
  const files = Array.from(e.target.files || [])
  if (files.length === 0) return

  let loaded = 0
  for (const file of files) {
    const reader = new FileReader()
    reader.onload = async (ev) => {
      await galleryStore.addImportedImage({
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        name: file.name,
        dataUrl: ev.target.result, // 会被 store 自动转存为文件
        importedAt: new Date().toISOString(),
      })
      loaded++
      if (loaded === files.length) {
        ElMessage.success(`已导入 ${loaded} 张图片`)
      }
    }
    reader.readAsDataURL(file)
  }

  e.target.value = ''
}

async function deleteImportedConfirm(img) {
  try {
    await ElMessageBox.confirm('确定要删除这张参考图吗？图库中也会同步删除。', '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    galleryStore.deleteImportedImage(img.id)
    ElMessage.success('已删除')
  } catch { /* 取消 */ }
}

async function deleteGenerated(img) {
  try {
    await ElMessageBox.confirm('确定要删除这张图片吗？图库中也会同步删除。', '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    galleryStore.deleteGeneratedImage(img.id)
    ElMessage.success('已删除')
  } catch { /* 取消 */ }
}

// ========== 生成图片 ==========
async function handleGenerate() {
  // 累计任务模式走独立逻辑
  if (themeStore.multiBatchMode) {
    return handleGenerateMultiBatch()
  }
  successBannerDismissed.value = false
  const config = apiStore.getGenConfig(selectedSiteId.value, selectedModelId.value)
  if (!config) {
    ElMessage.error('请先选择站点和模型')
    return
  }

  if (!genStore.prompt.trim()) {
    ElMessage.error('请输入提示词')
    return
  }

  const myToken = genStore.startBatch(generateCount.value)
  startTimeUpdate()

  addLog('info', '开始生成图片', {
    site: config.siteName,
    model: config.model,
    apiType: config.apiType,
    prompt: genStore.prompt,
    size: imageSize.value,
    count: generateCount.value,
    concurrency: concurrency.value,
    hasReference: referenceImages.value.length > 0,
    referenceCount: referenceImages.value.length,
  })

  const taskQueue = [...genStore.tasks]
  const running = []

  async function runTask() {
    while (taskQueue.length > 0) {
      if (genStore.isCancelled(myToken)) return
      const task = taskQueue.shift()
      if (!task) return

      task.status = 'running'
      task.startTime = Date.now()

      try {
        // 构建有效提示词和参考图（注入角色卡）
        const effectivePrompt = buildPromptWithCharacter(genStore.prompt)
        const effectiveRefs = await prepareRefsForGenerate()

        const result = await generateImage({
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          model: config.model,
          prompt: effectivePrompt,
          referenceImages: effectiveRefs,
          size: imageSize.value,
          apiType: config.apiType,
          customEndpoint: config.endpoint,
          quality: imageQuality.value,
        })

        if (genStore.isCancelled(myToken)) {
          addLog('info', '已被中止，丢弃返回结果')
          return
        }

        if (result.data && result.data.length > 0) {
          for (const item of result.data) {
            let dataUrl = ''
            if (item.b64_json) {
              dataUrl = toDataUrl(item.b64_json)
            } else if (item.url) {
              try {
                dataUrl = await downloadImageAsBase64(item.url)
              } catch (dlErr) {
                addLog('warn', '图片下载失败，使用远程URL', dlErr.message)
                dataUrl = item.url
              }
            }

            if (genStore.isCancelled(myToken)) return

            if (dataUrl) {
              const imageRecord = {
                id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
                name: `生成_${new Date().toLocaleString('zh-CN').replace(/[/:]/g, '-')}`,
                dataUrl,  // 这里会被 addGeneratedImage 自动转存为文件
                prompt: genStore.prompt,
                model: config.model,
                siteName: config.siteName,
                size: imageSize.value,
                apiType: config.apiType,
                hasReference: referenceImages.value.length > 0,
                createdAt: new Date().toISOString(),
                favorite: false,
                album: '',
              }
              await galleryStore.addGeneratedImage(imageRecord)
            }
          }
        }

        task.status = 'success'
        task.endTime = Date.now()
        genStore.completedCount++
        addLog('info', `任务 #${task.id} 生成成功`)
      } catch (err) {
        if (genStore.isCancelled(myToken)) return
        genStore.completedCount++
        let errMsg = err.response?.data?.error?.message || err.message || '未知错误'
        try {
          if (/^[A-Za-z0-9+/=]{4,}$/.test(errMsg) && errMsg.length % 4 <= 1) {
            const decoded = atob(errMsg)
            if (/^[\x20-\x7E\u4e00-\u9fff\s]+$/.test(decoded)) errMsg = decoded
          }
        } catch { /* 不是 base64 */ }
        task.status = 'failed'
        task.endTime = Date.now()
        task.error = errMsg
        addLog('error', `任务 #${task.id} 失败`, {
          error: errMsg,
          status: err.response?.status,
          data: err.response?.data,
        })
      }
    }
  }

  const concurrencyCount = Math.min(concurrency.value, generateCount.value)
  for (let i = 0; i < concurrencyCount; i++) {
    running.push(runTask())
  }

  await Promise.all(running)

  if (!genStore.isCancelled(myToken)) {
    genStore.endBatch()
    stopTimeUpdate()
    if (genStore.taskStats.success > 0) {
      ElMessage.success(`成功生成 ${genStore.taskStats.success} 张图片`)
      // 播放提示音
      if (themeStore.workflowSoundEnabled) {
        import('@/utils/notificationSound').then(({ playNotificationSound }) => {
          playNotificationSound()
        })
      }
    }
  }
}

async function handleStop() {
  try {
    await ElMessageBox.confirm('确定要中止当前生成任务吗？已发出的请求将被丢弃', '中止确认', {
      confirmButtonText: '中止',
      cancelButtonText: '继续生成',
      type: 'warning',
    })
    genStore.stopBatch()
    stopTimeUpdate()
    addLog('warn', '用户手动中止生成任务')
    ElMessage.success('已中止生成')
  } catch { /* 取消 */ }
}

// ========== 累计任务模式 ==========

async function handleGenerateMultiBatch() {
  successBannerDismissed.value = false
  const config = apiStore.getGenConfig(selectedSiteId.value, selectedModelId.value)
  if (!config) {
    ElMessage.error('请先选择站点和模型')
    return
  }
  if (!genStore.prompt.trim()) {
    ElMessage.error('请输入提示词')
    return
  }
  if (genStore.totalRunningCount >= 10) {
    ElMessage.warning('当前已有 10 个任务同时执行中，请等待部分任务完成后再提交')
    return
  }

  // 快照当前配置（后续修改不影响已提交的批次）
  const batchPrompt = buildPromptWithCharacter(genStore.prompt)
  const batchConfig = { ...config }
  const batchRefImages = await prepareRefsForGenerate()
  const batchSize = imageSize.value
  const batchQuality = imageQuality.value
  const batchConcurrency = Math.min(concurrency.value, generateCount.value)

  const batch = genStore.createMultiBatch(generateCount.value, batchPrompt, batchConfig.siteName, batchConfig.model)
  startTimeUpdate()

  addLog('info', '[累计模式] 新批次已提交', {
    prompt: batchPrompt,
    site: batchConfig.siteName,
    model: batchConfig.model,
    count: generateCount.value,
    concurrency: batchConcurrency,
  })

  // 异步执行，不阻塞 UI（允许用户继续提交下一批）
  runMultiBatch(batch, batchConfig, batchPrompt, batchRefImages, batchSize, batchQuality, batchConcurrency)
}

async function runMultiBatch(batch, config, batchPrompt, batchRefImages, batchSize, batchQuality, batchConcurrency) {
  const taskQueue = [...batch.tasks]
  const running = []

  async function runTask() {
    while (taskQueue.length > 0) {
      if (genStore.isMultiBatchStopped(batch.id)) return
      const task = taskQueue.shift()
      if (!task) return

      // 等待全局并发槽位（所有批次合计不超过 10）
      while (genStore.totalRunningCount >= 10) {
        if (genStore.isMultiBatchStopped(batch.id)) return
        await new Promise(r => setTimeout(r, 300))
      }

      task.status = 'running'
      task.startTime = Date.now()

      try {
        const result = await generateImage({
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          model: config.model,
          prompt: batchPrompt,
          referenceImages: batchRefImages && batchRefImages.length > 0 ? batchRefImages : null,
          size: batchSize,
          apiType: config.apiType,
          customEndpoint: config.endpoint,
          quality: batchQuality,
        })

        if (genStore.isMultiBatchStopped(batch.id)) {
          addLog('info', '批次已被中止，丢弃返回结果')
          return
        }

        if (result.data && result.data.length > 0) {
          for (const item of result.data) {
            let dataUrl = ''
            if (item.b64_json) {
              dataUrl = toDataUrl(item.b64_json)
            } else if (item.url) {
              try {
                dataUrl = await downloadImageAsBase64(item.url)
              } catch (dlErr) {
                addLog('warn', '图片下载失败，使用远程URL', dlErr.message)
                dataUrl = item.url
              }
            }

            if (genStore.isMultiBatchStopped(batch.id)) return

            if (dataUrl) {
              const imageRecord = {
                id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
                name: `生成_${new Date().toLocaleString('zh-CN').replace(/[/:]/g, '-')}`,
                dataUrl,
                prompt: batchPrompt,
                model: config.model,
                siteName: config.siteName,
                size: batchSize,
                apiType: config.apiType,
                hasReference: batchRefImages && batchRefImages.length > 0,
                createdAt: new Date().toISOString(),
                favorite: false,
                album: '',
              }
              await galleryStore.addGeneratedImage(imageRecord)
            }
          }
        }

        task.status = 'success'
        task.endTime = Date.now()
        addLog('info', `[批次] 任务 #${task.id} 生成成功`)
      } catch (err) {
        if (genStore.isMultiBatchStopped(batch.id)) return
        let errMsg = err.response?.data?.error?.message || err.message || '未知错误'
        try {
          if (/^[A-Za-z0-9+/=]{4,}$/.test(errMsg) && errMsg.length % 4 <= 1) {
            const decoded = atob(errMsg)
            if (/^[\x20-\x7E\u4e00-\u9fff\s]+$/.test(decoded)) errMsg = decoded
          }
        } catch { /* 不是 base64 */ }
        task.status = 'failed'
        task.endTime = Date.now()
        task.error = errMsg
        addLog('error', `[批次] 任务 #${task.id} 失败`, {
          error: errMsg,
          status: err.response?.status,
          data: err.response?.data,
        })
      }
    }
  }

  for (let i = 0; i < batchConcurrency; i++) {
    running.push(runTask())
  }

  await Promise.all(running)

  if (!genStore.isMultiBatchStopped(batch.id)) {
    genStore.endMultiBatch(batch.id)
    const successCount = batch.tasks.filter(t => t.status === 'success').length
    if (successCount > 0) {
      ElMessage.success(`批次完成，成功生成 ${successCount} 张图片`)
      // 播放提示音
      if (themeStore.workflowSoundEnabled) {
        import('@/utils/notificationSound').then(({ playNotificationSound }) => {
          playNotificationSound()
        })
      }
    }
  }

  if (!genStore.hasRunningBatches) {
    stopTimeUpdate()
  }
}

function handleStopMultiBatch(batchId) {
  genStore.stopMultiBatch(batchId)
  addLog('warn', '用户手动中止批次任务')
  if (!genStore.hasRunningBatches) {
    stopTimeUpdate()
  }
}

function formatBatchElapsed(batch) {
  if (!batch.startTime) return '0 秒'
  const end = batch.endTime || currentTime.value
  return formatElapsed(end - batch.startTime)
}
</script>

<style scoped>
.generate-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 16px;
}

/* ===== 上半部分 ===== */
.gen-top {
  display: flex;
  gap: 20px;
  flex: 1;
  min-height: 0;
}

.gen-params {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 16px;
  overflow-y: auto;
}

.param-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.param-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.param-row {
  display: flex;
  gap: 12px;
}

/* 参考图 */
.param-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ref-image-area {
  width: 100%;
}

.ref-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ref-thumb {
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--border-color);
}

.ref-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ref-remove {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity var(--transition);
}

.ref-thumb:hover .ref-remove {
  opacity: 1;
}

.ref-add {
  width: 72px;
  height: 72px;
  border: 2px dashed var(--border-color);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition);
}

.ref-add:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.ref-upload {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 24px;
  border: 2px dashed var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition);
}

.ref-upload:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

/* 右侧主区域 */
.gen-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.prompt-area {
  display: flex;
  gap: 12px;
  align-items: stretch;
}

.prompt-area :deep(.el-textarea__inner) {
  background: var(--bg-card);
  border-color: var(--border-color);
  color: var(--text-primary);
  border-radius: var(--radius-sm);
}

.gen-btn {
  flex: 1;
  padding: 0 28px;
  font-size: 16px;
  font-weight: 600;
  border-radius: var(--radius-sm);
}

.gen-btn.el-button--primary:not(:disabled) {
  background: var(--accent-color) !important;
  border-color: var(--accent-color) !important;
  color: #fff !important;
}

.gen-btn.el-button--primary:not(:disabled):hover {
  background: var(--accent-hover) !important;
  border-color: var(--accent-hover) !important;
}

/* 中止按钮专属红色 */
.stop-btn:not(:disabled) {
  background: #ef4444 !important;
  border-color: #ef4444 !important;
  color: #fff !important;
}

.stop-btn:not(:disabled):hover {
  background: #dc2626 !important;
  border-color: #dc2626 !important;
}

.prompt-btns {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
  width: 120px;
}

.prompt-btns .el-button {
  width: 100%;
  margin: 0;
}

.assist-btn,
.log-btn {
  border-radius: var(--radius-sm);
  font-size: 13px;
  width: 100%;
  box-sizing: border-box;
}

/* 任务监控面板 */
.status-area {
  flex: 1;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 16px;
  overflow-y: auto;
  min-height: 200px;
  display: flex;
  flex-direction: column;
}

.status-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 180px;
  color: var(--text-muted);
  gap: 12px;
  font-size: 14px;
}

.status-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* 成功提示 */
.success-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(34, 197, 94, 0.12);
  border: 1px solid rgba(34, 197, 94, 0.4);
  border-radius: var(--radius-sm);
  color: #16a34a;
  font-size: 13px;
  font-weight: 500;
}

.success-banner-text {
  flex: 1;
}

.success-banner-close {
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: currentColor;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.6;
  transition: opacity 0.2s;
  flex-shrink: 0;
}

.success-banner-close:hover {
  opacity: 1;
}

/* 头部 */
.status-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.status-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.status-desc {
  font-size: 12px;
  color: var(--text-muted);
}

.status-elapsed {
  padding: 4px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 999px;
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

/* 统计卡片 */
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.stat-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 12px 10px;
  text-align: center;
  transition: all var(--transition);
}

.stat-num {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}

.stat-label {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
}

.stat-card--running .stat-num { color: #3b82f6; }
.stat-card--success .stat-num { color: #16a34a; }
.stat-card--failed .stat-num { color: #ef4444; }

/* 任务列表 */
.task-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.task-item {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  border-left: 3px solid var(--text-muted);
  transition: all var(--transition);
  min-width: 0;
  overflow: hidden;
}

.task-item--running {
  border-left-color: #3b82f6;
  background: rgba(59, 130, 246, 0.06);
}
.task-item--success {
  border-left-color: #16a34a;
}
.task-item--failed,
.task-item--stopped {
  border-left-color: #ef4444;
  background: rgba(239, 68, 68, 0.05);
}

.task-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.task-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.task-num {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.task-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-secondary);
}

.task-item--running .task-tag {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}
.task-item--success .task-tag {
  background: rgba(34, 197, 94, 0.15);
  color: #16a34a;
}
.task-item--failed .task-tag,
.task-item--stopped .task-tag {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.task-duration {
  font-size: 12px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.task-error {
  margin-top: 6px;
  padding: 6px 10px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 4px;
  font-size: 12px;
  color: #ef4444;
  word-break: break-all;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ===== 下半部分 ===== */
.gen-bottom {
  display: flex;
  gap: 16px;
  height: 280px;
  flex-shrink: 0;
}

.bottom-panel {
  flex: 1;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  flex-shrink: 0;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.panel-count {
  font-size: 12px;
  color: var(--text-muted);
}

/* 面板网格 - 方格模式 */
.panel-grid--square {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  grid-auto-rows: 100px;
  gap: 8px;
  overflow-y: auto;
  overflow-x: hidden;
  flex: 1;
}

.panel-grid--square .panel-thumb {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--border-color);
  cursor: pointer;
}

.panel-grid--square .panel-thumb img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 面板网格 - 瀑布流模式 */
.panel-grid--masonry {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  overflow-y: auto;
  overflow-x: hidden;
  flex: 1;
  align-content: flex-start;
}

.panel-grid--masonry .panel-thumb {
  position: relative;
  height: 140px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--border-color);
  cursor: pointer;
}

.panel-grid--masonry .panel-thumb img {
  height: 100%;
  width: auto;
  display: block;
}

.thumb-delete {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: rgba(239, 68, 68, 0.9);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity var(--transition);
  z-index: 2;
}

.panel-thumb:hover .thumb-delete {
  opacity: 1;
}

.thumb-delete:hover {
  background: rgb(220, 38, 38);
}

/* 缩略图悬浮操作 */
.thumb-actions {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  gap: 4px;
  padding: 4px;
  background: rgba(0, 0, 0, 0.65);
  opacity: 0;
  transition: opacity var(--transition);
}

.panel-thumb:hover .thumb-actions {
  opacity: 1;
}

.thumb-actions button {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.15);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background var(--transition);
}

.thumb-actions button:hover {
  background: var(--accent-color);
}

.panel-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--text-muted);
  font-size: 13px;
}

/* ===== 竖向布局 ===== */
.generate-page--vertical {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  height: 100%;
  min-width: 0;
}

/* 左列：参数 + 提示词 + 任务监控 垂直堆叠 */
.generate-page--vertical .gen-top {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.generate-page--vertical .gen-params {
  width: 100%;
  flex-shrink: 0;
  overflow-y: visible;
}

.generate-page--vertical .gen-main {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* 任务监控在竖向模式下跟随内容撑高 */
.generate-page--vertical .status-area {
  overflow: visible;
  min-height: 200px;
  height: auto;
  flex: 0 0 auto;
}

/* 右列：最近生成 + 参考图 上下排列 */
.generate-page--vertical .gen-bottom {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: auto;
  min-height: 0;
  min-width: 0;
}

.generate-page--vertical .gen-bottom .bottom-panel {
  flex: 1;
  min-height: 0;
}

/* 提示词区域：textarea 在上，按钮组横向排在下 */
.generate-page--vertical .prompt-area {
  flex-direction: column;
  align-items: stretch;
}

/* 按钮组横向 + 等宽 */
.generate-page--vertical .prompt-btns {
  flex-direction: row;
  width: 100%;
  gap: 8px;
}

.generate-page--vertical .prompt-btns .el-button {
  flex: 1 1 0;
  width: auto;
  min-height: 40px;
  margin: 0;
}

.generate-page--vertical .gen-btn {
  flex: 1 1 0;
  min-height: 40px;
  padding: 0;
}

.generate-page--vertical .assist-btn,
.generate-page--vertical .log-btn {
  flex: 1 1 0;
  min-height: 40px;
  width: auto;
}

/* 任务列表防溢出 */
.generate-page--vertical .task-list {
  min-width: 0;
}

.generate-page--vertical .task-item {
  min-width: 0;
  overflow: hidden;
}

.generate-page--vertical .task-row {
  min-width: 0;
}

.generate-page--vertical .stats-row {
  min-width: 0;
}

/* ===== 批次卡片（累计任务模式） ===== */
.batch-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.batch-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 14px;
  border-left: 3px solid var(--border-color);
  transition: all var(--transition);
}

.batch-card--running {
  border-left-color: #3b82f6;
  background: rgba(59, 130, 246, 0.04);
}

.batch-card--done {
  border-left-color: #16a34a;
}

.batch-card--stopped {
  border-left-color: #ef4444;
  opacity: 0.75;
}

.batch-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px dashed var(--border-color);
}

.batch-info {
  flex: 1;
  min-width: 0;
}

.batch-prompt {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-all;
}

.batch-elapsed {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
  display: block;
}

.batch-meta {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-stop-btn:not(:disabled) {
  background: #ef4444 !important;
  border-color: #ef4444 !important;
  color: #fff !important;
}

.batch-stop-btn:not(:disabled):hover {
  background: #dc2626 !important;
  border-color: #dc2626 !important;
}

.batch-done-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 999px;
  white-space: nowrap;
  flex-shrink: 0;
}

.tag--done {
  background: rgba(34, 197, 94, 0.15);
  color: #16a34a;
}

.tag--stopped {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.batch-task-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* 竖向布局兼容 */
.generate-page--vertical .batch-list {
  min-width: 0;
}

.generate-page--vertical .batch-card {
  min-width: 0;
  overflow: hidden;
}

.status-elapsed-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.clear-history-btn:not(:disabled) {
  background: rgba(239, 68, 68, 0.1) !important;
  border-color: #ef4444 !important;
  color: #ef4444 !important;
}

.clear-history-btn:not(:disabled):hover {
  background: #ef4444 !important;
  border-color: #ef4444 !important;
  color: #fff !important;
}

/* ===== 角色卡选择 ===== */
.char-select-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 18px;
  border: 2px dashed var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition);
}

.char-select-area:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.char-selected-card {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 8px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--accent-color);
  border-radius: var(--radius-sm);
}

.char-selected-img {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-sm);
  object-fit: cover;
  border: 1px solid var(--border-color);
  flex-shrink: 0;
}

.char-selected-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.char-selected-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.char-selected-meta {
  font-size: 11px;
  color: var(--text-muted);
}

/* 角色卡选择弹窗 */
.char-select-dialog-body {
  max-height: 50vh;
  overflow-y: auto;
}

.char-select-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 10px;
}

.char-select-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px;
  border: 2px solid var(--border-color);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
}

.char-select-item:hover {
  border-color: var(--accent-color);
}

.char-select-item--active {
  border-color: var(--accent-color);
  background: var(--accent-light);
}

.char-select-item-img {
  width: 80px;
  height: 100px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--bg-secondary);
}

.char-select-item-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.char-select-item-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.char-select-item-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.char-select-empty {
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
  padding: 30px;
}

/* ===== 拖拽上传高亮 ===== */
.ref-upload--dragover {
  border-color: var(--accent-color) !important;
  background: var(--accent-light) !important;
  color: var(--accent-color) !important;
}

.ref-list--dragover {
  outline: 2px dashed var(--accent-color);
  outline-offset: -2px;
  background: var(--accent-light);
  border-radius: var(--radius-sm);
}

/* 我的参考图拖拽上传 */
.panel-empty--droppable {
  cursor: pointer;
  transition: all 0.2s;
}

.panel-empty--dragover {
  background: var(--accent-light) !important;
  color: var(--accent-color) !important;
  outline: 2px dashed var(--accent-color);
  outline-offset: -2px;
  border-radius: var(--radius-sm);
}

.panel-grid--dragover {
  outline: 2px dashed var(--accent-color);
  outline-offset: -2px;
  background: var(--accent-light);
  border-radius: var(--radius-sm);
}
</style>