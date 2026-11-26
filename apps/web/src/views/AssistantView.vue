<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { apiGet, apiPost } from '@/api/client';
import type { AgentSessionDetail, AgentSessionSummary, PlanningResult, Project } from '@/api/types';
import { TASK_PRIORITY_LABELS, TASK_TYPE_LABELS } from '@/api/types';

// AI 助手：需求输入 → 澄清问答 → 计划预览（第 5 步加入审批入库与 SSE 流式）
const projects = ref<Project[]>([]);
const projectId = ref('');
const requirement = ref('');
const running = ref(false);
const errorMsg = ref<string | null>(null);

const sessions = ref<AgentSessionSummary[]>([]);
const result = ref<PlanningResult | null>(null);
const sessionDetail = ref<AgentSessionDetail | null>(null);
const answers = ref('');

onMounted(async () => {
  projects.value = await apiGet<Project[]>('/projects');
  if (projects.value.length > 0) {
    projectId.value = projects.value[0].id;
    await loadSessions();
  }
});

async function loadSessions(): Promise<void> {
  if (!projectId.value) return;
  sessions.value = await apiGet<AgentSessionSummary[]>(
    `/projects/${projectId.value}/agent/sessions`,
  );
}

async function startPlan(): Promise<void> {
  running.value = true;
  errorMsg.value = null;
  result.value = null;
  sessionDetail.value = null;
  try {
    result.value = await apiPost<PlanningResult>(`/projects/${projectId.value}/agent/plan`, {
      requirement: requirement.value,
    });
    await loadSessions();
    await openSession(result.value.sessionId);
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : '规划失败';
  } finally {
    running.value = false;
  }
}

async function submitAnswers(): Promise<void> {
  if (!result.value) return;
  running.value = true;
  errorMsg.value = null;
  try {
    result.value = await apiPost<PlanningResult>(
      `/agent/sessions/${result.value.sessionId}/reply`,
      { answers: answers.value },
    );
    answers.value = '';
    await loadSessions();
    await openSession(result.value.sessionId);
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : '提交失败';
  } finally {
    running.value = false;
  }
}

async function openSession(sessionId: string): Promise<void> {
  sessionDetail.value = await apiGet<AgentSessionDetail>(`/agent/sessions/${sessionId}`);
  // 历史会话：从 state 恢复展示
  if (!result.value || result.value.sessionId !== sessionId) {
    const s = sessionDetail.value;
    if (s.status === 'WAITING_INPUT') {
      result.value = {
        sessionId,
        status: 'WAITING_INPUT',
        analysis: s.state?.analysis ?? null,
        questions: s.state?.analysis?.questions ?? [],
      };
    } else if (s.state?.plan) {
      result.value = {
        sessionId,
        status: 'PLANNED',
        analysis: s.state?.analysis ?? null,
        plan: s.state.plan,
      };
    } else {
      result.value = null;
    }
  }
}

function parentTitle(index: number | null): string {
  if (index === null || !result.value?.plan) return '—';
  return result.value.plan.tasks[index]?.title ?? '—';
}

const sessionStatusLabel: Record<string, string> = {
  ACTIVE: '执行中',
  WAITING_INPUT: '待补充需求',
  WAITING_APPROVAL: '待审批',
  COMPLETED: '已生成计划',
  FAILED: '失败',
};
</script>

