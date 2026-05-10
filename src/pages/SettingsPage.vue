<template>
  <div class="settings-page">
    <div class="page-header">
      <h2>⚙️ 设置</h2>
      <p class="subtitle">管理 API 站点、外观和日志</p>
    </div>

    <!-- 使用说明卡片 -->
    <div class="doc-card" @click="openDoc">
      <div class="doc-icon">
        <el-icon :size="28"><Reading /></el-icon>
      </div>
      <div class="doc-content">
        <div class="doc-title">使用说明</div>
        <div class="doc-desc">点击查看完整的使用文档、配置教程与常见问题解答</div>
      </div>
      <div class="doc-arrow">
        <el-icon :size="20"><Right /></el-icon>
      </div>
    </div>

    <!-- ===== API 站点 ===== -->
    <div class="section">
      <div class="section-header">
        <h3>绘图 API 站点</h3>
        <el-button type="primary" @click="openSiteDialog()">
          <el-icon><Plus /></el-icon> 添加站点
        </el-button>
      </div>

      <div v-if="apiStore.sites.length === 0" class="empty-state">
        <el-icon :size="48" color="var(--text-muted)"><Connection /></el-icon>
        <p>还没有配置任何站点</p>
      </div>

      <el-collapse v-else v-model="expandedSites">
        <el-collapse-item
          v-for="site in apiStore.sites"
          :key="site.id"
          :name="site.id"
        >
          <template #title>
            <div class="site-title">
              <span class="site-name">{{ site.name }}</span>
              <span class="site-url">{{ site.baseUrl }}</span>
              <div class="site-title-actions" @click.stop>
                <el-button text size="small" @click="openSiteDialog(site)">
                  <el-icon><Edit /></el-icon>
                </el-button>
                <el-button text size="small" type="danger" @click="handleDeleteSite(site)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>
            </div>
          </template>

          <!-- Keys 区域 -->
          <div class="sub-section">
            <div class="sub-header">
              <h4>▶ API Keys ({{ site.keys.length }})</h4>
              <el-button size="small" @click="openKeyDialog(site)">
                <el-icon><Plus /></el-icon> 添加 Key
              </el-button>
            </div>
            <div v-if="site.keys.length === 0" class="sub-empty">还没有添加 Key</div>
            <div v-else class="item-list">
              <div v-for="key in site.keys" :key="key.id" class="list-item">
                <div class="item-info">
                  <span class="item-name">{{ key.name || '(未命名)' }}</span>
                  <span class="item-detail">{{ maskKey(key.apiKey) }}</span>
                </div>
                <div class="item-actions">
                  <el-button text size="small" @click="openKeyDialog(site, key)">
                    <el-icon><Edit /></el-icon>
                  </el-button>
                  <el-button text size="small" type="danger" @click="handleDeleteKey(site, key)">
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <!-- 模型区域 -->
          <div class="sub-section">
            <div class="sub-header">
              <h4>▶ 模型 ({{ site.models.length }})</h4>
              <el-button size="small" @click="openModelDialog(site)" :disabled="site.keys.length === 0">
                <el-icon><Plus /></el-icon> 添加模型
              </el-button>
            </div>
            <div v-if="site.keys.length === 0" class="sub-empty">请先添加 Key</div>
            <div v-else-if="site.models.length === 0" class="sub-empty">还没有添加模型</div>
            <div v-else class="item-list">
              <div v-for="model in site.models" :key="model.id" class="list-item">
                <div class="item-info">
                  <span class="item-name">{{ model.name }}</span>
                  <div class="item-meta">
                    <el-tag size="small">{{ getKeyName(site, model.keyId) }}</el-tag>
                    <el-tag size="small" type="info">{{ apiStore.getApiTypeLabel(model.apiType) }}</el-tag>
                  </div>
                </div>
                <div class="item-actions">
                  <el-button text size="small" @click="openModelDialog(site, model)">
                    <el-icon><Edit /></el-icon>
                  </el-button>
                  <el-button text size="small" type="danger" @click="handleDeleteModel(site, model)">
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </div>
              </div>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>

    <!-- ===== 对话助手配置 ===== -->
    <div class="section" style="margin-top: 20px">
      <div class="section-header">
        <h3>优化助手与全栈AI工作流(语言模型)配置</h3>
        <el-button type="primary" size="small" @click="openChatSiteDialog()">
          <el-icon><Plus /></el-icon> 添加对话站点
        </el-button>
      </div>
      <div class="size-warning">
        此处的配置专用于「优化助手」面板以及「全栈AI工作流」面板（作为语言模型），与上方的绘图站点独立，默认请求 /chat/completions 接口。
      </div>

      <div v-if="chatStore.chatSites.length === 0" class="empty-state">
        <el-icon :size="48" color="var(--text-muted)"><Connection /></el-icon>
        <p>还没有配置对话站点</p>
      </div>

      <el-collapse v-else v-model="expandedChatSites">
        <el-collapse-item v-for="site in chatStore.chatSites" :key="site.id" :name="site.id">
          <template #title>
            <div class="site-title">
              <span class="site-name">{{ site.name }}</span>
              <span class="site-url">{{ site.baseUrl }}</span>
              <div class="site-title-actions" @click.stop>
                <el-button text size="small" @click="openChatSiteDialog(site)">
                  <el-icon><Edit /></el-icon>
                </el-button>
                <el-button text size="small" type="danger" @click="handleDeleteChatSite(site)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>
            </div>
          </template>

          <!-- Keys 区域 -->
          <div class="sub-section">
            <div class="sub-header">
              <h4>&#9654; API Keys ({{ site.keys.length }})</h4>
              <el-button size="small" @click="openChatKeyDialog(site)">
                <el-icon><Plus /></el-icon> 添加 Key
              </el-button>
            </div>
            <div v-if="site.keys.length === 0" class="sub-empty">还没有添加 Key</div>
            <div v-else class="item-list">
              <div v-for="key in site.keys" :key="key.id" class="list-item">
                <div class="item-info">
                  <span class="item-name">{{ key.name || '(未命名)' }}</span>
                  <span class="item-detail">{{ maskKey(key.apiKey) }}</span>
                </div>
                <div class="item-actions">
                  <el-button text size="small" @click="openChatKeyDialog(site, key)">
                    <el-icon><Edit /></el-icon>
                  </el-button>
                  <el-button text size="small" type="danger" @click="handleDeleteChatKey(site, key)">
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <!-- 模型区域 -->
          <div class="sub-section">
            <div class="sub-header">
              <h4>&#9654; 对话模型 ({{ site.models.length }})</h4>
              <el-button size="small" @click="openChatModelDialog(site)" :disabled="site.keys.length === 0">
                <el-icon><Plus /></el-icon> 添加模型
              </el-button>
            </div>
            <div v-if="site.keys.length === 0" class="sub-empty">请先添加 Key</div>
            <div v-else-if="site.models.length === 0" class="sub-empty">还没有添加模型</div>
            <div v-else class="item-list">
              <div v-for="model in site.models" :key="model.id" class="list-item">
                <div class="item-info">
                  <span class="item-name">{{ model.name }}</span>
                  <div class="item-meta">
                    <el-tag size="small">{{ chatStore.getChatKeyName(site, model.keyId) }}</el-tag>
                  </div>
                </div>
                <div class="item-actions">
                  <el-button
                    text
                    size="small"
                    type="success"
                    :loading="testingChatModelId === model.id"
                    @click="handleTestChatModel(site, model)"
                  >
                    <template v-if="testingChatModelId !== model.id"><el-icon><Connection /></el-icon> 测试</template>
                  </el-button>
                  <el-button text size="small" @click="openChatModelDialog(site, model)">
                    <el-icon><Edit /></el-icon>
                  </el-button>
                  <el-button text size="small" type="danger" @click="handleDeleteChatModel(site, model)">
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </div>
              </div>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>

    <!-- ===== 自定义接口类型 ===== -->
    <div class="section" style="margin-top: 20px">
      <div class="section-header">
        <h3>自定义绘图API接口类型</h3>
        <el-button size="small" @click="openTypeDialog()">
          <el-icon><Plus /></el-icon> 添加类型
        </el-button>
      </div>
      <div class="size-warning">
        • 基于三种基础接口（图片/Chat/Responses）之一，可自定义名称和 endpoint 路径
      </div>
      <div v-if="apiStore.customApiTypes.length === 0" class="sub-empty">暂无自定义类型</div>
      <div v-else class="item-list">
        <div v-for="type in apiStore.customApiTypes" :key="type.id" class="list-item">
          <div class="item-info">
            <span class="item-name">{{ type.name }}</span>
            <div class="item-meta">
              <el-tag size="small">基础: {{ baseTypeLabel(type.baseType) }}</el-tag>
              <el-tag size="small" type="info" v-if="type.endpoint">路径: {{ type.endpoint }}</el-tag>
            </div>
          </div>
          <div class="item-actions">
            <el-button text size="small" @click="openTypeDialog(type)">
              <el-icon><Edit /></el-icon>
            </el-button>
            <el-button text size="small" type="danger" @click="handleDeleteType(type)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 自定义尺寸 -->
    <div class="section" style="margin-top: 20px">
      <div class="section-header">
        <h3>自定义绘图尺寸</h3>
        <el-button size="small" @click="showSizeDialog = true">
          <el-icon><Plus /></el-icon> 添加尺寸
        </el-button>
      </div>
      <div class="size-warning">
        ⚠️ 不同绘图模型支持的尺寸不同，通常只支持特定的几个尺寸，手动设置可能导致无法正常生成，请您知悉
      </div>
      <div v-if="themeStore.customSizes.length === 0" class="sub-empty">暂无自定义尺寸</div>
      <div v-else class="size-list">
        <div v-for="size in themeStore.customSizes" :key="size" class="size-item">
          <span>{{ size }}</span>
          <el-button text size="small" type="danger" @click="removeSize(size)">
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
      </div>
    </div>

    <!-- 显示设置 -->
    <div class="section" style="margin-top: 20px">
      <div class="section-header"><h3>显示设置</h3></div>
      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">生成页布局</span>
          <span class="setting-desc">横向：上半部分参数和预览，下半部分历史；竖向：左半部分集中操作，右半部分历史</span>
        </div>
        <el-radio-group
          :model-value="themeStore.layoutMode"
          @update:model-value="themeStore.setLayoutMode"
        >
          <el-radio-button value="horizontal">横向</el-radio-button>
          <el-radio-button value="vertical">竖向</el-radio-button>
        </el-radio-group>
      </div>
      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">生成页图片显示</span>
          <span class="setting-desc">控制生成页下方面板的图片排列方式</span>
        </div>
        <el-radio-group :model-value="themeStore.imageDisplayMode" @update:model-value="themeStore.setImageDisplayMode">
          <el-radio-button value="square">等比方格</el-radio-button>
          <el-radio-button value="masonry">瀑布流</el-radio-button>
        </el-radio-group>
      </div>
      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">图库页图片显示</span>
          <span class="setting-desc">控制图库页面的图片排列方式</span>
        </div>
        <el-radio-group :model-value="themeStore.galleryDisplayMode" @update:model-value="themeStore.setGalleryDisplayMode">
          <el-radio-button value="square">等比方格</el-radio-button>
          <el-radio-button value="masonry">瀑布流</el-radio-button>
        </el-radio-group>
      </div>
      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">工作流页面图片显示</span>
          <span class="setting-desc">控制全栈AI工作流页面中参考图和最终图片的排列方式</span>
        </div>
        <el-radio-group :model-value="themeStore.workflowDisplayMode" @update:model-value="themeStore.setWorkflowDisplayMode">
          <el-radio-button value="square">等比方格</el-radio-button>
          <el-radio-button value="masonry">瀑布流</el-radio-button>
        </el-radio-group>
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">累计任务模式</span>
          <span class="setting-desc">开启后可连续提交多批次生成任务，各批次独立运行和中止，同时执行上限 10 个任务</span>
        </div>
        <el-switch
          :model-value="themeStore.multiBatchMode"
          @update:model-value="themeStore.setMultiBatchMode"
        />
      </div>
    </div>

    <!-- 工作流提示音 -->
    <div class="section" style="margin-top: 20px">
      <div class="section-header"><h3>提示音</h3></div>
      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">启用提示音</span>
          <span class="setting-desc">开启后，生图完成和工作流需要用户操作时会播放提示音</span>
        </div>
        <el-switch
          :model-value="themeStore.workflowSoundEnabled"
          @update:model-value="themeStore.setWorkflowSoundEnabled"
        />
      </div>
      <div v-if="themeStore.workflowSoundEnabled" class="setting-item">
        <div class="setting-info">
          <span class="setting-label">自定义提示音</span>
          <span class="setting-desc">{{ themeStore.workflowCustomSound ? '已设置自定义提示音' : '未设置，使用默认提示音' }}</span>
        </div>
        <div class="bg-actions">
          <el-button size="small" @click="testSound">
            试听
          </el-button>
          <el-button size="small" @click="selectSoundFile">
            <el-icon><Upload /></el-icon> 选择音频
          </el-button>
          <el-button v-if="themeStore.workflowCustomSound" size="small" type="danger" plain @click="themeStore.setWorkflowCustomSound('')">
            清除
          </el-button>
        </div>
      </div>
      <div v-if="themeStore.workflowSoundEnabled" class="setting-item">
        <div class="setting-info">
          <span class="setting-label">提示音音量</span>
          <span class="setting-desc">{{ Math.round(themeStore.notificationVolume * 100) }}%</span>
        </div>
        <el-slider
          :model-value="themeStore.notificationVolume"
          @update:model-value="themeStore.setNotificationVolume"
          :min="0.05" :max="1" :step="0.05" style="width: 200px"
        />
      </div>
      <input ref="soundInputRef" type="file" accept="audio/*" style="display: none" @change="onSoundFileSelected" />
    </div>

    <!-- 外观设置 -->
    <div class="section" style="margin-top: 20px">
      <div class="section-header"><h3>外观设置</h3></div>
      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">自定义背景图</span>
          <span class="setting-desc">设置应用的背景图片</span>
        </div>
        <div class="bg-actions">
          <el-button size="small" @click="selectBgImage">
            <el-icon><Upload /></el-icon> 选择图片
          </el-button>
          <el-button v-if="themeStore.bgImage" size="small" type="danger" plain @click="removeBgImage">
            清除
          </el-button>
        </div>
      </div>
      <div v-if="themeStore.bgImage" class="setting-item">
        <div class="setting-info">
          <span class="setting-label">背景不透明度</span>
          <span class="setting-desc">{{ Math.round(themeStore.bgOpacity * 100) }}%</span>
        </div>
        <el-slider
          :model-value="themeStore.bgOpacity"
          @update:model-value="themeStore.setBgOpacity"
          :min="0.05" :max="0.8" :step="0.05" style="width: 200px"
        />
      </div>
      <input ref="bgInputRef" type="file" accept="image/*" style="display: none" @change="onBgFileSelected" />
    </div>

    <!-- 数据存储 -->
    <div class="section" style="margin-top: 20px">
      <div class="section-header">
        <h3>数据存储</h3>
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">当前位置</span>
          <span class="setting-desc path-text">{{ dataDir || '加载中...' }}</span>
        </div>
        <div class="bg-actions">
          <el-button size="small" @click="openDataFolder">
            <el-icon><FolderOpened /></el-icon> 打开文件夹
          </el-button>
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">更改存储位置</span>
          <span class="setting-desc">数据较大时建议存储在非系统盘，已有数据会自动复制过去</span>
        </div>
        <div class="bg-actions">
          <el-button size="small" type="primary" @click="changeDataDir">
            <el-icon><FolderAdd /></el-icon> 选择目录
          </el-button>
          <el-button size="small" @click="resetDataDir">
            重置为默认
          </el-button>
        </div>
      </div>

      <div class="size-warning">
        • 本应用图片以 PNG 形式存储，图片数量较多时文件可能较大，建议迁移图片位置到非C盘
      </div>
    </div>

    <!-- 日志 -->
    <div class="section" style="margin-top: 20px">
      <div class="section-header"><h3>运行日志</h3></div>
      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">查看日志</span>
          <span class="setting-desc">查看生成记录和错误信息</span>
        </div>
        <el-button @click="showLogViewer = true">
          <el-icon><Document /></el-icon> 打开日志
        </el-button>
      </div>
    </div>

    <LogViewer v-model="showLogViewer" />

    <!-- ===== 对话框 ===== -->

    <!-- 站点对话框 -->
    <el-dialog v-model="siteDialogVisible" :title="editingSite ? '编辑站点' : '添加站点'" width="500px">
      <el-form :model="siteForm" label-width="90px">
        <el-form-item label="站点名称" required>
          <el-input v-model="siteForm.name" placeholder="例如：我的站点" />
        </el-form-item>
        <el-form-item label="Base URL" required>
          <el-input v-model="siteForm.baseUrl" placeholder="例如：https://xxx.com/v1（请务必保证结尾为/v1）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="siteDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitSite">确定</el-button>
      </template>
    </el-dialog>

    <!-- Key 对话框 -->
    <el-dialog v-model="keyDialogVisible" :title="editingKey ? '编辑 Key' : '添加 Key'" width="500px">
      <el-form :model="keyForm" label-width="90px">
        <el-form-item label="名称/备注">
          <el-input v-model="keyForm.name" placeholder="例如：主Key / 备用Key" />
        </el-form-item>
        <el-form-item label="API Key" required>
          <el-input v-model="keyForm.apiKey" placeholder="sk-..." show-password type="password" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="keyDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitKey">确定</el-button>
      </template>
    </el-dialog>

    <!-- 模型对话框 -->
    <el-dialog v-model="modelDialogVisible" :title="editingModel ? '编辑模型' : '添加模型'" width="500px">
      <el-form :model="modelForm" label-width="90px">
        <el-form-item label="模型名称" required>
          <el-input v-model="modelForm.name" placeholder="例如：gpt-image-2" />
        </el-form-item>
        <el-form-item label="使用 Key" required>
          <el-select v-model="modelForm.keyId" style="width: 100%">
            <el-option
              v-for="key in currentSiteForModel?.keys || []"
              :key="key.id"
              :label="`${key.name || '(未命名)'} — ${maskKey(key.apiKey)}`"
              :value="key.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="接口类型" required>
          <el-select v-model="modelForm.apiType" style="width: 100%">
            <el-option label="图片接口（/images/generations）" value="images" />
            <el-option label="Chat 接口（/chat/completions）" value="chat" />
            <el-option label="Responses 接口（/responses）" value="responses" />
            <el-option
              v-for="ct in apiStore.customApiTypes"
              :key="ct.id"
              :label="`自定义：${ct.name}`"
              :value="ct.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="modelDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitModel">确定</el-button>
      </template>
    </el-dialog>

    <!-- 自定义接口类型对话框 -->
    <el-dialog v-model="typeDialogVisible" :title="editingType ? '编辑接口类型' : '添加接口类型'" width="500px">
      <el-form :model="typeForm" label-width="100px">
        <el-form-item label="类型名称" required>
          <el-input v-model="typeForm.name" placeholder="例如：我的专用接口" />
        </el-form-item>
        <el-form-item label="基础类型" required>
          <el-select v-model="typeForm.baseType" style="width: 100%">
            <el-option label="图片接口" value="images" />
            <el-option label="Chat 接口" value="chat" />
            <el-option label="Responses 接口" value="responses" />
          </el-select>
        </el-form-item>
        <el-form-item label="自定义路径">
          <el-input v-model="typeForm.endpoint" placeholder="例如：/v2/custom-generate（可选）" />
        </el-form-item>
        <div style="font-size: 12px; color: var(--text-muted); padding-left: 100px">
          留空则使用基础类型的默认路径
        </div>
      </el-form>
      <template #footer>
        <el-button @click="typeDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitType">确定</el-button>
      </template>
    </el-dialog>

    <!-- 对话站点对话框 -->
    <el-dialog v-model="chatSiteDialogVisible" :title="editingChatSite ? '编辑对话站点' : '添加对话站点'" width="500px">
      <el-form :model="chatSiteForm" label-width="90px">
        <el-form-item label="站点名称" required>
          <el-input v-model="chatSiteForm.name" placeholder="例如：OpenAI 官方" />
        </el-form-item>
        <el-form-item label="Base URL" required>
          <el-input v-model="chatSiteForm.baseUrl" placeholder="例如：https://xxx.com/v1（请务必保证结尾为/v1）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="chatSiteDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitChatSite">确定</el-button>
      </template>
    </el-dialog>

    <!-- 对话 Key 对话框 -->
    <el-dialog v-model="chatKeyDialogVisible" :title="editingChatKey ? '编辑 Key' : '添加 Key'" width="500px">
      <el-form :model="chatKeyForm" label-width="90px">
        <el-form-item label="名称/备注">
          <el-input v-model="chatKeyForm.name" placeholder="例如：主Key / 备用Key" />
        </el-form-item>
        <el-form-item label="API Key" required>
          <el-input v-model="chatKeyForm.apiKey" placeholder="sk-..." show-password type="password" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="chatKeyDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitChatKey">确定</el-button>
      </template>
    </el-dialog>

    <!-- 对话模型对话框 -->
    <el-dialog v-model="chatModelDialogVisible" :title="editingChatModel ? '编辑对话模型' : '添加对话模型'" width="500px">
      <el-form :model="chatModelForm" label-width="90px">
        <el-form-item label="模型名称" required>
          <el-input v-model="chatModelForm.name" placeholder="例如：gpt-4o" />
        </el-form-item>
        <el-form-item label="使用 Key" required>
          <el-select v-model="chatModelForm.keyId" style="width: 100%">
            <el-option
              v-for="key in currentChatSiteForModel?.keys || []"
              :key="key.id"
              :label="`${key.name || '(未命名)'} — ${maskKey(key.apiKey)}`"
              :value="key.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="chatModelDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitChatModel">确定</el-button>
      </template>
    </el-dialog>

    <!-- 添加尺寸 -->
    <el-dialog v-model="showSizeDialog" title="添加自定义尺寸" width="400px">
      <div class="size-input-row">
        <el-input v-model.number="sizeWidth" placeholder="宽度" type="number" />
        <span style="padding: 0 8px">×</span>
        <el-input v-model.number="sizeHeight" placeholder="高度" type="number" />
      </div>
      <template #footer>
        <el-button @click="showSizeDialog = false">取消</el-button>
        <el-button type="primary" @click="addSize">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useApiStore } from '@/stores/api'
