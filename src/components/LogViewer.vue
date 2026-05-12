<template>
  <el-dialog
    v-model="visible"
    title="运行日志"
    width="700px"
    top="5vh"
    :close-on-click-modal="true"
  >

    <div class="log-tip">
      ⚠️ 如果报错：This operation was aborted，是因图片生成时间过长被自动终止，请前往设置页面调整生成页超时时间
    </div>
    <div class="log-toolbar">
      <el-radio-group v-model="logFilter" size="small">
        <el-radio-button value="all">全部</el-radio-button>
        <el-radio-button value="error">错误</el-radio-button>
        <el-radio-button value="warn">警告</el-radio-button>
        <el-radio-button value="info">信息</el-radio-button>
      </el-radio-group>
      <div class="toolbar-right">
        <el-button size="small" @click="showErrorRef = true">
          <el-icon><QuestionFilled /></el-icon> 常见报错对照
        </el-button>
        <el-button size="small" @click="handleClear" type="danger" plain>
          <el-icon><Delete /></el-icon> 清空日志
        </el-button>
      </div>
    </div>

    <div class="log-list">
      <div v-if="filteredLogs.length === 0" class="log-empty">
        暂无日志记录
      </div>
      <div
        v-for="log in filteredLogs"
        :key="log.id"
        class="log-item"
        :class="`log-item--${log.level}`"
      >
        <div class="log-header">
          <span class="log-level">{{ levelLabel(log.level) }}</span>
          <span class="log-time">{{ formatTime(log.time) }}</span>
        </div>
        <div class="log-message">{{ log.message }}</div>
        <div v-if="log.detail" class="log-detail">
          <button class="detail-toggle" @click="toggleExpand(log.id)">
            {{ isExpanded(log.id, log.level) ? '收起详情' : '查看详情' }}
          </button>
          <pre v-if="isExpanded(log.id, log.level)" class="detail-content">{{ log.detail }}</pre>
        </div>
      </div>
    </div>
    <!-- 常见报错对照 -->
    <el-dialog
      v-model="showErrorRef"
      title="常见报错对照"
      width="640px"
      top="8vh"
      append-to-body
    >
      <div class="err-ref-intro">
        以下是使用中转 API 时常见的错误代码及可能原因，仅供参考。具体请以实际站点的错误信息为准。
      </div>
      <div class="err-ref-list">
        <div
          v-for="item in errorRefList"
          :key="item.code"
          class="err-ref-item"
        >
          <div class="err-ref-header">
            <span class="err-ref-code" :class="`err-ref-code--${item.level}`">{{ item.code }}</span>
            <span class="err-ref-name">{{ item.name }}</span>
          </div>
          <div class="err-ref-desc">{{ item.desc }}</div>
          <div v-if="item.solution" class="err-ref-solution">
            <span class="solution-label">💡 建议：</span>{{ item.solution }}
          </div>
        </div>
      </div>
    </el-dialog>
  </el-dialog>
</template>

<script setup>
import { ref, computed } from 'vue'
import { getLogs, clearLogs } from '@/utils/logger'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, QuestionFilled } from '@element-plus/icons-vue'

const visible = defineModel({ type: Boolean, default: false })

const logFilter = ref('all')
const expandedIds = ref(new Set())

const showErrorRef = ref(false)

