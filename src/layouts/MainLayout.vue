<template>
  <div class="main-layout">
    <!-- 自定义背景图 -->
    <div
      v-if="themeStore.bgImage"
      class="app-bg-layer"
      :style="{
        backgroundImage: `url(${themeStore.bgImage})`,
        opacity: themeStore.bgOpacity,
      }"
    />

    <!-- 顶部导航 -->
    <header class="top-nav">
      <div class="nav-left">
        <span class="logo">🎨 MioDraw</span>
      </div>

      <nav class="nav-center">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          active-class="nav-item--active"
        >
          <el-icon :size="18"><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
          <span
            v-if="item.path === '/workflow' && workflowStore.isRunning"
            class="nav-running-dot"
          ></span>
        </router-link>
      </nav>

      <div class="nav-right">
        <el-tooltip :content="themeStore.isDark ? '切换亮色' : '切换暗色'" placement="bottom">
          <button class="theme-btn" @click="themeStore.toggleTheme">
            <el-icon :size="20">
              <Sunny v-if="themeStore.isDark" />
              <Moon v-else />
            </el-icon>
          </button>
        </el-tooltip>
      </div>
    </header>

    <!-- 主内容 -->
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { useThemeStore } from '@/stores/theme'
import { useWorkflowStore } from '@/stores/workflow'
import { Brush, PictureFilled, Setting, Sunny, Moon, MagicStick, User } from '@element-plus/icons-vue'

const themeStore = useThemeStore()
const workflowStore = useWorkflowStore()

const navItems = [
  { path: '/generate', label: '生成', icon: Brush },
  { path: '/gallery', label: '图库', icon: PictureFilled },
  { path: '/workflow', label: 'AI工作流', icon: MagicStick },
  { path: '/characters', label: '角色卡', icon: User },
  { path: '/settings', label: '设置', icon: Setting },
]
</script>

<style scoped>
.main-layout {
  height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
}

.top-nav {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  z-index: 100;
  flex-shrink: 0;
}

.nav-left .logo {
  font-size: 20px;
  font-weight: 700;
  color: var(--accent-color);
  user-select: none;
}

.nav-center {
  display: flex;
  gap: 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: all var(--transition);
}

.nav-item:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.nav-item--active {
  color: var(--accent-color);
  background: var(--accent-light);
}

.theme-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition);
}

.theme-btn:hover {
  color: var(--accent-color);
  border-color: var(--accent-color);
}

.main-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.nav-running-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #16a34a;
  box-shadow: 0 0 6px rgba(22, 163, 74, 0.6);
  animation: nav-pulse 1.5s ease-in-out infinite;
  margin-left: -2px;
}

@keyframes nav-pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 6px rgba(22, 163, 74, 0.6); }
  50% { opacity: 0.4; box-shadow: 0 0 2px rgba(22, 163, 74, 0.2); }
}
</style>