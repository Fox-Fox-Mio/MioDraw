<template>
  <!-- 计划确认弹窗 -->
  <el-dialog
    :model-value="workflowStore.pendingConfirm?.type === 'plan'"
    title="确认创作计划"
    width="720px"
    top="5vh"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
  >
    <div class="plan-confirm-body">
      <div v-if="workflowStore.plan" class="plan-summary">
        <div class="plan-summary-header">
            <span class="plan-total">{{ workflowStore.plan.totalImages === 0 && workflowStore.activeWorkflowType === 'gal-cg' ? 'AI 总结的故事大纲' : workflowStore.plan.pages ? `${workflowStore.plan.pages.length}页，共 ${workflowStore.plan.totalImages} 格` : `共 ${workflowStore.plan.totalImages} 张图片` }}</span>
          <span class="plan-strategy">{{ workflowStore.plan.strategy }}</span>
        </div>
        <!-- GalCG 分批提示 -->
        <div v-if="workflowStore.activeWorkflowType === 'gal-cg' && workflowStore.plan?.totalImages > 10" class="gal-batch-tip">
          <el-icon><WarningFilled /></el-icon>
          为保证生成质量，每次最多生成 10 张规划。您通过之后，如果后面还有规划，则AI 会继续生成后面规划，每次最多 10 张。
        </div>
        <!-- 漫画分镜展示 -->
        <div v-if="workflowStore.plan.pages" class="plan-comic-storyboard">
          <!-- 角色设定 -->
          <div v-if="workflowStore.plan.characters?.characters?.length" class="storyboard-characters">
            <div class="storyboard-section-title">角色设定</div>
            <div class="storyboard-char-list">
              <div v-for="ch in workflowStore.plan.characters.characters" :key="ch.name" class="storyboard-char-item">
                <span class="storyboard-char-name">{{ ch.name }}</span>
                <span class="storyboard-char-desc">{{ ch.appearance }}</span>
              </div>
            </div>
          </div>
          <!-- 按页展示 -->
          <div v-for="page in workflowStore.plan.pages" :key="page.pageIndex" class="storyboard-page">
            <div class="storyboard-page-header">
              <span class="storyboard-page-title">第 {{ page.pageIndex }} 页</span>
              <span class="storyboard-page-layout">排版: {{ page.layout }}</span>
            </div>
            <div class="storyboard-panels">
              <div v-for="panel in page.panels" :key="panel.panelIndex" class="storyboard-panel">
                <div class="storyboard-panel-header">
                  <span class="storyboard-panel-num">格 {{ panel.panelIndex }}</span>
                  <span class="storyboard-panel-shot">{{ shotLabel(panel.shot) }}</span>
                  <span v-if="panel.characters?.length" class="storyboard-panel-chars">{{ panel.characters.join(', ') }}</span>
                </div>
                <div class="storyboard-panel-desc">{{ panel.description }}</div>
                <div v-if="panel.dialogue" class="storyboard-panel-dialogue">"{{ panel.dialogue }}"</div>
                <div class="storyboard-panel-prompt">{{ panel.prompt }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 标准工作流展示 -->
        <div v-else class="plan-image-list">
          <div
            v-for="img in workflowStore.plan.images"
            :key="img.index"
            class="plan-image-item"
          >
            <span class="plan-image-num">#{{ img.index }}</span>
            <div class="plan-image-info">
              <span class="plan-image-title">{{ img.title }}</span>
              <span class="plan-image-desc">{{ img.description }}</span>
              <span class="plan-image-prompt">{{ img.initialPrompt }}</span>
            </div>
          </div>
        </div>
      </div>
      <template v-if="workflowStore.plan?.totalImages === 0 && workflowStore.activeWorkflowType === 'gal-cg'">
        <div class="plan-full-text-visible">{{ workflowStore.planningText }}</div>
      </template>
      <template v-else>
        <details class="plan-details-toggle">
          <summary>查看 AI 完整回复</summary>
          <div class="plan-full-text">{{ workflowStore.planningText }}</div>
        </details>
      </template>
      <div class="plan-feedback-area">
        <label>附加意见（可选，打回时会发送给 AI）</label>
        <el-input
          v-model="planFeedback"
          type="textarea"
          :rows="2"
          resize="none"
          placeholder="输入你的修改意见..."
        />
      </div>
    </div>
    <template #footer>
      <div class="dialog-footer-row">
        <el-button @click="handleRejectPlan">打回重做</el-button>
        <el-button type="primary" @click="handleApprovePlan">通过并开始</el-button>
      </div>
    </template>
  </el-dialog>

  <!-- 工作流暂停弹窗 -->
  <el-dialog
    :model-value="workflowStore.pendingConfirm?.type === 'plan-pause'"
    title="工作流已暂停"
    width="500px"
    top="15vh"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
  >
    <div class="pause-body">
      <div
        class="pause-icon"
        :class="pauseReason === 'parse-failed' ? 'pause-icon--warn' : 'pause-icon--info'"
      >
        <el-icon :size="32">
          <WarningFilled v-if="pauseReason === 'parse-failed'" />
          <CircleClose v-else />
        </el-icon>
      </div>
      <div class="pause-title">
        {{ pauseReason === 'parse-failed' ? '计划解析连续失败' : '计划连续被打回' }}
      </div>
      <div class="pause-message">
        {{ workflowStore.pendingConfirm?.data?.message }}
      </div>
      <div class="pause-count">
        {{ pauseReason === 'parse-failed'
          ? `连续解析失败 ${workflowStore.pendingConfirm?.data?.count} 次`
          : `连续打回 ${workflowStore.pendingConfirm?.data?.count} 次`
        }}
      </div>
    </div>
    <template #footer>
      <div class="dialog-footer-row">
        <el-button type="danger" @click="handlePauseAbort">终止工作流</el-button>
        <el-button type="primary" @click="handlePauseContinue">继续尝试</el-button>
      </div>
    </template>
  </el-dialog>

  <!-- 批量图片评审弹窗 (confirm-all) -->
  <el-dialog
    :model-value="workflowStore.pendingConfirm?.type === 'batch-image-review'"
    title="图片评审"
    width="820px"
    top="4vh"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
  >
    <div class="batch-review-body" v-if="workflowStore.pendingConfirm?.data">
      <!-- 信息栏 -->
      <div class="batch-review-header">
        <span class="batch-review-spec">
          #{{ workflowStore.pendingConfirm.data.imageSpec?.index }}
          {{ workflowStore.pendingConfirm.data.imageSpec?.title }}
        </span>
        <span class="batch-review-round">第 {{ workflowStore.pendingConfirm.data.attempt }} 轮</span>
      </div>

      <!-- 失败提示 -->
      <div
        v-if="batchCandidates.length < workflowStore.pendingConfirm.data.totalRequested"
        class="batch-review-warn"
      >
        <el-icon><WarningFilled /></el-icon>
        当前 {{ workflowStore.pendingConfirm.data.totalRequested }} 并发中有
        {{ workflowStore.pendingConfirm.data.totalRequested - batchCandidates.length }} 张图片生成或下载失败，仅展示
        {{ batchCandidates.length }} 张
      </div>

      <!-- 候选图网格 -->
      <div class="batch-review-tip">
        点击图片可查看大图，点击右上角勾选按钮可选择多张图片通过
      </div>
      <div class="batch-review-grid">
        <div
          v-for="(img, idx) in batchCandidates"
          :key="idx"
          class="batch-review-item"
          :class="{
            'batch-review-item--selected': batchSelectedIndices.includes(idx),
            'batch-review-item--recommended': workflowStore.pendingConfirm.data.recommendedIndex === idx,
          }"
        >
          <img :src="img.dataUrl" alt="" @click="previewImage(img.dataUrl)" />
          <!-- 勾选按钮 -->
          <button
            class="batch-review-select-btn"
            :class="{ 'batch-review-select-btn--active': batchSelectedIndices.includes(idx) }"
            @click.stop="toggleSelect(idx)"
          >
            <el-icon :size="16"><CircleCheck /></el-icon>
          </button>
          <!-- AI 评分标签 -->
          <div class="batch-review-score-bar">
            <span v-if="img.score !== null && img.score !== undefined" class="batch-review-score" :class="img.passed ? 'score--pass' : 'score--fail'">
              {{ img.score }}分
            </span>
            <span
              v-if="workflowStore.pendingConfirm.data.recommendedIndex != null && workflowStore.pendingConfirm.data.recommendedIndex === idx"
              class="batch-review-rec"
            >AI推荐</span>
          </div>
          <div class="batch-review-label">#{{ idx + 1 }}</div>
          <!-- AI 评价 -->
          <div class="batch-review-comment" v-if="img.comment">{{ img.comment }}</div>
        </div>
      </div>

      <!-- 大图预览 -->
      <el-dialog
        v-model="previewVisible"
        title="图片预览"
        width="auto"
        top="3vh"
        append-to-body
        :close-on-click-modal="true"
      >
        <div class="batch-preview-content">
          <img :src="previewUrl" alt="预览" />
        </div>
      </el-dialog>

      <!-- 阈值参考 -->
      <div v-if="batchBestScore !== null && batchBestScore > 0" class="batch-review-threshold">
        AI 评分通过阈值：{{ workflowStore.config.scoreThreshold }} 分 |
        本轮最高分：{{ batchBestScore }} 分
      </div>

      <!-- 反馈输入 -->
      <div class="batch-review-feedback">
        <label>附加意见（可选，打回时 AI 会结合评审建议和你的意见改进提示词）</label>
        <el-input
          v-model="batchFeedback"
          type="textarea"
          :rows="2"
          resize="none"
          placeholder="输入修改意见..."
        />
      </div>
    </div>

    <template #footer>
      <div class="batch-review-footer">
        <el-button @click="handleBatchReject">打回全部</el-button>
        <el-button
          type="primary"
          :disabled="batchSelectedIndices.length === 0"
          @click="handleBatchApprove"
        >
          通过选中的 {{ batchSelectedIndices.length }} 张图片
        </el-button>
      </div>
    </template>
  </el-dialog>

  <!-- 迭代上限暂停弹窗 -->
  <el-dialog
    :model-value="workflowStore.pendingConfirm?.type === 'iteration-limit'"
    title="图片迭代达到上限"
    width="520px"
    top="15vh"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
  >
    <div class="pause-body">
      <div class="pause-icon pause-icon--warn">
        <el-icon :size="32"><WarningFilled /></el-icon>
      </div>
      <div class="pause-title">
        图片 #{{ workflowStore.pendingConfirm?.data?.imageSpec?.index }} 已迭代 {{ workflowStore.pendingConfirm?.data?.attempt }} 轮
      </div>
      <div class="pause-message">
        该图片经过多轮生成和评审仍未达到通过标准，可能是当前提示词不够理想或评分阈值过高。
      </div>
      <div class="pause-message" v-if="workflowStore.pendingConfirm?.data?.lastScore">
        最近一次评分: {{ workflowStore.pendingConfirm?.data?.lastScore }} / 100 (阈值: {{ workflowStore.config.scoreThreshold }})
      </div>
    </div>
    <template #footer>
      <div class="dialog-footer-row">
        <el-button @click="handleIterationSkip">跳过这张图</el-button>
        <el-button type="primary" @click="handleIterationRetry">再试几轮</el-button>
        <el-button type="danger" @click="handleIterationAbort">终止工作流</el-button>
      </div>
    </template>
  </el-dialog>
  <!-- ===== GalCG 角色处理弹窗（新版） ===== -->
  <el-dialog
    :model-value="workflowStore.pendingConfirm?.type === 'gal-character-process'"
    title="角色处理"
    width="900px"
    top="3vh"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
  >
    <div class="char-process-body" v-if="workflowStore.pendingConfirm?.data">
      <!-- 顶部提示 -->
      <div class="char-process-tip-highlight">
        💡 角色的外貌描述可以直接用于生成 AI 立绘，如果您需要让 AI 使用指定提示词生成立绘，只需把角色外貌填入外貌描述栏中即可
      </div>

      <!-- 角色列表 -->
      <div class="char-process-list">
        <div
          v-for="(ch, idx) in charProcessList"
          :key="idx"
          class="char-process-card"
          :class="{
            'char-process-card--passed': ch.status === 'passed',
            'char-process-card--deleted': ch.deleted,
          }"
        >
          <!-- 已通过标记 -->
          <div v-if="ch.status === 'passed'" class="char-process-passed-badge">
            <el-icon :size="12"><CircleCheck /></el-icon> 已通过
          </div>

          <!-- 左侧：参考图 -->
          <div class="char-process-left">
            <div
              class="char-process-ref"
              :class="{ 'char-process-ref--dragover': charProcessDragIdx === idx }"
              @click="ch.refDataUrl && previewImage(ch.refDataUrl)"
              @dragover.prevent="ch.status !== 'passed' ? (charProcessDragIdx = idx) : null"
              @dragleave="charProcessDragIdx = -1"
              @drop.prevent="onCharProcessRefDrop($event, idx)"
            >
              <img v-if="ch.refDataUrl" :src="ch.refDataUrl" alt="" />
              <div v-else class="char-process-ref-empty">
                <el-icon :size="24"><User /></el-icon>
                <span>拖拽或点击上传</span>
              </div>
            </div>
            <!-- 上传/替换/删除参考图（仅待处理角色） -->
            <div v-if="ch.status !== 'passed'" class="char-process-ref-actions">
              <el-button size="small" @click="triggerCharProcessUpload(idx)">
                {{ ch.refDataUrl ? '替换' : '上传' }}
              </el-button>
              <el-button v-if="ch.refDataUrl" size="small" type="danger" @click="removeCharProcessRef(idx)">
                删除图
              </el-button>
            </div>
          </div>

          <!-- 中间：信息编辑 -->
          <div class="char-process-center">
            <div class="char-process-field">
              <label>角色名</label>
              <el-input
                v-model="ch.name"
                size="small"
                :disabled="ch.status === 'passed'"
                placeholder="角色名称"
              />
            </div>
            <div class="char-process-field">
              <label>角色身份</label>
              <span class="char-process-role">{{ ch.role || '未知' }}</span>
            </div>
            <div class="char-process-field">
              <label>外貌描述</label>
              <el-input
                v-model="ch.appearance"
                type="textarea"
                :rows="3"
                resize="none"
                :disabled="ch.status === 'passed'"
                placeholder="角色外貌描述..."
              />
              <div v-if="!ch.appearance && ch.status !== 'passed'" class="char-process-warn-text">
                ⚠️ 该角色无原文外貌描述，建议上传参考图或手动填写
              </div>
            </div>
          </div>

          <!-- 右侧：操作选项（仅待处理角色） -->
          <div v-if="ch.status !== 'passed'" class="char-process-right">
            <div class="char-process-actions-title">选择操作</div>
            <div class="char-process-action-group">
              <button
                class="char-process-action-btn"
                :class="{ 'char-process-action-btn--active': ch.action === 'option1' }"
                :disabled="!ch.refDataUrl"
                @click="ch.action = ch.action === 'option1' ? null : 'option1'"
                :title="!ch.refDataUrl ? '需要先上传参考图' : ''"
              >
                <span class="char-process-action-label">基于参考图重新生成描述</span>
                <span class="char-process-action-hint">需要参考图</span>
              </button>
              <button
                class="char-process-action-btn"
                :class="{ 'char-process-action-btn--active': ch.action === 'option2' }"
                @click="ch.action = ch.action === 'option2' ? null : 'option2'"
              >
                <span class="char-process-action-label">用AI生成立绘</span>
                <span class="char-process-action-hint">基于外貌描述</span>
              </button>
              <button
                class="char-process-action-btn char-process-action-btn--pass"
                :class="{ 'char-process-action-btn--active': ch.action === 'option3' }"
                :disabled="!ch.refDataUrl || !ch.appearance"
                @click="ch.action = ch.action === 'option3' ? null : 'option3'"
                :title="!ch.refDataUrl ? '需要参考图' : !ch.appearance ? '需要外貌描述' : ''"
              >
                <span class="char-process-action-label">通过</span>
                <span class="char-process-action-hint">需要参考图+描述</span>
              </button>
            </div>
            <!-- 删除角色 -->
            <el-button
              text type="danger" size="small"
              class="char-process-delete-btn"
              @click="markCharProcessDeleted(idx)"
            >
              <el-icon><Delete /></el-icon> 删除此角色
            </el-button>
          </div>
        </div>
      </div>

      <!-- 参考图上传 input -->
      <input
        ref="charProcessUploadInput"
        type="file"
        accept="image/*"
        style="display: none"
        @change="onCharProcessUploaded"
      />

      <!-- 大图预览 -->
      <el-dialog
        v-model="previewVisible"
        title="图片预览"
        width="auto"
        top="3vh"
        append-to-body
        :close-on-click-modal="true"
      >
        <div class="batch-preview-content">
          <img :src="previewUrl" alt="预览" />
        </div>
      </el-dialog>
    </div>

    <template #footer>
      <div class="char-process-footer">
        <div class="char-process-footer-info">
          {{ charProcessPassedCount }} / {{ charProcessActiveCount }} 个角色已通过
          <span v-if="charProcessPendingNeedAction > 0" style="margin-left: 8px; color: #f59e0b;">
            （{{ charProcessPendingNeedAction }} 个待选择操作）
          </span>
        </div>
        <el-button
          type="primary"
          :disabled="!charProcessCanExecute"
          @click="handleCharProcessExecute"
        >
          {{ charProcessAllPassed ? '全部通过，继续' : '执行选中的操作' }}
        </el-button>
      </div>
    </template>
  </el-dialog>
  <!-- ===== 超时延长弹窗 ===== -->
  <el-dialog
    :model-value="workflowStore.pendingConfirm?.type === 'time-extend'"
    title="工作流已超时"
    width="520px"
    top="15vh"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
  >
    <div class="pause-body">
      <div class="pause-icon pause-icon--warn">
        <el-icon :size="32"><WarningFilled /></el-icon>
      </div>
      <div class="pause-title">已超过设定的时间上限</div>
      <div class="pause-message">
        工作流已运行超过设定的时间上限（{{ workflowStore.config.timeLimitMinutes }} 分钟）。
        您可以选择延长时间继续运行，或者立即终止工作流。
      </div>
      <div class="time-extend-slider">
        <div class="time-extend-label">延长时间：{{ timeExtendDisplay }}</div>
        <el-slider
          v-model="timeExtendMinutes"
          :min="10"
          :max="360"
          :step="10"
          :marks="{ 10: '10分', 30: '30分', 60: '1h', 120: '2h', 180: '3h', 360: '6h' }"
        />
      </div>
    </div>
    <template #footer>
      <div class="dialog-footer-row">
        <el-button type="danger" @click="handleTimeExtendStop">终止工作流</el-button>
        <el-button type="primary" @click="handleTimeExtendContinue">
          延长 {{ timeExtendDisplay }} 继续运行
        </el-button>
      </div>
    </template>
  </el-dialog>
  <!-- ===== 效率优先模式：统一评审弹窗 ===== -->
  <el-dialog
    :model-value="workflowStore.pendingConfirm?.type === 'efficiency-batch-review'"
    title="图片统一评审"
    width="900px"
    top="3vh"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
  >
    <div class="eff-review-body" v-if="workflowStore.pendingConfirm?.data">
      <div class="eff-review-tip">
        点击图片可放大查看，点击右上角勾选按钮选中图片，然后在底部批量通过或打回
      </div>
      <div class="eff-review-round" v-if="workflowStore.pendingConfirm.data.round > 1">
        第 {{ workflowStore.pendingConfirm.data.round }} 轮评审（打回重新生成的图片）
      </div>
      <div class="eff-review-grid">
        <div
          v-for="(img, idx) in effMergedImages"
          :key="idx"
          class="eff-review-item"
          :class="{
            'eff-review-item--selected': img.status === 'pending' && effSelectedIndices.includes(img.originalIndex),
            'eff-review-item--approved': img.status === 'approved',
            'eff-review-item--rejected': img.status === 'rejected',
          }"
        >
          <img :src="img.dataUrl" alt="" @click="previewImage(img.dataUrl)" />
          <!-- 已通过徽章 -->
          <div v-if="img.status === 'approved'" class="eff-review-approved-badge">
            <el-icon :size="11"><CircleCheck /></el-icon> 已通过
          </div>
          <!-- 已打回徽章 -->
          <div v-else-if="img.status === 'rejected'" class="eff-review-rejected-badge">
            <el-icon :size="11"><CircleClose /></el-icon> 已打回
          </div>
          <!-- 可选择按钮（仅待审核图片） -->
          <button
            v-else
            class="eff-review-select-btn"
            :class="{ 'eff-review-select-btn--active': effSelectedIndices.includes(img.originalIndex) }"
            @click.stop="toggleEffSelect(img.originalIndex)"
          >
            <el-icon :size="16"><CircleCheck /></el-icon>
          </button>
          <div class="eff-review-label">#{{ img.specIndex || (idx + 1) }}</div>
        </div>
      </div>

      <!-- 大图预览 -->
      <el-dialog
        v-model="previewVisible"
        title="图片预览"
        width="auto"
        top="3vh"
        append-to-body
        :close-on-click-modal="true"
      >
        <div class="batch-preview-content">
          <img :src="previewUrl" alt="预览" />
        </div>
      </el-dialog>
    </div>

    <template #footer>
      <div class="eff-review-footer">
        <div class="eff-review-footer-info">
          已选中 {{ effSelectedIndices.length }} / {{ effReviewImages.length }} 张待审核
          <span v-if="effApprovedImages.length > 0" style="margin-left: 8px; color: #16a34a;">
            （{{ effApprovedImages.length }} 张已通过）
          </span>
          <span v-if="effRejectedImages.length > 0" style="margin-left: 8px; color: #ef4444;">
            （{{ effRejectedImages.length }} 张已打回）
          </span>
        </div>
        <div class="eff-review-footer-actions">
          <el-button
            :disabled="effSelectedIndices.length === 0"
            @click="handleEffReject"
          >
            打回选中的 {{ effSelectedIndices.length }} 张
          </el-button>
          <el-button
            type="primary"
            :disabled="effSelectedIndices.length === 0"
            @click="handleEffApprove"
          >
            通过选中的 {{ effSelectedIndices.length }} 张
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>

  <!-- ===== 效率优先模式：打回意见弹窗 ===== -->
  <el-dialog
    :model-value="workflowStore.pendingConfirm?.type === 'efficiency-reject-feedback'"
    title="为打回的图片添加修改意见（可选）"
    width="700px"
    top="5vh"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
  >
    <div class="eff-feedback-body" v-if="workflowStore.pendingConfirm?.data">
      <div class="eff-feedback-tip">
        可以为每张打回的图片单独添加修改意见，AI 将根据意见优化提示词重新生成。不添加意见则使用原提示词重新生成。
      </div>
      <div class="eff-feedback-list">
        <div
          v-for="item in effFeedbackSorted"
          :key="item.originalIndex"
          class="eff-feedback-item"
        >
          <div class="eff-feedback-item-img" @click="previewImage(item.img.dataUrl)">
            <img :src="item.img.dataUrl" alt="" />
          </div>
          <div class="eff-feedback-item-right">
            <span class="eff-feedback-item-title">#{{ item.img.specIndex }}</span>
            <el-input
              v-model="effFeedbackTexts[item.originalIndex]"
              type="textarea"
              :rows="2"
              resize="none"
              placeholder="修改意见（可选）..."
            />
          </div>
        </div>
      </div>
    </div>

      <!-- 大图预览 -->
      <el-dialog
        v-model="previewVisible"
        title="图片预览"
        width="auto"
        top="3vh"
        append-to-body
        :close-on-click-modal="true"
      >
        <div class="batch-preview-content">
          <img :src="previewUrl" alt="预览" />
        </div>
      </el-dialog>

    <template #footer>
      <div class="dialog-footer-row">
        <el-button @click="handleEffFeedbackSkip">不添加意见，直接重新生成</el-button>
        <el-button type="primary" @click="handleEffFeedbackConfirm">确认意见并重新生成</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { useThemeStore } from '@/stores/theme'
