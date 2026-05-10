<template>
  <div class="workflow-page">
    <!-- 左侧：工作流模式侧边栏 -->
    <div class="sidebar" :class="{ 'sidebar--collapsed': workflowStore.sidebarCollapsed }">
      <div class="sidebar-header">
        <span v-if="!workflowStore.sidebarCollapsed" class="sidebar-title">工作流</span>
        <button class="sidebar-toggle" @click="workflowStore.toggleSidebar">
          <el-icon>
            <DArrowLeft v-if="!workflowStore.sidebarCollapsed" />
            <DArrowRight v-else />
          </el-icon>
        </button>
      </div>

      <!-- 展开状态 -->
      <div v-if="!workflowStore.sidebarCollapsed" class="sidebar-content">
        <div
          v-for="wf in workflowStore.workflowTypes"
          :key="wf.id"
          class="sidebar-item"
          :class="{ active: workflowStore.activeWorkflowType === wf.id, 'sidebar-item--disabled': workflowStore.isRunning && workflowStore.activeWorkflowType !== wf.id }"
          @click="!workflowStore.isRunning && workflowStore.setWorkflowType(wf.id)"
        >
          <el-icon><MagicStick /></el-icon>
          <div class="sidebar-item-info">
            <span class="sidebar-item-name">
              {{ wf.name }}
              <span v-if="wf.comingSoon" class="coming-soon-tag">敬请期待</span>
              <span v-else-if="wf.beta" class="beta-tag">Beta</span>
            </span>
            <span class="sidebar-item-desc">{{ wf.desc }}</span>
          </div>
        </div>
      </div>

      <!-- 收起状态 -->
      <div v-else class="sidebar-content">
        <div
          v-for="wf in workflowStore.workflowTypes"
          :key="wf.id"
          class="sidebar-item sidebar-item--icon-only"
          :class="{ active: workflowStore.activeWorkflowType === wf.id, 'sidebar-item--disabled': workflowStore.isRunning && workflowStore.activeWorkflowType !== wf.id }"
          @click="!workflowStore.isRunning && workflowStore.setWorkflowType(wf.id)"
          :title="wf.name"
        >
          <el-icon :size="18"><MagicStick /></el-icon>
        </div>
      </div>
    </div>

    <!-- 右侧：主内容 -->
    <div class="workflow-main">
      <!-- 页面头部 -->
      <div class="page-header">
        <div class="header-left">
          <h2>{{ activeType?.name || '全栈AI工作流' }} <span v-if="activeType?.comingSoon" class="coming-soon-tag coming-soon-tag--title">敬请期待</span><span v-else-if="activeType?.beta" class="beta-tag beta-tag--title">Beta</span></h2>
          <p class="subtitle">{{ activeType?.desc }}</p>
        </div>
        <div class="header-right">
          <span v-if="workflowStore.isRunning" class="status-badge status-badge--running">
            <span class="badge-dot"></span> 运行中
          </span>
          <span v-else-if="workflowStore.status === 'completed'" class="status-badge status-badge--done">
            已完成
          </span>
          <span v-else-if="workflowStore.status === 'failed'" class="status-badge status-badge--failed">
            已失败
          </span>
          <span v-else-if="workflowStore.status === 'stopped'" class="status-badge status-badge--stopped">
            已停止
          </span>
        </div>
      </div>

      <!-- ===== 阶段内容区 ===== -->
      <div class="phase-area">
        <!-- 未完成的工作流提示 -->
        <div v-if="isUnfinishedWorkflow" class="phase-unfinished">
          <div class="placeholder-card">
            <el-icon :size="48" color="var(--text-muted)"><MagicStick /></el-icon>
            <h3>此工作流尚未构建完毕，敬请期待</h3>
          </div>
        </div>
        <!-- 空闲 → 配置界面 -->
        <div v-else-if="workflowStore.status === 'idle'" class="phase-idle">
          <div class="config-panel">
            <!-- 流程步骤示意 -->
            <div class="workflow-steps-bar" v-if="workflowStore.activeWorkflowType === 'char-design'">
              <div class="step-item"><span class="step-num">1</span><span>配置模型与参数</span></div>
              <div class="step-arrow">→</div>
              <div class="step-item"><span class="step-num">2</span><span>AI 生成角色设定</span></div>
              <div class="step-arrow">→</div>
              <div class="step-item"><span class="step-num">3</span><span>生成多角度立绘/差分</span></div>
              <div class="step-arrow">→</div>
              <div class="step-item"><span class="step-num">4</span><span>生成场景插图</span></div>
              <div class="step-arrow">→</div>
              <div class="step-item"><span class="step-num">5</span><span>导出角色卡</span></div>
            </div>
            <div class="workflow-steps-bar" v-else-if="workflowStore.activeWorkflowType === 'cg-diff'">
              <div class="step-item"><span class="step-num">1</span><span>配置模型与参数</span></div>
              <div class="step-arrow">→</div>
              <div class="step-item"><span class="step-num">2</span><span>生成底CG</span></div>
              <div class="step-arrow">→</div>
              <div class="step-item"><span class="step-num">3</span><span>AI 规划差分</span></div>
              <div class="step-arrow">→</div>
              <div class="step-item"><span class="step-num">4</span><span>并行生成差分</span></div>
              <div class="step-arrow">→</div>
              <div class="step-item"><span class="step-num">5</span><span>输出最终作品</span></div>
            </div>
            <div class="workflow-steps-bar" v-else-if="workflowStore.activeWorkflowType === 'gal-cg'">
              <div class="step-item"><span class="step-num">1</span><span>上传故事文档</span></div>
              <div class="step-arrow">→</div>
              <div class="step-item"><span class="step-num">2</span><span>角色提取与立绘</span></div>
              <div class="step-arrow">→</div>
              <div class="step-item"><span class="step-num">3</span><span>分批生成CG计划</span></div>
              <div class="step-arrow">→</div>
              <div class="step-item"><span class="step-num">4</span><span>逐张生成剧情CG</span></div>
              <div class="step-arrow">→</div>
              <div class="step-item"><span class="step-num">5</span><span>输出CG集</span></div>
            </div>
            <div class="workflow-steps-bar" v-else>
              <div class="step-item"><span class="step-num">1</span><span>配置模型与参数</span></div>
              <div class="step-arrow">→</div>
              <div class="step-item"><span class="step-num">2</span><span>AI 生成规划大纲</span></div>
              <div class="step-arrow">→</div>
              <div class="step-item"><span class="step-num">3</span><span>自动生图 + 智能评审</span></div>
              <div class="step-arrow">→</div>
              <div class="step-item"><span class="step-num">4</span><span>输出最终作品</span></div>
            </div>

            <!-- ===== 模型配置 ===== -->
            <div class="config-card">
              <div class="config-card-header">
                <h3 class="config-card-title">模型配置</h3>
                <el-button
                  size="small"
                  @click="handleRestoreLastConfig"
                  :disabled="!workflowStore.lastModelConfig"
                >
                  <el-icon><RefreshRight /></el-icon> 使用上次的模型配置
                </el-button>
              </div>

              <!-- 语言模型队列 -->
              <div class="config-section">
                <div class="config-section-header">
                  <div>
                    <span class="config-section-label">语言模型队列（必须使用支持视觉(多模态)的模型）</span>
                    <span class="config-section-hint">用于理解需求、规划大纲、评审图片，排在前面的优先使用，连续失败 3 次自动切换下一个</span>
                  </div>
                </div>
                <div v-if="chatStore.chatSites.length === 0" class="config-empty-tip">
                  <el-icon><WarningFilled /></el-icon>
                  请先在「设置 → 对话助手配置」中添加对话站点和模型
                </div>
                <template v-else>
                  <div class="model-select-row">
                    <el-select v-model="llmSiteId" placeholder="选择站点" size="default" @change="llmModelId = null" style="flex: 1">
                      <el-option v-for="s in chatStore.chatSites" :key="s.id" :label="s.name" :value="s.id" />
                    </el-select>
                    <el-select v-model="llmModelId" placeholder="选择模型" size="default" :disabled="!llmSiteId" style="flex: 1">
                      <el-option v-for="m in currentLlmModels" :key="m.id" :label="m.name" :value="m.id" />
                    </el-select>
                    <el-button type="primary" @click="addLlmModel" :disabled="!llmModelId">
                      <el-icon><Plus /></el-icon> 添加
                    </el-button>
                  </div>
                  <div v-if="workflowStore.config.llmModels.length > 0" class="model-queue">
                    <div
                      v-for="(m, i) in workflowStore.config.llmModels"
                      :key="i"
                      class="model-queue-item"
                      :class="{
                        'model-queue-item--dragging': dragType === 'llm' && dragIndex === i,
                        'model-queue-item--over': dragType === 'llm' && dragOverIndex === i && dragIndex !== i,
                      }"
                      draggable="true"
                      @dragstart="onDragStart('llm', i)"
                      @dragover="onDragOver($event, 'llm', i)"
                      @dragend="onDragEnd('llm')"
                    >
                      <span class="queue-drag-handle">
                        <el-icon :size="14"><Rank /></el-icon>
                      </span>
                      <span class="queue-index">#{{ i + 1 }}</span>
                      <div class="queue-info">
                        <span class="queue-name">{{ m.modelName }}</span>
                        <span class="queue-site">{{ m.siteName }}</span>
                      </div>
                      <el-button text type="danger" size="small" @click="removeLlmModel(i)">
                        <el-icon><Delete /></el-icon>
                      </el-button>
                    </div>
                  </div>
                  <div v-else class="model-queue-empty">请至少添加一个语言模型</div>
                </template>
              </div>

              <!-- 生图模型队列 -->
              <div class="config-section">
                <div class="config-section-header">
                  <div>
                    <span class="config-section-label">生图模型队列</span>
                    <span class="config-section-hint">用于生成图片，排在前面的优先使用，连续失败 3 次自动切换下一个</span>
                  </div>
                </div>
                <div v-if="apiStore.sites.length === 0" class="config-empty-tip">
                  <el-icon><WarningFilled /></el-icon>
                  请先在「设置 → 绘图 API 站点」中添加站点和模型
                </div>
                <template v-else>
                  <div class="model-select-row">
                    <el-select v-model="imageSiteId" placeholder="选择站点" size="default" @change="imageModelId = null" style="flex: 1">
                      <el-option v-for="s in apiStore.sites" :key="s.id" :label="s.name" :value="s.id" />
                    </el-select>
                    <el-select v-model="imageModelId" placeholder="选择模型" size="default" :disabled="!imageSiteId" style="flex: 1">
                      <el-option
                        v-for="m in currentImageModels"
                        :key="m.id"
                        :label="`${m.name} (${apiStore.getApiTypeLabel(m.apiType)})`"
                        :value="m.id"
                      />
                    </el-select>
                    <el-button type="primary" @click="addImageModel" :disabled="!imageModelId">
                      <el-icon><Plus /></el-icon> 添加
                    </el-button>
                  </div>
                  <div v-if="workflowStore.config.imageModels.length > 0" class="model-queue">
                    <div
                      v-for="(m, i) in workflowStore.config.imageModels"
                      :key="i"
                      class="model-queue-item"
                      :class="{
                        'model-queue-item--dragging': dragType === 'image' && dragIndex === i,
                        'model-queue-item--over': dragType === 'image' && dragOverIndex === i && dragIndex !== i,
                      }"
                      draggable="true"
                      @dragstart="onDragStart('image', i)"
                      @dragover="onDragOver($event, 'image', i)"
                      @dragend="onDragEnd('image')"
                    >
                      <span class="queue-drag-handle">
                        <el-icon :size="14"><Rank /></el-icon>
                      </span>
                      <span class="queue-index">#{{ i + 1 }}</span>
                      <div class="queue-info">
                        <span class="queue-name">{{ m.modelName }}</span>
                        <span class="queue-site">{{ m.siteName }} · {{ apiTypeLabel(m.apiType) }}</span>
                      </div>
                      <el-button text type="danger" size="small" @click="removeImageModel(i)">
                        <el-icon><Delete /></el-icon>
                      </el-button>
                    </div>
                  </div>
                  <div v-else class="model-queue-empty">请至少添加一个生图模型</div>
                </template>
              </div>
            </div>

            <!-- ===== 任务配置 ===== -->
            <div class="config-card">
              <!-- 初始提示词 -->
              <div class="config-section">
                <div class="config-section-header">
                  <span class="config-section-label">{{ workflowStore.activeWorkflowType === 'gal-cg' ? '补充说明（可选）' : '初始提示词 *' }}</span>
                </div>
                <div class="prompt-input-row">
                  <el-input
                    v-model="workflowStore.config.initialPrompt"
                    type="textarea"
                    :rows="4"
                    resize="none"
                    :placeholder="workflowStore.activeWorkflowType === 'gal-cg' ? '此工作流的附加要求暂时只会发给负责大纲的AI，一般无需填写' : '描述你想要 AI 完成的创作任务…'"
                    maxlength="4000"
                    show-word-limit
                  />
                  <el-button class="prompt-assist-btn" @click="showAssistant = true">
                    <el-icon><ChatDotRound /></el-icon> 优化助手
                  </el-button>
                </div>
              </div>

              <!-- CG差分绘制模式选择（仅cg-diff工作流显示） -->
              <div class="config-section" v-if="workflowStore.activeWorkflowType === 'cg-diff'">
                <div class="config-section-header">
                  <span class="config-section-label">绘制模式</span>
                </div>
                <div class="confirm-mode-group">
                  <div
                    class="confirm-option"
                    :class="{ active: workflowStore.config.cgDiffMode === 'full' }"
                    @click="workflowStore.config.cgDiffMode = 'full'"
                  >
                    <el-radio v-model="workflowStore.config.cgDiffMode" value="full" />
                    <div class="confirm-option-text">
                      <span class="confirm-option-title">CG + 差分从零绘制</span>
                      <span class="confirm-option-desc">AI 先生成底CG，再在底CG基础上绘制多张差分</span>
                    </div>
                  </div>
                  <div
                    class="confirm-option"
                    :class="{ active: workflowStore.config.cgDiffMode === 'diff-only' }"
                    @click="workflowStore.config.cgDiffMode = 'diff-only'"
                  >
                    <el-radio v-model="workflowStore.config.cgDiffMode" value="diff-only" />
                    <div class="confirm-option-text">
                      <span class="confirm-option-title">仅绘制差分</span>
                      <span class="confirm-option-desc">上传已有的底CG，AI 直接在其基础上绘制差分</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 参考图（CG+差分模式 或 非cg-diff工作流时显示，gal-cg不显示） -->
              <div class="config-section" v-if="(workflowStore.activeWorkflowType !== 'cg-diff' || workflowStore.config.cgDiffMode === 'full') && workflowStore.activeWorkflowType !== 'gal-cg'">
                <div class="config-section-header">
                  <span class="config-section-label">参考图（可选）</span>
                  <el-button
                    v-if="workflowStore.config.referenceImages.length > 0"
                    text type="danger" size="small"
                    @click="clearRefImages"
                  >清空</el-button>
                </div>
                <div class="ref-dual-layout">
                  <!-- 左：上传 / 已选参考图 -->
                  <div class="ref-dual-left">
                    <div class="ref-dual-panel">
                      <div class="ref-dual-panel-title">已选参考图 ({{ workflowStore.config.referenceImages.length }})</div>
                      <div
                        v-if="workflowStore.config.referenceImages.length > 0"
                        class="ref-list-tall"
                        :class="{ 'ref-list-tall--dragover': refDragover }"
                        @dragover.prevent="refDragover = true"
                        @dragleave="refDragover = false"
                        @drop.prevent="onRefDrop"
                      >
                        <div v-for="img in workflowStore.config.referenceImages" :key="img.id" class="ref-thumb">
                          <img :src="img.dataUrl" alt="参考图" />
                          <button class="ref-remove" @click="removeRefImage(img.id)">
                            <el-icon><Close /></el-icon>
                          </button>
                        </div>
                        <div class="ref-add" @click="selectRefImage">
                          <el-icon :size="20"><Plus /></el-icon>
                        </div>
                      </div>
                      <div
                        v-else
                        class="ref-upload-tall"
                        :class="{ 'ref-upload-tall--dragover': refDragover }"
                        @click="selectRefImage"
                        @dragover.prevent="refDragover = true"
                        @dragleave="refDragover = false"
                        @drop.prevent="onRefDrop"
                      >
                        <el-icon :size="24"><Upload /></el-icon>
                        <span>点击或拖拽上传参考图</span>
                      </div>
                    </div>
                    <input
                      ref="refFileInput"
                      type="file"
                      accept="image/*"
                      multiple
                      style="display: none"
                      @change="onRefFileSelected"
                    />
                  </div>
                  <!-- 右：我的参考图（与生成页同步） -->
                  <div class="ref-dual-right">
                    <div class="ref-dual-panel">
                      <div class="ref-dual-panel-title">我的参考图 ({{ galleryStore.importedImages.length }})</div>
                      <div
                        v-if="galleryStore.importedImages.length > 0"
                        :class="[
                          'ref-imported-grid',
                          themeStore.workflowDisplayMode === 'masonry' ? 'ref-imported-grid--masonry' : 'ref-imported-grid--square',
                          importDragover ? 'ref-imported-grid--dragover' : ''
                        ]"
                        @dragover.prevent="importDragover = true"
                        @dragleave="importDragover = false"
                        @drop.prevent="onImportDrop"
                      >
                        <div
                          v-for="img in galleryStore.importedImages"
                          :key="img.id"
                          class="ref-imported-thumb"
                        >
                          <img :src="galleryStore.getDisplayUrl(img, true)" :alt="img.name" loading="lazy" />
                          <el-tooltip content="删除" placement="top">
                            <button class="ref-imported-delete" @click.stop="deleteImportedConfirm(img)">
                              <el-icon><Delete /></el-icon>
                            </button>
                          </el-tooltip>
                          <div class="ref-imported-actions" @click.stop>
                            <el-tooltip content="用作参考图" placement="top">
                              <button @click="useImportedAsRef(img)">
                                <el-icon><PictureFilled /></el-icon>
                              </button>
                            </el-tooltip>
                          </div>
                        </div>
                      </div>
                      <div
                        v-else
                        class="ref-imported-empty"
                        :class="{ 'ref-imported-empty--dragover': importDragover }"
                        @dragover.prevent="importDragover = true"
                        @dragleave="importDragover = false"
                        @drop.prevent="onImportDrop"
                      >
                        拖拽图片到此处导入，或在生成页导入
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 底CG上传（仅差分模式） -->
              <div class="config-section" v-if="workflowStore.activeWorkflowType === 'cg-diff' && workflowStore.config.cgDiffMode === 'diff-only'">
                <div class="config-section-header">
                  <span class="config-section-label">底CG图片 *</span>
                  <el-button
                    v-if="workflowStore.config.cgDiffBaseCG"
                    text type="danger" size="small"
                    @click="removeCgDiffBaseCG"
                  >移除</el-button>
                </div>
                <div v-if="workflowStore.config.cgDiffBaseCG" class="cg-base-preview">
                  <img :src="workflowStore.config.cgDiffBaseCG.dataUrl" alt="底CG" />
                  <div class="cg-base-info">
                    <span>原始分辨率：{{ workflowStore.config.cgDiffBaseCG.width }} × {{ workflowStore.config.cgDiffBaseCG.height }}</span>
                    <span>自动匹配生成尺寸：<strong>{{ workflowStore.config.cgDiffAutoSize }}</strong></span>
                  </div>
                </div>
                <div
                  v-else
                  class="cg-base-upload"
                  :class="{ 'cg-base-upload--dragover': cgBaseDragover }"
                  @click="selectCgDiffBaseCG"
                  @dragover.prevent="cgBaseDragover = true"
                  @dragleave="cgBaseDragover = false"
                  @drop.prevent="onCgBaseDrop"
                >
                  <el-icon :size="24"><Upload /></el-icon>
                  <span>点击或拖拽上传底CG图片（必需，差分将基于此图生成）</span>
                </div>
                <input
                  ref="cgDiffBaseCGInput"
                  type="file"
                  accept="image/*"
                  style="display: none"
                  @change="onCgDiffBaseCGSelected"
                />
              </div>

              <!-- 总时长 -->
              <div class="config-section">
                <div class="config-section-header">
                  <span class="config-section-label">总任务时长上限</span>
                  <span class="config-time-display">{{ timeLimitDisplay }}</span>
                </div>
                <el-slider
                  v-model="workflowStore.config.timeLimitMinutes"
                  :min="workflowStore.activeWorkflowType === 'gal-cg' ? 30 : 10" :max="timeLimitMax" :step="5"
                  :marks="timeMarks"
                />
              </div>

              <!-- 并发 / 尺寸 / 质量 一行三列 -->
              <div class="config-row-3">
                <div class="config-section" v-if="!(workflowStore.activeWorkflowType === 'cg-diff' && workflowStore.config.cgDiffMode === 'diff-only')">
                  <div class="config-section-header">
                    <span class="config-section-label">并发数</span>
                  </div>
                  <el-input-number v-model="workflowStore.config.concurrency" :min="1" :max="4" :step="1" style="width: 100%" :disabled="workflowStore.config.efficiencyMode" />
                  <div class="quality-hint">{{ workflowStore.config.efficiencyMode ? '效率优先模式下并发数由模型数量自动决定，无需手动设定' : '选定并发数后，AI每轮都会以这个并发数请求图片，如果需要降低费用消耗，请调低并发数' }}</div>
                </div>
                <div class="config-section">
                  <div class="config-section-header">
                    <span class="config-section-label">图片尺寸</span>
                  </div>
                  <el-select v-model="workflowStore.config.imageSize" style="width: 100%" filterable :disabled="(workflowStore.activeWorkflowType === 'cg-diff' && workflowStore.config.cgDiffMode === 'diff-only' && !!workflowStore.config.cgDiffBaseCG) || (workflowStore.activeWorkflowType === 'char-design' && !workflowStore.config.charDesignEnableScenes) || workflowStore.activeWorkflowType === 'gal-cg'">
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
                      <el-option v-for="size in themeStore.customSizes" :key="size" :label="size" :value="size" />
                    </el-option-group>
                  </el-select>
                  <div class="quality-hint">
                    <template v-if="workflowStore.activeWorkflowType === 'cg-diff' && workflowStore.config.cgDiffMode === 'diff-only' && workflowStore.config.cgDiffBaseCG">
                      已根据底CG分辨率自动匹配，不可手动修改
                    </template>
                    <template v-else-if="workflowStore.activeWorkflowType === 'char-design' && !workflowStore.config.charDesignEnableScenes">
                      立绘将自动使用竖图尺寸（9:16），未开启场景插图时无需配置
                    </template>
                    <template v-else-if="workflowStore.activeWorkflowType === 'char-design'">
                      此尺寸仅影响场景插图，立绘将自动使用竖图尺寸（9:16）
                    </template>
                    <template v-else-if="workflowStore.activeWorkflowType === 'gal-cg'">
                      角色立绘自动使用 2K 竖图（9:16），剧情 CG 自动使用 2K 横图（16:9），无需手动配置
                    </template>
                    <template v-else>
                      选定特定尺寸后，所有图片都将按照这个尺寸生成。如果需要每张图片尺寸不同，请使用 auto（自动）。推荐先前往生成页面验证使用的模型是否支持该分辨率，以免工作流卡住
                    </template>
                  </div>
                </div>
                <div class="config-section">
                  <div class="config-section-header">
                    <span class="config-section-label">图片质量</span>
                  </div>
                  <el-select v-model="workflowStore.config.imageQuality" style="width: 100%" :disabled="!hasResponsesModel">
                    <el-option label="自动 (auto)" value="auto" />
                    <el-option label="低 (low)" value="low" />
                    <el-option label="中 (medium)" value="medium" />
                    <el-option label="高 (high)" value="high" />
                  </el-select>
                  <div class="quality-hint">仅对 Responses 接口的生图模型生效{{ !hasResponsesModel ? '（当前队列中无 Responses 模型）' : '' }}</div>
                </div>
              </div>
            </div>

            <!-- ===== 人物设定生成专属配置 ===== -->
            <div class="config-card" v-if="workflowStore.activeWorkflowType === 'char-design'">
              <h3 class="config-card-title" style="margin-bottom: 16px;">人物设定配置</h3>

              <!-- 角色名称 -->
              <div class="config-section">
                <div class="config-section-header">
                  <span class="config-section-label">角色名称（可选）</span>
                </div>
                <el-input
                  v-model="workflowStore.config.charDesignName"
                  placeholder="留空则由 AI 自动命名"
                  maxlength="50"
                  show-word-limit
                  clearable
                />
                <div class="quality-hint">指定角色名后，AI 将使用该名称创建角色设定</div>
              </div>
              <!-- 表情差分开关 -->
              <div class="config-section">
                <div class="setting-item-inline">
                  <div class="setting-item-info">
                    <span class="config-section-label">生成表情差分</span>
                    <span class="config-section-hint">开启后将在正面锚定图基础上生成多张表情变体（如微笑、害羞、生气等）</span>
                  </div>
                  <el-switch v-model="workflowStore.config.charDesignEnableExpressions" />
                </div>
              </div>

              <!-- 表情差分数量 -->
              <div class="config-section" v-if="workflowStore.config.charDesignEnableExpressions">
                <div class="config-section-header">
                  <span class="config-section-label">表情差分数量</span>
                </div>
                <el-input-number v-model="workflowStore.config.charDesignExpressionCount" :min="1" :max="8" :step="1" style="width: 100%" />
                <div class="quality-hint">将生成指定数量的表情差分，固定4路并发，逐张审核</div>
              </div>
              <!-- 生成侧面与背面立绘开关 -->
              <div class="config-section">
                <div class="setting-item-inline">
                  <div class="setting-item-info">
                    <span class="config-section-label">生成侧面与背面立绘</span>
                    <span class="config-section-hint">开启后将在正面锚定图基础上额外生成侧面和背面全身立绘</span>
                  </div>
                  <el-switch v-model="workflowStore.config.charDesignEnableAngles" />
                </div>
              </div>
              <!-- AI生成剧情与对应插图开关 -->
              <div class="config-section">
                <div class="setting-item-inline">
                  <div class="setting-item-info">
                    <span class="config-section-label">AI 生成剧情与对应插图</span>
                    <span class="config-section-hint">开启后AI会为角色构建故事场景并生成对应插图，需要更多时间（至少25分钟）</span>
                  </div>
                  <el-switch
                    v-model="workflowStore.config.charDesignEnableScenes"
                    :disabled="workflowStore.config.timeLimitMinutes < 25"
                  />
                </div>
                <div v-if="workflowStore.config.timeLimitMinutes < 25" class="quality-hint" style="color: #f59e0b;">
                  ⚠️ 当前设定时间低于25分钟，无法启用此功能，请增加时间上限
                </div>
              </div>

              <!-- 确认模式（仅此工作流） -->
              <div class="config-section">
                <div class="config-section-header">
                  <span class="config-section-label">确认模式（仅此工作流生效）</span>
                </div>
                <div class="confirm-mode-group">
                  <div
                    class="confirm-option"
                    :class="{ active: workflowStore.config.charDesignConfirmMode === 'pure-ai' }"
                    @click="workflowStore.config.charDesignConfirmMode = 'pure-ai'"
                  >
                    <el-radio v-model="workflowStore.config.charDesignConfirmMode" value="pure-ai" />
                    <div class="confirm-option-text">
                      <span class="confirm-option-title">纯AI工作</span>
                      <span class="confirm-option-desc">全程自动，无需人工干预</span>
                    </div>
                  </div>
                  <div
                    class="confirm-option"
                    :class="{ active: workflowStore.config.charDesignConfirmMode === 'confirm-non-image' }"
                    @click="workflowStore.config.charDesignConfirmMode = 'confirm-non-image'"
                  >
                    <el-radio v-model="workflowStore.config.charDesignConfirmMode" value="confirm-non-image" />
                    <div class="confirm-option-text">
                      <span class="confirm-option-title">用户仅确认所有非图片节点</span>
                      <span class="confirm-option-desc">角色设定、场景大纲、最终文档需确认，图片由AI自动评分</span>
                    </div>
                  </div>
                  <div
                    class="confirm-option"
                    :class="{ active: workflowStore.config.charDesignConfirmMode === 'confirm-image' }"
                    @click="workflowStore.config.charDesignConfirmMode = 'confirm-image'"
                  >
                    <el-radio v-model="workflowStore.config.charDesignConfirmMode" value="confirm-image" />
                    <div class="confirm-option-text">
                      <span class="confirm-option-title">用户仅确认所有图片节点</span>
                      <span class="confirm-option-desc">所有图片需用户选图确认，设定和文档由AI自动通过</span>
                    </div>
                  </div>
                  <div
                    class="confirm-option"
                    :class="{ active: workflowStore.config.charDesignConfirmMode === 'confirm-all' }"
                    @click="workflowStore.config.charDesignConfirmMode = 'confirm-all'"
                  >
                    <el-radio v-model="workflowStore.config.charDesignConfirmMode" value="confirm-all" />
                    <div class="confirm-option-text">
                      <span class="confirm-option-title">用户确认所有节点</span>
                      <span class="confirm-option-desc">设定、图片、文档全部需要手动确认</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- ===== GalCG叙事专属配置 ===== -->
            <div class="config-card" v-if="workflowStore.activeWorkflowType === 'gal-cg'">
              <h3 class="config-card-title" style="margin-bottom: 16px;">GalCG 叙事配置</h3>

              <!-- 故事文档上传/输入 -->
              <div class="config-section">
                <div class="config-section-header">
                  <span class="config-section-label">故事文档 *</span>
                  <el-button
                    v-if="workflowStore.config.galCGDocumentText"
                    text type="danger" size="small"
                    @click="clearGalCGDocument"
                  >清空</el-button>
                </div>
                <div v-if="workflowStore.config.galCGDocumentText" class="gal-doc-preview">
                  <div class="gal-doc-preview-header">
                    <span class="gal-doc-preview-name">{{ workflowStore.config.galCGDocumentTitle || '已输入文本' }}</span>
                    <span class="gal-doc-preview-count">{{ workflowStore.config.galCGDocumentText.length }} 字</span>
                  </div>
                  <div class="gal-doc-preview-content">{{ workflowStore.config.galCGDocumentText.slice(0, 200) }}{{ workflowStore.config.galCGDocumentText.length > 200 ? '...' : '' }}</div>
                </div>
                <div
                  v-else
                  class="gal-doc-upload-area"
                  :class="{ 'gal-doc-upload-area--dragover': galDocDragover }"
                  @dragover.prevent="galDocDragover = true"
                  @dragleave="galDocDragover = false"
                  @drop.prevent="onGalDocDrop"
                >
                  <div class="gal-doc-upload-btn" @click="$refs.galDocInput.click()">
                    <el-icon :size="24"><Upload /></el-icon>
                    <span>点击或拖拽上传故事文档（.txt / .md / .docx）</span>
                  </div>
                  <div class="gal-doc-or">或</div>
                  <el-button size="small" @click="showGalDocTextDialog = true">
                    <el-icon><Edit /></el-icon> 手动输入/粘贴文本
                  </el-button>
                </div>
                <input
                  ref="galDocInput"
                  type="file"
                  accept=".txt,.md,.docx"
                  style="display: none"
                  @change="onGalDocFileSelected"
                />
                <div class="quality-hint">支持 .txt / .md / .docx 格式，建议文档在 5000~30000 字之间，超过 50000 字时可能影响效果</div>
              </div>

              <!-- 纯CG模式 -->
              <div class="config-section">
                <div class="setting-item-inline">
                  <div class="setting-item-info">
                    <span class="config-section-label">仅生成不带任何文字的纯 CG</span>
                    <span class="config-section-hint">开启后 CG 画面中不会包含对话框、旁白等任何文字内容，只保留纯粹的画面</span>
                  </div>
                  <el-switch v-model="workflowStore.config.galCGPureCGMode" @change="onPureCGModeChange" />
                </div>
              </div>

              <!-- CG剧情衔接旁白 -->
              <div class="config-section">
                <div class="setting-item-inline">
                  <div class="setting-item-info">
                    <span class="config-section-label">CG 剧情衔接旁白 <span style="font-size: 11px; color: #16a34a; font-weight: 400;">（推荐开启）</span></span>
                    <span class="config-section-hint">{{ workflowStore.config.galCGPureCGMode ? '纯 CG 模式下不可开启旁白' : '开启后 AI 将为每张 CG 生成配套的剧情文字，增强前后 CG 的叙事连贯性' }}</span>
                  </div>
                  <el-switch v-model="workflowStore.config.galCGEnableNarration" :disabled="workflowStore.config.galCGPureCGMode" @change="onNarrationChange" />
                </div>
              </div>

              <!-- 旁白样式选择（仅开启旁白时显示） -->
              <div class="config-section" v-if="workflowStore.config.galCGEnableNarration">
                <div class="config-section-header">
                  <span class="config-section-label">旁白展示样式</span>
                </div>
                <div class="narration-style-group">
                  <div
                    class="narration-style-option"
                    :class="{ active: workflowStore.config.galCGNarrationStyle === 'sidebar' }"
                    @click="workflowStore.config.galCGNarrationStyle = 'sidebar'"
                  >
                    <el-radio v-model="workflowStore.config.galCGNarrationStyle" value="sidebar" />
                    <div class="narration-style-text">
                      <span class="narration-style-title">右侧添加详细文本</span>
                      <span class="narration-style-desc">在 CG 右侧拼接黑色文字区域，AI 结合原文生成 100-200 字的剧情配文</span>
                    </div>
                    <el-button size="small" type="primary" plain class="narration-preview-btn" @click.stop="previewNarrationStyle('sidebar')">效果预览</el-button>
                  </div>
                  <div
                    class="narration-style-option"
                    :class="{ active: workflowStore.config.galCGNarrationStyle === 'embed' }"
                    @click="workflowStore.config.galCGNarrationStyle = 'embed'"
                  >
                    <el-radio v-model="workflowStore.config.galCGNarrationStyle" value="embed" />
                    <div class="narration-style-text">
                      <span class="narration-style-title">简要文本嵌入图片</span>
                      <span class="narration-style-desc">在 CG 画面角落渲染白底黑字文本框，由 AI 生成 1-2 句简短旁白</span>
                    </div>
                    <el-button size="small" type="primary" plain class="narration-preview-btn" @click.stop="previewNarrationStyle('embed')">效果预览</el-button>
                  </div>
                </div>
              </div>

              <!-- 旁白样式预览弹窗 -->
              <el-dialog v-model="narrationPreviewVisible" title="旁白样式预览" width="800px" top="5vh" append-to-body>
                <div class="narration-preview-content">
                  <img :src="narrationPreviewUrl" alt="样式预览" />
                </div>
              </el-dialog>

              <!-- 画风要求 -->
              <div class="config-section">
                <div class="config-section-header">
                  <span class="config-section-label">画风要求（可选）</span>
                </div>
                <div class="style-preset-group">
                  <div
                    v-for="style in galCGStylePresets"
                    :key="style.id"
                    class="style-preset-tag"
                    :class="{ 'style-preset-tag--active': workflowStore.config.galCGStylePreset === style.id }"
                    @click="workflowStore.config.galCGStylePreset = workflowStore.config.galCGStylePreset === style.id ? '' : style.id"
                  >
                    {{ style.label }}
                  </div>
                </div>
                <el-input
                  v-if="workflowStore.config.galCGStylePreset === 'custom'"
                  v-model="workflowStore.config.galCGStyleCustom"
                  type="textarea"
                  :rows="2"
                  resize="none"
                  placeholder="输入自定义画风描述，如：厚涂风格、暗色调、电影感光影..."
                  maxlength="200"
                  show-word-limit
                  style="margin-top: 8px;"
                />
                <div class="quality-hint" style="margin-top: 6px;">
                  实际画风和您配置的生图模型与模型能力有一定关系，不能完全保证画风的绝对修改，见谅
                </div>
              </div>

              <!-- 角色预设（可选） -->
              <div class="config-section">
                <div class="config-section-header">
                  <span class="config-section-label">角色预设（可选，最多 8 个）</span>
                  <el-button
                    v-if="workflowStore.config.galCGPresetCharacters.length > 0"
                    text type="danger" size="small"
                    @click="clearPresetCharacters"
                  >清空</el-button>
                </div>
                <div class="quality-hint" style="margin-bottom: 8px;">
                  预设角色后，AI 将直接使用您提供的参考图和名称，无需重新生成立绘
                </div>

                <!-- 已添加的角色列表 -->
                <div v-if="workflowStore.config.galCGPresetCharacters.length > 0" class="preset-char-grid">
                  <div
                    v-for="(ch, idx) in workflowStore.config.galCGPresetCharacters"
                    :key="ch.id"
                    class="preset-char-card"
                  >
                    <div class="preset-char-img">
                      <img :src="ch.dataUrl" alt="" />
                    </div>
                    <div class="preset-char-name">{{ ch.name }}</div>
                    <button class="preset-char-delete" @click="removePresetCharacter(idx)">
                      <el-icon :size="12"><Close /></el-icon>
                    </button>
                  </div>
                </div>

                <!-- 新建角色按钮 -->
                <div v-if="!showPresetCharForm && workflowStore.config.galCGPresetCharacters.length < 8" class="preset-char-add">
                  <el-button size="small" @click="showPresetCharForm = true">
                    <el-icon><Plus /></el-icon> 新建角色
                  </el-button>
                </div>

                <!-- 内联新建表单 -->
                <div v-if="showPresetCharForm" class="preset-char-form">
                  <div
                    class="preset-char-form-img"
                    :class="{ 'preset-char-form-img--dragover': presetCharDragover }"
                    @click="$refs.presetCharImgInput.click()"
                    @dragover.prevent="presetCharDragover = true"
                    @dragleave="presetCharDragover = false"
                    @drop.prevent="onPresetCharDrop"
                  >
                    <img v-if="presetCharDataUrl" :src="presetCharDataUrl" alt="" />
                    <div v-else class="preset-char-form-placeholder">
                      <el-icon><Upload /></el-icon>
                      <span>拖拽或点击</span>
                    </div>
                  </div>
                  <el-input
                    v-model="presetCharName"
                    placeholder="角色名称"
                    maxlength="30"
                    show-word-limit
                    clearable
                    style="flex: 1"
                  />
                  <el-button type="primary" size="small" :disabled="!presetCharName.trim() || !presetCharDataUrl" @click="confirmAddPresetCharacter">添加</el-button>
                  <el-button size="small" @click="cancelPresetCharForm">取消</el-button>
                  <input
                    ref="presetCharImgInput"
                    type="file"
                    accept="image/*"
                    style="display: none"
                    @change="onPresetCharImgSelected"
                  />
                </div>
              </div>

              <!-- 确认模式 -->
              <div class="config-section">
                <div class="config-section-header">
                  <span class="config-section-label">确认模式（仅此工作流生效）</span>
                </div>
                <div class="confirm-mode-group">
                  <div
                    class="confirm-option"
                    :class="{ active: workflowStore.config.galCGConfirmMode === 'pure-ai' }"
                    @click="workflowStore.config.galCGConfirmMode = 'pure-ai'"
                  >
                    <el-radio v-model="workflowStore.config.galCGConfirmMode" value="pure-ai" />
                    <div class="confirm-option-text">
                      <span class="confirm-option-title">纯AI工作</span>
                      <span class="confirm-option-desc">全程自动，无需人工干预</span>
                    </div>
                  </div>
                  <div
                    class="confirm-option"
                    :class="{ active: workflowStore.config.galCGConfirmMode === 'confirm-non-image' }"
                    @click="workflowStore.config.galCGConfirmMode = 'confirm-non-image'"
                  >
                    <el-radio v-model="workflowStore.config.galCGConfirmMode" value="confirm-non-image" />
                    <div class="confirm-option-text">
                      <span class="confirm-option-title">用户仅确认非图片节点</span>
                      <span class="confirm-option-desc">故事大纲、角色清单、生图计划需确认，图片由AI自动评分</span>
                    </div>
                  </div>
                  <div
                    class="confirm-option"
                    :class="{ active: workflowStore.config.galCGConfirmMode === 'confirm-image' }"
                    @click="workflowStore.config.galCGConfirmMode = 'confirm-image'"
                  >
                    <el-radio v-model="workflowStore.config.galCGConfirmMode" value="confirm-image" />
                    <div class="confirm-option-text">
                      <span class="confirm-option-title">用户仅确认图片节点</span>
                      <span class="confirm-option-desc">所有图片需用户选图确认，大纲和计划由AI自动通过</span>
                    </div>
                  </div>
                  <div
                    class="confirm-option"
                    :class="{ active: workflowStore.config.galCGConfirmMode === 'confirm-all' }"
                    @click="workflowStore.config.galCGConfirmMode = 'confirm-all'"
                  >
                    <el-radio v-model="workflowStore.config.galCGConfirmMode" value="confirm-all" />
                    <div class="confirm-option-text">
                      <span class="confirm-option-title">用户确认所有节点</span>
                      <span class="confirm-option-desc">大纲、角色、计划、图片全部需要手动确认</span>
                    </div>
                  </div>
                </div>
              <!-- AI 评分开关（仅图片确认模式下显示） -->
              <div class="config-section" v-if="workflowStore.config.galCGConfirmMode === 'confirm-all' || workflowStore.config.galCGConfirmMode === 'confirm-image'">
                <div class="setting-item-inline">
                  <div class="setting-item-info">
                    <span class="config-section-label">启用 AI 评分</span>
                    <span class="config-section-hint">{{ workflowStore.config.efficiencyMode ? '效率优先模式下 AI 评分已自动关闭' : '关闭后图片将直接展示给你选择，不经过 AI 评审打分，可节省语言模型调用费用' }}</span>
                  </div>
                  <el-switch v-model="workflowStore.config.enableAiReview" :disabled="workflowStore.config.efficiencyMode" />
                </div>
              </div>

              <!-- 评分阈值 -->
              <div class="config-section" v-if="workflowStore.config.galCGConfirmMode !== 'confirm-all' && workflowStore.config.galCGConfirmMode !== 'confirm-image' || workflowStore.config.enableAiReview">
                <div class="config-section-header">
                  <span class="config-section-label">AI 评分通过阈值</span>
                  <span class="config-time-display">{{ workflowStore.config.scoreThreshold }} 分 / 100 分</span>
                </div>
                <el-slider
                  v-model="workflowStore.config.scoreThreshold"
                  :min="60" :max="100" :step="1"
                  :marks="{ 60: '60', 70: '70', 80: '80', 90: '90', 100: '100' }"
                />
                <div class="threshold-hint">
                  分数越高要求越严格，AI 会反复迭代直到满意为止。建议 85-95 之间。
                </div>
              </div>
              </div>
            </div>
            <!-- GalCG 手动输入文本弹窗 -->
            <el-dialog v-model="showGalDocTextDialog" title="输入故事文本" width="640px" :close-on-click-modal="false" append-to-body>
              <div class="gal-doc-text-dialog">
                <el-input
                  v-model="galDocManualText"
                  type="textarea"
                  :rows="16"
                  resize="vertical"
                  placeholder="在此粘贴或输入故事文本..."
                  maxlength="100000"
                  show-word-limit
                />
              </div>
              <template #footer>
                <el-button @click="showGalDocTextDialog = false">取消</el-button>
                <el-button type="primary" :disabled="!galDocManualText.trim()" @click="handleGalDocManualSave">确认</el-button>
              </template>
            </el-dialog>
            <!-- ===== 工作模式 ===== -->
            <div class="config-card" v-if="workflowStore.activeWorkflowType !== 'char-design' && workflowStore.activeWorkflowType !== 'gal-cg'">
              <h3 class="config-card-title">工作模式</h3>

              <!-- 确认模式 -->
              <div class="config-section">
                <div class="config-section-header">
                  <span class="config-section-label">确认模式</span>
                </div>
                <div class="confirm-mode-group">
                  <div
                    class="confirm-option"
                    :class="{ active: workflowStore.config.confirmMode === 'pure-ai' }"
                    @click="workflowStore.config.confirmMode = 'pure-ai'"
                  >
                    <el-radio v-model="workflowStore.config.confirmMode" value="pure-ai" />
                    <div class="confirm-option-text">
                      <span class="confirm-option-title">纯AI工作</span>
                      <span class="confirm-option-desc">全程自动，无需人工干预</span>
                    </div>
                  </div>
                  <div
                    class="confirm-option"
                    :class="{ active: workflowStore.config.confirmMode === 'confirm-start' }"
                    @click="workflowStore.config.confirmMode = 'confirm-start'"
                  >
                    <el-radio v-model="workflowStore.config.confirmMode" value="confirm-start" />
                    <div class="confirm-option-text">
                      <span class="confirm-option-title">用户仅确认开始节点</span>
                      <span class="confirm-option-desc">仅在 AI 生成大纲后需要确认，后续自动运行</span>
                    </div>
                  </div>
                  <div
                    class="confirm-option"
                    :class="{ active: workflowStore.config.confirmMode === 'confirm-all' }"
                    @click="workflowStore.config.confirmMode = 'confirm-all'"
                  >
                    <el-radio v-model="workflowStore.config.confirmMode" value="confirm-all" />
                    <div class="confirm-option-text">
                      <span class="confirm-option-title">用户确认所有节点</span>
                      <span class="confirm-option-desc">每张图片通过前都需要你手动审批，可附加修改意见</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- AI 评分开关（仅 confirm-all 模式） -->
              <div class="config-section" v-if="workflowStore.config.confirmMode === 'confirm-all'">
                <div class="setting-item-inline">
                  <div class="setting-item-info">
                    <span class="config-section-label">启用 AI 评分</span>
                    <span class="config-section-hint">{{ workflowStore.config.efficiencyMode ? '效率优先模式下 AI 评分已自动关闭' : '关闭后图片将直接展示给你选择，不经过 AI 评审打分，可节省语言模型调用费用' }}</span>
                  </div>
                  <el-switch v-model="workflowStore.config.enableAiReview" :disabled="workflowStore.config.efficiencyMode" />
                </div>
              </div>
              <!-- 评分阈值 -->
              <div class="config-section" v-if="workflowStore.config.confirmMode !== 'confirm-all' || workflowStore.config.enableAiReview">
                <div class="config-section-header">
                  <span class="config-section-label">AI 评分通过阈值</span>
                  <span class="config-time-display">{{ workflowStore.config.scoreThreshold }} 分 / 100 分</span>
                </div>
                <el-slider
                  v-model="workflowStore.config.scoreThreshold"
                  :min="60" :max="100" :step="1"
                  :marks="{ 60: '60', 70: '70', 80: '80', 90: '90', 100: '100' }"
                />
                <div class="threshold-hint">
                  分数越高要求越严格，AI 会反复迭代直到满意为止。建议 85-95 之间。
                </div>
              </div>
            </div>

            <!-- ===== 效率优先模式 ===== -->
            <div class="config-card" v-if="workflowStore.activeWorkflowType !== 'cg-diff' && workflowStore.activeWorkflowType !== 'comic'">
              <div class="setting-item-inline">
                <div class="setting-item-info">
                  <span class="config-section-label">⚡ 效率优先模式</span>
                  <span class="config-section-hint">开启后将同时使用所有生图模型并行生成，每张图只生成一张，优化或省略评审环节，大幅提升速度但可能降低品质</span>
                </div>
                <el-switch v-model="workflowStore.config.efficiencyMode" @change="onEfficiencyModeChange" />
              </div>
            </div>
            <div class="config-card" v-if="workflowStore.activeWorkflowType === 'cg-diff'">
              <div class="setting-item-inline" style="opacity: 0.5;">
                <div class="setting-item-info">
                  <span class="config-section-label">⚡ 效率优先模式</span>
                  <span class="config-section-hint">本工作流已经过优化，效率优先模式意义不大，故未添加</span>
                </div>
              </div>
            </div>

            <!-- ===== 启动按钮 ===== -->
            <div class="config-start">
              <el-button
                type="primary"
                size="large"
                class="start-workflow-btn"
                :disabled="!canStart"
                @click="handleStartWorkflow"
              >
                <el-icon><CaretRight /></el-icon> 启动工作流
              </el-button>
              <div v-if="!canStart" class="start-hint">
                请完成以下必填项：
                <span v-if="workflowStore.config.llmModels.length === 0">添加语言模型</span>
                <span v-if="workflowStore.config.imageModels.length === 0">{{ workflowStore.config.llmModels.length === 0 ? '、' : '' }}添加生图模型</span>
                <span v-if="!workflowStore.config.initialPrompt.trim()">{{ (workflowStore.config.llmModels.length === 0 || workflowStore.config.imageModels.length === 0) ? '、' : '' }}输入初始提示词</span>
                <span v-if="workflowStore.activeWorkflowType === 'cg-diff' && workflowStore.config.cgDiffMode === 'diff-only' && !workflowStore.config.cgDiffBaseCG?.dataUrl">、上传底CG图片</span>
                <span v-if="workflowStore.activeWorkflowType === 'gal-cg' && !workflowStore.config.galCGDocumentText.trim() && !workflowStore.config.initialPrompt.trim()">、上传故事文档或输入提示词</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 工作中（规划 / 确认 / 执行） -->
        <div v-else-if="workflowStore.isRunning" class="phase-active">
          <!-- 顶部状态栏 -->
          <div class="active-header">
            <div class="active-header-left">
              <span class="status-badge status-badge--running">
                <span class="badge-dot"></span> {{ statusText }}
              </span>
              <span class="active-elapsed">{{ formatElapsed(elapsedDisplay) }}</span>
              <span class="active-remaining">剩余 {{ formatElapsed(remainingDisplay) }}</span>
            </div>
            <el-button type="danger" class="stop-workflow-btn" @click="handleStopWorkflow">
              <el-icon><CircleClose /></el-icon> 停止工作流
            </el-button>
          </div>

          <!-- 节点流 -->
          <div class="flow-pipeline">
            <div class="flow-track">
              <template v-for="(node, idx) in flowNodes" :key="node.id">
                <div class="flow-node" :class="`flow-node--${node.status}`">
                  <div class="flow-node-dot">
                    <el-icon v-if="node.status === 'done'" :size="16"><CircleCheck /></el-icon>
                    <el-icon v-else-if="node.status === 'active'" :size="16" class="is-loading"><Loading /></el-icon>
                    <el-icon v-else-if="node.status === 'waiting'" :size="16"><Clock /></el-icon>
                    <el-icon v-else-if="node.status === 'failed'" :size="16"><CircleClose /></el-icon>
                    <span v-else class="flow-node-idx">{{ idx + 1 }}</span>
                  </div>
                  <span class="flow-node-label">{{ node.label }}</span>
                  <span v-if="node.detail" class="flow-node-detail">{{ node.detail }}</span>
                </div>
                <div
                  v-if="idx < flowNodes.length - 1"
                  class="flow-connector"
                  :class="{ 'flow-connector--done': node.status === 'done' }"
                ></div>
              </template>
            </div>
          </div>


          <!-- 规划阶段：流式文本展示 -->
          <div
            v-if="workflowStore.status === 'planning' || workflowStore.status === 'confirming-plan'"
            class="planning-display"
          >
            <h3 class="section-title">AI 创作计划</h3>
            <div class="planning-text" ref="planningTextRef">
              <div v-if="workflowStore.planningText" class="planning-content">{{ workflowStore.planningText }}</div>
              <div v-else class="planning-loading">
                <el-icon class="is-loading"><Loading /></el-icon>
                <span>正在生成创作计划...</span>
              </div>
            </div>
          </div>

          <!-- 执行阶段 -->
          <div v-if="workflowStore.status === 'running'" class="execution-display">
            <h3 class="section-title">生图进度</h3>

            <!-- 每张图片进度 -->
            <div class="exec-image-list">
              <div
                v-for="prog in workflowStore.imageProgress"
                :key="prog.index"
                class="exec-image-card"
                :class="`exec-image-card--${prog.status}`"
              >
                <div class="exec-image-header">
                  <span class="exec-image-num">#{{ prog.index }}</span>
                  <span class="exec-image-title">{{ prog.title }}</span>
                  <span class="exec-image-status">{{ imageStatusLabel(prog.status) }}</span>
                </div>
                <div class="exec-image-detail">
                  <span class="exec-image-attempt" v-if="prog.currentAttempt > 0">
                    第 {{ prog.currentAttempt }} 轮
                  </span>
                  <span class="exec-image-prompt" v-if="prog.currentPrompt" :title="prog.currentPrompt">
                    {{ prog.currentPrompt }}
                  </span>
                </div>
                <!-- 最终通过的图 -->
                <div v-if="prog.status === 'passed' && prog.finalImageRecord" class="exec-image-result">
                  <img :src="getImageUrl(prog.finalImageRecord, true)" alt="" />
                </div>
              </div>
            </div>
          </div>


          <!-- 模型队列状态 -->
          <div class="model-status-section">
            <h3 class="section-title">模型队列状态</h3>
            <div class="model-status-grid">
              <!-- 语言模型队列 -->
              <div class="model-status-card">
                <div class="model-status-card-header">
                  <span class="model-status-card-title">语言模型</span>
                  <span class="model-status-card-summary">
                    可用 {{ llmAvailableCount }} / {{ workflowStore.llmQueue.length }}
                  </span>
                </div>
                <div class="model-status-list">
                  <div
                    v-for="(m, i) in workflowStore.llmQueue"
                    :key="i"
                    class="model-status-item"
                    :class="{
                      'model-status-item--active': !m.isDeprecated && isCurrentLlm(m),
                      'model-status-item--deprecated': m.isDeprecated,
                    }"
                  >
                    <div class="model-status-left">
                      <span class="model-status-indicator" :class="m.isDeprecated ? 'indicator--dead' : 'indicator--alive'"></span>
                      <div class="model-status-info">
                        <span class="model-status-name">{{ m.modelName }}</span>
                        <span class="model-status-site">{{ m.siteName }}</span>
                      </div>
                    </div>
                    <div class="model-status-right">
                      <span class="model-status-tag tag--success" v-if="m.successCount > 0">
                        {{ m.successCount }} 成功
                      </span>
                      <span class="model-status-tag tag--fail" v-if="m.totalFails > 0">
                        {{ m.totalFails }} 失败
                      </span>
                      <span class="model-status-tag tag--deprecated" v-if="m.isDeprecated">
                        {{ m._manuallyDeprecated ? '已停用（手动）' : '已停用' }}
                      </span>
                      <span class="model-status-tag tag--standby" v-if="!m.isDeprecated && m.successCount === 0 && m.totalFails === 0">
                        待命
                      </span>
                      <el-button
                        v-if="!m.isDeprecated"
                        text type="warning" size="small"
                        @click="handleDeprecateModel('llm', i)"
                        class="model-action-btn"
                      >停用</el-button>
                      <el-button
                        v-if="m.isDeprecated"
                        text type="primary" size="small"
                        @click="handleRestoreModel('llm', i)"
                        class="model-action-btn"
                      >恢复</el-button>
                    </div>
                  </div>
                  <div v-if="workflowStore.llmQueue.length === 0" class="model-status-empty">
                    未初始化
                  </div>
                </div>
              </div>

              <!-- 生图模型队列 -->
              <div class="model-status-card">
                <div class="model-status-card-header">
                  <span class="model-status-card-title">生图模型</span>
                  <span class="model-status-card-summary">
                    可用 {{ imageAvailableCount }} / {{ workflowStore.imageQueue.length }}
                  </span>
                </div>
                <div class="model-status-list">
                  <div
                    v-for="(m, i) in workflowStore.imageQueue"
                    :key="i"
                    class="model-status-item"
                    :class="{
                      'model-status-item--active': !m.isDeprecated && isCurrentImage(m),
                      'model-status-item--deprecated': m.isDeprecated,
                    }"
                  >
                    <div class="model-status-left">
                      <span class="model-status-indicator" :class="m.isDeprecated ? 'indicator--dead' : 'indicator--alive'"></span>
                      <div class="model-status-info">
                        <span class="model-status-name">{{ m.modelName }}</span>
                        <span class="model-status-site">{{ m.siteName }}</span>
                      </div>
                    </div>
                    <div class="model-status-right">
                      <span class="model-status-tag tag--success" v-if="m.successCount > 0">
                        {{ m.successCount }} 成功
                      </span>
                      <span class="model-status-tag tag--fail" v-if="m.totalFails > 0">
                        {{ m.totalFails }} 失败
                      </span>
                      <span class="model-status-tag tag--deprecated" v-if="m.isDeprecated">
                        {{ m._manuallyDeprecated ? '已停用（手动）' : '已停用' }}
                      </span>
                      <span class="model-status-tag tag--standby" v-if="!m.isDeprecated && m.successCount === 0 && m.totalFails === 0">
                        待命
                      </span>
                      <el-button
                        v-if="!m.isDeprecated"
                        text type="warning" size="small"
                        @click="handleDeprecateModel('image', i)"
                        class="model-action-btn"
                      >停用</el-button>
                      <el-button
                        v-if="m.isDeprecated"
                        text type="primary" size="small"
                        @click="handleRestoreModel('image', i)"
                        class="model-action-btn"
                      >恢复</el-button>
                    </div>
                  </div>
                  <div v-if="workflowStore.imageQueue.length === 0" class="model-status-empty">
                    未初始化
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 事件日志 -->
          <div class="timeline-section">
            <h3 class="section-title">事件日志 ({{ workflowStore.timeline.length }})</h3>
            <div class="timeline-list" ref="timelineRef">
              <div
                v-for="event in workflowStore.timeline"
                :key="event.id"
                class="timeline-item"
                :class="`timeline-item--${event.type}`"
              >
                <span class="timeline-time">{{ formatTime(event.time) }}</span>
                <span class="timeline-dot"></span>
                <span class="timeline-msg">{{ event.message }}</span>
              </div>
              <div v-if="workflowStore.timeline.length === 0" class="timeline-empty">
                暂无事件
              </div>
            </div>
          </div>
        </div>

        <!-- 已完成 / 已停止 / 已失败 -->
        <div v-else class="phase-done">
          <div class="done-card">
            <div class="done-icon-row">
              <el-icon
                :size="40"
                :color="workflowStore.status === 'completed' ? '#16a34a' : '#ef4444'"
              >
                <CircleCheck v-if="workflowStore.status === 'completed'" />
                <CircleClose v-else />
              </el-icon>
              <div class="done-text">
                <h3>工作流{{ { completed: '已完成', failed: '已失败', stopped: '已停止' }[workflowStore.status] }}</h3>
                <p v-if="workflowStore.activeWorkflowType === 'char-design' && workflowStore.status === 'completed'">
                  角色「{{ workflowStore.lastCharDesignName || '未知' }}」的设定已自动导入到「角色卡」页面，可前往查看和编辑
                </p>
                <p v-else-if="workflowStore.plan">
                  计划 {{ workflowStore.plan.totalImages }} 张，
                  完成 {{ workflowStore.finalImages.length }} 张，
                  耗时 {{ formatElapsed(elapsedDisplay) }}
                </p>
              </div>
            </div>
            <div class="done-actions">
              <el-button
                v-if="workflowStore.finalImages.length > 0 && workflowStore.activeWorkflowType !== 'char-design'"
                type="primary"
                @click="handleExportToGallery(null)"
              >
                <el-icon><FolderAdd /></el-icon> 添加当前批次到图库
              </el-button>
              <el-button v-if="workflowStore.activeWorkflowType === 'char-design' && workflowStore.status === 'completed'" type="primary" @click="$router.push('/characters')">
                <el-icon><User /></el-icon> 前往角色卡页面
              </el-button>
              <el-button @click="workflowStore.resetWorkflow()">
                返回配置页
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 最终图片区域 ===== -->
      <div class="final-section" v-if="showFinalSection">
        <div class="final-header">
          <div class="final-header-left">
            <h3>历史最终图片</h3>
            <span class="final-count">{{ totalFinalCount }} 张</span>
          </div>
          <div class="final-header-right">
            <el-button
              v-if="totalFinalCount > 0 && !workflowStore.isRunning"
              size="small"
              type="danger"
              plain
              @click="handleClearAllFinal"
            >
              <el-icon><Delete /></el-icon> 清除所有
            </el-button>
          </div>
        </div>

        <!-- 当前批次 -->
        <div v-if="workflowStore.finalImages.length > 0" class="final-batch-card">
          <div class="final-batch-header">
            <div class="final-batch-info">
              <span class="final-batch-label">当前批次</span>
              <span class="final-batch-count">{{ workflowStore.finalImages.length }} 张</span>
            </div>
            <div class="final-batch-actions" v-if="!workflowStore.isRunning">
              <el-button type="primary" size="small" @click="handleExportToGallery(null)">
                <el-icon><FolderAdd /></el-icon> 添加到图库
              </el-button>
            </div>
          </div>

          <!-- 普通网格展示 -->
          <div :class="['final-grid', themeStore.workflowDisplayMode === 'masonry' ? 'final-grid--masonry' : 'final-grid--square']">
            <div
              v-for="img in workflowStore.finalImages"
              :key="img.id"
              class="final-item"
              @click="openWorkflowDetail(img)"
            >
              <img :src="getImageUrl(img, true)" :alt="img.name || ''" loading="lazy" />
              <div class="final-item-overlay">
                <span v-if="img.cgMeta?.type === 'base'" class="final-item-cgtag final-item-cgtag--base">底CG</span>
                <span v-if="img.cgMeta?.type === 'diff'" class="final-item-cgtag final-item-cgtag--diff">{{ img.cgMeta.changeType || '差分' }}</span>
                <span v-if="img.score" class="final-item-score">{{ img.score }}分</span>
                <span v-if="img.autoSelected" class="final-item-auto">自动</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 历史批次 -->
        <div
          v-for="batch in workflowStore.batchHistory.slice().reverse()"
          :key="batch.id"
          class="final-batch-card final-batch-card--history"
        >
          <div class="final-batch-header">
            <div class="final-batch-info">
              <span class="final-batch-label">历史批次</span>
              <span class="final-batch-time">{{ formatDateTime(batch.time) }}</span>
              <span class="final-batch-count">{{ batch.images.length }} 张</span>
              <span class="final-batch-prompt" :title="batch.prompt">{{ batch.prompt }}</span>
            </div>
            <div class="final-batch-actions">
              <el-button type="primary" size="small" @click="handleExportToGallery(batch.id)">
                <el-icon><FolderAdd /></el-icon> 添加到图库
              </el-button>
            </div>
          </div>
          <div :class="['final-grid', themeStore.workflowDisplayMode === 'masonry' ? 'final-grid--masonry' : 'final-grid--square']">
            <div
              v-for="img in batch.images"
              :key="img.id"
              class="final-item"
              @click="openWorkflowDetail(img)"
            >
              <img :src="getImageUrl(img, true)" :alt="img.name || ''" loading="lazy" />
              <div class="final-item-overlay">
                <span v-if="img.cgMeta?.type === 'base'" class="final-item-cgtag final-item-cgtag--base">底CG</span>
                <span v-if="img.cgMeta?.type === 'diff'" class="final-item-cgtag final-item-cgtag--diff">{{ img.cgMeta.changeType || '差分' }}</span>
                <span v-if="img.score" class="final-item-score">{{ img.score }}分</span>
                <span v-if="img.autoSelected" class="final-item-auto">自动</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-if="totalFinalCount === 0 && workflowStore.isRunning" class="final-empty">
          <p>工作流产出的最终图片将显示在这里</p>
        </div>
      </div>

      <!-- 工作流图片详情弹窗 -->
      <el-dialog
        v-model="wfDetailVisible"
        :title="wfDetailImage?.name || '图片详情'"
        width="780px"
        top="5vh"
        :close-on-click-modal="true"
      >
        <div class="wf-detail-content" v-if="wfDetailImage">
          <div class="wf-detail-img">
            <img :src="getImageUrl(wfDetailImage)" :alt="wfDetailImage.name" />
            <button class="wf-detail-zoom" @click="wfFullPreviewVisible = true">
              <el-icon :size="18"><ZoomIn /></el-icon>
            </button>
          </div>

          <!-- 大图预览 -->
          <el-dialog
            v-model="wfFullPreviewVisible"
            title="图片预览"
            width="auto"
            top="3vh"
            append-to-body
            :close-on-click-modal="true"
          >
            <div class="wf-full-preview-content">
              <img :src="getImageUrl(wfDetailImage)" :alt="wfDetailImage.name" />
            </div>
          </el-dialog>
          <div class="wf-detail-meta">
            <div class="wf-meta-section">
              <h4>生成信息</h4>
              <div class="wf-meta-row">
                <span class="wf-meta-label">名称</span>
                <span class="wf-meta-value">{{ wfDetailImage.name || '-' }}</span>
              </div>
              <div class="wf-meta-row" v-if="wfDetailImage.score">
                <span class="wf-meta-label">AI 评分</span>
                <span class="wf-meta-value" style="color: var(--accent-color); font-weight: 700">
                  {{ wfDetailImage.score }} / 100 分
                  <span v-if="wfDetailImage.autoSelected" style="font-size: 11px; color: var(--text-muted); font-weight: 400">（自动选取）</span>
                </span>
              </div>
              <div class="wf-meta-row" v-if="wfDetailImage.attempts">
                <span class="wf-meta-label">迭代轮次</span>
                <span class="wf-meta-value">{{ wfDetailImage.attempts }} 轮</span>
              </div>
              <div class="wf-meta-row">
                <span class="wf-meta-label">生成时间</span>
                <span class="wf-meta-value">{{ formatDateTime(wfDetailImage.createdAt) }}</span>
              </div>
            </div>

            <div class="wf-meta-section" v-if="wfDetailImage.planDescription">
              <h4>规划描述</h4>
              <div class="wf-prompt-box">{{ wfDetailImage.planDescription }}</div>
            </div>

            <div class="wf-meta-section" v-if="wfDetailImage.prompt">
              <h4>最终提示词</h4>
              <div class="wf-prompt-box">{{ wfDetailImage.prompt }}</div>
            </div>

            <div class="wf-detail-actions">
              <el-button @click="handleExportSingle(wfDetailImage)">
                <el-icon><Download /></el-icon> 导出
              </el-button>
              <el-button type="danger" @click="handleDeleteWorkflowImage(wfDetailImage)">
                <el-icon><Delete /></el-icon> 删除
              </el-button>
            </div>
          </div>
        </div>
      </el-dialog>
    </div>
    <PromptAssistant v-model="showAssistant" mode="workflow" :ref-images="workflowStore.config.referenceImages" />
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { useApiStore } from '@/stores/api'
import { useChatStore } from '@/stores/chat'
import { useThemeStore } from '@/stores/theme'
import { startWorkflow } from '@/utils/workflowEngine'
import { relPathToUrl, readImageAsBase64 } from '@/utils/imageStorage'
import { useGalleryStore } from '@/stores/gallery'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  MagicStick, Loading, CircleCheck, CircleClose,
  DArrowLeft, DArrowRight, Plus, Delete, Close, Upload,
  CaretRight, WarningFilled, FolderAdd, Download, ChatDotRound, PictureFilled, Clock, Rank, RefreshRight, ZoomIn,
} from '@element-plus/icons-vue'
import PromptAssistant from '@/components/PromptAssistant.vue'