import { useThemeStore } from '@/stores/theme'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Plus, Connection, Edit, Delete, Document, Upload, FolderOpened, FolderAdd,
  Reading, Right,
} from '@element-plus/icons-vue'
import LogViewer from '@/components/LogViewer.vue'
import { useChatStore } from '@/stores/chat'


const chatStore = useChatStore()
const apiStore = useApiStore()
const themeStore = useThemeStore()

const expandedSites = ref([])
const showLogViewer = ref(false)

//说明文档
const DOC_URL = 'https://fcnkea891cg0.feishu.cn/wiki/FY5RwsCo5itbA9kADehcmwh0npg?from=from_copylink'  // 👈 改成你自己的链接

function openDoc() {
  // 通过 Electron 主进程打开外部链接（需要主进程支持）
  if (window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(DOC_URL)
  } else {
    window.open(DOC_URL, '_blank')
  }
}

// ==========数据库==========
const dataDir = ref('')

async function loadDataDir() {
  try {
    dataDir.value = await window.electronAPI.getDataDir()
  } catch { /* ignore */ }
}

async function changeDataDir() {
  try {
    await ElMessageBox.confirm(
      '更改存储位置后，已有数据会被复制到新目录。是否继续？',
      '更改存储位置',
      { confirmButtonText: '继续', cancelButtonText: '取消' }
    )
  } catch { return }

  const result = await window.electronAPI.selectDataDir()
  if (result?.canceled) return
  if (result?.success) {
    dataDir.value = result.path
    ElMessage.success(`已切换到新目录${result.copied > 0 ? `，复制了 ${result.copied} 个文件` : ''}`)
  } else {
    ElMessage.error(result?.error || '切换失败')
  }
}

