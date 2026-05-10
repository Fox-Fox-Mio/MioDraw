<template>
  <div class="character-page">
    <!-- ===== 列表视图 ===== -->
    <div v-if="!editingCharacter" class="char-list-view">
      <!-- 顶部操作栏 -->
      <div class="char-header">
        <div class="char-header-left">
          <h2>角色卡</h2>
          <span class="char-count">{{ characterStore.characterCount }} 个角色</span>
        </div>
        <div class="char-header-right">
          <el-input
            v-model="searchQuery"
            placeholder="搜索角色..."
            :prefix-icon="Search"
            clearable
            style="width: 200px"
            size="default"
          />
          <el-button v-if="!batchMode" type="primary" @click="showCreateDialog = true">
            <el-icon><Plus /></el-icon> 新建角色
          </el-button>
          <el-button v-if="!batchMode" @click="enterBatchMode">
            <el-icon><Operation /></el-icon> 批量管理
          </el-button>
          <template v-if="batchMode">
            <el-button :class="{ 'batch-btn-fav': batchSelected.length > 0 }" :disabled="batchSelected.length === 0" @click="batchFav(true)">
              <el-icon><Star /></el-icon> 收藏 ({{ batchSelected.length }})
            </el-button>
            <el-button :disabled="batchSelected.length === 0" @click="batchFav(false)">
              <el-icon><Star /></el-icon> 取消收藏
            </el-button>
            <el-button :class="{ 'batch-btn-del': batchSelected.length > 0 }" :disabled="batchSelected.length === 0" @click="batchDel">
              <el-icon><Delete /></el-icon> 删除 ({{ batchSelected.length }})
            </el-button>
            <el-button @click="exitBatchMode">取消</el-button>
          </template>
        </div>
      </div>

      <!-- 筛选标签 -->
      <div class="char-filter-bar">
        <el-radio-group v-model="filterMode" size="small">
          <el-radio-button value="all">全部</el-radio-button>
          <el-radio-button value="fav">已收藏</el-radio-button>
        </el-radio-group>
      </div>

      <!-- 角色卡网格 -->
      <div v-if="filteredCharacters.length > 0" class="char-grid">
        <div
          v-for="ch in filteredCharacters"
          :key="ch.id"
          class="char-card"
          :class="{ 'char-card--selected': batchMode && batchSelected.includes(ch.id) }"
          @click="batchMode ? toggleBatchSelect(ch.id) : openEditor(ch)"
        >
          <div class="char-card-img">
            <img v-if="ch.mainImageRelPath" :src="getCharMainImageUrl(ch, true)" :alt="ch.name" loading="lazy" />
            <div v-else class="char-card-img-placeholder">
              <el-icon :size="32"><User /></el-icon>
            </div>
            <!-- 收藏角标 -->
            <span v-if="ch.favorite" class="char-card-fav">
              <el-icon :size="14"><Star /></el-icon>
            </span>
            <!-- 批量选择勾选 -->
            <button
              v-if="batchMode"
              class="char-card-check"
              :class="{ 'char-card-check--active': batchSelected.includes(ch.id) }"
              @click.stop="toggleBatchSelect(ch.id)"
            >
              <el-icon :size="16"><CircleCheck /></el-icon>
            </button>
          </div>
          <div class="char-card-info">
            <span class="char-card-name">{{ ch.name }}</span>
            <span class="char-card-meta">
              {{ ch.gallery?.length || 0 }} 张画廊 · {{ ch.stories?.length || 0 }} 篇故事
            </span>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else class="char-empty">
        <el-icon :size="48" color="var(--text-muted)"><User /></el-icon>
        <p v-if="searchQuery">没有找到匹配的角色</p>
        <p v-else>还没有角色卡，点击右上角「新建角色」开始创建</p>
      </div>
    </div>

    <!-- ===== 编辑视图 ===== -->
    <div v-else class="char-editor-view">
      <!-- 编辑器顶栏 -->
      <div class="editor-topbar">
        <el-button text @click="closeEditor">
          <el-icon><ArrowLeft /></el-icon> 返回列表
        </el-button>
        <div class="editor-topbar-right">
          <el-button
            :type="editingCharacter.favorite ? 'warning' : 'default'"
            size="small"
            @click="toggleEditFav"
          >
            <el-icon><Star /></el-icon> {{ editingCharacter.favorite ? '已收藏' : '收藏' }}
          </el-button>
          <el-button type="danger" size="small" @click="handleDeleteCharacter">
            <el-icon><Delete /></el-icon> 删除角色
          </el-button>
        </div>
      </div>

      <!-- 编辑器主体 -->
      <div class="editor-body">
        <!-- 左侧：主设图 + 基本信息 -->
        <div class="editor-left">
          <!-- 主设图 -->
          <div class="editor-main-image">
            <img
              v-if="editingCharacter.mainImageRelPath"
              :src="getCharMainImageUrl(editingCharacter)"
              alt="主设图"
              @click="previewMainImage"
            />
            <div v-else class="editor-main-image-empty" @click="changeMainImage">
              <el-icon :size="36"><Plus /></el-icon>
              <span>点击上传主设图</span>
            </div>
            <div v-if="editingCharacter.mainImageRelPath" class="editor-main-image-actions">
              <el-button size="small" @click="changeMainImage">更换</el-button>
            </div>
          </div>
          <input
            ref="mainImageInput"
            type="file"
            accept="image/*"
            style="display: none"
            @change="onMainImageSelected"
          />

          <!-- 角色名 -->
          <div class="editor-field">
            <label>角色名称 *</label>
            <el-input v-model="editName" placeholder="输入角色名称" @blur="saveBasicFields" />
          </div>
          <!-- 导出按钮 -->
          <div class="editor-left-bottom">
            <el-button style="width: 100%" @click="showExportDialog = true">
              <el-icon><Download /></el-icon> 导出角色卡
            </el-button>
          </div>
        </div>

        <!-- 右侧：详细信息 Tab 区 -->
        <div class="editor-right">
          <el-tabs v-model="activeTab" type="border-card">
            <!-- 基础设定 -->
            <!-- 基础设定 -->
            <el-tab-pane label="基础设定" name="basic">
              <div class="info-card">
                <div class="info-card-header">
                  <label>基础设定</label>
                  <div class="info-card-actions">
                    <el-button v-if="!editingField.basic" size="small" @click="editingField.basic = true">
                      <el-icon><Edit /></el-icon> 编辑
                    </el-button>
                    <el-button v-else size="small" type="primary" @click="saveField('basic')">
                      <el-icon><CircleCheck /></el-icon> 保存
                    </el-button>
                    <el-button size="small" :loading="aiGenerating === 'basic'" @click="aiGenerate('basic')">
                      <el-icon><MagicStick /></el-icon> AI 生成
                    </el-button>
                    <el-button size="small" class="ai-gen-setting-btn" @click="showAiModelDialog = true">
                      <el-icon><Setting /></el-icon>
                    </el-button>
                  </div>
                </div>
                <div v-if="editingField.basic" class="info-card-edit">
                  <el-input
                    v-model="editBasicInfo"
                    type="textarea"
                    :rows="8"
                    resize="vertical"
                    placeholder="身高、年龄、种族、职业等基础设定..."
                  />
                </div>
                <div v-else class="info-card-display">
                  <div v-if="editBasicInfo.trim()" class="info-card-text">{{ editBasicInfo }}</div>
                  <div v-else class="info-card-empty">暂未填写基础设定，点击「编辑」或「AI 生成」</div>
                </div>
              </div>
            </el-tab-pane>

            <!-- 外观描述 -->
            <el-tab-pane label="外观描述" name="appearance">
              <div class="info-card">
                <div class="info-card-header">
                  <label>外观描述</label>
                  <div class="info-card-actions">
                    <el-button v-if="!editingField.appearance" size="small" @click="editingField.appearance = true">
                      <el-icon><Edit /></el-icon> 编辑
                    </el-button>
                    <el-button v-else size="small" type="primary" @click="saveField('appearance')">
                      <el-icon><CircleCheck /></el-icon> 保存
                    </el-button>
                    <el-button size="small" :loading="aiGenerating === 'appearance'" @click="aiGenerate('appearance')">
                      <el-icon><MagicStick /></el-icon> AI 生成
                    </el-button>
                    <el-button size="small" class="ai-gen-setting-btn" @click="showAiModelDialog = true">
                      <el-icon><Setting /></el-icon>
                    </el-button>
                  </div>
                </div>
                <div v-if="editingField.appearance" class="info-card-edit">
                  <el-input
                    v-model="editAppearance"
                    type="textarea"
                    :rows="8"
                    resize="vertical"
                    placeholder="发色、瞳色、体型、标志性服装、配饰等外观特征..."
                  />
                </div>
                <div v-else class="info-card-display">
                  <div v-if="editAppearance.trim()" class="info-card-text">{{ editAppearance }}</div>
                  <div v-else class="info-card-empty">暂未填写外观描述，点击「编辑」或「AI 生成」</div>
                </div>
              </div>
            </el-tab-pane>

            <!-- 性格特点 -->
            <el-tab-pane label="性格特点" name="personality">
              <div class="info-card">
                <div class="info-card-header">
                  <label>性格特点</label>
                  <div class="info-card-actions">
                    <el-button v-if="!editingField.personality" size="small" @click="editingField.personality = true">
                      <el-icon><Edit /></el-icon> 编辑
                    </el-button>
                    <el-button v-else size="small" type="primary" @click="saveField('personality')">
                      <el-icon><CircleCheck /></el-icon> 保存
                    </el-button>
                    <el-button size="small" :loading="aiGenerating === 'personality'" @click="aiGenerate('personality')">
                      <el-icon><MagicStick /></el-icon> AI 生成
                    </el-button>
                    <el-button size="small" class="ai-gen-setting-btn" @click="showAiModelDialog = true">
                      <el-icon><Setting /></el-icon>
                    </el-button>
                  </div>
                </div>
                <div v-if="editingField.personality" class="info-card-edit">
                  <el-input
                    v-model="editPersonality"
                    type="textarea"
                    :rows="8"
                    resize="vertical"
                    placeholder="性格特征、行为习惯、口头禅等..."
                  />
                </div>
                <div v-else class="info-card-display">
                  <div v-if="editPersonality.trim()" class="info-card-text">{{ editPersonality }}</div>
                  <div v-else class="info-card-empty">暂未填写性格特点，点击「编辑」或「AI 生成」</div>
                </div>
              </div>
            </el-tab-pane>

            <!-- 经历与故事 -->
            <el-tab-pane label="经历与故事" name="stories">
              <div class="stories-panel">
                <div class="stories-header">
                  <span>共 {{ editingCharacter.stories?.length || 0 }} 篇</span>
                  <el-button size="small" type="primary" @click="openCreateStoryDialog">
                    <el-icon><Plus /></el-icon> 新建
                  </el-button>
                </div>
                <div v-if="editingCharacter.stories?.length > 0" class="stories-list">
                  <div
                    v-for="(story, i) in editingCharacter.stories"
                    :key="story.id"
                    class="story-item"
                    :class="{
                      'story-item--dragging': storyDragIndex === i,
                      'story-item--over': storyDragOverIndex === i && storyDragIndex !== i,
                    }"
                    draggable="true"
                    @dragstart="onStoryDragStart(i)"
                    @dragover.prevent="storyDragOverIndex = i"
                    @dragend="onStoryDragEnd"
                    @click="openStoryView(story)"
                  >
                    <span class="story-drag-handle">
                      <el-icon :size="14"><Rank /></el-icon>
                    </span>
                    <div class="story-item-info">
                      <span class="story-item-title">{{ story.title }}</span>
                      <span class="story-item-time">{{ formatDate(story.updatedAt) }}</span>
                    </div>
                    <div class="story-item-actions" @click.stop>
                      <el-button text size="small" @click="openEditStoryDialog(story)">
                        <el-icon><Edit /></el-icon>
                      </el-button>
                      <el-button text type="danger" size="small" @click="handleDeleteStory(story)">
                        <el-icon><Delete /></el-icon>
                      </el-button>
                    </div>
                  </div>
                </div>
                <div v-else class="stories-empty">还没有故事，点击「新建」开始创作</div>
              </div>
            </el-tab-pane>

            <!-- 画廊 -->
            <el-tab-pane label="画廊" name="gallery">
              <div class="gallery-panel">
                <div class="gallery-header">
                  <span>共 {{ editingCharacter.gallery?.length || 0 }} 张</span>
                  <div class="gallery-header-actions">
                    <el-dropdown trigger="click" @command="handleImportMode">
                      <el-button size="small">
                        <el-icon><FolderAdd /></el-icon> 从图库导入 <el-icon class="el-icon--right"><ArrowDown /></el-icon>
                      </el-button>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item command="copy">
                            复制到画廊（图库保留原图）
                          </el-dropdown-item>
                          <el-dropdown-item command="cut">
                            剪切到画廊（图库移除原图）
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                    <el-button size="small" type="primary" @click="uploadGalleryImage">
                      <el-icon><Upload /></el-icon> 上传图片
                    </el-button>
                  </div>
                </div>
                <input
                  ref="galleryImageInput"
                  type="file"
                  accept="image/*"
                  multiple
                  style="display: none"
                  @change="onGalleryImageSelected"
                />
                <div v-if="editingCharacter.gallery?.length > 0" class="gallery-grid">
                  <div
                    v-for="img in editingCharacter.gallery"
                    :key="img.id"
                    class="gallery-item"
                    @click="openGalleryDetail(img)"
                  >
                    <img :src="characterStore.getDisplayUrl(img, true)" :alt="img.name" loading="lazy" />
                    <div class="gallery-item-overlay">
                      <span v-if="img.favorite" class="gallery-item-fav">
                        <el-icon :size="12"><Star /></el-icon>
                      </span>
                    </div>
                  </div>
                </div>
                <div v-else class="gallery-empty">
                  <p>还没有画廊图片，可以上传或从图库导入</p>
                </div>
              </div>
            </el-tab-pane>
          </el-tabs>
        </div>
      </div>
    </div>

    <!-- ===== 新建角色弹窗 ===== -->
    <el-dialog v-model="showCreateDialog" title="新建角色" width="460px" :close-on-click-modal="false">
      <div class="create-dialog-body">
        <div class="create-field">
          <label>角色名称 *</label>
          <el-input v-model="createName" placeholder="输入角色名称" maxlength="50" show-word-limit />
        </div>
        <div class="create-field">
          <label>人物主设图 *</label>
          <div v-if="createImagePreview" class="create-image-preview">
            <img :src="createImagePreview" alt="主设图预览" />
            <el-button text type="danger" size="small" class="create-image-remove" @click="removeCreateImage">
              <el-icon><Close /></el-icon>
            </el-button>
          </div>
          <div v-else class="create-image-upload" @click="$refs.createImageInput.click()">
            <el-icon :size="24"><Upload /></el-icon>
            <span>点击上传主设图（建议纯色底色立绘）</span>
          </div>
          <input
            ref="createImageInput"
            type="file"
            accept="image/*"
            style="display: none"
            @change="onCreateImageSelected"
          />
        </div>
      </div>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!canCreate" @click="handleCreate">创建</el-button>
      </template>
    </el-dialog>

    <!-- ===== 主设图预览 ===== -->
    <el-dialog
      v-model="mainImagePreviewVisible"
      title="主设图预览"
      width="auto"
      top="3vh"
      :close-on-click-modal="true"
    >
      <div class="main-image-preview-content">
        <img v-if="editingCharacter" :src="getCharMainImageUrl(editingCharacter)" alt="主设图" />
      </div>
    </el-dialog>

    <!-- ===== 画廊图片详情弹窗 ===== -->
    <el-dialog
      v-model="galleryDetailVisible"
      :title="galleryDetailImage?.name || '图片详情'"
      width="780px"
      top="5vh"
      :close-on-click-modal="true"
    >
      <div class="gallery-detail-content" v-if="galleryDetailImage">
        <div class="gallery-detail-img">
          <img :src="characterStore.getDisplayUrl(galleryDetailImage)" :alt="galleryDetailImage.name" />
          <button class="gallery-detail-zoom" @click="galleryFullPreviewVisible = true">
            <el-icon :size="18"><ZoomIn /></el-icon>
          </button>
        </div>
        <div class="gallery-detail-meta">
          <div class="gallery-meta-section">
            <h4>图片信息</h4>
            <div class="gallery-meta-row">
              <span class="gallery-meta-label">名称</span>
              <span class="gallery-meta-value">{{ galleryDetailImage.name || '-' }}</span>
            </div>
            <div class="gallery-meta-row">
              <span class="gallery-meta-label">添加时间</span>
              <span class="gallery-meta-value">{{ formatDate(galleryDetailImage.createdAt) }}</span>
            </div>
          </div>
          <div class="gallery-detail-actions">
            <el-button
              :type="galleryDetailImage.favorite ? 'warning' : 'default'"
              @click="toggleGalleryDetailFav"
            >
              <el-icon><Star /></el-icon> {{ galleryDetailImage.favorite ? '取消收藏' : '收藏' }}
            </el-button>
            <el-button @click="exportGalleryImage">
              <el-icon><Download /></el-icon> 导出到设备
            </el-button>
            <el-button @click="exportGalleryToLibrary('copy')">
              <el-icon><FolderAdd /></el-icon> 复制到图库
            </el-button>
            <el-button @click="exportGalleryToLibrary('cut')">
              <el-icon><FolderAdd /></el-icon> 剪切到图库
            </el-button>
            <el-button type="danger" @click="deleteGalleryImage">
              <el-icon><Delete /></el-icon> 永久删除
            </el-button>
          </div>
        </div>
      </div>
    </el-dialog>

    <!-- 画廊大图预览 -->
    <el-dialog
      v-model="galleryFullPreviewVisible"
      title="图片预览"
      width="auto"
      top="3vh"
      append-to-body
      :close-on-click-modal="true"
    >
      <div class="gallery-full-preview-content">
        <img v-if="galleryDetailImage" :src="characterStore.getDisplayUrl(galleryDetailImage)" alt="" />
      </div>
    </el-dialog>

    <!-- ===== 从图库导入弹窗 ===== -->
    <el-dialog v-model="showImportDialog" title="从图库导入" width="680px" :close-on-click-modal="true">
      <div class="import-dialog-body">
        <div v-if="galleryStore.generatedImages.length > 0" class="import-grid">
          <div
            v-for="img in galleryStore.generatedImages"
            :key="img.id"
            class="import-item"
            :class="{ 'import-item--selected': importSelected.includes(img.id) }"
            @click="toggleImportSelect(img.id)"
          >
            <img :src="galleryStore.getDisplayUrl(img, true)" :alt="img.name" loading="lazy" />
            <button
              class="import-item-check"
              :class="{ 'import-item-check--active': importSelected.includes(img.id) }"
            >
              <el-icon :size="14"><CircleCheck /></el-icon>
            </button>
          </div>
        </div>
        <div v-else class="import-empty">图库中暂无图片</div>
      </div>
      <template #footer>
        <el-button @click="showImportDialog = false">取消</el-button>
        <el-button type="primary" :disabled="importSelected.length === 0" @click="handleImportFromGallery">
          {{ importMode === 'cut' ? '剪切' : '复制' }}选中的 {{ importSelected.length }} 张到画廊
        </el-button>
      </template>
    </el-dialog>
    <!-- ===== 新建故事弹窗 ===== -->
    <el-dialog v-model="showCreateStoryDialog" title="新建故事" width="600px" :close-on-click-modal="false">
      <div class="story-dialog-body">
        <div class="editor-field">
          <label>故事标题 *</label>
          <el-input v-model="createStoryTitle" placeholder="输入故事标题" maxlength="100" show-word-limit />
        </div>
        <div class="editor-field">
          <label>故事内容</label>
          <el-input
            v-model="createStoryContent"
            type="textarea"
            :rows="12"
            resize="vertical"
            placeholder="写下这个角色的经历与故事..."
          />
        </div>
      </div>
      <template #footer>
        <el-button @click="showCreateStoryDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!createStoryTitle.trim()" @click="handleCreateStory">保存</el-button>
      </template>
    </el-dialog>

    <!-- ===== 编辑故事弹窗 ===== -->
    <el-dialog v-model="showEditStoryDialog" title="编辑故事" width="600px" :close-on-click-modal="false">
      <div class="story-dialog-body">
        <div class="editor-field">
          <label>故事标题 *</label>
          <el-input v-model="editStoryTitle" placeholder="输入故事标题" maxlength="100" show-word-limit />
        </div>
        <div class="editor-field">
          <label>故事内容</label>
          <el-input
            v-model="editStoryContent"
            type="textarea"
            :rows="12"
            resize="vertical"
            placeholder="写下这个角色的经历与故事..."
          />
        </div>
      </div>
      <template #footer>
        <el-button @click="showEditStoryDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!editStoryTitle.trim()" @click="handleSaveEditStory">保存</el-button>
      </template>
    </el-dialog>

    <!-- ===== 查看故事弹窗 ===== -->
    <el-dialog v-model="showViewStoryDialog" :title="viewStoryData?.title || '故事'" width="600px" :close-on-click-modal="true">
      <div class="story-view-body">
        <div class="story-view-content">{{ viewStoryData?.content || '（暂无内容）' }}</div>
        <div class="story-view-time">最后编辑：{{ formatDate(viewStoryData?.updatedAt) }}</div>
      </div>
    </el-dialog>
  </div>
    <!-- ===== AI 模型选择弹窗 ===== -->
    <el-dialog v-model="showAiModelDialog" title="选择 AI 生成模型" width="460px" :close-on-click-modal="true">
      <div class="ai-model-dialog-body">
        <div class="editor-field">
          <label>对话站点</label>
          <el-select v-model="aiModelSiteId" placeholder="选择站点" style="width: 100%" @change="aiModelModelId = null">
            <el-option v-for="s in chatStore.chatSites" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </div>
        <div class="editor-field">
          <label>对话模型</label>
          <el-select v-model="aiModelModelId" placeholder="选择模型" style="width: 100%" :disabled="!aiModelSiteId">
            <el-option v-for="m in aiModelCurrentModels" :key="m.id" :label="m.name" :value="m.id" />
          </el-select>
        </div>
        <div v-if="aiModelSavedName" class="ai-model-current">
          当前使用：<strong>{{ aiModelSavedName }}</strong>
        </div>
      </div>
      <template #footer>
        <el-button @click="showAiModelDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!aiModelSiteId || !aiModelModelId" @click="saveAiModel">保存</el-button>
      </template>
    </el-dialog>
    <!-- ===== 导出角色卡弹窗 ===== -->
    <el-dialog v-model="showExportDialog" title="导出角色卡" width="460px" :close-on-click-modal="true">
      <div class="export-dialog-body" v-if="editingCharacter">
        <div class="export-preview-name">{{ editingCharacter.name }}</div>
        <div class="export-field">
          <label>导出格式</label>
          <el-radio-group v-model="exportFormat">
            <el-radio-button value="json">JSON</el-radio-button>
            <el-radio-button value="txt">TXT</el-radio-button>
          </el-radio-group>
        </div>
        <div class="export-field">
          <label>导出内容</label>
          <div class="export-options">
            <el-checkbox v-model="exportOptions.basicInfo">基础设定</el-checkbox>
            <el-checkbox v-model="exportOptions.appearance">外观描述</el-checkbox>
            <el-checkbox v-model="exportOptions.personality">性格特点</el-checkbox>
            <el-checkbox v-model="exportOptions.stories">经历与故事</el-checkbox>
          </div>
        </div>
        <div class="export-preview">
          <div class="export-preview-header">
            <span>预览</span>
            <el-button text size="small" @click="copyExportContent">
              <el-icon><DocumentCopy /></el-icon> 复制
            </el-button>
          </div>
          <div class="export-preview-content">{{ exportPreview }}</div>
        </div>
      </div>
      <template #footer>
        <el-button @click="showExportDialog = false">取消</el-button>
        <el-button type="primary" @click="handleExport">
          <el-icon><Download /></el-icon> 导出为 {{ exportFormat.toUpperCase() }}
        </el-button>
      </template>
    </el-dialog>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useCharacterStore } from '@/stores/character'