const workflowStore = useWorkflowStore()
const apiStore = useApiStore()
const chatStore = useChatStore()
const themeStore = useThemeStore()
const galleryStore = useGalleryStore()

// ========== 通用 ==========

const activeType = computed(() =>
  workflowStore.workflowTypes.find(t => t.id === workflowStore.activeWorkflowType)
)

function getImageUrl(img, isThumb = false) {
  if (img.dataUrl) return img.dataUrl
  if (img.relPath) {
    const base = relPathToUrl(img.relPath)
    return isThumb ? `${base}?thumb=400` : base
  }
  return ''
}

// ========== 实时计时 ==========

const currentTime = ref(Date.now())
let timeInterval = null

function startTimer() {
  if (timeInterval) return
  timeInterval = setInterval(() => { currentTime.value = Date.now() }, 1000)
}

function stopTimer() {
  if (timeInterval) { clearInterval(timeInterval); timeInterval = null }
}

const elapsedDisplay = computed(() => {
  if (!workflowStore.startTime) return 0
  const end = workflowStore.endTime || currentTime.value
  const elapsed = end - workflowStore.startTime
  const currentPause = workflowStore.pauseStartTime ? (currentTime.value - workflowStore.pauseStartTime) : 0
  const totalPaused = workflowStore.pausedDuration + currentPause
  return elapsed - totalPaused
})