async function resetDataDir() {
  try {
    await ElMessageBox.confirm(
      '确定要重置存储位置为默认（系统用户目录）吗？已有数据会被复制过去。',
      '重置',
      { confirmButtonText: '重置', cancelButtonText: '取消', type: 'warning' }
    )
  } catch { return }

  const result = await window.electronAPI.resetDataDir()
  if (result?.success) {
    dataDir.value = result.path
    ElMessage.success(`已重置${result.copied > 0 ? `，复制了 ${result.copied} 个文件` : ''}`)
  } else {
    ElMessage.error(result?.error || '重置失败')
  }
}

function openDataFolder() {
  window.electronAPI.openDataDir()
}

onMounted(() => {
  loadDataDir()
})

// ========== 站点 ==========
const siteDialogVisible = ref(false)
const editingSite = ref(null)
const siteForm = reactive({ name: '', baseUrl: '' })

function openSiteDialog(site) {
  editingSite.value = site || null
  siteForm.name = site?.name || ''
  siteForm.baseUrl = site?.baseUrl || ''
  siteDialogVisible.value = true
}

function submitSite() {
  if (!siteForm.name || !siteForm.baseUrl) {
    ElMessage.warning('请填写完整')
    return
  }
  if (editingSite.value) {
    apiStore.updateSite(editingSite.value.id, { ...siteForm })
    ElMessage.success('已更新')
  } else {
    const site = apiStore.addSite({ ...siteForm })
    expandedSites.value.push(site.id)
    ElMessage.success('已添加站点，请继续添加 Key 和模型')
  }
  siteDialogVisible.value = false
}

