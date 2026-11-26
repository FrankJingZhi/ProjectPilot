import { createRouter, createWebHistory } from 'vue-router';
import { getToken } from '@/api/client';
import AppLayout from '@/layouts/AppLayout.vue';

// 登录页 + 五个主页面
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { title: '登录' },
    },
    {
      path: '/',
      component: AppLayout,
      children: [
        { path: '', redirect: '/dashboard' },
        {
          path: 'dashboard',
          name: 'dashboard',
          component: () => import('@/views/DashboardView.vue'),
          meta: { title: '项目仪表盘' },
        },
        {
          path: 'projects',
          name: 'projects',
          component: () => import('@/views/ProjectsView.vue'),
          meta: { title: '项目列表' },
        },
        {
          path: 'projects/:id',
          name: 'project-detail',
          component: () => import('@/views/ProjectDetailView.vue'),
          meta: { title: '项目详情' },
        },
        {
          path: 'tasks',
          name: 'tasks',
          component: () => import('@/views/TasksView.vue'),
          meta: { title: '任务管理' },
        },
        {
          path: 'assistant',
          name: 'assistant',
          component: () => import('@/views/AssistantView.vue'),
          meta: { title: 'AI 助手' },
        },
        {
          path: 'plan',
          name: 'plan',
          component: () => import('@/views/PlanView.vue'),
          meta: { title: '项目计划' },
        },
      ],
    },
  ],
});

// 登录守卫：未登录一律去登录页；已登录访问登录页则回仪表盘
router.beforeEach((to) => {
  const loggedIn = Boolean(getToken());
  if (to.name !== 'login' && !loggedIn) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.name === 'login' && loggedIn) {
    return { name: 'dashboard' };
  }
  return true;
});