const remainingDisplay = computed(() => {
  if (!workflowStore.startTime) return workflowStore.config.timeLimitMinutes * 60 * 1000
  const elapsed = currentTime.value - workflowStore.startTime
  const currentPause = workflowStore.pauseStartTime ? (currentTime.value - workflowStore.pauseStartTime) : 0
  const totalPaused = workflowStore.pausedDuration + currentPause
  const effectiveElapsed = elapsed - totalPaused
  return Math.max(0, workflowStore.config.timeLimitMinutes * 60 * 1000 - effectiveElapsed)
})

const statusText = computed(() => {
  const map = {
    planning: '规划中',
    'confirming-plan': '等待确认',
    running: '执行中',
  }
  return map[workflowStore.status] || ''
})

onMounted(() => {
  if (workflowStore.isRunning) startTimer()

  // 阻止 Electron 默认拖拽行为（防止页面导航到文件）
  document.addEventListener('dragover', (e) => e.preventDefault())
  document.addEventListener('drop', (e) => e.preventDefault())
})

watch(() => workflowStore.isRunning, (val) => {
  if (val) startTimer()
  else stopTimer()
})

// 监测剩余时间归零，主动触发超时检查
const timeExtendTriggered = ref(false)

watch(remainingDisplay, (val) => {
  if (val <= 0 && workflowStore.isRunning && !workflowStore.pendingConfirm && !timeExtendTriggered.value) {
    timeExtendTriggered.value = true
    const maxMinutes = workflowStore.activeWorkflowType === 'cg-diff' || workflowStore.activeWorkflowType === 'char-design' ? 24 * 60 : 72 * 60
    if (workflowStore.config.timeLimitMinutes >= maxMinutes) return

    workflowStore.requestConfirm('time-extend', {}).then(result => {
      if (result.action === 'extend') {
        timeExtendTriggered.value = false // 延长后重置，下次归零还能再弹
      } else {
        workflowStore.stopWorkflow()
      }
    })
  }
})

