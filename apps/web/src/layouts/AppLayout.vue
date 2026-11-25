<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const pageTitle = computed(() => (route.meta.title as string) ?? 'ProjectPilot');

// 侧边导航：对应第一版四个主页面
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
      <div class="px-5 py-4 text-xs text-slate-500">V1 MVP · 第 1 步骨架</div>
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
