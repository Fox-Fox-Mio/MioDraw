<template>
  <el-dialog
    v-model="visible"
    title="下载背景去除模型"
    width="560px"
    :close-on-click-modal="false"
  >
    <div class="dl-body">
      <div class="dl-intro">
        首次使用其他背景去除模型需要下载对应的 AI 模型文件。请选择需要的模型和下载源。已安装的模型可以点击右侧「删除」按钮卸载以释放空间。
      </div>

      <!-- 模型选择 -->
      <div class="dl-section">
        <div class="dl-section-title">选择模型</div>
        <div class="dl-model-list">
          <label
            v-for="m in modelOptions"
            :key="m.id"
            class="dl-model-item"
            :class="{
              'dl-model-item--selected': selectedModels.includes(m.id),
              'dl-model-item--builtin': m.builtin,
            }"
          >
            <el-checkbox
              :model-value="selectedModels.includes(m.id)"
              @change="(val) => toggleModel(m.id, val)"
              :disabled="m.builtin"
            />
            <div class="dl-model-info">
              <span class="dl-model-name">
                {{ m.name }}
                <span v-if="m.builtin" class="dl-model-builtin-tag">已安装</span>
              </span>
              <span class="dl-model-desc">{{ m.desc }}</span>
            </div>
            <span class="dl-model-size">{{ m.size }}</span>
            <el-button
              v-if="modelInstalledMap[m.id]"
              text type="danger" size="small"
              class="dl-model-delete-btn"
              @click.prevent.stop="handleDeleteModel(m)"
            >
              删除
            </el-button>
          </label>
        </div>
      </div>

      <!-- 下载源 -->
      <div class="dl-section">
        <div class="dl-section-title">下载源</div>
        <el-radio-group v-model="downloadSource">
          <el-radio value="mirror">国内镜像源（推荐）</el-radio>
          <el-radio value="github">GitHub 官方源</el-radio>
          <el-radio value="baidu">百度网盘（手动下载）</el-radio>
          <el-radio value="quark">夸克网盘（手动下载）</el-radio>
        </el-radio-group>

        <!-- 网盘地址提示 -->
        <div v-if="downloadSource === 'baidu'" class="dl-manual-info">
          <div class="dl-manual-link">
            链接：https://pan.baidu.com/s/1-RVGhtmlVYhzUl7N-YsCLA?pwd=0721 
            <br>提取码：0721
          </div>
          <div class="dl-manual-hint">
            下载好的模型文件（.onnx）直接放在 MioDraw\resources\bg-remover\models 文件夹下即可
          </div>
        </div>
        <div v-if="downloadSource === 'quark'" class="dl-manual-info">
          <div class="dl-manual-link">
            链接：https://pan.quark.cn/s/92e1057a2cd5
            <br>提取码：tux5
          </div>
          <div class="dl-manual-hint">
            下载好的模型文件（.onnx）直接放在 MioDraw\resources\bg-remover\models 文件夹下即可
          </div>
        </div>
      </div>

      <!-- 预估大小 -->
      <div v-if="isAutoDownloadSource" class="dl-summary">
        已选择 {{ selectedModels.length }} 个模型，预估下载大小约 {{ estimatedSize }}
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">{{ isAutoDownloadSource ? '取消' : '关闭' }}</el-button>
      <el-button
        v-if="isAutoDownloadSource"
        type="primary"
        :disabled="selectedModels.length === 0"
        @click="handleStart"
      >
        开始下载
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const visible = defineModel({ type: Boolean, default: false })
const emit = defineEmits(['start'])

const props = defineProps({
  requiredModel: { type: String, default: '' },
})

const modelOptionsBase = [
  { id: 'u2net', name: 'u2net', desc: '经典通用模型', size: '~170MB', defaultBuiltin: false },
  { id: 'isnet-anime', name: 'isnet-anime', desc: '二次元插画推荐', size: '~170MB', defaultBuiltin: false },
  { id: 'isnet-general-use', name: 'isnet-general-use', desc: '通用场景推荐', size: '~170MB', defaultBuiltin: false },
  { id: 'u2netp', name: 'u2netp', desc: '轻量快速版', size: '~4MB', defaultBuiltin: true },
  { id: 'u2net_human_seg', name: 'u2net_human_seg', desc: '真人分割专用', size: '~170MB', defaultBuiltin: false },
  { id: 'silueta', name: 'silueta', desc: '超轻量模型', size: '~170MB', defaultBuiltin: false },
]