import { useGalleryStore } from '@/stores/gallery'
import { useChatStore } from '@/stores/chat'
import { saveImage, relPathToUrl, readImageAsBase64, exportImage, deleteImage } from '@/utils/imageStorage'
import { sendChatMessageStream } from '@/utils/chatApi'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Plus, Delete, Star, Search, User, Upload, Close, MagicStick,
  ArrowLeft, CircleCheck, Download, FolderAdd, ZoomIn, Operation, Edit, Rank, Setting, ArrowDown, DocumentCopy,
} from '@element-plus/icons-vue'

const characterStore = useCharacterStore()
const galleryStore = useGalleryStore()
const chatStore = useChatStore()

onMounted(async () => {
  await characterStore.init()
  await galleryStore.init()
})

// ========== 列表视图 ==========

const searchQuery = ref('')
const filterMode = ref('all')
const batchMode = ref(false)
const batchSelected = ref([])

const filteredCharacters = computed(() => {
  let list = characterStore.characters
  if (filterMode.value === 'fav') {
    list = list.filter(c => c.favorite)
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase()
    list = list.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.basicInfo || '').toLowerCase().includes(q) ||
      (c.appearance || '').toLowerCase().includes(q)
    )
  }
  return list
})

function getCharMainImageUrl(ch, isThumb = false) {
  if (!ch.mainImageRelPath) return ''
  const base = relPathToUrl(ch.mainImageRelPath)
  return isThumb ? `${base}?thumb=400` : base
}