// 时间被延长后重置标记
watch(() => workflowStore.config.timeLimitMinutes, () => {
  timeExtendTriggered.value = false
})

// 切换工作流类型时，钳制时间上限
watch(() => workflowStore.activeWorkflowType, (type) => {
  if ((type === 'cg-diff' || type === 'char-design') && workflowStore.config.timeLimitMinutes > 1440) {
    workflowStore.config.timeLimitMinutes = 1440
  }
  if (type === 'gal-cg' && workflowStore.config.timeLimitMinutes < 30) {
    workflowStore.config.timeLimitMinutes = 30
  }
})

// char-design 时间低于25分钟自动关闭场景功能
watch(() => workflowStore.config.timeLimitMinutes, (val) => {
  if (workflowStore.activeWorkflowType === 'char-design' && val < 25) {
    workflowStore.config.charDesignEnableScenes = false
  }
})

onUnmounted(() => stopTimer())

function formatElapsed(ms) {
  if (!ms || ms < 0) return '0 秒'
  const seconds = Math.floor(ms / 1000)
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const hours = Math.floor(mins / 60)
  const remainMins = mins % 60
  if (hours > 0) return `${hours}时${remainMins}分${secs}秒`
  if (mins > 0) return `${mins}分${secs}秒`
  return `${secs} 秒`
}

function formatTime(isoStr) {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleTimeString('zh-CN')
}

// ========== 流式文本自动滚动 ==========

const planningTextRef = ref(null)
const timelineRef = ref(null)

watch(() => workflowStore.planningText, () => {
  nextTick(() => {
    if (planningTextRef.value) {
      planningTextRef.value.scrollTop = planningTextRef.value.scrollHeight
    }
  })
})

watch(() => workflowStore.timeline.length, () => {
  nextTick(() => {
    if (timelineRef.value) {
      timelineRef.value.scrollTop = timelineRef.value.scrollHeight
    }
  })
})