import { playNotificationSound } from '@/utils/notificationSound'
import { WarningFilled, CircleClose, CircleCheck, Upload, User, Delete } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const workflowStore = useWorkflowStore()
const themeStore = useThemeStore()

// ========== 计划确认 ==========
const planFeedback = ref('')

function handleApprovePlan() {
  planFeedback.value = ''
  workflowStore.resolveConfirm({ approved: true })
}

function handleRejectPlan() {
  workflowStore.resolveConfirm({ approved: false, feedback: planFeedback.value || '' })
  planFeedback.value = ''
}

function shotLabel(shot) {
  const map = { wide: '全景', medium: '中景', 'close-up': '特写', 'extreme-close-up': '大特写' }
  return map[shot] || shot || ''
}

// ========== 暂停弹窗 ==========
const pauseReason = computed(() =>
  workflowStore.pendingConfirm?.data?.reason || ''
)

function handlePauseContinue() {
  workflowStore.resolveConfirm({ abort: false })
}

function handlePauseAbort() {
  workflowStore.resolveConfirm({ abort: true })
}

// ========== 批量图片确认 ==========
const batchSelectedIndices = ref([])
const batchFeedback = ref('')

const batchCandidates = computed(() =>
  workflowStore.pendingConfirm?.data?.candidates || []
)