const modelOptions = computed(() =>
  modelOptionsBase.map(m => ({
    ...m,
    builtin: m.defaultBuiltin && modelInstalledMap.value[m.id],
  }))
)

const selectedModels = ref([])
const downloadSource = ref('mirror')

const modelInstalledMap = ref({})

// 弹窗打开时检查每个模型是否已安装
watch(visible, async (val) => {
  if (val) {
    selectedModels.value = []
    if (props.requiredModel) {
      const opt = modelOptionsBase.find(m => m.id === props.requiredModel)
      if (opt && !opt.builtin) {
        selectedModels.value = [props.requiredModel]
      }
    }
    // 检查已安装状态
    for (const m of modelOptionsBase) {
      try {
        const result = await window.electronAPI.checkModelExists(m.id)
        modelInstalledMap.value[m.id] = result.exists
      } catch {
        modelInstalledMap.value[m.id] = false
      }
    }
  }
})

const isAutoDownloadSource = computed(() =>
  downloadSource.value === 'mirror' || downloadSource.value === 'github'
)

function toggleModel(id, checked) {
  const opt = modelOptions.value.find(m => m.id === id)
  if (opt?.builtin) return
  if (checked) {
    if (!selectedModels.value.includes(id)) {
      selectedModels.value.push(id)
    }
  } else {
    selectedModels.value = selectedModels.value.filter(m => m !== id)
  }
}

const estimatedSize = computed(() => {
  let mb = 0
  for (const id of selectedModels.value) {
    if (id === 'u2netp') mb += 4
    else mb += 170
  }
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb} MB`
})

function handleStart() {
  emit('start', {
    models: [...selectedModels.value],
    source: downloadSource.value,
  })
  visible.value = false
}

// 弹窗重新打开时会自动刷新安装状态（通过 watch visible）
// 但如果需要在不关闭弹窗的情况下刷新，可以手动调用：
async function refreshInstalledStatus() {
  for (const m of modelOptionsBase) {
    try {
      const result = await window.electronAPI.checkModelExists(m.id)
      modelInstalledMap.value[m.id] = result.exists
    } catch {
      modelInstalledMap.value[m.id] = false
    }
  }
}

defineExpose({ refreshInstalledStatus })

async function handleDeleteModel(m) {
  try {
    const { ElMessageBox, ElMessage } = await import('element-plus')
    await ElMessageBox.confirm(
      `确定要删除模型「${m.name}」吗？删除后如需使用该模型需要重新下载。`,
      '删除模型',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
    const result = await window.electronAPI.deleteModelFile(m.id)
    if (result.success) {
      modelInstalledMap.value[m.id] = false
      ElMessage.success(`模型「${m.name}」已删除`)
    } else {
      ElMessage.error(result.error || '删除失败')
    }
  } catch { /* 取消 */ }
}
</script>

<style scoped>
.dl-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dl-intro {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  padding: 10px 14px;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
}

.dl-section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.dl-model-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dl-model-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
}

.dl-model-item:hover {
  border-color: var(--accent-color);
}

.dl-model-item--selected {
  border-color: var(--accent-color);
  background: var(--accent-light);
}

.dl-model-item--builtin {
  opacity: 0.6;
  cursor: default;
}

.dl-model-item--builtin:hover {
  border-color: var(--border-color);
}

.dl-model-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dl-model-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.dl-model-builtin-tag {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(34, 197, 94, 0.12);
  color: #16a34a;
}

.dl-model-desc {
  font-size: 11px;
  color: var(--text-muted);
}

.dl-model-size {
  font-size: 12px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.dl-summary {
  font-size: 13px;
  color: var(--accent-color);
  font-weight: 500;
  text-align: center;
  padding: 8px;
  background: var(--accent-light);
  border-radius: var(--radius-sm);
}

/* 网盘手动下载提示 */
.dl-manual-info {
  margin-top: 10px;
  padding: 12px 14px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
}

.dl-manual-link {
  font-size: 13px;
  color: var(--text-primary);
  font-family: 'Consolas', 'Monaco', monospace;
  line-height: 1.6;
  word-break: break-all;
  user-select: text;
}

.dl-manual-hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--accent-color);
  line-height: 1.5;
  padding-top: 8px;
  border-top: 1px dashed var(--border-color);
}

.dl-model-delete-btn {
  flex-shrink: 0;
  margin-left: 4px;
}
</style>