// ========== 模型选择 ==========

const llmSiteId = ref(null)
const llmModelId = ref(null)
const imageSiteId = ref(null)
const imageModelId = ref(null)

const currentLlmModels = computed(() => {
  const site = chatStore.chatSites.find(s => s.id === llmSiteId.value)
  return site?.models || []
})

const currentImageModels = computed(() => {
  const site = apiStore.sites.find(s => s.id === imageSiteId.value)
  return site?.models || []
})

function addLlmModel() {
  if (!llmSiteId.value || !llmModelId.value) return

  const exists = workflowStore.config.llmModels.some(
    m => m.siteId === llmSiteId.value && m.modelId === llmModelId.value
  )
  if (exists) {
    ElMessage.warning('该模型已在队列中')
    return
  }

  const chatConfig = chatStore.getChatConfig(llmSiteId.value, llmModelId.value)
  if (!chatConfig) {
    ElMessage.error('获取模型配置失败，请检查该模型是否已绑定有效的 Key')
    return
  }

  workflowStore.config.llmModels.push({
    siteId: llmSiteId.value,
    siteName: chatConfig.siteName,
    modelId: llmModelId.value,
    modelName: chatConfig.model,
    baseUrl: chatConfig.baseUrl,
    apiKey: chatConfig.apiKey,
  })
  ElMessage.success(`已添加: ${chatConfig.model}`)
}

function handleRestoreLastConfig() {
  const last = workflowStore.lastModelConfig
  if (!last) {
    ElMessage.warning('没有找到上次的配置记录')
    return
  }

  const warnings = []

  // 恢复语言模型
  const restoredLlm = []
  for (const m of last.llmModels) {
    const site = chatStore.chatSites.find(s => s.id === m.siteId)
    if (!site) {
      warnings.push(`语言模型站点「${m.siteName}」已不存在`)
      continue
    }
    const model = site.models.find(md => md.id === m.modelId)
    if (!model) {
      warnings.push(`语言模型「${m.modelName}」已不存在于站点「${m.siteName}」`)
      continue
    }
    const chatConfig = chatStore.getChatConfig(m.siteId, m.modelId)
    if (!chatConfig) {
      warnings.push(`语言模型「${m.modelName}」的 Key 已失效`)
      continue
    }
    restoredLlm.push({
      siteId: m.siteId,
      siteName: chatConfig.siteName,
      modelId: m.modelId,
      modelName: chatConfig.model,
      baseUrl: chatConfig.baseUrl,
      apiKey: chatConfig.apiKey,
    })
  }

  // 恢复生图模型
  const restoredImage = []
  for (const m of last.imageModels) {
    const site = apiStore.sites.find(s => s.id === m.siteId)
    if (!site) {
      warnings.push(`生图模型站点「${m.siteName}」已不存在`)
      continue
    }
    const model = site.models.find(md => md.id === m.modelId)
    if (!model) {
      warnings.push(`生图模型「${m.modelName}」已不存在于站点「${m.siteName}」`)
      continue
    }
    const config = apiStore.getGenConfig(m.siteId, m.modelId)
    if (!config) {
      warnings.push(`生图模型「${m.modelName}」的 Key 已失效`)
      continue
    }
    restoredImage.push({
      siteId: m.siteId,
      siteName: config.siteName,
      modelId: m.modelId,
      modelName: config.model,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      apiType: config.apiType,
      endpoint: config.endpoint,
    })
  }

  workflowStore.config.llmModels = restoredLlm
  workflowStore.config.imageModels = restoredImage

  if (warnings.length > 0) {
    ElMessage.warning({
      message: `已恢复配置，但以下模型无法找到:\n${warnings.join('\n')}`,
      duration: 5000,
      showClose: true,
    })
  } else {
    const time = new Date(last.savedAt).toLocaleString('zh-CN')
    ElMessage.success(`已恢复上次配置 (${time})`)
  }
}

function removeLlmModel(index) {
  workflowStore.config.llmModels.splice(index, 1)
}

// ========== 拖拽排序 ==========
const dragType = ref(null)
const dragIndex = ref(null)
const dragOverIndex = ref(null)

function onDragStart(type, index) {
  dragType.value = type
  dragIndex.value = index
}

function onDragOver(e, type, index) {
  if (dragType.value !== type) return
  e.preventDefault()
  dragOverIndex.value = index
}

function onDragEnd(type) {
  if (dragType.value !== type || dragIndex.value === null || dragOverIndex.value === null) {
    resetDrag()
    return
  }
  if (dragIndex.value === dragOverIndex.value) {
    resetDrag()
    return
  }

  const list = type === 'llm'
    ? workflowStore.config.llmModels
    : workflowStore.config.imageModels

  const item = list.splice(dragIndex.value, 1)[0]
  list.splice(dragOverIndex.value, 0, item)
  resetDrag()
}

function resetDrag() {
  dragType.value = null
  dragIndex.value = null
  dragOverIndex.value = null
}

function addImageModel() {
  if (!imageSiteId.value || !imageModelId.value) return

  const exists = workflowStore.config.imageModels.some(
    m => m.siteId === imageSiteId.value && m.modelId === imageModelId.value
  )
  if (exists) {
    ElMessage.warning('该模型已在队列中')
    return
  }

  const config = apiStore.getGenConfig(imageSiteId.value, imageModelId.value)
  if (!config) {
    ElMessage.error('获取模型配置失败，请检查该模型是否已绑定有效的 Key')
    return
  }

  workflowStore.config.imageModels.push({
    siteId: imageSiteId.value,
    siteName: config.siteName,
    modelId: imageModelId.value,
    modelName: config.model,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    apiType: config.apiType,
    endpoint: config.endpoint,
  })
  ElMessage.success(`已添加: ${config.model}`)
}

function removeImageModel(index) {
  workflowStore.config.imageModels.splice(index, 1)
}

function apiTypeLabel(type) {
  const map = { images: '图片接口', chat: 'Chat', responses: 'Responses' }
  return map[type] || type
}

// ========== 参考图 ==========

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
      workflowStore.config.referenceImages.push({
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        dataUrl: ev.target.result,
      })
    }
    reader.readAsDataURL(file)
  }
}

const showAssistant = ref(false)
const refFileInput = ref(null)

function selectRefImage() {
  refFileInput.value?.click()
}

const galDocDragover = ref(false)

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

function onGalDocDrop(e) {
  galDocDragover.value = false
  const files = Array.from(e.dataTransfer?.files || [])
  if (files.length === 0) return

  const file = files[0]
  const ext = file.name.split('.').pop()?.toLowerCase()
  const supportedExts = ['txt', 'md', 'docx']

  if (!supportedExts.includes(ext)) {
    ElMessage.warning(`不支持的文件格式: .${ext}，请使用 .txt / .md / .docx`)
    return
  }

  // 复用现有的上传逻辑：构造一个假的 event 对象
  const fakeEvent = { target: { files: [file], value: '' } }
  onGalDocFileSelected(fakeEvent)
}

function onRefFileSelected(e) {
  const files = Array.from(e.target.files || [])
  for (const file of files) {
    const reader = new FileReader()
    reader.onload = (ev) => {
      workflowStore.config.referenceImages.push({
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        dataUrl: ev.target.result,
      })
    }
    reader.readAsDataURL(file)
  }
  e.target.value = ''
}

function removeRefImage(id) {
  workflowStore.config.referenceImages = workflowStore.config.referenceImages.filter(i => i.id !== id)
}

function clearRefImages() {
  workflowStore.config.referenceImages = []
}

async function useImportedAsRef(img) {
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
  workflowStore.config.referenceImages.push({
    id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
    dataUrl,
  })
  ElMessage.success('已添加为参考图')
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

const hasResponsesModel = computed(() =>
  workflowStore.config.imageModels.some(m => m.apiType === 'responses')
)

// ========== GalCG 文档处理 ==========

const galDocInput = ref(null)
const showGalDocTextDialog = ref(false)
const galDocManualText = ref('')

async function onGalDocFileSelected(e) {
  const file = e.target.files?.[0]
  if (!file) return
  e.target.value = ''

  const ext = file.name.split('.').pop()?.toLowerCase()

  // .txt 和 .md 直接在前端读取（无需主进程解析）
  if (ext === 'txt' || ext === 'md') {
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target.result
      if (!text.trim()) {
        ElMessage.warning('文件内容为空')
        return
      }
      workflowStore.config.galCGDocumentText = text
      workflowStore.config.galCGDocumentTitle = file.name
      if (text.length > 50000) {
        ElMessageBox.alert(
          `文档字数为 ${text.length} 字，超过 50000 字可能影响AI处理效果，建议精简后重试。`,
          '文档过长提醒',
          { confirmButtonText: '我知道了', type: 'warning' }
        )
      }
    }
    reader.readAsText(file)
    return
  }

  // .docx 需要主进程解析
  if (ext === 'docx') {
    try {
      ElMessage.info('正在解析文档...')
      // 在渲染进程读取文件为 base64，再传给主进程解析
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (ev) => {
          const arrayBuffer = ev.target.result
          const uint8Array = new Uint8Array(arrayBuffer)
          let binary = ''
          for (let i = 0; i < uint8Array.length; i++) {
            binary += String.fromCharCode(uint8Array[i])
          }
          resolve(btoa(binary))
        }
        reader.onerror = reject
        reader.readAsArrayBuffer(file)
      })
      const result = await window.electronAPI.parseDocument({ base64Data, ext: '.' + ext })
      if (!result.success) {
        ElMessage.error(result.error || '文档解析失败')
        return
      }
      const text = result.text
      workflowStore.config.galCGDocumentText = text
      workflowStore.config.galCGDocumentTitle = file.name
      ElMessage.success(`文档解析成功，共 ${text.length} 字`)
      if (text.length > 50000) {
        ElMessageBox.alert(
          `文档字数为 ${text.length} 字，超过 50000 字可能影响AI处理效果，建议精简后重试。`,
          '文档过长提醒',
          { confirmButtonText: '我知道了', type: 'warning' }
        )
      }
    } catch (err) {
      ElMessage.error('文档解析失败: ' + (err.message || '未知错误'))
    }
    return
  }

  ElMessage.warning(`不支持的文件格式: .${ext}`)
}

function clearGalCGDocument() {
  workflowStore.config.galCGDocumentText = ''
  workflowStore.config.galCGDocumentTitle = ''
}

function handleGalDocManualSave() {
  if (!galDocManualText.value.trim()) {
    ElMessage.warning('请输入文本内容')
    return
  }
  workflowStore.config.galCGDocumentText = galDocManualText.value
  workflowStore.config.galCGDocumentTitle = '手动输入'
  showGalDocTextDialog.value = false
  if (galDocManualText.value.length > 50000) {
    ElMessageBox.alert(
      `文本字数为 ${galDocManualText.value.length} 字，超过 50000 字可能影响AI处理效果，建议精简。`,
      '文本过长提醒',
      { confirmButtonText: '我知道了', type: 'warning' }
    )
  }
  galDocManualText.value = ''
}

// ========== GalCG 旁白样式预览 ==========

const narrationPreviewVisible = ref(false)
const narrationPreviewUrl = ref('')

function onPureCGModeChange(val) {
  if (val) {
    workflowStore.config.galCGEnableNarration = false
  }
}

function onNarrationChange(val) {
  if (val) {
    workflowStore.config.galCGPureCGMode = false
  }
}

const galCGStylePresets = [
  { id: 'anime-cel', label: '日系赛璐珞' },
  { id: 'anime-soft', label: '日系柔光' },
  { id: 'galgame', label: 'Galgame CG' },
  { id: 'watercolor', label: '水彩风格' },
  { id: 'realistic', label: '半写实' },
  { id: 'pixel', label: '像素风' },
  { id: 'custom', label: '自定义' },
]

function previewNarrationStyle(style) {
  narrationPreviewUrl.value = style === 'sidebar'
    ? new URL('/narration-preview-sidebar.png', import.meta.url).href
    : new URL('/narration-preview-embed.png', import.meta.url).href
  narrationPreviewVisible.value = true
}
// ========== GalCG 角色预设 ==========

const showPresetCharForm = ref(false)
const presetCharName = ref('')
const presetCharDataUrl = ref('')
const presetCharImgInput = ref(null)
const presetCharDragover = ref(false)

function onPresetCharDrop(e) {
  presetCharDragover.value = false
  const files = Array.from(e.dataTransfer?.files || [])
  const imageFile = files.find(f => f.type.startsWith('image/'))
  if (!imageFile) {
    ElMessage.warning('请拖入图片文件')
    return
  }
  const reader = new FileReader()
  reader.onload = (ev) => {
    presetCharDataUrl.value = ev.target.result
  }
  reader.readAsDataURL(imageFile)
}

function onPresetCharImgSelected(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    presetCharDataUrl.value = ev.target.result
  }
  reader.readAsDataURL(file)
  e.target.value = ''
}

function confirmAddPresetCharacter() {
  if (!presetCharName.value.trim() || !presetCharDataUrl.value) return
  if (workflowStore.config.galCGPresetCharacters.length >= 8) {
    ElMessage.warning('最多预设 8 个角色')
    return
  }
  workflowStore.config.galCGPresetCharacters.push({
    id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
    name: presetCharName.value.trim(),
    dataUrl: presetCharDataUrl.value,
  })
  presetCharName.value = ''
  presetCharDataUrl.value = ''
  showPresetCharForm.value = false
  ElMessage.success('角色已添加')
}

function cancelPresetCharForm() {
  presetCharName.value = ''
  presetCharDataUrl.value = ''
  showPresetCharForm.value = false
}

function removePresetCharacter(idx) {
  workflowStore.config.galCGPresetCharacters.splice(idx, 1)
}

function clearPresetCharacters() {
  workflowStore.config.galCGPresetCharacters = []
}
// ========== CG差分模式 ==========

const isCgDiffWorkflow = computed(() => workflowStore.activeWorkflowType === 'cg-diff')

const cgDiffBaseCGInput = ref(null)

const cgBaseDragover = ref(false)

function onCgBaseDrop(e) {
  cgBaseDragover.value = false
  const files = Array.from(e.dataTransfer?.files || [])
  const imageFile = files.find(f => f.type.startsWith('image/'))
  if (!imageFile) {
    ElMessage.warning('请拖入图片文件')
    return
  }
  const reader = new FileReader()
  reader.onload = (ev) => {
    const img = new Image()
    img.onload = () => {
      workflowStore.config.cgDiffBaseCG = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        dataUrl: ev.target.result,
        width: img.naturalWidth,
        height: img.naturalHeight,
      }
      workflowStore.config.cgDiffAutoSize = detectBestSize(img.naturalWidth, img.naturalHeight)
      workflowStore.config.imageSize = workflowStore.config.cgDiffAutoSize
    }
    img.src = ev.target.result
  }
  reader.readAsDataURL(imageFile)
}

function selectCgDiffBaseCG() {
  cgDiffBaseCGInput.value?.click()
}

function onCgDiffBaseCGSelected(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    const img = new Image()
    img.onload = () => {
      workflowStore.config.cgDiffBaseCG = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        dataUrl: ev.target.result,
        width: img.naturalWidth,
        height: img.naturalHeight,
      }
      // 自动检测分辨率
      workflowStore.config.cgDiffAutoSize = detectBestSize(img.naturalWidth, img.naturalHeight)
      workflowStore.config.imageSize = workflowStore.config.cgDiffAutoSize
    }
    img.src = ev.target.result
  }
  reader.readAsDataURL(file)
  e.target.value = ''
}

function removeCgDiffBaseCG() {
  workflowStore.config.cgDiffBaseCG = null
  workflowStore.config.cgDiffAutoSize = 'auto'
}

function detectBestSize(width, height) {
  const presets = [
    { label: '1024x1024', w: 1024, h: 1024 },
    { label: '1536x1024', w: 1536, h: 1024 },
    { label: '1024x1536', w: 1024, h: 1536 },
    { label: '1280x720', w: 1280, h: 720 },
    { label: '720x1280', w: 720, h: 1280 },
    { label: '2048x2048', w: 2048, h: 2048 },
    { label: '2560x1440', w: 2560, h: 1440 },
    { label: '1440x2560', w: 1440, h: 2560 },
    { label: '3840x2160', w: 3840, h: 2160 },
    { label: '2160x3840', w: 2160, h: 3840 },
    { label: '4096x4096', w: 4096, h: 4096 },
  ]

  const ratio = width / height
  let bestMatch = null
  let bestDiff = Infinity

  for (const p of presets) {
    const pRatio = p.w / p.h
    const ratioDiff = Math.abs(ratio - pRatio)
    const sizeDiff = Math.abs(width - p.w) + Math.abs(height - p.h)
    const totalDiff = ratioDiff * 1000 + sizeDiff
    if (totalDiff < bestDiff) {
      bestDiff = totalDiff
      bestMatch = p.label
    }
  }

  // 如果差异太大就用 auto
  if (bestDiff > 2000) return 'auto'
  return bestMatch || 'auto'
}

// ========== 时间显示 ==========

const timeLimitDisplay = computed(() => {
  const mins = workflowStore.config.timeLimitMinutes
  const hours = Math.floor(mins / 60)
  const remainMins = mins % 60
  if (hours === 0) return `${remainMins} 分钟`
  if (remainMins === 0) return `${hours} 小时`
  return `${hours} 小时 ${remainMins} 分钟`
})

const timeMarks = computed(() => {
  if (workflowStore.activeWorkflowType === 'cg-diff' || workflowStore.activeWorkflowType === 'char-design') {
    return { 10: '10分', 60: '1h', 360: '6h', 720: '12h', 1440: '24h' }
  }
  if (workflowStore.activeWorkflowType === 'gal-cg') {
    return { 30: '30分', 360: '6h', 720: '12h', 1440: '24h', 2880: '48h', 4320: '72h' }
  }
  return { 10: '10分', 720: '12h', 1440: '24h', 2880: '48h', 4320: '72h' }
})

const timeLimitMax = computed(() => {
  if (workflowStore.activeWorkflowType === 'cg-diff') return 1440
  if (workflowStore.activeWorkflowType === 'char-design') return 1440
  return 4320
})

// ========== 启动 / 停止 ==========