const batchBestScore = computed(() => {
  const candidates = batchCandidates.value
  if (candidates.length === 0) return 0
  return Math.max(...candidates.map(c => c.score || 0))
})

// 弹窗打开时重置选择状态
watch(() => workflowStore.pendingConfirm?.type, (type) => {
  if (type === 'batch-image-review') {
    batchSelectedIndices.value = []
    batchFeedback.value = ''
  }

  if (type === 'efficiency-batch-review') {
    effSelectedIndices.value = []
  }
  if (type === 'efficiency-reject-feedback') {
    const images = workflowStore.pendingConfirm?.data?.images || []
    effFeedbackTexts.value = images.map(() => '')
  }

  // 触发提示音
  if (type && themeStore.workflowSoundEnabled) {
    const soundTypes = ['plan', 'batch-image-review', 'iteration-limit', 'gal-character-process', 'efficiency-batch-review', 'efficiency-reject-feedback', 'time-extend']
    if (soundTypes.includes(type)) {
      playNotificationSound()
    }
  }
})

const previewVisible = ref(false)
const previewUrl = ref('')

function previewImage(dataUrl) {
  previewUrl.value = dataUrl
  previewVisible.value = true
}


function toggleSelect(idx) {
  const i = batchSelectedIndices.value.indexOf(idx)
  if (i >= 0) {
    batchSelectedIndices.value.splice(i, 1)
  } else {
    batchSelectedIndices.value.push(idx)
  }
}

