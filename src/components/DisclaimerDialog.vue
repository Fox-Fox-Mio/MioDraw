<template>
  <el-dialog
    v-model="visible"
    title="MioDraw 软件免责声明"
    width="700px"
    top="10vh"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
    class="disclaimer-dialog"
  >
    <div class="disclaimer-content">
      <p>欢迎使用 <strong>MioDraw</strong>（以下简称“本软件”）。在使用本软件之前，请您务必仔细阅读并理解本免责声明的全部内容。当您点击同意后，即视为您已完全同意并接受本声明的全部条款。</p>
      
      <h4>1. 非商业用途声明</h4>
      <p>本软件为个人开发者利用业余时间开发的免费分享工具，<strong>仅供个人学习、研究、交流和技术体验使用，严禁用于任何商业营利目的</strong>。因用户擅自进行商业化操作而引发的任何纠纷或经济损失，由用户自行承担。</p>
      
      <h4>2. 本地客户端性质与隐私安全</h4>
      <p><strong>接口中转</strong>：本软件仅提供一个图形化用户界面（GUI）客户端，<strong>本软件本身不包含、不提供、也不出售任何云端 AI 绘画大模型服务</strong>。用户需自行配置合法的第三方 API 接口及密钥。</p>
      <p><strong>数据本地化</strong>：您的 API Key、提示词、生成的图片以及相册数据，均<strong>完全保存在您本人的电脑本地</strong>。软件绝不会收集、上传或监控您的任何隐私数据。</p>
      
      <h4>3. AI 生成内容合规与版权约束</h4>
      <p><strong>内容责任</strong>：本软件展示的文字回复与生成的图片，均由您配置的第三方 AI 模型及接口直接返回。<strong>软件作者无法对生成的内容进行实质性控制或审查</strong>。</p>
      <p><strong>合法合规</strong>：用户在使用本软件时，必须严格遵守所在国家或地区的法律法规。<strong>严禁利用本软件生成、传播涉及色情、暴力、血腥、政治敏感、侵犯他人隐私或违背公序良俗的非法内容</strong>。</p>
      
      <h4>4. 内置第三方组件与插件</h4>
      <p>本软件内置了用于本地图片高清超分的开源引擎。该引擎版权归其原作者所有。本软件仅为方便用户体验而进行本地调用，请遵守相关开源协议。</p>
      
      <h4>5. 软件“按原样”提供</h4>
      <p>本软件按<strong>“原样”（As Is）</strong>提供。作者不对软件的绝对稳定性、无错误、无中断作出保证。因系统兼容性问题等原因导致的崩溃或数据损坏，作者不承担任何赔偿责任（建议定期备份图片数据）。</p>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button type="danger" plain @click="handleReject">
          拒绝并退出
        </el-button>
        <el-button 
          type="primary" 
          @click="handleAccept" 
          :disabled="countdown > 0"
        >
          我已知悉并同意上述所有内容 {{ countdown > 0 ? `(${countdown}s)` : '' }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const visible = ref(false)
const countdown = ref(5)
let timer = null

// 暴露给父组件的方法
const checkDisclaimer = async () => {
  // 从文件系统读取用户的同意记录，避免 localStorage 丢失
  let hasAgreed = false
  try {
    if (window.electronAPI?.loadData) {
      const res = await window.electronAPI.loadData('agreed-disclaimer')
      if (res?.success && res.data === true) {
        hasAgreed = true
      }
    }
  } catch { /* ignore */ }

  if (!hasAgreed) {
    visible.value = true
    startCountdown()
  }
}

defineExpose({ checkDisclaimer })

function startCountdown() {
  countdown.value = 5
  timer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(timer)
    }
  }, 1000)
}

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

async function handleAccept() {
  if (countdown.value > 0) return
  
  try {
    if (window.electronAPI?.saveData) {
      await window.electronAPI.saveData('agreed-disclaimer', true)
    }
  } catch { /* ignore */ }
  
  visible.value = false
}

function handleReject() {
  if (window.electronAPI?.quitApp) {
    window.electronAPI.quitApp()
  } else {
    window.close() // 兜底
  }
}
</script>

<style scoped>
.disclaimer-dialog :deep(.el-dialog__header) {
  border-bottom: 1px solid var(--border-color);
  margin-right: 0;
  padding-bottom: 16px;
}

.disclaimer-content {
  max-height: 50vh;
  overflow-y: auto;
  padding-right: 10px;
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.disclaimer-content h4 {
  color: var(--text-primary);
  margin-top: 16px;
  margin-bottom: 8px;
  font-size: 15px;
}

.disclaimer-content p {
  margin-bottom: 10px;
}

.disclaimer-content strong {
  color: var(--accent-color);
}

.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 10px;
}

/* 美化滚动条 */
.disclaimer-content::-webkit-scrollbar {
  width: 6px;
}
.disclaimer-content::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}
</style>