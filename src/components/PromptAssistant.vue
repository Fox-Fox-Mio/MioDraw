<template>
  <el-dialog v-model="visible" title="优化助手" width="1000px" top="4vh" :close-on-click-modal="false">
    <el-tabs v-model="activeTab" class="assistant-tabs">
      <!-- ===== AI 对话面板 ===== -->
      <el-tab-pane label="AI 对话" name="chat">
        <div class="chat-layout">
          <!-- 左侧：会话列表侧边栏 -->
          <div class="chat-sidebar" :class="{ 'chat-sidebar--collapsed': chatStore.sidebarCollapsed }">
            <div class="sidebar-header">
              <span v-if="!chatStore.sidebarCollapsed">会话列表</span>
              <div class="sidebar-actions">
                <el-button v-if="!chatStore.sidebarCollapsed" size="small" text @click="handleNewSession" title="新建对话">
                  <el-icon><Plus /></el-icon>
                </el-button>
                <el-button size="small" text @click="chatStore.toggleSidebar" title="收起/展开">
                  <el-icon><DArrowLeft v-if="!chatStore.sidebarCollapsed"/><DArrowRight v-else/></el-icon>
                </el-button>
              </div>
            </div>
            <div class="session-list">
              <div
                v-for="s in chatStore.sessions"
                :key="s.id"
                class="session-item"
                :class="{ active: chatStore.activeSessionId === s.id }"
                @click="chatStore.activeSessionId = s.id; chatStore.saveConfig()"
              >
                <el-icon v-if="chatStore.sidebarCollapsed" size="16"><ChatDotRound /></el-icon>
                <span v-else class="session-title" :title="s.title">{{ s.title }}</span>
                <div v-if="!chatStore.sidebarCollapsed" class="session-actions" @click.stop>
                  <el-button text size="small" class="action-btn edit-btn" @click="handleRenameSession(s)" title="重命名">
                    <el-icon><Edit /></el-icon>
                  </el-button>
                  <el-button text type="danger" size="small" class="action-btn delete-btn" @click="handleDeleteSessionById(s.id)" title="删除">
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <!-- 右侧：聊天主区域 -->
          <div class="main-chat-area">
            <!-- 顶部配置栏 -->
            <div class="chat-header">
              <span style="font-weight: 600; font-size: 14px; margin-right: auto;">当前对话：{{ activeSession?.title }}</span>
              
              <el-select v-model="chatStore.activeChatSiteId" placeholder="选择站点" style="width: 140px" size="small" @change="onChatSiteChange">
                <el-option v-for="site in chatStore.chatSites" :key="site.id" :label="site.name" :value="site.id" />
              </el-select>
              
              <el-select v-model="chatStore.activeChatModelId" placeholder="选择模型" style="width: 140px" size="small" :disabled="!chatStore.activeChatSiteId" @change="chatStore.saveConfig()">
                <el-option v-for="model in currentChatModels" :key="model.id" :label="model.name" :value="model.id" />
              </el-select>
            </div>

            <!-- 聊天记录区 -->
            <div class="chat-messages" ref="messagesContainer">
              <div v-if="activeSession?.messages.length === 0" class="chat-empty">
                发送消息或点击下方按钮，开始使用 AI 优化提示词。
              </div>
              <div v-for="(msg, index) in activeSession?.messages" :key="index" :class="['message-wrapper', `message-${msg.role}`]">
                <div class="message-bubble">{{ msg.content }}</div>
                <div class="message-actions">
                  <el-button v-if="msg.role === 'assistant'" text size="small" class="msg-action-btn" @click="copyText(msg.content)" title="复制">
                    <el-icon><DocumentCopy /></el-icon>
                  </el-button>
                  <el-button text type="danger" size="small" class="msg-action-btn" @click="handleDeleteMessage(index)" title="删除消息">
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </div>
              </div>
              <div v-if="isRequesting" class="message-wrapper message-assistant">
                <div class="message-bubble loading-bubble">
                  <el-icon class="is-loading"><Loading /></el-icon> AI 正在思考...
                </div>
              </div>
            </div>

            <!-- 输入区 -->
            <div class="chat-input-area">
              <!-- 已附加图片预览 -->
              <div v-if="attachedImages.length > 0" class="attached-images-row">
                <div v-for="img in attachedImages" :key="img.id" class="attached-thumb">
                  <img :src="img.dataUrl" alt="" />
                  <button class="attached-remove" @click="removeAttachedImage(img.id)">
                    <el-icon :size="10"><Close /></el-icon>
                  </button>
                </div>
                <div class="attached-hint">{{ attachedImages.length }} 张图片将随下次消息发送</div>
              </div>
              <div class="input-row">
                <div class="input-col">
                  <el-input
                    v-model="inputText"
                    type="textarea"
                    :rows="3"
                    resize="none"
                    placeholder="输入你想让 AI 帮忙写的内容，按 Ctrl+Enter 发送..."
                    @keydown.ctrl.enter.prevent="handleSend"
                  />
                  <div class="input-toolbar">
                    <el-button text size="small" class="attach-btn" @click="selectAttachImage" :disabled="isRequesting">
                      <el-icon><PictureFilled /></el-icon> 添加图片
                    </el-button>
                    <span v-if="refImages.length > 0" class="ref-hint">
                      页面已有 {{ refImages.length }} 张参考图，一键优化时将自动附带
                    </span>
                  </div>
                </div>
                <div class="right-action-group">
                  <!-- 发送按钮 -->
                  <el-button v-if="!isRequesting" type="primary" class="send-btn" :disabled="!inputText.trim()" @click="handleSend">
                    <el-icon><Position /></el-icon> 发送
                  </el-button>
                  <!-- 中止按钮 -->
                  <el-button v-else type="danger" class="send-btn stop-btn" @click="handleStopChat">
                    <el-icon><CircleClose /></el-icon> 中止
                  </el-button>

                  <el-button class="optimize-btn" type="primary" plain size="small" @click="handleOneClickOptimize" :disabled="isRequesting">
                    <div class="optimize-btn-text">
                      <span>一键优化当前</span>
                      <span>{{ mode === 'workflow' ? '规划提示词' : '生图提示词' }}</span>
                    </div>
                  </el-button>
                </div>
              </div>
              <input
                ref="attachFileInput"
                type="file"
                accept="image/*"
                multiple
                style="display: none"
                @change="onAttachFileSelected"
              />
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- ===== 提示词预设面板 ===== -->
      <el-tab-pane label="生图提示词预设" name="presets">
        <div class="presets-container">
          <div v-for="(preset, index) in presets" :key="index" class="preset-card">
            <div class="preset-header">
              <span class="preset-title">{{ preset.title }}</span>
              <el-button size="small" @click="copyText(preset.prompt)"><el-icon><DocumentCopy /></el-icon> 复制</el-button>
            </div>
            <div class="preset-content">{{ preset.prompt }}</div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </el-dialog>