function handleBatchApprove() {
  if (batchSelectedIndices.value.length === 0) return
  workflowStore.resolveConfirm({ approved: true, selectedIndices: [...batchSelectedIndices.value] })
  batchSelectedIndices.value = []
  batchFeedback.value = ''
}

function handleBatchReject() {
  const enableAiReview = workflowStore.config.enableAiReview !== false
  const feedback = batchFeedback.value.trim()

  if (!enableAiReview && !feedback) {
    ElMessage.warning('AI 评分已关闭，打回时请填写修改意见，否则下一轮提示词无法改进')
    return
  }

  workflowStore.resolveConfirm({ approved: false, feedback: feedback || '' })
  batchSelectedIndices.value = []
  batchFeedback.value = ''
}

// ========== 迭代上限 ==========
function handleIterationRetry() {
  workflowStore.resolveConfirm({ action: 'retry' })
}

function handleIterationSkip() {
  workflowStore.resolveConfirm({ action: 'skip' })
}

function handleIterationAbort() {
  workflowStore.resolveConfirm({ action: 'abort' })
}

// ========== GalCG 角色处理（新版） ==========

const charProcessList = ref([])
const charProcessUploadInput = ref(null)
let charProcessUploadIdx = -1
const charProcessDragIdx = ref(-1)

