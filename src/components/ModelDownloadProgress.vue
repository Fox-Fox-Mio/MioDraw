<template>
  <transition name="slide-down">
    <div v-if="downloadStore.isDownloading || downloadStore.showComplete" class="dl-progress-float">
      <!-- 下载中 -->
      <template v-if="downloadStore.isDownloading">
        <div class="dl-progress-header">
          <el-icon class="is-loading"><Loading /></el-icon>
          <span class="dl-progress-title">正在下载模型 ({{ downloadStore.currentIndex + 1 }}/{{ downloadStore.totalCount }})</span>
          <el-button
            text size="small" type="danger"
            class="dl-cancel-btn"
            @click="handleCancel"
          >
            取消
          </el-button>
        </div>
        <div class="dl-progress-model">{{ downloadStore.currentModelName }}</div>
        <el-progress
          :percentage="downloadStore.percentage"
          :stroke-width="6"
          :show-text="false"
        />
        <div class="dl-progress-info">
          <span>{{ downloadStore.downloadedMB }} / {{ downloadStore.totalMB }} MB</span>
          <span>{{ downloadStore.percentage }}%</span>
        </div>
      </template>

      <!-- 下载完成 -->
      <template v-else-if="downloadStore.showComplete">
        <div class="dl-progress-header dl-progress-header--done">
          <el-icon color="#16a34a"><CircleCheck /></el-icon>
          <span class="dl-progress-title">模型下载完成</span>
          <el-button text size="small" @click="downloadStore.dismiss()">
            <el-icon><Close /></el-icon>
          </el-button>
        </div>
        <div class="dl-progress-done-text">
          背景去除功能已可用
        </div>
      </template>
    </div>
  </transition>
</template>

<script setup>
import { useModelDownloadStore } from '@/stores/modelDownload'
import { Loading, CircleCheck, Close } from '@element-plus/icons-vue'
import { ElMessageBox, ElMessage } from 'element-plus'

async function handleCancel() {
  try {
    await ElMessageBox.confirm(
      '确定要取消下载吗？已下载的部分将被清除。',
      '取消下载',
      { confirmButtonText: '取消下载', cancelButtonText: '继续', type: 'warning' }
    )
    downloadStore.cancelDownload()
    ElMessage.info('下载已取消')
  } catch { /* 继续下载 */ }
}

const downloadStore = useModelDownloadStore()
</script>

<style scoped>
.dl-progress-float {
  position: fixed;
  top: 64px;
  right: 20px;
  width: 300px;
  padding: 14px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dl-progress-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dl-progress-header--done {
  justify-content: space-between;
}

.dl-progress-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.dl-progress-model {
  font-size: 12px;
  color: var(--text-muted);
  font-family: 'Consolas', 'Monaco', monospace;
}

.dl-progress-info {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-muted);
}

.dl-progress-done-text {
  font-size: 12px;
  color: var(--text-secondary);
}

/* 动画 */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}

.dl-cancel-btn {
  margin-left: auto;
  font-weight: 600 !important;
}

.dl-cancel-btn:not(:disabled) {
  background: rgba(239, 68, 68, 0.1) !important;
  border-color: #ef4444 !important;
  color: #ef4444 !important;
}

.dl-cancel-btn:not(:disabled):hover {
  background: #ef4444 !important;
  color: #fff !important;
}
</style>