async function handleDeleteSite(site) {
  try {
    await ElMessageBox.confirm(`确定删除站点「${site.name}」？其下的所有 Key 和模型都会被删除`, '删除确认', {
      confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning',
    })
    apiStore.deleteSite(site.id)
    ElMessage.success('已删除')
  } catch { /* 取消 */ }
}

// ========== Key ==========
const keyDialogVisible = ref(false)
const editingKey = ref(null)
const currentSiteForKey = ref(null)
const keyForm = reactive({ name: '', apiKey: '' })

function openKeyDialog(site, key) {
  currentSiteForKey.value = site
  editingKey.value = key || null
  keyForm.name = key?.name || ''
  keyForm.apiKey = key?.apiKey || ''
  keyDialogVisible.value = true
}

function submitKey() {
  if (!keyForm.apiKey) {
    ElMessage.warning('请输入 API Key')
    return
  }
  const site = currentSiteForKey.value
  if (editingKey.value) {
    apiStore.updateKey(site.id, editingKey.value.id, { ...keyForm })
    ElMessage.success('已更新')
  } else {
    apiStore.addKey(site.id, { ...keyForm })
    ElMessage.success('已添加')
  }
  keyDialogVisible.value = false
}

async function handleDeleteKey(site, key) {
  try {
    await ElMessageBox.confirm(`确定删除 Key「${key.name || '(未命名)'}」？`, '删除确认', {
      confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning',
    })
    apiStore.deleteKey(site.id, key.id)
    ElMessage.success('已删除')
  } catch { /* 取消 */ }
}