</template>

<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import { useApiStore } from '@/stores/api'
import { useChatStore } from '@/stores/chat'
import { useGenerationStore } from '@/stores/generation'
import { useWorkflowStore } from '@/stores/workflow'
import { sendChatMessageStream } from '@/utils/chatApi'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete, Edit, Position, Loading, DocumentCopy, DArrowLeft, DArrowRight, CircleClose, ChatDotRound, PictureFilled, Close } from '@element-plus/icons-vue'

const visible = defineModel({ type: Boolean, default: false })
const activeTab = ref('chat')

const props = defineProps({
  mode: { type: String, default: 'generate' }, // 'generate' | 'workflow'
  refImages: { type: Array, default: () => [] },
})

const apiStore = useApiStore()
const chatStore = useChatStore()
const genStore = useGenerationStore()
const workflowStore = useWorkflowStore()

const inputText = ref('')
const isRequesting = ref(false)
const messagesContainer = ref(null)
const attachedImages = ref([])
const attachFileInput = ref(null)

const chatRequestToken = ref(0)

let currentAbortStreamFn = null // 存储当前请求的中断函数

function handleStopChat() {
  chatRequestToken.value++
  isRequesting.value = false
  
  if (currentAbortStreamFn) {
    currentAbortStreamFn() // 通知底层强行切断网络连接
    currentAbortStreamFn = null
  }
  
  chatStore.saveSessions() // 存盘
}

function selectAttachImage() {
  attachFileInput.value?.click()
}

function onAttachFileSelected(e) {
  const files = Array.from(e.target.files || [])
  for (const file of files) {
    const reader = new FileReader()
    reader.onload = (ev) => {
      attachedImages.value.push({
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        dataUrl: ev.target.result,
      })
    }
    reader.readAsDataURL(file)
  }
  e.target.value = ''
}