function enterBatchMode() {
  batchMode.value = true
  batchSelected.value = []
}

function exitBatchMode() {
  batchMode.value = false
  batchSelected.value = []
}

function toggleBatchSelect(id) {
  const idx = batchSelected.value.indexOf(id)
  if (idx >= 0) batchSelected.value.splice(idx, 1)
  else batchSelected.value.push(id)
}

async function batchDel() {
  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${batchSelected.value.length} 个角色吗？角色的主设图和画廊图片将一并永久删除。`,
      '批量删除确认',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
    await characterStore.batchDelete(batchSelected.value)
    ElMessage.success(`已删除 ${batchSelected.value.length} 个角色`)
    exitBatchMode()
  } catch {}
}

function batchFav(value) {
  characterStore.batchToggleFavorite(batchSelected.value, value)
  ElMessage.success(value ? '已批量收藏' : '已批量取消收藏')
  exitBatchMode()
}

// ========== 新建角色 ==========

const showCreateDialog = ref(false)
const createName = ref('')
const createImagePreview = ref('')
let createImageFile = null

const canCreate = computed(() =>
  createName.value.trim().length > 0 && createImagePreview.value
)

function onCreateImageSelected(e) {
  const file = e.target.files?.[0]
  if (!file) return
  createImageFile = file
  const reader = new FileReader()
  reader.onload = (ev) => { createImagePreview.value = ev.target.result }
  reader.readAsDataURL(file)
  e.target.value = ''
}

function removeCreateImage() {
  createImagePreview.value = ''
  createImageFile = null
}

async function handleCreate() {
  if (!canCreate.value) return

  try {
    // 保存主设图
    const saved = await saveImage(createImagePreview.value, 'characters')
    const ch = characterStore.createCharacter({
      name: createName.value.trim(),
      mainImageRelPath: saved.relPath,
    })
    ElMessage.success(`角色「${ch.name}」创建成功`)
    showCreateDialog.value = false
    createName.value = ''
    createImagePreview.value = ''
    createImageFile = null
    // 直接打开编辑
    openEditor(ch)
  } catch (err) {
    ElMessage.error('创建失败: ' + err.message)
  }
}

// ========== 编辑器 ==========

const editingCharacter = ref(null)
const activeTab = ref('basic')
const editName = ref('')
const editBasicInfo = ref('')
const editAppearance = ref('')
const editPersonality = ref('')
const mainImageInput = ref(null)
const mainImagePreviewVisible = ref(false)
const editingField = ref({ basic: false, appearance: false, personality: false })

function saveField(field) {
  editingField.value[field] = false
  saveBasicFields()
  ElMessage.success('已保存')
}

function openEditor(ch) {
  // 从 store 获取最新引用
  editingCharacter.value = characterStore.getCharacter(ch.id)
  if (!editingCharacter.value) return
  editName.value = editingCharacter.value.name
  editBasicInfo.value = editingCharacter.value.basicInfo || ''
  editAppearance.value = editingCharacter.value.appearance || ''
  editPersonality.value = editingCharacter.value.personality || ''
  activeTab.value = 'basic'
  editingField.value = { basic: false, appearance: false, personality: false }
  editingStoryId.value = null
}

function closeEditor() {
  saveBasicFields()
  editingCharacter.value = null
}

function saveBasicFields() {
  if (!editingCharacter.value) return
  characterStore.updateCharacter(editingCharacter.value.id, {
    name: editName.value.trim() || editingCharacter.value.name,
    basicInfo: editBasicInfo.value,
    appearance: editAppearance.value,
    personality: editPersonality.value,
  })
}

function toggleEditFav() {
  if (!editingCharacter.value) return
  characterStore.toggleFavorite(editingCharacter.value.id)
}

async function handleDeleteCharacter() {
  if (!editingCharacter.value) return
  try {
    await ElMessageBox.confirm(
      `确定要删除角色「${editingCharacter.value.name}」吗？主设图和画廊图片将一并永久删除，不可恢复。`,
      '删除确认',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
    const name = editingCharacter.value.name
    await characterStore.deleteCharacter(editingCharacter.value.id)
    editingCharacter.value = null
    ElMessage.success(`角色「${name}」已删除`)
  } catch {}
}

// 更换主设图
function changeMainImage() {
  mainImageInput.value?.click()
}

async function onMainImageSelected(e) {
  const file = e.target.files?.[0]
  if (!file || !editingCharacter.value) return
  const reader = new FileReader()
  reader.onload = async (ev) => {
    try {
      // 删除旧主设图
      if (editingCharacter.value.mainImageRelPath) {
        await deleteImage(editingCharacter.value.mainImageRelPath).catch(() => {})
      }
      const saved = await saveImage(ev.target.result, 'characters')
      characterStore.updateCharacter(editingCharacter.value.id, {
        mainImageRelPath: saved.relPath,
      })
      ElMessage.success('主设图已更新')
    } catch (err) {
      ElMessage.error('上传失败: ' + err.message)
    }
  }
  reader.readAsDataURL(file)
  e.target.value = ''
}

function previewMainImage() {
  mainImagePreviewVisible.value = true
}

// ========== AI 模型配置 ==========

const showAiModelDialog = ref(false)
const aiModelSiteId = ref(null)
const aiModelModelId = ref(null)

// 初始化读取保存的配置
try {
  const saved = localStorage.getItem('character-ai-model')
  if (saved) {
    const parsed = JSON.parse(saved)
    aiModelSiteId.value = parsed.siteId || null
    aiModelModelId.value = parsed.modelId || null
  }
} catch {}

const aiModelCurrentModels = computed(() => {
  const site = chatStore.chatSites.find(s => s.id === aiModelSiteId.value)
  return site?.models || []
})

const aiModelSavedName = computed(() => {
  if (!aiModelSiteId.value || !aiModelModelId.value) return ''
  const site = chatStore.chatSites.find(s => s.id === aiModelSiteId.value)
  if (!site) return ''
  const model = site.models.find(m => m.id === aiModelModelId.value)
  return model ? `${site.name} / ${model.name}` : ''
})

function saveAiModel() {
  if (!aiModelSiteId.value || !aiModelModelId.value) return
  localStorage.setItem('character-ai-model', JSON.stringify({
    siteId: aiModelSiteId.value,
    modelId: aiModelModelId.value,
  }))
  showAiModelDialog.value = false
  ElMessage.success('AI 模型配置已保存')
}

function getAiChatConfig() {
  // 优先使用用户保存的配置
  if (aiModelSiteId.value && aiModelModelId.value) {
    const config = chatStore.getChatConfig(aiModelSiteId.value, aiModelModelId.value)
    if (config) return config
  }
  // 回退：使用第一个站点第一个模型
  const firstSite = chatStore.chatSites[0]
  if (!firstSite || !firstSite.models?.length) return null
  return chatStore.getChatConfig(firstSite.id, firstSite.models[0].id)
}

// ========== AI 一键生成 ==========

const aiGenerating = ref('')

async function aiGenerate(field) {
  if (!editingCharacter.value) return
  if (!editingCharacter.value.mainImageRelPath) {
    ElMessage.warning('请先上传主设图')
    return
  }

  const chatConfig = getAiChatConfig()
  if (!chatConfig) {
    ElMessage.warning('请先在「设置 → 对话助手配置」中添加对话站点和模型，或点击 AI 生成旁的设置按钮选择模型')
    return
  }

  const promptMap = {
    basic: `请根据这张角色立绘图，为这个角色生成基础设定信息，包括但不限于：预估年龄、预估身高、种族（如人类/精灵/兽人等）、可能的职业或身份。请用简洁的条目式中文输出，只输出设定内容，不要输出其他解释。角色名：${editName.value}`,
    appearance: `请根据这张角色立绘图，详细描述这个角色的外观特征，包括但不限于：发色、发型、瞳色、肤色、体型、服装、配饰、标志性特征等。请用详细的中文描述输出，适合用作后续AI绘图的角色描述参考。只输出描述内容。角色名：${editName.value}`,
    personality: `请根据这张角色立绘图的外观气质，推测并生成这个角色可能的性格特点，包括但不限于：性格类型、行为习惯、说话方式、价值观等。请用中文输出，只输出性格描述内容。角色名：${editName.value}`,
  }

  aiGenerating.value = field

  // 检查是否有已有内容，需要二次确认
  const existingContent = field === 'basic' ? editBasicInfo.value : field === 'appearance' ? editAppearance.value : editPersonality.value
  if (existingContent && existingContent.trim()) {
    try {
      await ElMessageBox.confirm(
        '当前已有内容，AI 生成将覆盖现有内容，是否继续？',
        '覆盖确认',
        { confirmButtonText: '继续生成', cancelButtonText: '取消', type: 'warning' }
      )
    } catch {
      aiGenerating.value = ''
      return
    }
  }

  try {
    const mainImageDataUrl = await readImageAsBase64(editingCharacter.value.mainImageRelPath)

    const messages = [
      { role: 'system', content: '你是一个专业的角色设定师，擅长根据角色立绘分析和撰写角色设定。' },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: mainImageDataUrl, detail: 'high' } },
          { type: 'text', text: promptMap[field] },
        ],
      },
    ]

    const result = await sendChatMessageStream(
      { baseUrl: chatConfig.baseUrl, apiKey: chatConfig.apiKey, model: chatConfig.model, messages },
      () => {},
      () => {}
    )

    if (result && result.trim()) {
      if (field === 'basic') editBasicInfo.value = result.trim()
      else if (field === 'appearance') editAppearance.value = result.trim()
      else if (field === 'personality') editPersonality.value = result.trim()
      editingField.value[field] = false
      saveBasicFields()
      ElMessage.success('AI 生成完成')
    } else {
      ElMessage.warning('AI 未返回有效内容')
    }
  } catch (err) {
    ElMessage.error('AI 生成失败: ' + err.message)
  } finally {
    aiGenerating.value = ''
  }
}

// ========== 经历与故事 ==========

const showCreateStoryDialog = ref(false)
const createStoryTitle = ref('')
const createStoryContent = ref('')

const showEditStoryDialog = ref(false)
const editingStoryId = ref(null)
const editStoryTitle = ref('')
const editStoryContent = ref('')

const showViewStoryDialog = ref(false)
const viewStoryData = ref(null)

// 拖拽排序
const storyDragIndex = ref(null)
const storyDragOverIndex = ref(null)

function openCreateStoryDialog() {
  createStoryTitle.value = ''
  createStoryContent.value = ''
  showCreateStoryDialog.value = true
}

function handleCreateStory() {
  if (!editingCharacter.value || !createStoryTitle.value.trim()) return
  characterStore.addStory(editingCharacter.value.id, createStoryTitle.value.trim(), createStoryContent.value)
  showCreateStoryDialog.value = false
  ElMessage.success('故事已保存')
}

function openEditStoryDialog(story) {
  editingStoryId.value = story.id
  editStoryTitle.value = story.title
  editStoryContent.value = story.content
  showEditStoryDialog.value = true
}

function handleSaveEditStory() {
  if (!editingCharacter.value || !editingStoryId.value || !editStoryTitle.value.trim()) return
  characterStore.updateStory(editingCharacter.value.id, editingStoryId.value, {
    title: editStoryTitle.value.trim(),
    content: editStoryContent.value,
  })
  showEditStoryDialog.value = false
  editingStoryId.value = null
  ElMessage.success('故事已保存')
}

function openStoryView(story) {
  viewStoryData.value = story
  showViewStoryDialog.value = true
}

async function handleDeleteStory(story) {
  try {
    await ElMessageBox.confirm(`确定要删除「${story.title}」吗？`, '删除确认', {
      confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning',
    })
    characterStore.deleteStory(editingCharacter.value.id, story.id)
    ElMessage.success('已删除')
  } catch {}
}

function onStoryDragStart(index) {
  storyDragIndex.value = index
}

function onStoryDragEnd() {
  if (
    storyDragIndex.value === null ||
    storyDragOverIndex.value === null ||
    storyDragIndex.value === storyDragOverIndex.value ||
    !editingCharacter.value
  ) {
    storyDragIndex.value = null
    storyDragOverIndex.value = null
    return
  }
  const list = editingCharacter.value.stories
  const item = list.splice(storyDragIndex.value, 1)[0]
  list.splice(storyDragOverIndex.value, 0, item)
  characterStore.saveCharacters()
  storyDragIndex.value = null
  storyDragOverIndex.value = null
}

// ========== 画廊 ==========

const galleryImageInput = ref(null)
const galleryDetailVisible = ref(false)
const galleryDetailImage = ref(null)
const galleryFullPreviewVisible = ref(false)
const showImportDialog = ref(false)
const importSelected = ref([])

function uploadGalleryImage() {
  galleryImageInput.value?.click()
}

async function onGalleryImageSelected(e) {
  const files = Array.from(e.target.files || [])
  if (!editingCharacter.value) return
  for (const file of files) {
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        await characterStore.addGalleryImage(editingCharacter.value.id, ev.target.result, file.name.replace(/\.[^.]+$/, ''))
      } catch (err) {
        ElMessage.error('上传失败: ' + err.message)
      }
    }
    reader.readAsDataURL(file)
  }
  e.target.value = ''
  ElMessage.success(`正在上传 ${files.length} 张图片...`)
}

function openGalleryDetail(img) {
  galleryDetailImage.value = img
  galleryDetailVisible.value = true
}

function toggleGalleryDetailFav() {
  if (!editingCharacter.value || !galleryDetailImage.value) return
  characterStore.toggleGalleryFavorite(editingCharacter.value.id, galleryDetailImage.value.id)
}

async function exportGalleryImage() {
  if (!galleryDetailImage.value?.relPath) return
  try {
    const result = await exportImage(galleryDetailImage.value.relPath, galleryDetailImage.value.name || 'character-image')
    if (result.canceled) return
    if (result.success) ElMessage.success('已导出')
    else ElMessage.error(result.error || '导出失败')
  } catch (err) {
    ElMessage.error('导出失败: ' + err.message)
  }
}

async function deleteGalleryImage() {
  if (!editingCharacter.value || !galleryDetailImage.value) return
  try {
    await ElMessageBox.confirm('确定要永久删除这张图片吗？', '删除确认', {
      confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning',
    })
    await characterStore.deleteGalleryImage(editingCharacter.value.id, galleryDetailImage.value.id)
    galleryDetailVisible.value = false
    galleryDetailImage.value = null
    ElMessage.success('已删除')
  } catch {}
}

// 从图库导入
const importMode = ref('copy') // 'copy' | 'cut'

function handleImportMode(mode) {
  importMode.value = mode
  importSelected.value = []
  showImportDialog.value = true
}

function importFromGallery() {
  importMode.value = 'copy'
  importSelected.value = []
  showImportDialog.value = true
}

function toggleImportSelect(id) {
  const idx = importSelected.value.indexOf(id)
  if (idx >= 0) importSelected.value.splice(idx, 1)
  else importSelected.value.push(id)
}

async function handleImportFromGallery() {
  if (!editingCharacter.value || importSelected.value.length === 0) return
  const isCut = importMode.value === 'cut'
  let successCount = 0

  for (const imgId of importSelected.value) {
    const img = galleryStore.generatedImages.find(i => i.id === imgId)
    if (!img || !img.relPath) continue

    try {
      if (isCut) {
        // 剪切：画廊直接引用原 relPath，图库移除记录（不删文件）
        await characterStore.addGalleryImageFromRelPath(
          editingCharacter.value.id, img.relPath, img.name || '图库导入'
        )
        // 从图库移除记录（不删物理文件，因为画廊在用）
        galleryStore.generatedImages = galleryStore.generatedImages.filter(i => i.id !== imgId)
        galleryStore.saveGenerated()
        successCount++
      } else {
        // 复制：读取原图再保存副本到角色卡目录
        const dataUrl = await readImageAsBase64(img.relPath)
        await characterStore.addGalleryImage(
          editingCharacter.value.id, dataUrl, img.name || '图库导入'
        )
        successCount++
      }
    } catch {}
  }

  showImportDialog.value = false
  importSelected.value = []
  if (successCount > 0) {
    ElMessage.success(`已${isCut ? '剪切' : '复制'} ${successCount} 张图片到画廊`)
  } else {
    ElMessage.warning('导入失败，未找到有效图片')
  }
}

// 导出到图库
async function exportGalleryToLibrary(mode = 'copy') {
  if (!galleryDetailImage.value?.relPath || !editingCharacter.value) return
  const isCut = mode === 'cut'

  try {
    if (isCut) {
      // 剪切：图库直接引用画廊的 relPath，画廊移除记录（不删文件）
      const record = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        name: galleryDetailImage.value.name || '角色卡导入',
        relPath: galleryDetailImage.value.relPath,
        prompt: '',
        model: '',
        siteName: '',
        size: '',
        apiType: '',
        hasReference: false,
        createdAt: new Date().toISOString(),
        favorite: false,
        album: '',
        isFromCharacter: true,
      }
      galleryStore.generatedImages.unshift(record)
      galleryStore.saveGenerated()

      // 从画廊移除记录（不删物理文件，因为图库在用）
      const ch = editingCharacter.value
      ch.gallery = ch.gallery.filter(i => i.id !== galleryDetailImage.value.id)
      ch.updatedAt = new Date().toISOString()
      characterStore.saveCharacters()

      galleryDetailVisible.value = false
      galleryDetailImage.value = null
      ElMessage.success('已剪切到图库')
    } else {
      // 复制：读取画廊图片再保存副本到图库目录
      const dataUrl = await readImageAsBase64(galleryDetailImage.value.relPath)
      const record = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        name: galleryDetailImage.value.name || '角色卡导入',
        dataUrl,
        prompt: '',
        model: '',
        siteName: '',
        size: '',
        apiType: '',
        hasReference: false,
        createdAt: new Date().toISOString(),
        favorite: false,
        album: '',
        isFromCharacter: true,
      }
      await galleryStore.addGeneratedImage(record)
      ElMessage.success('已复制到图库')
    }
  } catch (err) {
    ElMessage.error('导出失败: ' + err.message)
  }
}

// ========== 导出角色卡 ==========

const showExportDialog = ref(false)
const exportFormat = ref('json')
const exportOptions = ref({
  basicInfo: true,
  appearance: true,
  personality: true,
  stories: true,
})

const exportPreview = computed(() => {
  if (!editingCharacter.value) return ''
  return exportFormat.value === 'json'
    ? buildExportJSON()
    : buildExportTXT()
})

function buildExportData() {
  const ch = editingCharacter.value
  if (!ch) return {}
  const data = { name: ch.name }
  if (exportOptions.value.basicInfo && ch.basicInfo?.trim()) data.basicInfo = ch.basicInfo.trim()
  if (exportOptions.value.appearance && ch.appearance?.trim()) data.appearance = ch.appearance.trim()
  if (exportOptions.value.personality && ch.personality?.trim()) data.personality = ch.personality.trim()
  if (exportOptions.value.stories && ch.stories?.length > 0) {
    data.stories = ch.stories.map(s => ({
      title: s.title,
      content: s.content,
    }))
  }
  data.exportedAt = new Date().toISOString()
  data.exportedFrom = 'MioDraw'
  return data
}

function buildExportJSON() {
  return JSON.stringify(buildExportData(), null, 2)
}

function buildExportTXT() {
  const ch = editingCharacter.value
  if (!ch) return ''
  const lines = []
  lines.push(`========================================`)
  lines.push(`角色名：${ch.name}`)
  lines.push(`========================================`)

  if (exportOptions.value.basicInfo && ch.basicInfo?.trim()) {
    lines.push('')
    lines.push(`【基础设定】`)
    lines.push(ch.basicInfo.trim())
  }
  if (exportOptions.value.appearance && ch.appearance?.trim()) {
    lines.push('')
    lines.push(`【外观描述】`)
    lines.push(ch.appearance.trim())
  }
  if (exportOptions.value.personality && ch.personality?.trim()) {
    lines.push('')
    lines.push(`【性格特点】`)
    lines.push(ch.personality.trim())
  }
  if (exportOptions.value.stories && ch.stories?.length > 0) {
    lines.push('')
    lines.push(`【经历与故事】`)
    for (const s of ch.stories) {
      lines.push('')
      lines.push(`--- ${s.title} ---`)
      lines.push(s.content || '（无内容）')
    }
  }
  lines.push('')
  lines.push(`----------------------------------------`)
  lines.push(`导出时间：${new Date().toLocaleString('zh-CN')}`)
  lines.push(`导出自：MioDraw`)
  return lines.join('\n')
}

function copyExportContent() {
  const content = exportFormat.value === 'json' ? buildExportJSON() : buildExportTXT()
  navigator.clipboard.writeText(content).then(() => {
    ElMessage.success('已复制到剪贴板')
  }).catch(() => {
    ElMessage.error('复制失败')
  })
}

async function handleExport() {
  if (!editingCharacter.value) return
  const content = exportFormat.value === 'json' ? buildExportJSON() : buildExportTXT()
  const ext = exportFormat.value
  const fileName = `${editingCharacter.value.name}_角色卡.${ext}`

  // 使用 Blob + 下载链接
  const blob = new Blob([content], { type: ext === 'json' ? 'application/json' : 'text/plain' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)

  showExportDialog.value = false
  ElMessage.success(`已导出为 ${fileName}`)
}
// ========== 工具函数 ==========

function formatDate(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN')
}
</script>

<style scoped>
.character-page {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* ===== 列表视图 ===== */
.char-list-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.char-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.char-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.char-header-left h2 {
  font-size: 22px;
  margin: 0;
}

.char-count {
  font-size: 12px;
  color: var(--text-muted);
  padding: 2px 8px;
  background: var(--bg-secondary);
  border-radius: 999px;
}

.char-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.char-filter-bar {
  margin-bottom: 14px;
  flex-shrink: 0;
}

/* 角色卡网格 */
.char-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 14px;
  flex: 1;
  overflow-y: auto;
  align-content: flex-start;
}

.char-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
}

.char-card:hover {
  border-color: var(--accent-color);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.char-card--selected {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 2px var(--accent-light);
}

.char-card-img {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 4;
  background: var(--bg-secondary);
  overflow: hidden;
}

.char-card-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.char-card-img-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.char-card-fav {
  position: absolute;
  top: 6px;
  left: 6px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(245, 158, 11, 0.9);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
}

.char-card-check {
  position: absolute;
  top: 6px;
  right: 6px;
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
}

.char-card-check--active {
  border-color: var(--accent-color);
  background: var(--accent-color);
  color: white;
}

.char-card-info {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.char-card-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.char-card-meta {
  font-size: 11px;
  color: var(--text-muted);
}

.char-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 20px;
  color: var(--text-muted);
  font-size: 14px;
}

/* ===== 编辑器视图 ===== */
.char-editor-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.editor-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.editor-topbar-right {
  display: flex;
  gap: 8px;
}

.editor-body {
  display: flex;
  gap: 20px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* 左侧 */
.editor-left {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.editor-main-image {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 4;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
}

.editor-main-image img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  cursor: pointer;
  background: #111;
}

.editor-main-image-empty {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.editor-main-image-empty:hover {
  color: var(--accent-color);
}

.editor-main-image-actions {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
}

/* 右侧 */
.editor-right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.editor-right :deep(.el-tabs) {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.editor-right :deep(.el-tabs__content) {
  flex: 1;
  overflow-y: auto;
}

.editor-right :deep(.el-tab-pane) {
  height: 100%;
}

.editor-field {
  margin-bottom: 14px;
}

.editor-field:last-child {
  margin-bottom: 0;
}

.editor-field label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.editor-field-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.editor-field-header label {
  margin-bottom: 0;
}

/* ===== 故事面板 ===== */
.stories-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}

.stories-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-muted);
}

.stories-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  overflow-y: auto;
}

.story-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
}

.story-item:hover {
  border-color: var(--accent-color);
  background: var(--bg-hover);
}

.story-item--dragging {
  opacity: 0.4;
  border-style: dashed;
}

.story-item--over {
  border-color: var(--accent-color);
  background: var(--accent-light);
  box-shadow: 0 0 0 2px var(--accent-light);
}

.story-drag-handle {
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

.story-drag-handle:active {
  cursor: grabbing;
}

.story-item:hover .story-drag-handle {
  opacity: 1;
}

.story-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.story-item-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.story-item-time {
  font-size: 11px;
  color: var(--text-muted);
}

.story-item-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.stories-empty {
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
  padding: 30px;
}

/* 故事弹窗 */
.story-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.story-view-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.story-view-content {
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 16px;
  max-height: 50vh;
  overflow-y: auto;
}

.story-view-time {
  font-size: 12px;
  color: var(--text-muted);
  text-align: right;
}

/* ===== 画廊面板 ===== */
.gallery-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}

.gallery-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-muted);
}

.gallery-header-actions {
  display: flex;
  gap: 6px;
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 8px;
  flex: 1;
  overflow-y: auto;
  align-content: flex-start;
}

.gallery-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.2s;
}

.gallery-item:hover {
  border-color: var(--accent-color);
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

.gallery-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.gallery-item-overlay {
  position: absolute;
  top: 4px;
  right: 4px;
}

.gallery-item-fav {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(245, 158, 11, 0.9);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
}

.gallery-empty {
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
  padding: 30px;
}

/* ===== 画廊详情弹窗 ===== */
.gallery-detail-content {
  display: flex;
  gap: 20px;
}

.gallery-detail-img {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.gallery-detail-img img {
  max-width: 100%;
  max-height: 70vh;
  border-radius: var(--radius-sm);
  display: block;
}

.gallery-detail-zoom {
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

.gallery-detail-zoom:hover {
  background: rgba(0, 0, 0, 0.8);
  color: #fff;
  transform: scale(1.1);
}

.gallery-detail-meta {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.gallery-meta-section h4 {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.gallery-meta-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 13px;
}

.gallery-meta-label { color: var(--text-muted); }
.gallery-meta-value { color: var(--text-primary); font-weight: 500; }

.gallery-detail-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: auto;
}

.gallery-detail-actions .el-button {
  width: 100%;
  margin: 0;
}

/* 大图预览 */
.main-image-preview-content,
.gallery-full-preview-content {
  display: flex;
  align-items: center;
  justify-content: center;
}

.main-image-preview-content img,
.gallery-full-preview-content img {
  max-width: 90vw;
  max-height: 80vh;
  border-radius: var(--radius-sm);
  object-fit: contain;
}

/* ===== 新建角色弹窗 ===== */
.create-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.create-field label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.create-image-preview {
  position: relative;
  width: 200px;
  height: 260px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--border-color);
}

.create-image-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #111;
}

.create-image-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
}

.create-image-upload {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 200px;
  height: 260px;
  border: 2px dashed var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.create-image-upload:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

/* ===== 从图库导入弹窗 ===== */
.import-dialog-body {
  max-height: 50vh;
  overflow-y: auto;
}

.import-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 8px;
}

.import-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 2px solid var(--border-color);
  cursor: pointer;
  transition: all 0.2s;
}

.import-item:hover {
  border-color: var(--accent-color);
}

.import-item--selected {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 2px var(--accent-light);
}

.import-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.import-item-check {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.7);
  background: rgba(0, 0, 0, 0.4);
  color: rgba(255, 255, 255, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.import-item-check--active {
  border-color: var(--accent-color);
  background: var(--accent-color);
  color: white;
}

.import-empty {
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
  padding: 30px;
}

/* 批量按钮选中态强制颜色 */
.batch-btn-fav:not(:disabled) {
  background: #f59e0b !important;
  border-color: #f59e0b !important;
  color: #fff !important;
}

.batch-btn-fav:not(:disabled):hover {
  background: #d97706 !important;
  border-color: #d97706 !important;
}

.batch-btn-del:not(:disabled) {
  background: #ef4444 !important;
  border-color: #ef4444 !important;
  color: #fff !important;
}

.batch-btn-del:not(:disabled):hover {
  background: #dc2626 !important;
  border-color: #dc2626 !important;
}

/* AI 生成按钮组 */
.ai-gen-btn-group {
  display: flex;
  gap: 4px;
}

.ai-gen-setting-btn {
  width: 32px;
  min-width: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* AI 模型选择弹窗 */
.ai-model-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ai-model-current {
  font-size: 12px;
  color: var(--text-muted);
  padding: 8px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
}

.ai-model-current strong {
  color: var(--accent-color);
}

/* ===== 信息卡片（基础设定/外观/性格） ===== */
.info-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.info-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-card);
}

.info-card-header label {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.info-card-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.info-card-edit {
  padding: 14px 16px;
}

.info-card-display {
  padding: 16px;
  min-height: 120px;
}

.info-card-text {
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.info-card-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100px;
  color: var(--text-muted);
  font-size: 13px;
}

/* ===== 导出弹窗 ===== */
.export-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.export-preview-name {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  text-align: center;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-color);
}

.export-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.export-field label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.export-options {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.export-preview {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.export-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-card);
  font-size: 12px;
  color: var(--text-muted);
}

.export-preview-content {
  padding: 12px;
  font-size: 12px;
  font-family: 'Consolas', 'Monaco', monospace;
  color: var(--text-secondary);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
}

/* 左侧底部导出按钮 */
.editor-left-bottom {
  margin-top: auto;
  padding-top: 14px;
}
</style>