// ========== 模型 ==========
const modelDialogVisible = ref(false)
const editingModel = ref(null)
const currentSiteForModel = ref(null)
const modelForm = reactive({ name: '', keyId: '', apiType: 'images' })

function openModelDialog(site, model) {
  currentSiteForModel.value = site
  editingModel.value = model || null
  modelForm.name = model?.name || ''
  modelForm.keyId = model?.keyId || site.keys[0]?.id || ''
  modelForm.apiType = model?.apiType || 'images'
  modelDialogVisible.value = true
}

function submitModel() {
  if (!modelForm.name || !modelForm.keyId) {
    ElMessage.warning('请填写完整')
    return
  }
  const site = currentSiteForModel.value
  if (editingModel.value) {
    apiStore.updateModel(site.id, editingModel.value.id, { ...modelForm })
    ElMessage.success('已更新')
  } else {
    apiStore.addModel(site.id, { ...modelForm })
    ElMessage.success('已添加')
  }
  modelDialogVisible.value = false
}

async function handleDeleteModel(site, model) {
  try {
    await ElMessageBox.confirm(`确定删除模型「${model.name}」？`, '删除确认', {
      confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning',
    })
    apiStore.deleteModel(site.id, model.id)
    ElMessage.success('已删除')
  } catch { /* 取消 */ }
}