const errorRefList = [
  {
    code: '400',
    name: 'Bad Request',
    level: 'warn',
    desc: '请求参数不合法，常见于模型名不支持、尺寸不支持、提示词违规等',
    solution: '检查模型名是否拼写正确、尺寸是否为该模型支持的值、提示词是否触发了内容审核',
  },
  {
    code: '401',
    name: 'Unauthorized',
    level: 'error',
    desc: 'API Key 无效或未授权',
    solution: '检查 API Key 是否正确、是否已过期、是否以 sk- 开头',
  },
  {
    code: '402',
    name: 'Payment Required',
    level: 'error',
    desc: '账户余额不足或需要付费',
    solution: '登录站点检查余额，或联系站点管理员充值',
  },
  {
    code: '403',
    name: 'Forbidden',
    level: 'error',
    desc: '被站点拒绝访问，可能是 IP 被封、区域限制或 Key 权限不足',
    solution: '检查网络环境（可能需要代理）、联系站点确认 Key 权限',
  },
  {
    code: '404',
    name: 'Not Found',
    level: 'warn',
    desc: '接口路径错误，或该模型不存在',
    solution: '检查 Base URL 是否正确（通常以 /v1 结尾）、接口类型（图片/Chat/Responses）是否匹配、模型名是否存在于该站点',
  },
  {
    code: '408',
    name: 'Request Timeout',
    level: 'warn',
    desc: '请求在规定时间内未完成',
    solution: '稍后重试，或减少同时并发的数量',
  },
  {
    code: '413',
    name: 'Payload Too Large',
    level: 'warn',
    desc: '请求体过大，通常是参考图过大',
    solution: '压缩或缩小参考图再试',
  },
  {
    code: '429',
    name: 'Too Many Requests',
    level: 'warn',
    desc: '触发了速率限制（RPM/TPM），短时间请求太多',
    solution: '降低并发数、降低生成数量，或稍等片刻再试',
  },
  {
    code: '500',
    name: 'Internal Server Error',
    level: 'error',
    desc: '上游服务器内部错误',
    solution: '通常是站点或上游模型的临时故障，稍后重试即可',
  },
  {
    code: '502',
    name: 'Bad Gateway',
    level: 'error',
    desc: '中转站与上游服务之间通信失败',
    solution: '上游 API 可能暂时不可用，稍后重试；或尝试更换站点/模型',
  },
  {
    code: '503',
    name: 'Service Unavailable',
    level: 'error',
    desc: '服务暂时不可用，通常是过载或维护中',
    solution: '稍后重试，或更换到其他站点',
  },
  {
    code: '504',
    name: 'Gateway Timeout',
    level: 'error',
    desc: '网关超时，通常是上游模型响应过慢',
    solution: '图片生成耗时较长时常见，稍后重试；4K 等大尺寸更容易触发',
  },
  {
    code: '520',
    name: 'Web Server Returned an Unknown Error',
    level: 'error',
    desc: 'Cloudflare 收到源站异常响应',
    solution: '通常是站点上游问题，稍后重试',
  },
  {
    code: '521',
    name: 'Web Server Is Down',
    level: 'error',
    desc: 'Cloudflare 无法连接到源站',
    solution: '站点服务器离线，稍后重试',
  },
  {
    code: '524',
    name: 'A Timeout Occurred',
    level: 'error',
    desc: 'Cloudflare 与源站之间超时（通常超过 100 秒）',
    solution: '非常常见于大尺寸/高质量图片生成，降低尺寸或质量后重试',
  },
  {
    code: 'ECONNRESET',
    name: 'Connection Reset',
    level: 'error',
    desc: '网络连接被重置',
    solution: '检查网络、代理是否正常，或稍后重试',
  },
  {
    code: 'ETIMEDOUT',
    name: 'Connection Timeout',
    level: 'error',
    desc: '连接超时',
    solution: '检查网络连接、代理设置，确认站点 URL 可正常访问',
  },
  {
    code: 'ENOTFOUND',
    name: 'DNS Lookup Failed',
    level: 'error',
    desc: '无法解析域名',
    solution: '检查 Base URL 拼写是否正确、DNS 是否正常',
  },
  {
    code: '未找到图片',
    name: '模型返回中未找到图片内容',
    level: 'warn',
    desc: '请求成功但解析不到图片数据',
    solution: '确认该模型支持生图；Chat/Responses 接口需要模型本身具备生图能力（如 gpt-4o、gpt-5.x）',
  },
  {
    code: 'CORS',
    name: '跨域被拦截',
    level: 'error',
    desc: '浏览器跨域限制',
    solution: '本应用已走 Electron 主进程代理，理论上不会遇到；如果看到请联系开发者',
  },
]

const filteredLogs = computed(() => {
  const logs = getLogs()
  if (logFilter.value === 'all') return logs
  return logs.filter(l => l.level === logFilter.value)
})

function toggleExpand(id) {
  const newSet = new Set(expandedIds.value)
  if (newSet.has(id)) {
    newSet.delete(id)
  } else {
    newSet.add(id)
  }
  expandedIds.value = newSet
}

function isExpanded(id, level) {
  const toggled = expandedIds.value.has(id)
  // 错误级别默认展开，点击可收起；其他级别默认收起，点击可展开
  return level === 'error' ? !toggled : toggled
}

function levelLabel(level) {
  return { info: '信息', warn: '警告', error: '错误' }[level] || level
}

function formatTime(time) {
  if (!time) return ''
  const d = new Date(time)
  return d.toLocaleString('zh-CN')
}

async function handleClear() {
  try {
    await ElMessageBox.confirm('确定要清空所有日志吗？', '清空确认', {
      confirmButtonText: '清空',
      cancelButtonText: '取消',
      type: 'warning',
    })
    clearLogs()
    expandedIds.value = new Set()
    ElMessage.success('日志已清空')
  } catch { /* 取消 */ }
}
</script>

<style scoped>
.log-tip {
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.4);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  font-size: 12px;
  color: #b45309;
  line-height: 1.5;
  margin-bottom: 12px;
}

.log-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.log-list {
  max-height: 500px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log-empty {
  text-align: center;
  padding: 40px;
  color: var(--text-muted);
  font-size: 14px;
}

.log-item {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  border-left: 3px solid;
  background: var(--bg-secondary);
}

.log-item--info {
  border-left-color: #3b82f6;
}

.log-item--warn {
  border-left-color: #f59e0b;
}

.log-item--error {
  border-left-color: #ef4444;
}

.log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.log-level {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.log-item--info .log-level { color: #3b82f6; }
.log-item--warn .log-level { color: #f59e0b; }
.log-item--error .log-level { color: #ef4444; }

.log-time {
  font-size: 11px;
  color: var(--text-muted);
}

.log-message {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.4;
}

.log-detail {
  margin-top: 6px;
}

.detail-toggle {
  border: none;
  background: transparent;
  color: var(--accent-color);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}

.detail-toggle:hover {
  text-decoration: underline;
}

.detail-content {
  margin-top: 6px;
  padding: 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow-y: auto;
}
.toolbar-right {
  display: flex;
  gap: 8px;
}

.err-ref-intro {
  font-size: 13px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  margin-bottom: 12px;
  line-height: 1.5;
}

.err-ref-list {
  max-height: 60vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.err-ref-item {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
}

.err-ref-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.err-ref-code {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 4px;
  background: var(--bg-card);
}

.err-ref-code--error {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.err-ref-code--warn {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

.err-ref-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.err-ref-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-bottom: 6px;
}

.err-ref-solution {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
  padding-top: 6px;
  border-top: 1px dashed var(--border-color);
}

.solution-label {
  font-weight: 600;
  color: var(--accent-color);
}
</style>