function removeAttachedImage(id) {
  attachedImages.value = attachedImages.value.filter(i => i.id !== id)
}

const currentSiteModels = computed(() => {
  const site = apiStore.sites.find(s => s.id === chatStore.selectedSiteId)
  return site?.models || []
})

const activeSession = computed(() => {
  return chatStore.sessions.find(s => s.id === chatStore.activeSessionId)
})

const SYSTEM_PROMPT_GENERATE = `你是一个专业的AI绘图提示词优化专家。
请根据用户的描述，扩展并优化为一段结构清晰、细节丰富、适合AI绘图模型理解的英文和中文两个版本的提示词，并且要方便用户复制（包含画面主体、环境背景、光影效果、画质要求等）。
【严格要求】请直接输出优化后的提示词内容，绝对不要输出任何其他的解释说明或废话。方便用户复制，只在中文版提示词前面加上'中文版：'，在英文版提示词前加上'英文版：'`

const SYSTEM_PROMPT_WORKFLOW = `你是一个专业的AI绘图项目创意总监。用户正在使用全栈AI工作流，需要你帮忙优化"初始规划提示词"。这个提示词不是直接发给绘图模型的，而是发给一个AI规划系统，由该系统理解用户意图后自动拆解为多张图片的创作计划并逐一生成。

因此，你的优化方向应该侧重于：
1. 清晰描述整体创作目标和主题，而非单张图片的画面细节
2. 说明期望的图片数量、风格统一性、系列感等宏观需求
3. 如果用户描述了多个场景或角色，帮忙梳理清楚彼此关系
4. 可以补充合理的创意建议，比如色调统一、构图变化、叙事逻辑等
5. 语言清晰自然即可，使用中文，不需要转成英文绘图提示词格式

【严格要求】请直接输出优化后的规划提示词内容，不要输出解释说明或废话。`