// ========== 自定义接口类型 ==========
const typeDialogVisible = ref(false)
const editingType = ref(null)
const typeForm = reactive({ name: '', baseType: 'images', endpoint: '' })

function openTypeDialog(type) {
  editingType.value = type || null
  typeForm.name = type?.name || ''
  typeForm.baseType = type?.baseType || 'images'
  typeForm.endpoint = type?.endpoint || ''
  typeDialogVisible.value = true
}

function submitType() {
  if (!typeForm.name) {
    ElMessage.warning('请填写名称')
    return
  }
  if (editingType.value) {
    apiStore.updateCustomApiType(editingType.value.id, { ...typeForm })
    ElMessage.success('已更新')
  } else {
    apiStore.addCustomApiType({ ...typeForm })
    ElMessage.success('已添加')
  }
  typeDialogVisible.value = false
}

async function handleDeleteType(type) {
  try {
    await ElMessageBox.confirm(`确定删除「${type.name}」？使用它的模型会回退为图片接口`, '删除确认', {
      confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning',
    })
    apiStore.deleteCustomApiType(type.id)
    ElMessage.success('已删除')
  } catch { /* 取消 */ }
}

const expandedChatSites = ref([])

// ========== 对话站点 ==========
const chatSiteDialogVisible = ref(false)
const editingChatSite = ref(null)
const chatSiteForm = reactive({ name: '', baseUrl: '' })

function openChatSiteDialog(site) {
  editingChatSite.value = site || null
  chatSiteForm.name = site?.name || ''
  chatSiteForm.baseUrl = site?.baseUrl || ''
  chatSiteDialogVisible.value = true
}