function onCharProcessRefDrop(e, idx) {
  charProcessDragIdx.value = -1
  if (charProcessList.value[idx]?.status === 'passed') return

  const files = Array.from(e.dataTransfer?.files || [])
  const imageFile = files.find(f => f.type.startsWith('image/'))
  if (!imageFile) return

  const reader = new FileReader()
  reader.onload = (ev) => {
    if (charProcessList.value[idx]) {
      charProcessList.value[idx].refDataUrl = ev.target.result
    }
  }
  reader.readAsDataURL(imageFile)
}

watch(() => workflowStore.pendingConfirm?.type, (type) => {
  if (type === 'gal-character-process') {
    const chars = workflowStore.pendingConfirm?.data?.characters || []
    charProcessList.value = JSON.parse(JSON.stringify(chars))
  }
})

const charProcessActiveCount = computed(() =>
  charProcessList.value.filter(c => !c.deleted).length
)

const charProcessPassedCount = computed(() =>
  charProcessList.value.filter(c => !c.deleted && c.status === 'passed').length
)

const charProcessPendingNeedAction = computed(() =>
  charProcessList.value.filter(c => !c.deleted && c.status === 'pending' && !c.action).length
)

const charProcessAllPassed = computed(() =>
  charProcessActiveCount.value > 0 &&
  charProcessList.value.filter(c => !c.deleted).every(c => c.status === 'passed')
)