<template>
  <div class="grid grid-cols-1 gap-4 xl:grid-cols-3">
    <!-- 左栏：输入与会话历史 -->
    <div class="space-y-4">
      <div class="rounded-xl border border-slate-200 bg-white p-5">
        <h2 class="text-base font-semibold">描述你的项目需求</h2>
        <div class="mt-3 space-y-3">
          <select
            v-model="projectId"
            class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            @change="loadSessions"
          >
            <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <textarea
            v-model="requirement"
            rows="6"
            maxlength="10000"
            placeholder="例如：我要开发一个在线 Markdown 编辑器，使用 Vue 3 + NestJS，支持编辑、实时预览、文档保存、用户登录和分享，预计两周完成…"
            class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          ></textarea>
          <button
            class="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            :disabled="running || !requirement.trim() || !projectId"
            @click="startPlan"
          >
            {{ running ? 'AI 规划中（约 30~90 秒）…' : '🤖 开始智能规划' }}
          </button>
          <p v-if="errorMsg" class="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">
            {{ errorMsg }}
          </p>
        </div>
      </div>

      <div class="rounded-xl border border-slate-200 bg-white p-5">
        <h3 class="text-sm font-semibold text-slate-600">历史会话</h3>
        <p v-if="sessions.length === 0" class="mt-2 text-xs text-slate-400">暂无会话</p>
        <ul class="mt-2 space-y-1">
          <li v-for="s in sessions" :key="s.id">
            <button
              class="w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-slate-50"
              :class="{ 'bg-blue-50': sessionDetail?.id === s.id }"
              @click="openSession(s.id)"
            >
              <div class="truncate font-medium text-slate-700">{{ s.title }}</div>
              <div class="mt-0.5 text-slate-400">
                {{ sessionStatusLabel[s.status] ?? s.status }} ·
                {{ s.createdAt.slice(0, 16).replace('T', ' ') }}
              </div>
            </button>
          </li>
        </ul>
      </div>
    </div>

    <!-- 右两栏：结果展示 -->
    <div class="space-y-4 xl:col-span-2">
      <!-- 澄清问题 -->
      <div
        v-if="result?.status === 'WAITING_INPUT'"
        class="rounded-xl border border-amber-200 bg-amber-50/50 p-5"
      >
        <h2 class="text-base font-semibold text-amber-800">AI 需要澄清以下问题</h2>
        <ol class="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li v-for="(q, i) in result.questions" :key="i">{{ q }}</li>
        </ol>
        <textarea
          v-model="answers"
          rows="4"
          placeholder="请逐条回答上面的问题…"
          class="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        ></textarea>
        <button
          class="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          :disabled="running || !answers.trim()"
          @click="submitAnswers"
        >
          {{ running ? 'AI 继续规划中…' : '提交补充信息' }}
        </button>
      </div>

      <!-- 计划预览 -->
      <template v-if="result?.status === 'PLANNED' && result.plan">
        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <div class="flex items-center justify-between">
            <h2 class="text-base font-semibold">📋 开发计划预览</h2>
            <span class="rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-600">
              提案 · 第 5 步支持审批入库
            </span>
          </div>
          <p class="mt-2 text-sm text-slate-500">{{ result.analysis?.summary }}</p>
          <div class="mt-3 grid grid-cols-1 gap-3 text-xs md:grid-cols-3">
            <div class="rounded-lg bg-slate-50 p-3">
              <div class="font-semibold text-slate-600">功能清单</div>
              <ul class="mt-1 list-disc pl-4 text-slate-500">
                <li v-for="(f, i) in result.analysis?.features ?? []" :key="i">{{ f }}</li>
              </ul>
            </div>
            <div class="rounded-lg bg-slate-50 p-3">
              <div class="font-semibold text-slate-600">技术约束</div>
              <ul class="mt-1 list-disc pl-4 text-slate-500">
                <li v-for="(c, i) in result.analysis?.constraints ?? []" :key="i">{{ c }}</li>
              </ul>
            </div>
            <div class="rounded-lg bg-slate-50 p-3">
              <div class="font-semibold text-slate-600">风险识别</div>
              <ul class="mt-1 list-disc pl-4 text-slate-500">
                <li v-for="(r, i) in result.plan.risks" :key="i">{{ r }}</li>
              </ul>
            </div>
          </div>
        </div>

        <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-100 text-left text-xs text-slate-400">
                <th class="px-4 py-3 font-medium">#</th>
                <th class="px-4 py-3 font-medium">任务</th>
                <th class="px-4 py-3 font-medium">类型</th>
                <th class="px-4 py-3 font-medium">优先级</th>
                <th class="px-4 py-3 font-medium">角色</th>
                <th class="px-4 py-3 font-medium">工期(天)</th>
                <th class="px-4 py-3 font-medium">父任务</th>
                <th class="px-4 py-3 font-medium">前置</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(t, i) in result.plan.tasks" :key="i" class="border-b border-slate-50">
                <td class="px-4 py-2.5 text-slate-400">{{ i }}</td>
                <td class="px-4 py-2.5 font-medium" :title="t.description">{{ t.title }}</td>
                <td class="px-4 py-2.5 text-xs">{{ TASK_TYPE_LABELS[t.type] }}</td>
                <td class="px-4 py-2.5 text-xs">{{ TASK_PRIORITY_LABELS[t.priority] }}</td>
                <td class="px-4 py-2.5 text-slate-500">{{ t.assigneeRole }}</td>
                <td class="px-4 py-2.5 text-slate-500">{{ t.estimatedDays }}</td>
                <td class="px-4 py-2.5 text-xs text-slate-500">{{ parentTitle(t.parentIndex) }}</td>
                <td class="px-4 py-2.5 text-xs text-slate-500">
                  {{ t.dependsOnIndexes.join(', ') || '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <h3 class="text-sm font-semibold text-slate-600">里程碑</h3>
          <ul class="mt-2 space-y-1 text-sm text-slate-500">
            <li v-for="(m, i) in result.plan.milestones" :key="i">
              🚩 第 {{ m.offsetDays }} 天 · {{ m.name }} — {{ m.description }}
            </li>
          </ul>
        </div>
      </template>

      <!-- 执行审计 -->
      <div
        v-if="sessionDetail && sessionDetail.executions.length > 0"
        class="rounded-xl border border-slate-200 bg-white p-5"
      >
        <h3 class="text-sm font-semibold text-slate-600">执行记录（审计）</h3>
        <ul class="mt-2 space-y-1 text-xs">
          <li v-for="ex in sessionDetail.executions" :key="ex.id" class="flex items-center gap-2">
            <span
              class="inline-block h-2 w-2 rounded-full"
              :class="ex.status === 'SUCCESS' ? 'bg-emerald-500' : 'bg-rose-500'"
            ></span>
            <span class="font-mono">{{ ex.toolName }}</span>
            <span class="text-slate-400">{{ ex.status }}</span>
            <span v-if="ex.error" class="truncate text-rose-500">{{ ex.error }}</span>
          </li>
        </ul>
      </div>

      <!-- 空状态 -->
      <div
        v-if="!result && !running"
        class="flex min-h-60 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white"
      >
        <p class="max-w-sm text-center text-sm text-slate-400">
          在左侧描述项目需求并点击「开始智能规划」，AI
          将分析需求、必要时提问澄清，然后生成任务计划提案
        </p>
      </div>
    </div>
  </div>
</template>