const presets = [
  { 
    title: '防复制参考图/防参考图虚影', 
    prompt: 'Only refer to the hairstyle, face shape, height, clothing (clothing must match the reference image), and temperament of the person in the image. Do not copy the background, composition, pose, or lighting of the reference image. The image should contain only one clear and complete person, without any phantom images, semi-transparent afterimages, double exposure, repeated outlines, transparent overlays, or residual backgrounds from the reference image. High definition, natural colors, ensure the person is rendered very delicately with excellent lighting effects, and do not directly replicate the art style of the reference image!\n\n注意只参考图中人物的发型、脸型、身高、服装（服装要和参考图一致）和气质，不要复制参考图的背景、构图、姿势和光影。画面中只能有一个清晰完整的人物，不要出现参考图虚影、半透明残影、双重曝光、重复轮廓、透明叠层或残留背景。高清，色彩自然，注意人物要画得很细腻，光影效果很好，不能直接照搬参考图的画风！' 
  },
  { 
    title: '二次元精致插画 (Anime Portrait)', 
    prompt: 'masterpiece, best quality, ultra-detailed, highres, 1girl, solo, detailed beautiful face, flowing hair, intricate clothing, vibrant colors, cinematic lighting, anime style\n\n杰作，最高画质，超精细，高分辨率，1个女孩，单人，精美细节的面容，飘逸的头发，复杂的服饰，鲜艳的色彩，电影级光影，动漫风格' 
  },
  { 
    title: '真实人像摄影 (Photorealistic Portrait)', 
    prompt: 'raw photo, masterpiece, best quality, photorealistic portrait of a young woman, highly detailed skin, natural skin texture, soft natural lighting, sharp focus, 85mm lens, bokeh\n\nRAW格式照片，杰作，最高画质，年轻女性的逼真肖像，高度细节的皮肤，自然的皮肤纹理，柔和的自然光，清晰的焦点，85mm镜头，背景虚化' 
  },
  { 
    title: '壮丽风景 (Epic Landscape)', 
    prompt: 'breathtaking landscape, masterpiece, best quality, majestic mountains, crystal clear lake, lush green forest, golden hour, stunning sky, dramatic clouds, volumetric lighting\n\n令人惊叹的风景，杰作，最高画质，雄伟的山脉，清澈见底的湖泊，茂密的绿色森林， 黄金时刻(黄昏/日出)，迷人的天空，戏剧性的云彩，体积光/丁达尔效应)' 
  },
  { 
    title: '赛博朋克城市 (Cyberpunk City)', 
    prompt: 'cyberpunk style, neon cityscapes, futuristic metropolis, rainy night, glowing neon lights, wet streets reflecting lights, high contrast, rich details, sci-fi atmosphere, Unreal Engine 5 render\n\n赛博朋克风格，霓虹城市景观，未来大都市，雨夜，闪烁的霓虹灯，倒映着灯光的潮湿街道，高对比度，丰富的细节，科幻氛围，虚幻引擎5渲染)' 
  },
  { 
    title: '奇幻魔法森林 (Fantasy Magic Forest)', 
    prompt: 'epic fantasy scene, magical forest, glowing plants, mystical creatures, ancient ruins, ethereal atmosphere, sparkling magic dust, cinematic lighting, highly detailed concept art\n\n史诗般的奇幻场景，魔法森林，发光的植物，神秘生物，古代遗迹，空灵的氛围，闪烁的魔法粉末，电影级光影，高度细节的概念艺术' 
  },
  { 
    title: '3D/盲盒/黏土风格 (3D Pixar/Clay)', 
    prompt: '3d render, Pixar style, Disney style, cute little boy, big eyes, clay texture, soft smooth lighting, colorful, highly detailed, octane render, trending on artstation\n\n3D渲染，皮克斯风格，迪士尼风格，可爱的小男孩，大眼睛，黏土材质，柔和平滑的光照，色彩丰富，高度细节，Octane渲染，ArtStation热门' 
  },
  { 
    title: '水墨国风 (Chinese Ink Wash)', 
    prompt: 'traditional chinese ink wash painting, masterpiece, elegant, poetic, mountains and rivers, misty atmosphere, soft brush strokes, minimalist, serene and peaceful, wuxia style\n\n传统中国水墨画，杰作，优雅，充满诗意，山水，雾气弥漫的氛围，柔和的笔触，极简主义，宁静平和，武侠风格' 
  },
  { 
    title: '现代室内设计 (Modern Interior)', 
    prompt: 'modern architectural design, luxury living room, floor-to-ceiling windows, panoramic city view, elegant furniture, warm interior lighting, photorealistic, architectural photography\n\n现代建筑设计，豪华客厅，落地窗，城市全景，优雅的家具，温暖的室内照明，逼真，建筑摄影' 
  }
]

const currentChatModels = computed(() => {
  const site = chatStore.chatSites.find(s => s.id === chatStore.activeChatSiteId)
  return site?.models || []
})

function onChatSiteChange(siteId) {
  const site = chatStore.chatSites.find(s => s.id === siteId)
  chatStore.activeChatModelId = site?.models[0]?.id || null
  chatStore.saveConfig()
}

function handleNewSession() {
  chatStore.createSession(`对话 ${chatStore.sessions.length + 1}`)
}