const charProcessCanExecute = computed(() => {
  if (charProcessAllPassed.value) return true
  const pending = charProcessList.value.filter(c => !c.deleted && c.status === 'pending')
  return pending.length > 0 && pending.every(c => c.action)
})

function triggerCharProcessUpload(idx) {
  charProcessUploadIdx = idx
  charProcessUploadInput.value?.click()
}

function onCharProcessUploaded(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    if (charProcessList.value[charProcessUploadIdx]) {
      charProcessList.value[charProcessUploadIdx].refDataUrl = ev.target.result
    }
  }
  reader.readAsDataURL(file)
  e.target.value = ''
}

function removeCharProcessRef(idx) {
  if (charProcessList.value[idx]) {
    charProcessList.value[idx].refDataUrl = ''
  }
}

function markCharProcessDeleted(idx) {
  if (charProcessList.value[idx]) {
    charProcessList.value[idx].deleted = true
  }
}

function handleCharProcessExecute() {
  workflowStore.resolveConfirm({
    characters: JSON.parse(JSON.stringify(charProcessList.value)),
  })
}

// ========== 超时延长 ==========

const timeExtendMinutes = ref(30)

const timeExtendDisplay = computed(() => {
  const mins = timeExtendMinutes.value
  const hours = Math.floor(mins / 60)
  const remainMins = mins % 60
  if (hours === 0) return `${remainMins} 分钟`
  if (remainMins === 0) return `${hours} 小时`
  return `${hours} 小时 ${remainMins} 分钟`
})

function handleTimeExtendContinue() {
  workflowStore.extendTimeLimit(timeExtendMinutes.value)
  workflowStore.resolveConfirm({ action: 'extend' })
  timeExtendMinutes.value = 30
}

function handleTimeExtendStop() {
  workflowStore.resolveConfirm({ action: 'stop' })
  timeExtendMinutes.value = 30
}

// ========== 效率优先模式：统一评审 ==========

const effSelectedIndices = ref([])

const effReviewImages = computed(() =>
  workflowStore.pendingConfirm?.data?.images || []
)

const effApprovedImages = computed(() =>
  workflowStore.pendingConfirm?.data?.approvedImages || []
)

const effRejectedImages = computed(() =>
  workflowStore.pendingConfirm?.data?.rejectedImages || []
)

const effMergedImages = computed(() => {
  const actionable = effReviewImages.value.map((img, i) => ({
    dataUrl: img.dataUrl,
    specIndex: img.specIndex,
    status: 'pending',
    originalIndex: i,
  }))
  const approved = effApprovedImages.value.map(img => ({
    dataUrl: img.dataUrl,
    specIndex: img.specIndex,
    status: 'approved',
    originalIndex: -1,
  }))
  const rejected = effRejectedImages.value.map(img => ({
    dataUrl: img.dataUrl,
    specIndex: img.specIndex,
    status: 'rejected',
    originalIndex: -1,
  }))
  const merged = [...actionable, ...approved, ...rejected]
  merged.sort((a, b) => (a.specIndex || 0) - (b.specIndex || 0))
  return merged
})

function toggleEffSelect(idx) {
  const i = effSelectedIndices.value.indexOf(idx)
  if (i >= 0) effSelectedIndices.value.splice(i, 1)
  else effSelectedIndices.value.push(idx)
}

function handleEffApprove() {
  if (effSelectedIndices.value.length === 0) return
  workflowStore.resolveConfirm({
    action: 'approve',
    indices: [...effSelectedIndices.value],
  })
  effSelectedIndices.value = []
}

function handleEffReject() {
  if (effSelectedIndices.value.length === 0) return
  workflowStore.resolveConfirm({
    action: 'reject',
    indices: [...effSelectedIndices.value],
  })
  effSelectedIndices.value = []
}

// ========== 效率优先模式：打回意见 ==========

const effFeedbackTexts = ref([])

const effFeedbackImages = computed(() =>
  workflowStore.pendingConfirm?.data?.images || []
)

const effFeedbackSorted = computed(() => {
  const images = effFeedbackImages.value
  return images
    .map((img, idx) => ({ img, originalIndex: idx }))
    .sort((a, b) => (a.img.specIndex || 0) - (b.img.specIndex || 0))
})

function handleEffFeedbackSkip() {
  const feedbacks = effFeedbackImages.value.map(() => '')
  workflowStore.resolveConfirm({ feedbacks })
}

function handleEffFeedbackConfirm() {
  workflowStore.resolveConfirm({ feedbacks: [...effFeedbackTexts.value] })
  effFeedbackTexts.value = []
}
</script>

<style scoped>
.dialog-footer-row {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

/* ===== 计划确认 ===== */
.plan-confirm-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 60vh;
  overflow-y: auto;
}

.plan-summary {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 14px;
}

.plan-summary-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-color);
}

.plan-total {
  font-size: 16px;
  font-weight: 700;
  color: var(--accent-color);
}

