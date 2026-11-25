<script setup lang="ts">
import { onMounted } from 'vue';
import { useAppStore } from '@/stores/app';

const appStore = useAppStore();
onMounted(() => {
  void appStore.checkHealth();
});

// 开发路线图：每步都要有可运行成果
const roadmap = [
  { step: 1, title: 'Monorepo 骨架', desc: 'Vue3 + NestJS + PostgreSQL + Prisma', done: true },
  { step: 2, title: '项目/任务 CRUD', desc: 'API + 项目列表页', done: false },
  { step: 3, title: '任务看板', desc: '拖拽状态流转 + 依赖关系', done: false },
  { step: 4, title: 'Agent 引擎', desc: 'LangGraph.js 需求分析 / 任务拆解', done: false },
  { step: 5, title: '对话与审批', desc: 'SSE 流式 + 人工审批 + 执行记录', done: false },
  { step: 6, title: '排期与风险', desc: '甘特图 + 里程碑 + 风险报告', done: false },
];
</script>

<template>
  <div class="space-y-6">
    <!-- 服务状态卡片 -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
      <div class="rounded-xl border border-slate-200 bg-white p-5">
        <div class="text-sm text-slate-500">后端 API</div>
        <div class="mt-2 flex items-center gap-2">
          <span
            class="inline-block h-2.5 w-2.5 rounded-full"
            :class="appStore.health ? 'bg-emerald-500' : 'bg-rose-500'"
          ></span>
          <span class="text-lg font-semibold">
            {{ appStore.checking ? '检测中…' : appStore.health ? '在线' : '离线' }}
          </span>
        </div>
        <p v-if="appStore.healthError" class="mt-2 text-xs text-rose-500">
          {{ appStore.healthError }}
        </p>
      </div>
      <div class="rounded-xl border border-slate-200 bg-white p-5">
        <div class="text-sm text-slate-500">数据库</div>
        <div class="mt-2 flex items-center gap-2">
          <span
            class="inline-block h-2.5 w-2.5 rounded-full"
            :class="appStore.health?.database === 'up' ? 'bg-emerald-500' : 'bg-rose-500'"
          ></span>
          <span class="text-lg font-semibold">
            {{ appStore.health?.database === 'up' ? '已连接' : '未连接' }}
          </span>
        </div>
      </div>
      <div class="rounded-xl border border-slate-200 bg-white p-5">
        <div class="text-sm text-slate-500">当前阶段</div>
        <div class="mt-2 text-lg font-semibold">V1 · 第 1 步</div>
        <p class="mt-2 text-xs text-slate-400">智能项目规划 MVP</p>
      </div>
    </div>

    <!-- 开发路线图 -->
    <div class="rounded-xl border border-slate-200 bg-white p-6">
      <h2 class="text-base font-semibold">开发路线图</h2>
      <ol class="mt-4 space-y-3">
        <li
          v-for="item in roadmap"
          :key="item.step"
          class="flex items-center gap-4 rounded-lg border border-slate-100 px-4 py-3"
        >
          <span
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
            :class="item.done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'"
          >
            {{ item.done ? '✓' : item.step }}
          </span>
          <div class="min-w-0">
            <div class="text-sm font-medium">{{ item.title }}</div>
            <div class="truncate text-xs text-slate-400">{{ item.desc }}</div>
          </div>
          <span
            v-if="item.done"
            class="ml-auto shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-600"
          >
            已完成
          </span>
        </li>
      </ol>
    </div>
  </div>
</template>