const canStart = computed(() => {
  const minTime = workflowStore.activeWorkflowType === 'gal-cg' ? 30 : 10
  const base = workflowStore.config.llmModels.length > 0
    && workflowStore.config.imageModels.length > 0
    && workflowStore.config.timeLimitMinutes >= minTime

  // GalCG：需要文档文本或提示词
  if (workflowStore.activeWorkflowType === 'gal-cg') {
    return base && (workflowStore.config.galCGDocumentText.trim().length > 0 || workflowStore.config.initialPrompt.trim().length > 0)
  }

  // CG差分-仅差分模式需要上传底CG
  if (workflowStore.activeWorkflowType === 'cg-diff' && workflowStore.config.cgDiffMode === 'diff-only') {
    return base && workflowStore.config.initialPrompt.trim().length > 0 && workflowStore.config.cgDiffBaseCG?.dataUrl
  }

  return base && workflowStore.config.initialPrompt.trim().length > 0
})

// ========== 效率优先模式 ==========

async function onEfficiencyModeChange(val) {
  if (val) {
    try {
      await ElMessageBox.confirm(
        '效率优先模式开启后，将同时使用所有您配置的生图模型进行生图，每张图片只会生成一张但多张不同图片将同时生成（您配置的生图模型越多，并发数越多），但稳定性和品质可能有所降低，是否依旧开启？',
        '确认开启效率优先模式',
        { confirmButtonText: '确认开启', cancelButtonText: '取消', type: 'warning' }
      )
      // 强制关闭 AI 评分
      workflowStore.config.enableAiReview = false
    } catch {
      workflowStore.config.efficiencyMode = false
    }
  } else {
    // 关闭效率优先时恢复 AI 评分默认值
    workflowStore.config.enableAiReview = true
  }
}

async function handleStartWorkflow() {
  if (!canStart.value) {
    ElMessage.warning('请完成所有必填配置')
    return
  }
  if (workflowStore.activeWorkflowType === 'cg-diff') {
    const { startCgDiffWorkflow } = await import('@/utils/cgDiffWorkflowEngine')
    startCgDiffWorkflow(workflowStore)
  } else if (workflowStore.activeWorkflowType === 'char-design') {
    const { startCharDesignWorkflow } = await import('@/utils/characterDesignEngine')
    startCharDesignWorkflow(workflowStore)
  } else if (workflowStore.activeWorkflowType === 'gal-cg') {
    const { startGalCGWorkflow } = await import('@/utils/galCGWorkflowEngine')
    startGalCGWorkflow(workflowStore)
  } else {
    startWorkflow(workflowStore)
  }
}

async function handleStopWorkflow() {
  workflowStore.requestStop()

  try {
    await ElMessageBox.confirm(
      '确定要停止工作流吗？已生成的图片不会丢失，但正在进行的任务将被丢弃。',
      '停止确认',
      { confirmButtonText: '停止', cancelButtonText: '继续运行', type: 'warning' }
    )
    workflowStore.stopWorkflow()
    ElMessage.success('工作流已停止')

    // 兜底：延迟检查，如果引擎因残留异步错误将状态改为 failed，强制纠正回 stopped
    let alreadyCorrected = false
    const checkInterval = setInterval(() => {
      if (workflowStore.status === 'failed' && !alreadyCorrected) {
        workflowStore.status = 'stopped'
        if (!workflowStore.endTime) workflowStore.endTime = Date.now()
        alreadyCorrected = true
        clearInterval(checkInterval)
      }
    }, 100)
    setTimeout(() => clearInterval(checkInterval), 5000)
  } catch {
    workflowStore.cancelStop()
    ElMessage.info('已取消停止，工作流继续运行')
  }
}


// ========== 节点流 ==========

const flowNodes = computed(() => {
  const nodes = []
  const ws = workflowStore

  nodes.push({ id: 'start', label: '开始', status: 'done' })

  // ===== CG差分工作流专属节点 =====
  if (ws.activeWorkflowType === 'cg-diff') {
    const isFull = ws.config.cgDiffMode === 'full'
    const diffStartIdx = isFull ? 1 : 0
    const baseCGProgress = isFull ? ws.imageProgress?.[0] : null
    const baseCGDone = baseCGProgress?.status === 'passed'
    const hasDiffEntries = ws.imageProgress?.length > diffStartIdx

    if (isFull) {
      // CG大纲节点
      let cgPlanStatus = 'pending'
      if (!baseCGProgress && !hasDiffEntries) {
        if (ws.status === 'planning') cgPlanStatus = 'active'
        else if (ws.status === 'confirming-plan') cgPlanStatus = 'waiting'
      }
      if (baseCGProgress || hasDiffEntries || ws.status === 'completed') cgPlanStatus = 'done'
      if (['failed', 'stopped'].includes(ws.status) && cgPlanStatus !== 'done') cgPlanStatus = 'failed'
      nodes.push({ id: 'cg-plan', label: 'CG大纲', status: cgPlanStatus })

      // 底CG节点
      let baseCGNodeStatus = 'pending'
      if (baseCGProgress) {
        if (['generating', 'reviewing', 'waiting-confirm'].includes(baseCGProgress.status)) baseCGNodeStatus = 'active'
        else if (baseCGProgress.status === 'passed') baseCGNodeStatus = 'done'
        else if (['timeout', 'max-attempts', 'error'].includes(baseCGProgress.status)) baseCGNodeStatus = 'failed'
      }
      if (['failed', 'stopped'].includes(ws.status) && baseCGNodeStatus === 'pending' && cgPlanStatus === 'done') baseCGNodeStatus = 'failed'
      nodes.push({
        id: 'base-cg', label: '底CG', status: baseCGNodeStatus,
        detail: baseCGProgress?.currentAttempt > 0 ? `第${baseCGProgress.currentAttempt}轮` : ''
      })
    }

    // 差分大纲节点
    let diffPlanStatus = 'pending'
    const canReachDiffPlan = isFull ? baseCGDone : true
    if (canReachDiffPlan && !hasDiffEntries) {
      if (ws.status === 'planning') diffPlanStatus = 'active'
      else if (ws.status === 'confirming-plan') diffPlanStatus = 'waiting'
    }
    if (hasDiffEntries || ws.status === 'completed') diffPlanStatus = 'done'
    if (['failed', 'stopped'].includes(ws.status) && diffPlanStatus !== 'done' && canReachDiffPlan) diffPlanStatus = 'failed'
    nodes.push({ id: 'diff-plan', label: '差分大纲', status: diffPlanStatus })

    // 差分图片节点
    if (ws.imageProgress?.length > diffStartIdx) {
      for (let i = diffStartIdx; i < ws.imageProgress.length; i++) {
        const prog = ws.imageProgress[i]
        let imgStatus = 'pending'
        if (['generating', 'reviewing', 'waiting-confirm'].includes(prog.status)) imgStatus = 'active'
        else if (prog.status === 'passed') imgStatus = 'done'
        else if (['timeout', 'max-attempts', 'error'].includes(prog.status)) imgStatus = 'failed'
        nodes.push({
          id: `diff-${i}`, label: prog.title || `差分 #${i - diffStartIdx + 1}`,
          status: imgStatus, detail: prog.currentAttempt > 0 ? `第${prog.currentAttempt}轮` : ''
        })
      }
    }
  }
  // ===== 人物设定生成工作流节点 =====
  else if (ws.activeWorkflowType === 'char-design') {
    const hasProgress = ws.imageProgress && ws.imageProgress.length > 0
    const enableScenes = ws.config.charDesignEnableScenes

    // 设定节点
    let settingStatus = 'pending'
    if (!hasProgress) {
      if (ws.status === 'planning') settingStatus = 'active'
      else if (ws.status === 'confirming-plan') settingStatus = 'waiting'
    }
    if (hasProgress || ws.status === 'completed') settingStatus = 'done'
    if (['failed', 'stopped'].includes(ws.status) && settingStatus !== 'done') settingStatus = 'failed'
    nodes.push({ id: 'char-setting', label: '角色设定', status: settingStatus })

    // 锚定图节点
    let anchorStatus = 'pending'
    const anchorProg = ws.imageProgress?.[0]
    if (anchorProg) {
      if (['generating', 'reviewing', 'waiting-confirm'].includes(anchorProg.status)) anchorStatus = 'active'
      else if (anchorProg.status === 'passed') anchorStatus = 'done'
      else if (['timeout', 'max-attempts', 'error'].includes(anchorProg.status)) anchorStatus = 'failed'
    }
    nodes.push({ id: 'anchor', label: '锚定图', status: anchorStatus, detail: anchorProg?.currentAttempt > 0 ? `第${anchorProg.currentAttempt}轮` : '' })


    // 表情差分汇总节点
    if (ws.config.charDesignEnableExpressions) {
      const exprCount = ws.config.charDesignExpressionCount || 4
      const anchorDone = anchorProg?.status === 'passed'
      // 计算表情差分的 progress 范围（紧跟在锚定图后面）
      const exprStartIdx = 1
      const exprEndIdx = exprStartIdx + exprCount
      let exprDoneCount = 0
      let exprHasActive = false

      if (ws.imageProgress?.length > exprStartIdx) {
        for (let i = exprStartIdx; i < Math.min(exprEndIdx, ws.imageProgress.length); i++) {
          const p = ws.imageProgress[i]
          if (p?.charDesignMeta?.type === 'expression' || (p && i < exprEndIdx)) {
            if (p.status === 'passed') exprDoneCount++
            if (['generating', 'reviewing', 'waiting-confirm'].includes(p.status)) exprHasActive = true
          }
        }
      }

      let exprStatus = 'pending'
      if (exprDoneCount === exprCount) exprStatus = 'done'
      else if (exprHasActive || exprDoneCount > 0) exprStatus = 'active'
      else if (anchorDone && ws.status === 'planning') exprStatus = 'active' // 大纲阶段
      else if (anchorDone && ws.status === 'confirming-plan' && !ws.imageProgress?.some(p => p.charDesignMeta?.type === 'expression')) exprStatus = 'waiting'
      if (['failed', 'stopped'].includes(ws.status) && exprStatus === 'pending' && anchorDone) exprStatus = 'failed'

      nodes.push({ id: 'expressions', label: '表情差分', status: exprStatus, detail: `${exprDoneCount}/${exprCount}` })
    }

    // 侧面/背面节点（仅开启时显示）
    if (ws.config.charDesignEnableAngles) {
      const angleOffset = 1 + (ws.config.charDesignEnableExpressions ? (ws.config.charDesignExpressionCount || 4) : 0)
      const angleNames = ['侧面', '背面']
      for (let i = 0; i < 2; i++) {
        const prog = ws.imageProgress?.[angleOffset + i]
        let status = 'pending'
        if (prog) {
          if (['generating', 'reviewing', 'waiting-confirm'].includes(prog.status)) status = 'active'
          else if (prog.status === 'passed') status = 'done'
          else if (['timeout', 'max-attempts', 'error'].includes(prog.status)) status = 'failed'
        }
        nodes.push({ id: `angle-${i}`, label: angleNames[i], status, detail: prog?.currentAttempt > 0 ? `第${prog.currentAttempt}轮` : '' })
      }
    }

    // 场景节点（如果开启）
    const exprOffset = ws.config.charDesignEnableExpressions ? (ws.config.charDesignExpressionCount || 4) : 0
    const angleOffset = ws.config.charDesignEnableAngles ? 2 : 0
    const sceneStartIdx = 1 + exprOffset + angleOffset
    if (enableScenes && ws.imageProgress?.length > sceneStartIdx) {
      // 效率优先模式：场景图汇总为一个节点
      if (ws.config.efficiencyMode) {
        const sceneProgs = ws.imageProgress.slice(sceneStartIdx)
        const total = sceneProgs.length
        const passedCount = sceneProgs.filter(p => p.status === 'passed').length
        const generatedCount = sceneProgs.filter(p => ['passed', 'reviewing', 'waiting-confirm'].includes(p.status)).length
        const isActive = sceneProgs.some(p => ['generating', 'reviewing', 'waiting-confirm'].includes(p.status))
        let sceneStatus = 'pending'
        if (passedCount === total) sceneStatus = 'done'
        else if (isActive || generatedCount > 0) sceneStatus = 'active'
        if (['failed', 'stopped'].includes(ws.status) && sceneStatus !== 'done') sceneStatus = 'failed'
        nodes.push({ id: 'scenes-all', label: '场景插图', status: sceneStatus, detail: `${generatedCount}/${total}` })
      } else {
        for (let i = sceneStartIdx; i < ws.imageProgress.length; i++) {
          const prog = ws.imageProgress[i]
          let status = 'pending'
          if (['generating', 'reviewing', 'waiting-confirm'].includes(prog.status)) status = 'active'
          else if (prog.status === 'passed') status = 'done'
          else if (['timeout', 'max-attempts', 'error'].includes(prog.status)) status = 'failed'
          nodes.push({ id: `scene-${i}`, label: prog.title || `场景${i - 2}`, status, detail: prog?.currentAttempt > 0 ? `第${prog.currentAttempt}轮` : '' })
        }
      }
    } else if (enableScenes) {
      // 场景大纲阶段
      let scenesPlanStatus = 'pending'
      const anchorDone = anchorProg?.status === 'passed'
      const lastPreSceneIdx = sceneStartIdx - 1
      const anglesDone = lastPreSceneIdx < 1 ? true : ws.imageProgress?.[lastPreSceneIdx]?.status === 'passed'
      if (anchorDone && anglesDone && ws.status === 'planning') scenesPlanStatus = 'active'
      else if (anchorDone && anglesDone && ws.status === 'confirming-plan') scenesPlanStatus = 'waiting'
      if (['failed', 'stopped'].includes(ws.status) && scenesPlanStatus === 'pending' && anchorDone) scenesPlanStatus = 'failed'
      nodes.push({ id: 'scene-plan', label: '场景大纲', status: scenesPlanStatus })
    }

    // 文档节点
    let docStatus = 'pending'
    const allImagesDone = ws.imageProgress?.length > 0 && ws.imageProgress.every(p => ['passed', 'timeout', 'max-attempts', 'error'].includes(p.status))
    if (ws.status === 'completed') docStatus = 'done'
    else if (allImagesDone && ws.status === 'planning') docStatus = 'active'
    else if (allImagesDone && ws.status === 'confirming-plan') docStatus = 'waiting'
    else if (['failed', 'stopped'].includes(ws.status)) docStatus = 'failed'
    nodes.push({ id: 'final-doc', label: '角色卡文档', status: docStatus })
  }

  // ===== GalCG叙事工作流节点 =====
  else if (ws.activeWorkflowType === 'gal-cg') {
    const outlineDone = ws._galOutlineDone
    const charsDone = ws._galCharsDone
    const charImgDone = ws._galCharImgDone
    const finalCharsDone = ws._galFinalCharsDone
    const hasCharPortraits = ws.imageProgress?.some(p => p.galMeta?.type === 'char-portrait')
    const hasCGs = ws.imageProgress?.some(p => p.galMeta?.type === 'cg')

    // 故事大纲节点
    let outlineStatus = 'pending'
    if (outlineDone) {
      outlineStatus = 'done'
    } else {
      if (ws.status === 'planning') outlineStatus = 'active'
      else if (ws.status === 'confirming-plan') outlineStatus = 'waiting'
    }
    if (['failed', 'stopped'].includes(ws.status) && outlineStatus !== 'done') outlineStatus = 'failed'
    nodes.push({ id: 'gal-outline', label: '故事大纲', status: outlineStatus })

    // 角色提取节点
    let charListStatus = 'pending'
    if (charsDone) {
      charListStatus = 'done'
    } else if (outlineDone) {
      if (ws.status === 'planning') charListStatus = 'active'
      else if (ws.status === 'confirming-plan') charListStatus = 'waiting'
    }
    if (['failed', 'stopped'].includes(ws.status) && charListStatus !== 'done' && outlineDone) charListStatus = 'failed'
    nodes.push({ id: 'gal-chars', label: '角色提取', status: charListStatus })

    // 角色处理节点（含描述生成+立绘生成）
    let charProcessStatus = 'pending'
    if (charsDone && !charImgDone) {
      if (ws.status === 'confirming-plan') charProcessStatus = 'waiting'
      else if (['planning', 'running'].includes(ws.status)) charProcessStatus = 'active'
      else if (['failed', 'stopped'].includes(ws.status)) charProcessStatus = 'failed'
    } else if (charImgDone) {
      charProcessStatus = 'done'
    }
    if (charsDone) {
      nodes.push({ id: 'gal-char-process', label: '角色处理', status: charProcessStatus })
    }

    // CG计划节点
    const cgPlanDone = ws._galCGPlanDone
    let cgPlanStatus = 'pending'
    if (finalCharsDone && !cgPlanDone) {
      if (ws.status === 'planning') cgPlanStatus = 'active'
      else if (ws.status === 'confirming-plan') cgPlanStatus = 'waiting'
    }
    if (cgPlanDone || hasCGs || ws.status === 'completed') cgPlanStatus = 'done'
    if (['failed', 'stopped'].includes(ws.status) && cgPlanStatus !== 'done' && finalCharsDone) cgPlanStatus = 'failed'
    nodes.push({ id: 'gal-cg-plan', label: 'CG计划', status: cgPlanStatus })

    // 旁白生成节点（仅开启旁白时显示）
    if (ws.config.galCGEnableNarration) {
      const narrationDone = ws._galNarrationDone
      const cgPlanDoneRef = ws._galCGPlanDone  // 使用引擎标记，不依赖派生状态
      let narrationStatus = 'pending'
      if (narrationDone) {
        narrationStatus = 'done'
      } else if (hasCGs) {
        // 如果已经有CG在生成了，说明旁白已完成（或跳过了）
        narrationStatus = 'done'
      } else if (cgPlanDoneRef) {
        // CG计划确实完成且旁白未完成，说明正在生成旁白
        if (ws.status === 'planning') narrationStatus = 'active'
        else if (['failed', 'stopped'].includes(ws.status)) narrationStatus = 'failed'
      }
      const narrationLabel = ws.config.galCGNarrationStyle === 'sidebar' ? '配文生成' : '旁白生成'
      nodes.push({ id: 'gal-narration', label: narrationLabel, status: narrationStatus })
    }

    // CG生成节点
    const cgCount = ws.imageProgress?.filter(p => p.galMeta?.type === 'cg')?.length || 0
    if (cgCount > 0) {
      const cgPassedCount = ws.imageProgress?.filter(p => p.galMeta?.type === 'cg' && p.status === 'passed')?.length || 0
      const cgGeneratedCount = ws.imageProgress?.filter(p => p.galMeta?.type === 'cg' && ['passed', 'reviewing', 'waiting-confirm'].includes(p.status))?.length || 0
      const cgActive = ws.imageProgress?.some(p => p.galMeta?.type === 'cg' && ['generating', 'reviewing', 'waiting-confirm'].includes(p.status))
      let cgGenStatus = 'pending'
      if (cgPassedCount === cgCount) cgGenStatus = 'done'
      else if (cgActive || cgGeneratedCount > 0) cgGenStatus = 'active'
      if (['failed', 'stopped'].includes(ws.status) && cgGenStatus !== 'done') cgGenStatus = 'failed'
      nodes.push({ id: 'gal-cg-gen', label: 'CG生成', status: cgGenStatus, detail: `${cgGeneratedCount}/${cgCount}` })
    }

    // 输出节点
    let outputStatus = 'pending'
    if (ws.status === 'completed') outputStatus = 'done'
    else if (['failed', 'stopped'].includes(ws.status)) outputStatus = 'failed'
    nodes.push({ id: 'gal-output', label: '输出', status: outputStatus })
  }
  // ===== 漫画 / 标准工作流节点 =====
  else {

    let planStatus = 'pending'
    if (ws.status === 'planning') planStatus = 'active'
    else if (ws.status === 'confirming-plan') planStatus = 'waiting'
    else if (['running', 'completed'].includes(ws.status)) planStatus = 'done'
    else if (['failed', 'stopped'].includes(ws.status)) planStatus = ws.plan ? 'done' : 'failed'
    nodes.push({ id: 'plan', label: '规划大纲', status: planStatus })

    if (ws.imageProgress && ws.imageProgress.length > 0) {
      // 效率优先模式：汇总为一个节点
      if (ws.config.efficiencyMode) {
        const total = ws.imageProgress.length
        const passedCount = ws.imageProgress.filter(p => p.status === 'passed').length
        const generatedCount = ws.imageProgress.filter(p => ['passed', 'reviewing', 'waiting-confirm'].includes(p.status)).length
        const isActive = ws.imageProgress.some(p => ['generating', 'reviewing', 'waiting-confirm'].includes(p.status))
        let imgStatus = 'pending'
        if (passedCount === total) imgStatus = 'done'
        else if (isActive || generatedCount > 0) imgStatus = 'active'
        if (['failed', 'stopped'].includes(ws.status) && imgStatus !== 'done') imgStatus = 'failed'
        nodes.push({ id: 'img-all', label: '生图', status: imgStatus, detail: `${generatedCount}/${total}` })
      } else {
        // 普通模式：每张图独立节点
        for (let i = 0; i < ws.imageProgress.length; i++) {
          const prog = ws.imageProgress[i]
          let imgStatus = 'pending'
          let detail = ''
          if (['generating', 'reviewing', 'waiting-confirm'].includes(prog.status)) {
            imgStatus = 'active'
            detail = prog.currentAttempt > 0 ? `第${prog.currentAttempt}轮` : ''
          } else if (prog.status === 'passed') {
            imgStatus = 'done'
          } else if (['timeout', 'max-attempts', 'error'].includes(prog.status)) {
            imgStatus = 'failed'
          }
          nodes.push({ id: `img-${i}`, label: prog.title || `图片 #${i + 1}`, status: imgStatus, detail })
        }
      }
    } else if (ws.plan) {
      const total = ws.plan.totalImages || 0
      if (ws.config.efficiencyMode) {
        nodes.push({ id: 'img-all', label: '生图', status: 'pending', detail: `0/${total}` })
      } else {
        for (let i = 0; i < total; i++) {
          nodes.push({ id: `img-${i}`, label: `#${i + 1}`, status: 'pending' })
        }
      }
    }
  }

  // 结束节点（通用）
  let endStatus = 'pending'
  if (ws.status === 'completed') endStatus = 'done'
  else if (ws.status === 'failed' || ws.status === 'stopped') endStatus = 'failed'
  nodes.push({ id: 'end', label: '结束', status: endStatus })

  return nodes
})
// ========== 执行面板计算 ==========