.plan-strategy {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.plan-image-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.plan-image-item {
  display: flex;
  gap: 10px;
  padding: 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
}

.plan-image-num {
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

.plan-image-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.plan-image-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.plan-image-desc {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.plan-image-prompt {
  font-size: 11px;
  color: var(--text-muted);
  font-family: 'Consolas', 'Monaco', monospace;
  line-height: 1.3;
  word-break: break-all;
  padding: 4px 6px;
  background: var(--bg-secondary);
  border-radius: 3px;
  margin-top: 2px;
}

.plan-details-toggle {
  cursor: pointer;
}

.plan-details-toggle summary {
  font-size: 13px;
  color: var(--accent-color);
  font-weight: 500;
  padding: 6px 0;
  user-select: none;
}

.plan-details-toggle summary:hover {
  text-decoration: underline;
}

.plan-full-text {
  margin-top: 8px;
  padding: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow-y: auto;
}

.plan-feedback-area {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.plan-feedback-area label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

/* ===== 暂停弹窗 ===== */
.pause-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
  padding: 12px 0;
}

.pause-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pause-icon--warn {
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
}

.pause-icon--info {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

.pause-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}

.pause-message {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.6;
  max-width: 380px;
}

.pause-count {
  font-size: 12px;
  color: var(--text-muted);
  padding: 4px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 999px;
}

/* ===== 批量图片评审 ===== */
.batch-review-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.batch-review-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.batch-review-spec {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.batch-review-round {
  font-size: 12px;
  color: var(--text-muted);
  padding: 2px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 999px;
}

.batch-review-warn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: var(--radius-sm);
  color: #d97706;
  font-size: 13px;
}

:root.dark .batch-review-warn {
  color: #fbbf24;
}

.batch-review-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}

.batch-review-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 2px solid var(--border-color);
  transition: all 0.2s;
}

.batch-review-item img {
  cursor: zoom-in;
}

.batch-review-item:hover {
  border-color: var(--accent-color);
  box-shadow: var(--shadow-md);
}

.batch-review-item--selected {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 3px var(--accent-light);
}

.batch-review-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.batch-review-select-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.7);
  background: rgba(0, 0, 0, 0.4);
  color: rgba(255, 255, 255, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  z-index: 3;
}

.batch-review-select-btn:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
  background: rgba(0, 0, 0, 0.6);
}

.batch-review-select-btn--active {
  border-color: var(--accent-color);
  background: var(--accent-color);
  color: white;
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
}

.batch-review-select-btn--active:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
  color: white;
}

.batch-review-label {
  position: absolute;
  bottom: 6px;
  left: 6px;
  font-size: 11px;
  font-weight: 700;
  color: white;
  background: rgba(0,0,0,0.5);
  padding: 1px 6px;
  border-radius: 3px;
}

.batch-review-score-bar {
  position: absolute;
  top: 6px;
  left: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.batch-review-score {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 3px;
  color: white;
}

.score--pass {
  background: rgba(22, 163, 74, 0.85);
}

.score--fail {
  background: rgba(239, 68, 68, 0.75);
}

.batch-review-rec {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 5px;
  border-radius: 3px;
  background: rgba(99, 102, 241, 0.85);
  color: white;
}

.batch-review-item--recommended {
  border-color: var(--accent-color);
}

.batch-review-comment {
  position: absolute;
  bottom: 22px;
  left: 0;
  right: 0;
  padding: 4px 6px;
  background: rgba(0, 0, 0, 0.65);
  color: white;
  font-size: 10px;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.2s;
}

.batch-review-item:hover .batch-review-comment {
  opacity: 1;
}

.batch-review-threshold {
  font-size: 12px;
  color: var(--text-muted);
  padding: 6px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  text-align: center;
}

.batch-review-feedback {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.batch-review-feedback label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.batch-review-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

/* 大图预览 */
.batch-preview-content {
  display: flex;
  align-items: center;
  justify-content: center;
}

.batch-preview-content img {
  max-width: 90vw;
  max-height: 80vh;
  border-radius: var(--radius-sm);
  object-fit: contain;
}

.batch-review-tip {
  font-size: 12px;
  color: var(--text-muted);
  padding: 6px 10px;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  text-align: center;
}

/* ===== 漫画分镜展示 ===== */
.plan-comic-storyboard {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.storyboard-section-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.storyboard-characters {
  padding: 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
}

.storyboard-char-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.storyboard-char-item {
  display: flex;
  gap: 8px;
  font-size: 12px;
  line-height: 1.5;
}

.storyboard-char-name {
  font-weight: 700;
  color: var(--accent-color);
  flex-shrink: 0;
}

.storyboard-char-desc {
  color: var(--text-secondary);
}

.storyboard-page {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.storyboard-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
}

.storyboard-page-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.storyboard-page-layout {
  font-size: 11px;
  color: var(--text-muted);
}

.storyboard-panels {
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: var(--border-color);
}

.storyboard-panel {
  padding: 10px 12px;
  background: var(--bg-secondary);
}

.storyboard-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.storyboard-panel-num {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
  background: var(--accent-light);
  color: var(--accent-color);
  padding: 1px 6px;
  border-radius: 3px;
}

.storyboard-panel-shot {
  font-size: 11px;
  color: var(--text-muted);
  padding: 1px 5px;
  background: var(--bg-card);
  border-radius: 3px;
}

.storyboard-panel-chars {
  font-size: 11px;
  color: var(--text-secondary);
}

.storyboard-panel-desc {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
  margin-bottom: 4px;
}

.storyboard-panel-dialogue {
  font-size: 12px;
  color: #f59e0b;
  font-style: italic;
  margin-bottom: 4px;
}

.storyboard-panel-prompt {
  font-size: 11px;
  color: var(--text-muted);
  font-family: 'Consolas', 'Monaco', monospace;
  line-height: 1.3;
  word-break: break-all;
  padding: 4px 6px;
  background: var(--bg-card);
  border-radius: 3px;
}

.gal-batch-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: var(--radius-sm);
  color: #3b82f6;
  font-size: 12px;
  line-height: 1.5;
  margin-bottom: 10px;
}

.plan-full-text-visible {
  padding: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 350px;
  overflow-y: auto;
}

/* ===== 效率优先模式：统一评审 ===== */
.eff-review-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 70vh;
  overflow-y: auto;
}

.eff-review-tip {
  font-size: 12px;
  color: var(--text-muted);
  padding: 6px 10px;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  text-align: center;
}

.eff-review-round {
  font-size: 13px;
  font-weight: 600;
  color: #f59e0b;
  text-align: center;
  padding: 4px 0;
}

.eff-review-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.eff-review-item {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 2px solid var(--border-color);
  transition: all 0.2s;
  cursor: pointer;
}

.eff-review-item:hover {
  border-color: var(--accent-color);
  box-shadow: var(--shadow-md);
}

.eff-review-item--selected {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 3px var(--accent-light);
}

.eff-review-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.eff-review-select-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.7);
  background: rgba(0, 0, 0, 0.4);
  color: rgba(255, 255, 255, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  z-index: 3;
}