function submitChatSite() {
  if (!chatSiteForm.name || !chatSiteForm.baseUrl) {
    ElMessage.warning('请填写完整')
    return
  }
  if (editingChatSite.value) {
    chatStore.updateChatSite(editingChatSite.value.id, { ...chatSiteForm })
    ElMessage.success('已更新')
  } else {
    const site = chatStore.addChatSite({ ...chatSiteForm })
    expandedChatSites.value.push(site.id)
    ElMessage.success('已添加，请继续添加 Key 和模型')
  }
  chatSiteDialogVisible.value = false
}

async function handleDeleteChatSite(site) {
  try {
    await ElMessageBox.confirm(`确定删除对话站点「${site.name}」？其下的所有 Key 和模型都会被删除`, '删除确认', {
      confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning',
    })
    chatStore.deleteChatSite(site.id)
    ElMessage.success('已删除')
  } catch { /* 取消 */ }
}

// ========== 对话 Key ==========
const chatKeyDialogVisible = ref(false)
const editingChatKey = ref(null)
const currentChatSiteForKey = ref(null)
const chatKeyForm = reactive({ name: '', apiKey: '' })

function openChatKeyDialog(site, key) {
  currentChatSiteForKey.value = site
  editingChatKey.value = key || null
  chatKeyForm.name = key?.name || ''
  chatKeyForm.apiKey = key?.apiKey || ''
  chatKeyDialogVisible.value = true
}

function submitChatKey() {
  if (!chatKeyForm.apiKey) {
    ElMessage.warning('请输入 API Key')
    return
  }
  const site = currentChatSiteForKey.value
  if (editingChatKey.value) {
    chatStore.updateChatKey(site.id, editingChatKey.value.id, { ...chatKeyForm })
    ElMessage.success('已更新')
  } else {
    chatStore.addChatKey(site.id, { ...chatKeyForm })
    ElMessage.success('已添加')
  }
  chatKeyDialogVisible.value = false
}

async function handleDeleteChatKey(site, key) {
  try {
    await ElMessageBox.confirm(`确定删除 Key「${key.name || '(未命名)'}」？`, '删除确认', {
      confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning',
    })
    chatStore.deleteChatKey(site.id, key.id)
    ElMessage.success('已删除')
  } catch { /* 取消 */ }
}

// ========== 对话模型 ==========
const chatModelDialogVisible = ref(false)
const editingChatModel = ref(null)
const currentChatSiteForModel = ref(null)
const chatModelForm = reactive({ name: '', keyId: '' })

function openChatModelDialog(site, model) {
  currentChatSiteForModel.value = site
  editingChatModel.value = model || null
  chatModelForm.name = model?.name || ''
  chatModelForm.keyId = model?.keyId || site.keys[0]?.id || ''
  chatModelDialogVisible.value = true
}

function submitChatModel() {
  if (!chatModelForm.name || !chatModelForm.keyId) {
    ElMessage.warning('请填写完整')
    return
  }
  const site = currentChatSiteForModel.value
  if (editingChatModel.value) {
    chatStore.updateChatModel(site.id, editingChatModel.value.id, { ...chatModelForm })
    ElMessage.success('已更新')
  } else {
    chatStore.addChatModel(site.id, { ...chatModelForm })
    ElMessage.success('已添加')
  }
  chatModelDialogVisible.value = false
}

async function handleDeleteChatModel(site, model) {
  try {
    await ElMessageBox.confirm(`确定删除对话模型「${model.name}」？`, '删除确认', {
      confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning',
    })
    chatStore.deleteChatModel(site.id, model.id)
    ElMessage.success('已删除')
  } catch { /* 取消 */ }
}

// ========== 对话模型测试 ==========
const testingChatModelId = ref(null)

async function handleTestChatModel(site, model) {
  const config = chatStore.getChatConfig(site.id, model.id)
  if (!config) {
    ElMessage.error('无法获取模型配置，请检查是否已绑定有效的 Key')
    return
  }

  testingChatModelId.value = model.id

  try {
    const response = await window.electronAPI.apiRequest({
      url: `${config.baseUrl}/chat/completions`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: 'Hi, this is a connectivity test. Reply with "OK" only.' }],
        max_tokens: 10,
      }),
      timeout: 30000,
    })

    if (response.status >= 400) {
      const errMsg = response.data?.error?.message || response.data?.message || `HTTP ${response.status}`
      ElMessage.error(`测试失败 (${response.status}): ${errMsg}`)
    } else {
      ElMessage.success(`模型「${config.model}」连接正常`)
    }
  } catch (err) {
    ElMessage.error(`测试失败: ${err.message || '请求异常'}`)
  } finally {
    testingChatModelId.value = null
  }
}

// ========== 工具 ==========
function maskKey(key) {
  if (!key) return ''
  if (key.length <= 8) return '****'
  return key.slice(0, 4) + '****' + key.slice(-4)
}

function getKeyName(site, keyId) {
  const k = site.keys.find(k => k.id === keyId)
  return k ? (k.name || '(未命名)') : '无'
}

function baseTypeLabel(baseType) {
  return { images: '图片接口', chat: 'Chat 接口', responses: 'Responses 接口' }[baseType] || baseType
}

// ========== 背景 ==========
const bgInputRef = ref(null)
function selectBgImage() { bgInputRef.value?.click() }
function onBgFileSelected(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => themeStore.setBgImage(ev.target.result)
  reader.readAsDataURL(file)
  e.target.value = ''
}
function removeBgImage() { themeStore.setBgImage('') }