const activeImageCount = computed(() =>
  workflowStore.imageProgress.filter(p =>
    ['generating', 'reviewing', 'waiting-confirm'].includes(p.status)
  ).length
)

const pendingImageCount = computed(() =>
  workflowStore.imageProgress.filter(p => p.status === 'pending').length
)

function imageStatusLabel(status) {
  const map = {
    pending: '等待中',
    generating: '生成中',
    reviewing: '评审中',
    'waiting-confirm': '待确认',
    passed: '已通过',
    rejected: '未通过',
    timeout: '已超时',
    'max-attempts': '已跳过',
    error: '出错',
  }
  return map[status] || status
}

// ========== 模型队列 ==========

const llmAvailableCount = computed(() =>
  workflowStore.llmQueue.filter(m => !m.isDeprecated).length
)

const imageAvailableCount = computed(() =>
  workflowStore.imageQueue.filter(m => !m.isDeprecated).length
)

function isCurrentLlm(m) {
  if (m.isDeprecated) return false
  // LLM 不管什么模式都只有第一个未停用的在用
  const first = workflowStore.llmQueue.find(q => !q.isDeprecated)
  return first && first.modelId === m.modelId && first.siteId === m.siteId
}

function isCurrentImage(m) {
  if (m.isDeprecated) return false
  // 效率优先模式且正在运行中：所有未停用模型都视为活跃
  if (workflowStore.config.efficiencyMode && workflowStore.status === 'running') {
    return true
  }
  // 普通模式：只有第一个未停用模型是活跃的
  const first = workflowStore.imageQueue.find(q => !q.isDeprecated)
  return first && first.modelId === m.modelId && first.siteId === m.siteId
}

async function handleDeprecateModel(type, index) {
  const queue = type === 'llm' ? workflowStore.llmQueue : workflowStore.imageQueue
  const model = queue[index]
  if (!model) return

  const typeName = type === 'llm' ? '语言' : '生图'
  try {
    await ElMessageBox.confirm(
      `确定要手动停用${typeName}模型「${model.modelName}」吗？停用后工作流将不再使用该模型，已发出的请求会正常完成。`,
      '手动停用模型',
      { confirmButtonText: '停用', cancelButtonText: '取消', type: 'warning' }
    )
    workflowStore.deprecateModel(type, index)
    ElMessage.success(`已停用: ${model.modelName}`)
  } catch { /* 取消 */ }
}

async function handleRestoreModel(type, index) {
  const queue = type === 'llm' ? workflowStore.llmQueue : workflowStore.imageQueue
  const model = queue[index]
  if (!model) return

  const typeName = type === 'llm' ? '语言' : '生图'
  const reason = model._manuallyDeprecated ? '手动禁用' : '连续失败'
  try {
    await ElMessageBox.confirm(
      `模型「${model.modelName}」已因${reason}而被停用，恢复之后可能依旧无法正常响应，确认恢复这个模型吗？`,
      '恢复模型',
      { confirmButtonText: '确认恢复', cancelButtonText: '取消', type: 'warning' }
    )
    workflowStore.restoreModel(type, index)
    ElMessage.success(`已恢复: ${model.modelName}`)
  } catch { /* 取消 */ }
}

// ========== 最终图片 ==========

const wfDetailVisible = ref(false)
const wfDetailImage = ref(null)
const wfFullPreviewVisible = ref(false)

const isUnfinishedWorkflow = computed(() =>
  workflowStore.activeWorkflowType === 'comic'
)

const showFinalSection = computed(() =>
  !isUnfinishedWorkflow.value &&
  workflowStore.activeWorkflowType !== 'char-design' && (
    workflowStore.finalImages.length > 0
  || workflowStore.batchHistory.length > 0
  || workflowStore.isRunning
  )
)

const totalFinalCount = computed(() => {
  let count = workflowStore.finalImages.length
  for (const batch of workflowStore.batchHistory) {
    count += batch.images.length
  }
  return count
})

function openWorkflowDetail(img) {
  wfDetailImage.value = img
  wfDetailVisible.value = true
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN')
}

async function handleExportSingle(img) {
  if (!img.relPath) {
    ElMessage.warning('该图片文件不可用')
    return
  }
  try {
    const result = await window.electronAPI.exportImageFile({
      relPath: img.relPath,
      suggestedName: (img.name || 'workflow-image') + '.png',
    })
    if (result.canceled) return
    if (result.success) {
      ElMessage.success('已导出')
    } else {
      ElMessage.error(result.error || '导出失败')
    }
  } catch (err) {
    ElMessage.error('导出失败: ' + err.message)
  }
}

function handleDeleteWorkflowImage(img) {
  workflowStore.finalImages = workflowStore.finalImages.filter(i => i.id !== img.id)
  workflowStore.saveFinalImages()
  wfDetailVisible.value = false
  ElMessage.success('已删除')
}

async function handleClearAllFinal() {
  try {
    await ElMessageBox.confirm(
      '确定要清除所有最终图片吗？这将永久删除所有批次的图片文件，不可恢复。',
      '彻底删除确认',
      {
        confirmButtonText: '彻底删除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      }
    )
    await workflowStore.clearFinalImages(true)
    ElMessage.success('已彻底删除所有图片')
  } catch { /* 取消 */ }
}

async function handleExportToGallery(batchId = null) {
  const images = batchId
    ? workflowStore.batchHistory.find(b => b.id === batchId)?.images || []
    : workflowStore.finalImages

  const count = images.length
  if (count === 0) {
    ElMessage.warning('没有可添加的图片')
    return
  }

  try {
    const { value } = await ElMessageBox.prompt(
      `将 ${count} 张图片作为独立相册添加到图库。请输入相册名称:`,
      '添加到图库',
      {
        inputValue: `工作流 ${new Date().toLocaleString('zh-CN').replace(/[/:]/g, '-')}`,
        confirmButtonText: '添加',
        cancelButtonText: '取消',
        inputValidator: (val) => val.trim().length > 0 || '请输入相册名称',
      }
    )

    const albumName = value.trim()
    await galleryStore.batchAddFromWorkflow(images, albumName)
    workflowStore.exportToGalleryDone(batchId)

    ElMessage.success(`已添加 ${count} 张图片到相册「${albumName}」`)
  } catch { /* 取消 */ }
}
</script>

<style scoped>
.workflow-page {
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
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition);
  color: var(--text-secondary);
}

.sidebar-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.sidebar-item.active {
  background: var(--accent-light);
  color: var(--accent-color);
}

.sidebar-item--icon-only {
  justify-content: center;
  padding: 10px 0;
}

.sidebar-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.sidebar-item-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.sidebar-item.active .sidebar-item-name {
  color: var(--accent-color);
}

.sidebar-item-desc {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.3;
}

/* ===== 主内容区 ===== */
.workflow-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow-y: auto;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  flex-shrink: 0;
}

.header-left h2 {
  font-size: 22px;
  margin-bottom: 4px;
}

.subtitle {
  font-size: 13px;
  color: var(--text-muted);
}

/* ===== 状态徽章 ===== */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.status-badge--running {
  background: rgba(59, 130, 246, 0.12);
  color: #3b82f6;
}

.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.status-badge--done {
  background: rgba(34, 197, 94, 0.12);
  color: #16a34a;
}

.status-badge--failed,
.status-badge--stopped {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

/* ===== 阶段内容 ===== */
.phase-area {
  flex-shrink: 0;
}

/* 工作流步骤示意 */
.workflow-steps {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  flex-wrap: wrap;
  justify-content: center;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text-secondary);
}

.step-num {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--accent-color);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.step-arrow {
  color: var(--text-muted);
  font-size: 16px;
}

/* ===== 最终图片区域 ===== */
.final-section {
  margin-top: 24px;
  flex-shrink: 0;
}

.final-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.final-header h3 {
  font-size: 16px;
  font-weight: 600;
}

.final-count {
  font-size: 12px;
  color: var(--text-muted);
}

.final-empty {
  padding: 32px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
  background: var(--bg-card);
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-md);
}

/* 最终图片 - 方格模式 */
.final-grid--square {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}

.final-grid--square .final-item {
  aspect-ratio: 1;
}

.final-grid--square .final-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 最终图片 - 瀑布流模式 */
.final-grid--masonry {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-start;
}

.final-grid--masonry .final-item {
  height: 200px;
  aspect-ratio: auto;
}

.final-grid--masonry .final-item img {
  height: 100%;
  width: auto;
  display: block;
}

.final-item {
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all var(--transition);
}

.final-item:hover {
  border-color: var(--accent-color);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.final-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* ===== 配置面板 ===== */
.config-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.workflow-steps-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
  padding: 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}

.config-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 20px;
}

.config-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.config-card-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.config-section {
  margin-bottom: 18px;
}

.config-section:last-child {
  margin-bottom: 0;
}

.config-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.config-section-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  display: block;
}

.config-section-hint {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.4;
  display: block;
  margin-top: 2px;
}

.config-time-display {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent-color);
  flex-shrink: 0;
}

.config-empty-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: var(--radius-sm);
  color: #d97706;
  font-size: 13px;
}

:root.dark .config-empty-tip {
  color: #fbbf24;
}

/* 模型选择行 */
.model-select-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
}

/* 模型队列列表 */
.model-queue {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.model-queue-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  transition: all var(--transition);
}

.model-queue-item:hover {
  border-color: var(--accent-color);
}

.queue-index {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--accent-light);
  color: var(--accent-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.queue-info {
  flex: 1;
  min-width: 0;
}

.queue-name {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-site {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
}

.model-queue-empty {
  padding: 12px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-sm);
}

/* 参考图区域（复用生成页样式） */
.ref-area {
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

/* 三列行 */
.config-row-3 {
  display: flex;
  gap: 16px;
}

.config-row-3 .config-section {
  flex: 1;
  margin-bottom: 0;
}

/* 确认模式选项 */
.confirm-mode-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.confirm-option {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition);
}

.confirm-option:hover {
  border-color: var(--accent-color);
  background: var(--bg-hover);
}

.confirm-option.active {
  border-color: var(--accent-color);
  background: var(--accent-light);
}

.confirm-option .el-radio {
  margin-top: 1px;
}

.confirm-option-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.confirm-option-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.confirm-option-desc {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.4;
}

/* 阈值提示 */
.threshold-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
}

/* 启动按钮区 */
.config-start {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
}

.start-workflow-btn {
  width: 280px;
  height: 48px;
  font-size: 16px;
  font-weight: 700;
  border-radius: var(--radius-md);
}

.start-workflow-btn.el-button--primary:not(:disabled) {
  background: var(--accent-color) !important;
  border-color: var(--accent-color) !important;
  color: #fff !important;
}

.start-workflow-btn.el-button--primary:not(:disabled):hover {
  background: var(--accent-hover) !important;
  border-color: var(--accent-hover) !important;
}

.start-hint {
  font-size: 12px;
  color: var(--text-muted);
}

.start-hint span {
  color: #ef4444;
  font-weight: 500;
}

/* 时间滑块底部留白（给 marks 文字腾空间） */
.config-section :deep(.el-slider) {
  margin-bottom: 16px;
}

/* ===== 工作中状态 ===== */
.phase-active {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.active-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}

.active-header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.active-elapsed {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.active-remaining {
  font-size: 12px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.stop-workflow-btn:not(:disabled) {
  background: #ef4444 !important;
  border-color: #ef4444 !important;
  color: #fff !important;
}

.stop-workflow-btn:not(:disabled):hover {
  background: #dc2626 !important;
  border-color: #dc2626 !important;
}

/* ===== 规划阶段 ===== */
.section-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 10px 0;
}

.planning-display {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 16px;
}

.planning-text {
  max-height: 400px;
  overflow-y: auto;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 14px;
}

.planning-content {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.planning-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 14px;
  padding: 20px 0;
  justify-content: center;
}

/* ===== 事件日志 ===== */
.timeline-section {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 16px;
}

.timeline-list {
  max-height: 240px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.timeline-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  transition: background var(--transition);
}

.timeline-item:hover {
  background: var(--bg-hover);
}

.timeline-time {
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
  min-width: 64px;
  font-variant-numeric: tabular-nums;
}

.timeline-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-top: 6px;
  flex-shrink: 0;
  background: var(--text-muted);
}