async function handleDeleteSessionById(id) {
  try {
    await ElMessageBox.confirm('确定要删除该对话吗？', '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    chatStore.deleteSession(id)
  } catch { /* ignore */ }
}

async function handleRenameSession(session) {
  try {
    const { value } = await ElMessageBox.prompt('请输入新的对话名称', '重命名对话', {
      inputValue: session.title,
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputValidator: (val) => val.trim().length > 0 || '名称不能为空'
    })
    if (value && value.trim()) {
      chatStore.renameSession(session.id, value.trim())
      ElMessage.success('已重命名')
    }
  } catch { /* ignore */ }
}

function handleDeleteMessage(index) {
  chatStore.deleteMessage(chatStore.activeSessionId, index)
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

watch(() => activeSession.value?.messages.length, scrollToBottom)
watch(visible, (val) => { if (val) scrollToBottom() })

async function handleSend() {
  if (!inputText.value.trim() || isRequesting.value) return
  const images = [...attachedImages.value]
  attachedImages.value = []
  await sendMessage(inputText.value, false, images)
  inputText.value = ''
}

async function handleOneClickOptimize() {
  const isWorkflow = props.mode === 'workflow'
  const currentPrompt = isWorkflow
    ? workflowStore.config.initialPrompt.trim()
    : genStore.prompt.trim()

  if (!currentPrompt) {
    ElMessage.warning(isWorkflow ? '当前规划提示词为空，请先输入一些内容' : '当前生图提示词为空，请先在外部输入一些内容')
    return
  }

  // 合并：助手内附加的图片 + 父页面的参考图
  const allImages = [...attachedImages.value, ...props.refImages]
  attachedImages.value = []

  const label = isWorkflow ? 'AI生图工作流规划' : '生图'
  const hasImages = allImages.length > 0
  const imageHint = hasImages ? `（已附带 ${allImages.length} 张参考图，请结合参考图进行优化）` : ''
  chatStore.createSession(`优化: ${currentPrompt.slice(0, 10)}...`)
  await sendMessage(`请帮我优化以下${label}提示词${imageHint}：\n${currentPrompt}`, true, allImages)
}

async function sendMessage(userText, useSystemPrompt = false, images = []) {
  const chatConfig = chatStore.getChatConfig(chatStore.activeChatSiteId, chatStore.activeChatModelId)

  if (!chatConfig) {
    ElMessage.error('请先在右上角选择对话站点和模型（或去设置页添加）')
    return
  }

  const sessionId = chatStore.activeSessionId
  chatStore.addMessage(sessionId, 'user', userText)
  
  chatRequestToken.value++
  const myToken = chatRequestToken.value
  isRequesting.value = true

  try {
    const msgsToSend = []
    if (useSystemPrompt) {
      const sysPrompt = props.mode === 'workflow' ? SYSTEM_PROMPT_WORKFLOW : SYSTEM_PROMPT_GENERATE
      msgsToSend.push({ role: 'system', content: sysPrompt })
    }
    const history = activeSession.value.messages
    msgsToSend.push(...history)

    // 如果有图片，将最后一条用户消息替换为多模态格式（不影响存储）
    if (images.length > 0) {
      const lastIdx = msgsToSend.length - 1
      const lastMsg = msgsToSend[lastIdx]
      if (lastMsg && lastMsg.role === 'user') {
        const content = []
        for (const img of images) {
          if (img.dataUrl) {
            content.push({ type: 'image_url', image_url: { url: img.dataUrl, detail: 'high' } })
          }
        }
        content.push({ type: 'text', text: typeof lastMsg.content === 'string' ? lastMsg.content : userText })
        msgsToSend[lastIdx] = { role: 'user', content }
      }
    }

    // ✨ 提前放入一条空的 AI 回复，用来装流式文本
    chatStore.addMessage(sessionId, 'assistant', '')

    const finalReply = await sendChatMessageStream({
      baseUrl: chatConfig.baseUrl,
      apiKey: chatConfig.apiKey,
      model: chatConfig.model,
      messages: msgsToSend,
    },
    (currentText) => {
      // ✅ 打字机效果实时更新
      if (chatRequestToken.value === myToken) {
        chatStore.updateLastMessage(sessionId, currentText)
      }
    }, 
    (abortFn) => {
      // ✅ 接收中断控制器
      currentAbortStreamFn = abortFn
    })

    if (chatRequestToken.value !== myToken) return // 中途被中止了
    
    // 如果是一键优化，并且完全生成完毕没有中断，才通知更换
    if (useSystemPrompt) {
      ElMessage.success('提示词优化已完成，建议满意后手动复制')
    }

  } catch (err) {
    if (chatRequestToken.value !== myToken) return
    ElMessage.error(`请求失败: ${err.message}`)
    chatStore.updateLastMessage(sessionId, `❌ 请求失败: ${err.message}`)
  } finally {
    if (chatRequestToken.value === myToken) {
      isRequesting.value = false
      currentAbortStreamFn = null
      chatStore.saveSessions() // 对话结束后统一存盘
    }
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败')
  }
}
</script>

<style scoped>
.assistant-tabs {
  margin-top: -10px;
}

/* ===== 聊天整体布局 ===== */
.chat-layout {
  display: flex;
  height: 70vh; /* 加大高度 */
  min-height: 500px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

/* --- 左侧侧边栏 --- */
.chat-sidebar {
  width: 200px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: width var(--transition); /* 添加过渡动画 */
}

/* 侧边栏收起时的样式 */
.chat-sidebar--collapsed {
  width: 50px;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}

.chat-sidebar--collapsed .sidebar-header {
  justify-content: center;
  padding: 8px 4px;
}

.sidebar-actions {
  display: flex;
  gap: 2px;
}

.session-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.session-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
  transition: all 0.2s;
}

.chat-sidebar--collapsed .session-item {
  justify-content: center;
  padding: 8px 0;
}

.session-item:hover {
  background: var(--bg-hover);
}

.session-item.active {
  background: var(--accent-light);
  color: var(--accent-color);
  font-weight: 600;
}

.session-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-actions {
  display: flex;
  opacity: 0;
  transition: opacity 0.2s;
  margin-left: 4px;
}

.session-item:hover .session-actions {
  opacity: 1;
}

.session-actions .action-btn {
  padding: 4px;
  height: auto;
  margin: 0;
}

/* --- 右侧聊天主区域 --- */
.main-chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 12px 16px;
  background: var(--bg-card);
}

.chat-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.header-divider {
  width: 1px;
  height: 24px;
  background: var(--border-color);
  margin: 0 8px;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.chat-empty {
  text-align: center;
  color: var(--text-muted);
  margin-top: 40px;
}

.message-wrapper {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  max-width: 85%;
}

.message-user {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.message-assistant {
  align-self: flex-start;
}

.message-bubble {
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}

.message-user .message-bubble {
  background: var(--accent-color);
  color: white;
  border-top-right-radius: 2px;
}

.message-assistant .message-bubble {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-top-left-radius: 2px;
}

.loading-bubble {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
}

/* 消息悬浮操作按钮 */
.message-actions {
  display: flex;
  opacity: 0;
  transition: opacity 0.2s;
  align-items: flex-end;
  padding-bottom: 4px;
}

.message-wrapper:hover .message-actions {
  opacity: 1;
}

.msg-action-btn {
  padding: 4px 8px;
  margin: 0;
  height: auto;
}

/* 输入区 */
.chat-input-area {
  flex-shrink: 0;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-row {
  display: flex;
  gap: 12px;
  align-items: stretch;
}

.input-row :deep(.el-textarea__inner) {
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
}

.right-action-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.send-btn {
  width: 90px;
  flex: 1;
  border-radius: var(--radius-sm);
  margin: 0 !important;
}

.send-btn.el-button--primary:not(:disabled) {
  background: var(--accent-color) !important;
  border-color: var(--accent-color) !important;
  color: #fff !important;
}

.send-btn.el-button--primary:not(:disabled):hover {
  background: var(--accent-hover) !important;
  border-color: var(--accent-hover) !important;
}

.optimize-btn {
  width: 90px;
  height: auto;
  padding: 6px 0;
  margin: 0 !important;
  border-radius: var(--radius-sm);
}

.optimize-btn-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  font-size: 11px;
}

/* 预设面板 */
.presets-container {
  height: 70vh; /* 同样加大高度 */
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-right: 8px;
}

.preset-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 12px 16px;
}

.preset-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.preset-title {
  font-weight: 600;
  color: var(--accent-color);
}

.preset-content {
  font-size: 13px;
  color: var(--text-secondary);
  background: var(--bg-card);
  padding: 10px;
  border-radius: 4px;
  line-height: 1.4;
  white-space: pre-wrap; /* 👈 加上这一行，\n 就会变成真正的换行啦！ */
  word-break: break-all; /* 加不加都行，防止长单词撑破盒子 */
}

.stop-btn:not(:disabled) {
  background: #ef4444 !important;
  border-color: #ef4444 !important;
  color: #fff !important;
}

.stop-btn:not(:disabled):hover {
  background: #dc2626 !important;
  border-color: #dc2626 !important;
}

/* ===== 图片附件 ===== */
.attached-images-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 8px;
  flex-wrap: wrap;
}

.attached-thumb {
  position: relative;
  width: 48px;
  height: 48px;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  flex-shrink: 0;
}

.attached-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.attached-remove {
  position: absolute;
  top: 1px;
  right: 1px;
  width: 16px;
  height: 16px;
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

.attached-thumb:hover .attached-remove {
  opacity: 1;
}

.attached-hint {
  font-size: 11px;
  color: var(--text-muted);
}

.input-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.input-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.attach-btn {
  padding: 2px 6px;
  font-size: 12px;
  color: var(--text-muted) !important;
}

.attach-btn:hover:not(:disabled) {
  color: var(--accent-color) !important;
}

.ref-hint {
  font-size: 11px;
  color: var(--accent-color);
}
</style>