<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { apiGet } from '@/api/client';
import type { Project } from '@/api/types';
import { PROJECT_STATUS_LABELS } from '@/api/types';

// 任务管理入口：选择项目进入看板
const projects = ref<Project[]>([]);
const loading = ref(true);

onMounted(async () => {
  try {
    projects.value = await apiGet<Project[]>('/projects');
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="space-y-4">
    <p class="text-sm text-slate-500">选择一个项目查看任务看板（双击卡片可编辑任务）</p>
    <p v-if="loading" class="text-sm text-slate-400">加载中…</p>
    <div
      v-if="!loading && projects.length === 0"
      class="flex min-h-60 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white"
    >
      <p class="text-sm text-slate-400">还没有项目，请先到「项目列表」创建</p>
    </div>
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <RouterLink
        v-for="project in projects"
        :key="project.id"
        :to="`/projects/${project.id}?view=kanban`"
        class="rounded-xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md"
      >
        <div class="flex items-center justify-between">
          <span class="font-semibold">{{ project.name }}</span>
          <span class="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs text-blue-600">
            {{ PROJECT_STATUS_LABELS[project.status] }}
          </span>
        </div>
        <p class="mt-2 text-sm text-slate-400">
          任务 {{ project._count?.tasks ?? 0 }} 个 · 点击查看看板 →
        </p>
      </RouterLink>
    </div>
  </div>
</template>
