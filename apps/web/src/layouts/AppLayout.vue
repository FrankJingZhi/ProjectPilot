<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const pageTitle = computed(() => (route.meta.title as string) ?? 'ProjectPilot');

// 刷新页面后恢复当前用户信息
onMounted(() => {
  if (!auth.user) {
    void auth.fetchMe();
  }
});

function logout(): void {
  auth.logout();
  void router.replace({ name: 'login' });
}

// 侧边导航：五个主页面
const navItems = [
  { to: '/dashboard', label: '项目仪表盘', icon: '📊' },
  { to: '/projects', label: '项目列表', icon: '📁' },
  { to: '/tasks', label: '任务管理', icon: '🗂️' },
  { to: '/assistant', label: 'AI 助手', icon: '🤖' },
  { to: '/plan', label: '项目计划', icon: '📅' },
];
</script>

<template>
  <div class="flex h-full">
    <!-- 侧边栏 -->
    <aside class="flex w-60 shrink-0 flex-col bg-slate-900 text-slate-200">
      <div class="flex items-center gap-2 px-5 py-5">
        <span class="text-2xl">🧭</span>
        <div>
          <div class="text-lg font-semibold text-white">ProjectPilot</div>
          <div class="text-xs text-slate-400">AI 项目管理智能体</div>
        </div>
      </div>
      <nav class="mt-2 flex-1 space-y-1 px-3">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-slate-800"
          active-class="bg-blue-600 text-white hover:bg-blue-600"
        >
          <span>{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>
      <!-- 当前登录用户 -->
      <div class="border-t border-slate-800 px-5 py-4">
        <div class="flex items-center justify-between">
          <div class="min-w-0">
            <div class="truncate text-sm text-slate-200">
              {{ auth.user?.name ?? '加载中…' }}
              <span
                v-if="auth.user?.isAdmin"
                class="ml-1 rounded bg-blue-600/30 px-1.5 py-0.5 text-[10px] text-blue-300"
                >管理员</span
              >
            </div>
            <div class="truncate text-xs text-slate-500">{{ auth.user?.email }}</div>
          </div>
          <button
            class="ml-2 shrink-0 text-xs text-slate-400 transition-colors hover:text-white"
            title="退出登录"
            @click="logout"
          >
            退出
          </button>
        </div>
      </div>
    </aside>

    <!-- 主区域 -->
    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-14 items-center border-b border-slate-200 bg-white px-6">
        <h1 class="text-base font-semibold">{{ pageTitle }}</h1>
      </header>
      <main class="flex-1 overflow-auto p-6">
        <RouterView />
      </main>
    </div>
  </div>
</template>