.timeline-item--info .timeline-dot { background: #3b82f6; }
.timeline-item--success .timeline-dot { background: #16a34a; }
.timeline-item--warn .timeline-dot { background: #f59e0b; }
.timeline-item--error .timeline-dot { background: #ef4444; }
.timeline-item--llm .timeline-dot { background: #8b5cf6; }
.timeline-item--image .timeline-dot { background: #06b6d4; }

.timeline-msg {
  color: var(--text-secondary);
  line-height: 1.4;
  word-break: break-word;
}

.timeline-item--error .timeline-msg { color: #ef4444; }

.timeline-empty {
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
  padding: 12px;
}

/* ===== 执行面板 ===== */
.execution-display {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 16px;
}

.exec-image-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.exec-image-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-left: 3px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  transition: all var(--transition);
}

.exec-image-card--generating,
.exec-image-card--reviewing,
.exec-image-card--waiting-confirm {
  border-left-color: #3b82f6;
  background: rgba(59, 130, 246, 0.04);
}

.exec-image-card--passed {
  border-left-color: #16a34a;
}

.exec-image-card--timeout,
.exec-image-card--max-attempts,
.exec-image-card--error {
  border-left-color: #ef4444;
  opacity: 0.75;
}

.exec-image-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.exec-image-num {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--accent-light);
  color: var(--accent-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
  white-space: nowrap;
}

.exec-image-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.exec-image-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-muted);
  flex-shrink: 0;
}

.exec-image-card--generating .exec-image-status,
.exec-image-card--reviewing .exec-image-status {
  background: rgba(59, 130, 246, 0.12);
  color: #3b82f6;
}

.exec-image-card--waiting-confirm .exec-image-status {
  background: rgba(245, 158, 11, 0.12);
  color: #d97706;
}

.exec-image-card--passed .exec-image-status {
  background: rgba(34, 197, 94, 0.12);
  color: #16a34a;
}

.exec-image-card--timeout .exec-image-status,
.exec-image-card--error .exec-image-status {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

.exec-image-detail {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
}

.exec-image-attempt {
  padding: 1px 6px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 3px;
  flex-shrink: 0;
}

.exec-image-prompt {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.exec-image-result {
  margin-top: 8px;
}

.exec-image-result img {
  max-width: 200px;
  max-height: 200px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
}

/* ===== 模型队列状态面板 ===== */
.model-status-section {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 16px;
}

.model-status-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.model-status-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 12px;
}

.model-status-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.model-status-card-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.model-status-card-summary {
  font-size: 11px;
  color: var(--text-muted);
  padding: 2px 8px;
  background: var(--bg-card);
  border-radius: 999px;
}

.model-status-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.model-status-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  transition: all var(--transition);
  background: var(--bg-card);
}

.model-status-item--active {
  border-color: var(--accent-color);
  background: var(--accent-light);
}

.model-status-item--deprecated {
  background: rgba(239, 68, 68, 0.04);
}

.model-status-item--deprecated .model-status-left {
  opacity: 0.5;
}

.model-status-item--deprecated .model-status-tag {
  opacity: 0.5;
}

.model-status-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.model-status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.indicator--alive {
  background: #16a34a;
  box-shadow: 0 0 4px rgba(22, 163, 74, 0.4);
}

.indicator--dead {
  background: #9ca3af;
}

.model-status-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.model-status-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-status-item--deprecated .model-status-name {
  text-decoration: line-through;
  color: var(--text-muted);
}

.model-status-site {
  font-size: 11px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-status-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  margin-left: 8px;
}

.model-status-tag {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 3px;
  white-space: nowrap;
}

.tag--success {
  background: rgba(34, 197, 94, 0.12);
  color: #16a34a;
}

.tag--fail {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

.tag--deprecated {
  background: rgba(107, 114, 128, 0.15);
  color: #6b7280;
}

.tag--standby {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

.model-status-empty {
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
  padding: 10px;
}

/* ===== 完成状态 ===== */
.done-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}

.done-icon-row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.done-text h3 {
  font-size: 18px;
  margin: 0 0 4px 0;
}

.done-text p {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
}

.done-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/* ===== 最终图片区域 ===== */
.final-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.final-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.final-header-left h3 {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
}

.final-header-right {
  display: flex;
  gap: 8px;
}

.final-item {
  position: relative;
}

.final-item-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  background: linear-gradient(transparent, rgba(0,0,0,0.6));
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
  pointer-events: none;
}

.final-item-score {
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  padding: 1px 5px;
  background: rgba(99, 102, 241, 0.8);
  border-radius: 3px;
}

.final-item-auto {
  font-size: 10px;
  font-weight: 600;
  color: #fbbf24;
  padding: 1px 4px;
  background: rgba(0,0,0,0.4);
  border-radius: 3px;
}

/* ===== 工作流图片详情弹窗 ===== */
.wf-detail-content {
  display: flex;
  gap: 20px;
}

.wf-detail-img {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.wf-detail-img img {
  max-width: 100%;
  max-height: 70vh;
  border-radius: var(--radius-sm);
  display: block;
}

.wf-detail-meta {
  width: 250px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.wf-meta-section h4 {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.wf-meta-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 13px;
}

.wf-meta-label {
  color: var(--text-muted);
}

.wf-meta-value {
  color: var(--text-primary);
  font-weight: 500;
  text-align: right;
}

.wf-prompt-box {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 10px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  max-height: 100px;
  overflow-y: auto;
  word-break: break-all;
}

.wf-detail-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: auto;
}

.wf-detail-actions .el-button {
  width: 100%;
  margin: 0;
}

/* ===== 参考图双栏布局 ===== */
.ref-dual-layout {
  display: flex;
  gap: 12px;
}

.ref-dual-left,
.ref-dual-right {
  flex: 1;
  min-width: 0;
}

.ref-dual-panel {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 10px;
  height: 180px;
  display: flex;
  flex-direction: column;
}

.ref-dual-panel-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 8px;
  flex-shrink: 0;
}

.ref-list-tall {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  overflow-y: auto;
  flex: 1;
  align-content: flex-start;
}

.ref-upload-tall {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: 1;
  border: 2px dashed var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition);
}

.ref-upload-tall:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

/* 我的参考图 - 通用 */
.ref-imported-grid {
  overflow-y: auto;
  flex: 1;
}

.ref-imported-thumb {
  position: relative;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all var(--transition);
  flex-shrink: 0;
}

.ref-imported-thumb:hover {
  border-color: var(--accent-color);
  box-shadow: var(--shadow-sm);
}

.ref-imported-thumb img {
  display: block;
}

/* 方格模式 */
.ref-imported-grid--square {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
  grid-auto-rows: 76px;
  gap: 6px;
  align-content: flex-start;
}

.ref-imported-grid--square .ref-imported-thumb {
  width: 100%;
  height: 100%;
}

.ref-imported-grid--square .ref-imported-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 瀑布流模式 */
.ref-imported-grid--masonry {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-content: flex-start;
}

.ref-imported-grid--masonry .ref-imported-thumb {
  height: 76px;
}

.ref-imported-grid--masonry .ref-imported-thumb img {
  height: 100%;
  width: auto;
}

/* 悬浮删除按钮 */
.ref-imported-delete {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 20px;
  height: 20px;
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
  font-size: 12px;
}

.ref-imported-thumb:hover .ref-imported-delete {
  opacity: 1;
}

.ref-imported-delete:hover {
  background: rgb(220, 38, 38);
}

/* 悬浮操作栏 */
.ref-imported-actions {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  gap: 4px;
  padding: 3px;
  background: rgba(0, 0, 0, 0.65);
  opacity: 0;
  transition: opacity var(--transition);
}

.ref-imported-thumb:hover .ref-imported-actions {
  opacity: 1;
}

.ref-imported-actions button {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.15);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  transition: background var(--transition);
}

.ref-imported-actions button:hover {
  background: var(--accent-color);
}

.ref-imported-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--text-muted);
  font-size: 12px;
  text-align: center;
  line-height: 1.4;
}

/* 质量提示 */
.quality-hint {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
  line-height: 1.3;
}

.prompt-input-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.prompt-assist-btn {
  align-self: flex-end;
  border-radius: var(--radius-sm);
  font-size: 13px;
}

/* ===== 批次卡片 ===== */
.final-batch-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 16px;
}

.final-batch-card--history {
  border-left: 3px solid var(--text-muted);
  opacity: 0.9;
}

.final-batch-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px dashed var(--border-color);
}

.final-batch-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}

.final-batch-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  flex-shrink: 0;
}

.final-batch-time {
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.final-batch-count {
  font-size: 11px;
  color: var(--text-muted);
  padding: 1px 6px;
  background: var(--bg-secondary);
  border-radius: 999px;
  flex-shrink: 0;
}

.final-batch-prompt {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.final-batch-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/* ===== 节点流 ===== */
.flow-pipeline {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 20px 16px;
  overflow-x: auto;
}

.flow-track {
  display: flex;
  align-items: flex-start;
  min-width: max-content;
  gap: 0;
}

.flow-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  min-width: 72px;
  max-width: 100px;
}

.flow-node-dot {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid;
  transition: all 0.3s;
  flex-shrink: 0;
}

/* 状态颜色 */
.flow-node--pending .flow-node-dot {
  border-color: var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-muted);
}

.flow-node--active .flow-node-dot {
  border-color: #3b82f6;
  background: rgba(59, 130, 246, 0.12);
  color: #3b82f6;
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.3);
}

.flow-node--waiting .flow-node-dot {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
}

.flow-node--done .flow-node-dot {
  border-color: #16a34a;
  background: rgba(34, 197, 94, 0.12);
  color: #16a34a;
}

.flow-node--failed .flow-node-dot {
  border-color: #ef4444;
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

.flow-node-idx {
  font-size: 12px;
  font-weight: 700;
  color: inherit;
}

.flow-node-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-align: center;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  max-width: 100%;
  word-break: break-all;
}

.flow-node--active .flow-node-label {
  color: #3b82f6;
  font-weight: 700;
}

.flow-node--done .flow-node-label {
  color: #16a34a;
}

.flow-node--failed .flow-node-label {
  color: #ef4444;
}

.flow-node-detail {
  font-size: 10px;
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.1);
  padding: 1px 6px;
  border-radius: 3px;
  white-space: nowrap;
}

/* 连接线 */
.flow-connector {
  width: 40px;
  height: 2px;
  background: var(--border-color);
  flex-shrink: 0;
  margin-top: 17px;
  position: relative;
}

.flow-connector--done {
  background: #16a34a;
}

/* 连接线箭头 */
.flow-connector::after {
  content: '';
  position: absolute;
  right: -1px;
  top: -4px;
  width: 0;
  height: 0;
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  border-left: 6px solid var(--border-color);
}

.flow-connector--done::after {
  border-left-color: #16a34a;
}

/* 滚动条 */
.flow-pipeline::-webkit-scrollbar {
  height: 4px;
}

.flow-pipeline::-webkit-scrollbar-thumb {
  background: var(--text-muted);
  border-radius: 2px;
}

.setting-item-inline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.setting-item-info {
  flex: 1;
  min-width: 0;
}

/* 拖拽排序 */
.queue-drag-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  color: var(--text-muted);
  cursor: grab;
  flex-shrink: 0;
  opacity: 0.5;
  transition: opacity 0.2s;
}

.queue-drag-handle:active {
  cursor: grabbing;
}

.model-queue-item:hover .queue-drag-handle {
  opacity: 1;
}

.model-queue-item--dragging {
  opacity: 0.4;
  border-style: dashed;
}

.model-queue-item--over {
  border-color: var(--accent-color);
  background: var(--accent-light);
  box-shadow: 0 0 0 2px var(--accent-light);
}

/* Beta 标签 */
.beta-tag {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
  vertical-align: middle;
  margin-left: 4px;
  line-height: 1.4;
}

.beta-tag--title {
  font-size: 11px;
  padding: 2px 7px;
}

/* ===== CG差分配置 ===== */
.cg-base-preview {
  display: flex;
  gap: 14px;
  padding: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  align-items: center;
}

.cg-base-preview img {
  width: 120px;
  height: 120px;
  object-fit: contain;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: #111;
  flex-shrink: 0;
}

.cg-base-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
}

.cg-base-info strong {
  color: var(--accent-color);
}

/* CG差分标签 */
.final-item-cgtag {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  color: #fff;
}

.final-item-cgtag--base {
  background: rgba(139, 92, 246, 0.85);
}

.final-item-cgtag--diff {
  background: rgba(6, 182, 212, 0.85);
}

/* 底CG上传区域 */
.cg-base-upload {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 140px;
  border: 2px dashed var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition);
}

.cg-base-upload:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

/* 工作流运行中禁用切换 */
.sidebar-item--disabled {
  opacity: 0.4;
  pointer-events: none;
  cursor: not-allowed;
}

/* 工作流详情放大按钮 */
.wf-detail-img {
  position: relative;
}

.wf-detail-zoom {
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

.wf-detail-zoom:hover {
  background: rgba(0, 0, 0, 0.8);
  color: #fff;
  transform: scale(1.1);
}

.wf-full-preview-content {
  display: flex;
  align-items: center;
  justify-content: center;
}

.wf-full-preview-content img {
  max-width: 90vw;
  max-height: 80vh;
  border-radius: var(--radius-sm);
  object-fit: contain;
}

/* ===== GalCG 文档上传 ===== */
.gal-doc-preview {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 12px;
}

.gal-doc-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.gal-doc-preview-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.gal-doc-preview-count {
  font-size: 11px;
  color: var(--text-muted);
  padding: 1px 6px;
  background: var(--bg-card);
  border-radius: 999px;
}

.gal-doc-preview-content {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  word-break: break-all;
}

.gal-doc-upload-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 20px;
  border: 2px dashed var(--border-color);
  border-radius: var(--radius-sm);
}

.gal-doc-upload-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  transition: color 0.2s;
}

.gal-doc-upload-btn:hover {
  color: var(--accent-color);
}

.gal-doc-or {
  font-size: 12px;
  color: var(--text-muted);
}

.gal-doc-text-dialog {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 敬请期待标签 */
.coming-soon-tag {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(107, 114, 128, 0.15);
  color: #9ca3af;
  vertical-align: middle;
  margin-left: 4px;
  line-height: 1.4;
}

.coming-soon-tag--title {
  font-size: 11px;
  padding: 2px 7px;
}

/* ===== 旁白样式选择 ===== */
.narration-style-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.narration-style-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition);
}

.narration-style-option:hover {
  border-color: var(--accent-color);
  background: var(--bg-hover);
}

.narration-style-option.active {
  border-color: var(--accent-color);
  background: var(--accent-light);
}

.narration-style-option .el-radio {
  margin-top: 1px;
}

.narration-style-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.narration-style-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.narration-style-desc {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.4;
}

.narration-preview-content {
  display: flex;
  align-items: center;
  justify-content: center;
}

.narration-preview-content img {
  max-width: 100%;
  max-height: 70vh;
  border-radius: var(--radius-sm);
  object-fit: contain;
}

/* ===== GalCG 角色预设 ===== */
.preset-char-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 10px;
  margin-bottom: 10px;
}

.preset-char-card {
  position: relative;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  overflow: hidden;
  text-align: center;
  transition: border-color 0.2s;
}

.preset-char-card:hover {
  border-color: var(--accent-color);
}

.preset-char-img {
  width: 100%;
  height: 110px;
  overflow: hidden;
  background: #111;
}

.preset-char-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preset-char-name {
  padding: 6px 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preset-char-delete {
  position: absolute;
  top: 4px;
  right: 4px;
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
  transition: opacity 0.2s;
}

.preset-char-card:hover .preset-char-delete {
  opacity: 1;
}

.preset-char-delete:hover {
  background: rgba(239, 68, 68, 0.9);
}

.preset-char-add {
  margin-bottom: 10px;
}

.preset-char-form {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  background: var(--bg-secondary);
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-sm);
  transition: border-color 0.2s;
}

.preset-char-form:hover {
  border-color: var(--accent-color);
}

.preset-char-form-img {
  width: 80px;
  height: 96px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  cursor: pointer;
  flex-shrink: 0;
  border: 2px dashed var(--border-color);
  background: var(--bg-card);
  transition: all 0.2s;
}

.preset-char-form-img:hover {
  border-color: var(--accent-color);
  background: var(--accent-light);
}

.preset-char-form-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: calc(var(--radius-sm) - 2px);
}

.preset-char-form-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--text-muted);
  font-size: 11px;
}

.preset-char-form-img:hover .preset-char-form-placeholder {
  color: var(--accent-color);
}

/* 旁白预览按钮强制高亮 */
.narration-style-option .narration-preview-btn:not(:disabled) {
  background: rgba(99, 102, 241, 0.15) !important;
  border-color: var(--accent-color) !important;
  color: var(--accent-color) !important;
  font-weight: 600;
}

.narration-style-option .narration-preview-btn:not(:disabled):hover {
  background: var(--accent-color) !important;
  border-color: var(--accent-color) !important;
  color: #fff !important;
}

/* 模型操作按钮 */
.model-action-btn {
  padding: 4px 10px !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  margin-left: 6px;
  border-radius: 4px !important;
}

.model-status-right .model-action-btn.el-button--warning:not(:disabled) {
  background: rgba(245, 158, 11, 0.12) !important;
  border: 1px solid rgba(245, 158, 11, 0.4) !important;
  color: #f59e0b !important;
}

.model-status-right .model-action-btn.el-button--warning:not(:disabled):hover {
  background: rgba(245, 158, 11, 0.25) !important;
  border-color: #f59e0b !important;
  color: #d97706 !important;
}

.model-status-right .model-action-btn.el-button--primary:not(:disabled) {
  background: rgba(59, 130, 246, 0.12) !important;
  border: 1px solid rgba(59, 130, 246, 0.4) !important;
  color: #3b82f6 !important;
}

.model-status-right .model-action-btn.el-button--primary:not(:disabled):hover {
  background: rgba(59, 130, 246, 0.25) !important;
  border-color: #3b82f6 !important;
  color: #2563eb !important;
}

.model-status-item--deprecated .model-action-btn {
  opacity: 2;
}

/* ===== 拖拽上传高亮 ===== */
.ref-upload-tall--dragover {
  border-color: var(--accent-color) !important;
  background: var(--accent-light) !important;
  color: var(--accent-color) !important;
}

.ref-list-tall--dragover {
  outline: 2px dashed var(--accent-color);
  outline-offset: -2px;
  background: var(--accent-light);
  border-radius: var(--radius-sm);
}

.gal-doc-upload-area--dragover {
  border-color: var(--accent-color) !important;
  background: var(--accent-light) !important;
}

.gal-doc-upload-area--dragover .gal-doc-upload-btn {
  color: var(--accent-color) !important;
}

/* 工作流我的参考图拖拽上传 */
.ref-imported-grid--dragover {
  outline: 2px dashed var(--accent-color);
  outline-offset: -2px;
  background: var(--accent-light);
  border-radius: var(--radius-sm);
}

.ref-imported-empty--dragover {
  background: var(--accent-light) !important;
  color: var(--accent-color) !important;
  outline: 2px dashed var(--accent-color);
  outline-offset: -2px;
  border-radius: var(--radius-sm);
}

/* 底CG拖拽上传 */
.cg-base-upload--dragover {
  border-color: var(--accent-color) !important;
  background: var(--accent-light) !important;
  color: var(--accent-color) !important;
}

/* 角色预设主设图拖拽 */
.preset-char-form-img--dragover {
  border-color: var(--accent-color) !important;
  background: var(--accent-light) !important;
}

.preset-char-form-img--dragover .preset-char-form-placeholder {
  color: var(--accent-color) !important;
}

/* 画风预设标签 */
.style-preset-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.style-preset-tag {
  padding: 6px 14px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}

.style-preset-tag:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.style-preset-tag--active {
  border-color: var(--accent-color) !important;
  background: var(--accent-light) !important;
  color: var(--accent-color) !important;
  font-weight: 600;
}
</style>