// ========== 提示音 ==========
const soundInputRef = ref(null)

function selectSoundFile() {
  soundInputRef.value?.click()
}

function onSoundFileSelected(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    themeStore.setWorkflowCustomSound(ev.target.result)
    ElMessage.success('已设置自定义提示音')
  }
  reader.readAsDataURL(file)
  e.target.value = ''
}

function testSound() {
  import('@/utils/notificationSound').then(({ playNotificationSound }) => {
    playNotificationSound()
  })
}

// ========== 尺寸 ==========
const showSizeDialog = ref(false)
const sizeWidth = ref(null)
const sizeHeight = ref(null)

function addSize() {
  const w = parseInt(sizeWidth.value)
  const h = parseInt(sizeHeight.value)
  if (!w || !h || w < 64 || h < 64 || w > 8192 || h > 8192) {
    ElMessage.warning('请输入有效的宽高（64 - 8192）')
    return
  }
  const size = `${w}x${h}`
  if (themeStore.customSizes.includes(size)) {
    ElMessage.warning('该尺寸已存在')
    return
  }
  themeStore.addCustomSize(size)
  sizeWidth.value = null
  sizeHeight.value = null
  showSizeDialog.value = false
  ElMessage.success(`已添加 ${size}`)
}
function removeSize(size) {
  themeStore.removeCustomSize(size)
  ElMessage.success('已删除')
}
</script>

<style scoped>
.settings-page {
  max-width: 900px;
  margin: 0 auto;
  padding-bottom: 40px;
}
.page-header { margin-bottom: 28px; }
.page-header h2 { font-size: 24px; margin-bottom: 4px; }
.subtitle { color: var(--text-muted); font-size: 14px; }

.section {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 20px;
}
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.section-header h3 { font-size: 16px; font-weight: 600; }

.empty-state { text-align: center; padding: 40px; color: var(--text-muted); }
.empty-state p { margin-top: 12px; font-size: 14px; }

/* 站点标题 */
.site-title {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding-right: 12px;
}
.site-name { font-weight: 600; font-size: 15px; }
.site-url { color: var(--text-muted); font-size: 12px; flex: 1; }
.site-title-actions { display: flex; gap: 4px; }

/* 子区 */
.sub-section { padding: 12px 0; }
.sub-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.sub-header h4 { font-size: 13px; font-weight: 600; color: var(--text-secondary); }
.sub-empty { padding: 12px; text-align: center; color: var(--text-muted); font-size: 12px; }

/* 列表项 */
.item-list { display: flex; flex-direction: column; gap: 6px; }
.list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
}
.item-info { flex: 1; min-width: 0; }
.item-name { display: block; font-size: 13px; font-weight: 500; color: var(--text-primary); }
.item-detail { font-size: 12px; color: var(--text-muted); }
.item-meta { display: flex; gap: 6px; margin-top: 4px; flex-wrap: wrap; }
.item-actions { display: flex; gap: 2px; flex-shrink: 0; }

/* 设置项 */
.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
}
.setting-info { display: flex; flex-direction: column; gap: 4px; }
.setting-label { font-size: 14px; font-weight: 500; color: var(--text-primary); }
.setting-desc { font-size: 12px; color: var(--text-muted); }

.bg-actions { display: flex; gap: 8px; }

/* 尺寸警告 */
.size-warning {
  background: rgba(245, 158, 11, 0.1);
  border-left: 3px solid #f59e0b;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}
.size-list { display: flex; flex-wrap: wrap; gap: 8px; }
.size-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: 13px;
}
.size-input-row { display: flex; align-items: center; }

.path-text {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 11px;
  word-break: break-all;
  max-width: 400px;
}

.doc-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  margin-bottom: 20px;
  background: linear-gradient(135deg, var(--accent-light), var(--bg-card));
  border: 1px solid var(--accent-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition);
}

.doc-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  border-color: var(--accent-hover);
}

.doc-icon {
  width: 52px;
  height: 52px;
  border-radius: var(--radius-sm);
  background: var(--accent-color);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.doc-content {
  flex: 1;
  min-width: 0;
}

.doc-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.doc-desc {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.doc-arrow {
  color: var(--accent-color);
  flex-shrink: 0;
}

/* el-collapse 美化 */
:deep(.el-collapse) {
  border: none;
  background: transparent;
}

:deep(.el-collapse-item) {
  margin-bottom: 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--bg-secondary);
}

:deep(.el-collapse-item:last-child) {
  margin-bottom: 0;
}

:deep(.el-collapse-item__header) {
  padding: 0 16px;
  background: transparent;
  border-bottom: 1px solid transparent;
  font-size: 14px;
  height: 52px;
  line-height: 52px;
  transition: border-color var(--transition);
}

:deep(.el-collapse-item.is-active .el-collapse-item__header) {
  border-bottom-color: var(--border-color);
}

:deep(.el-collapse-item__wrap) {
  border-bottom: none;
  background: transparent;
}

:deep(.el-collapse-item__content) {
  padding: 16px;
}
</style>