import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/generate',
  },
  {
    path: '/generate',
    name: 'Generate',
    component: () => import('@/pages/GeneratePage.vue'),
  },
  {
    path: '/gallery',
    name: 'Gallery',
    component: () => import('@/pages/GalleryPage.vue'),
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/pages/SettingsPage.vue'),
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router