.eff-review-select-btn:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
  background: rgba(0, 0, 0, 0.6);
}

.eff-review-select-btn--active {
  border-color: var(--accent-color);
  background: var(--accent-color);
  color: white;
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
}

.eff-review-select-btn--active:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
  color: white;
}

.eff-review-label {
  position: absolute;
  bottom: 6px;
  left: 6px;
  font-size: 12px;
  font-weight: 700;
  color: white;
  background: rgba(0,0,0,0.55);
  padding: 2px 8px;
  border-radius: 3px;
}

.eff-review-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.eff-review-footer-info {
  font-size: 13px;
  color: var(--text-muted);
}

.eff-review-footer-actions {
  display: flex;
  gap: 10px;
}

/* ===== 效率优先模式：打回意见 ===== */
.eff-feedback-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 65vh;
  overflow-y: auto;
}

.eff-feedback-tip {
  font-size: 13px;
  color: var(--text-secondary);
  padding: 8px 12px;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  line-height: 1.5;
}

.eff-feedback-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.eff-feedback-item {
  display: flex;
  gap: 12px;
  padding: 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
}

.eff-feedback-item-img {
  width: 120px;
  height: 68px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--border-color);
  background: #111;
  cursor: zoom-in;
  transition: border-color 0.2s;
}

.eff-feedback-item-img:hover {
  border-color: var(--accent-color);
}

.eff-feedback-item-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.eff-feedback-item-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.eff-feedback-item-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

/* 效率模式：已通过图片样式 */
.eff-review-item--approved {
  border-color: #16a34a !important;
  opacity: 0.7;
  pointer-events: auto;
}

.eff-review-item--approved img {
  cursor: zoom-in;
}

.eff-review-approved-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  border-radius: 4px;
  background: rgba(22, 163, 74, 0.9);
  color: white;
  font-size: 11px;
  font-weight: 700;
  z-index: 3;
  pointer-events: none;
}

/* 效率模式：已打回图片样式 */
.eff-review-item--rejected {
  border-color: #ef4444 !important;
  opacity: 0.7;
  pointer-events: auto;
}

.eff-review-item--rejected img {
  cursor: zoom-in;
}

.eff-review-rejected-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  border-radius: 4px;
  background: rgba(239, 68, 68, 0.9);
  color: white;
  font-size: 11px;
  font-weight: 700;
  z-index: 3;
  pointer-events: none;
}

/* ===== GalCG 角色处理弹窗（新版） ===== */
.char-process-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: 72vh;
  overflow-y: auto;
}

.char-process-tip-highlight {
  padding: 12px 16px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: var(--radius-sm);
  color: #3b82f6;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.6;
}

:root.dark .char-process-tip-highlight {
  color: #60a5fa;
}

.char-process-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.char-process-card {
  display: flex;
  gap: 14px;
  padding: 14px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  position: relative;
  transition: all 0.2s;
}

.char-process-card:hover {
  border-color: var(--accent-color);
}

.char-process-card--passed {
  opacity: 0.65;
  pointer-events: none;
  border-color: #16a34a;
}

.char-process-card--passed .char-process-ref,
.char-process-card--passed .char-process-ref img {
  pointer-events: auto;
  cursor: zoom-in;
}

.char-process-card--deleted {
  display: none;
}

.char-process-passed-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 4px;
  background: rgba(22, 163, 74, 0.9);
  color: white;
  font-size: 12px;
  font-weight: 700;
  z-index: 2;
}

/* 左侧：参考图 */
.char-process-left {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
}

.char-process-ref {
  width: 100px;
  height: 130px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--border-color);
  background: #111;
  cursor: zoom-in;
}

.char-process-ref img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.char-process-ref-empty {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--text-muted);
  font-size: 11px;
  cursor: default;
}

.char-process-ref-actions {
  display: flex;
  gap: 4px;
}

.char-process-ref-actions .el-button {
  padding: 4px 8px !important;
  font-size: 11px !important;
}

/* 中间：信息 */
.char-process-center {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.char-process-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.char-process-field label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}

.char-process-role {
  font-size: 13px;
  color: var(--text-secondary);
}

.char-process-warn-text {
  font-size: 11px;
  color: #f59e0b;
  margin-top: 2px;
}

/* 右侧：操作 */
.char-process-right {
  width: 150px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.char-process-actions-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
  text-align: center;
}

.char-process-action-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.char-process-action-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 6px;
  border: 2px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
}

.char-process-action-btn:hover:not(:disabled) {
  border-color: var(--accent-color);
  background: var(--bg-hover);
}

.char-process-action-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.char-process-action-btn--active {
  border-color: var(--accent-color) !important;
  background: var(--accent-light) !important;
  color: var(--accent-color) !important;
}

.char-process-action-btn--pass.char-process-action-btn--active {
  border-color: #16a34a !important;
  background: rgba(22, 163, 74, 0.12) !important;
  color: #16a34a !important;
}

.char-process-action-icon {
  font-size: 16px;
}

.char-process-action-label {
  font-size: 12px;
  font-weight: 600;
}

.char-process-action-hint {
  font-size: 10px;
  color: var(--text-muted);
}

.char-process-delete-btn {
  margin-top: auto;
  align-self: center;
}

/* 底部 */
.char-process-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.char-process-footer-info {
  font-size: 13px;
  color: var(--text-muted);
}

/* ===== 超时延长弹窗 ===== */
.time-extend-slider {
  width: 100%;
  max-width: 380px;
  margin-top: 8px;
}

.time-extend-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent-color);
  text-align: center;
  margin-bottom: 8px;
}

.time-extend-slider :deep(.el-slider) {
  margin-bottom: 20px;
}

/* 角色处理弹窗参考图拖拽 */
.char-process-ref--dragover {
  border-color: var(--accent-color) !important;
  background: var(--accent-light) !important;
  box-shadow: 0 0 0 2px var(--accent-light);
}
</style>