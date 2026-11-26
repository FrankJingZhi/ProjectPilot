<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { apiGet, apiPost } from '@/api/client';
import type { Milestone, Project, ScheduleResult, Task } from '@/api/types';
import { TASK_STATUS_LABELS, TASK_TYPE_LABELS } from '@/api/types';

// 项目计划：自动排期 + 甘特图 + 里程碑（第 6 步）
const DAY = 24 * 60 * 60 * 1000;
const DAY_WIDTH = 28;

const projects = ref<Project[]>([]);
const projectId = ref('');
const project = ref<(Project & { milestones: Milestone[] }) | null>(null);
const tasks = ref<Task[]>([]);
const schedule = ref<ScheduleResult | null>(null);
const scheduling = ref(false);
const errorMsg = ref<string | null>(null);

onMounted(async () => {
  projects.value = await apiGet<Project[]>('/projects');
  if (projects.value.length > 0) {
    projectId.value = projects.value[0].id;
    await loadAll();
  }
});

async function loadAll(): Promise<void> {
  if (!projectId.value) return;
  errorMsg.value = null;
  schedule.value = null;
  project.value = await apiGet(`/projects/${projectId.value}`);
  tasks.value = await apiGet<Task[]>(`/projects/${projectId.value}/tasks`);
}

// 触发自动排期：重算全部任务计划起止并刷新
async function runSchedule(): Promise<void> {
  scheduling.value = true;
  errorMsg.value = null;
  try {
    schedule.value = await apiPost<ScheduleResult>(
      `/projects/${projectId.value}/tasks/schedule`,
      {},
    );
    await loadAll();
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : '排期失败';
  } finally {
    scheduling.value = false;
  }
}

// 归一化到 UTC 零点，避免时区漂移
function utcDay(value: string | Date): number {
  const d = new Date(value);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

const scheduledTasks = computed(() =>
  tasks.value
    .filter((t) => t.plannedStart && t.plannedEnd && t.status !== 'CANCELLED')
    .sort((a, b) => utcDay(a.plannedStart!) - utcDay(b.plannedStart!)),
);
const unscheduledTasks = computed(() =>
  tasks.value.filter((t) => !t.plannedStart && t.status !== 'CANCELLED'),
);
const criticalIds = computed(
  () => new Set(schedule.value?.tasks.filter((t) => t.critical).map((t) => t.id) ?? []),
);

// 时间轴范围：覆盖任务、里程碑、目标日期与今天
const rangeStart = computed(() => {
  const points = [
    ...scheduledTasks.value.map((t) => utcDay(t.plannedStart!)),
    ...(project.value?.milestones ?? []).map((m) => utcDay(m.dueDate)),
    utcDay(new Date()),
  ];
  if (project.value?.startDate) points.push(utcDay(project.value.startDate));
  return points.length > 0 ? Math.min(...points) : utcDay(new Date());
});
const rangeEnd = computed(() => {
  const points = [
    ...scheduledTasks.value.map((t) => utcDay(t.plannedEnd!)),
    ...(project.value?.milestones ?? []).map((m) => utcDay(m.dueDate)),
    utcDay(new Date()),
  ];
  if (project.value?.targetEndDate) points.push(utcDay(project.value.targetEndDate));
  return points.length > 0 ? Math.max(...points) : rangeStart.value + 7 * DAY;
});
const days = computed(() => {
  const list: number[] = [];
  for (let d = rangeStart.value; d <= rangeEnd.value; d += DAY) list.push(d);
  return list;
});
const timelineWidth = computed(() => days.value.length * DAY_WIDTH);

function offsetDays(value: string | Date): number {
  return Math.round((utcDay(value) - rangeStart.value) / DAY);
}
function barLeft(t: Task): number {
  return offsetDays(t.plannedStart!) * DAY_WIDTH;
}
function barWidth(t: Task): number {
  const span = Math.round((utcDay(t.plannedEnd!) - utcDay(t.plannedStart!)) / DAY);
  return Math.max(1, span) * DAY_WIDTH;
}
function isWeekend(day: number): boolean {
  const wd = new Date(day).getUTCDay();
  return wd === 0 || wd === 6;
}
function dayLabel(day: number): string {
  return String(new Date(day).getUTCDate());
}
function monthLabel(day: number): string {
  const d = new Date(day);
  return `${d.getUTCMonth() + 1}月`;
}
const todayOffset = computed(() => offsetDays(new Date()));
const overdueTarget = computed(() => {
  if (!schedule.value || !project.value?.targetEndDate) return false;
  return utcDay(schedule.value.projectEnd) > utcDay(project.value.targetEndDate);
});

// 任务条配色：按类型区分，关键路径加红色描边
function barClass(t: Task): string {
  const base =
    t.type === 'EPIC' ? 'bg-indigo-500' : t.type === 'STORY' ? 'bg-blue-400' : 'bg-emerald-400';
  const done = t.status === 'DONE' ? 'opacity-50' : '';
  const critical = criticalIds.value.has(t.id) ? 'ring-2 ring-rose-500' : '';
  return `${base} ${done} ${critical}`;
}
</script>

<template>
  <div class="space-y-4">
    <!-- 工具栏 -->
    <div class="rounded-xl border border-slate-200 bg-white p-5">
      <div class="flex flex-wrap items-center gap-3">
        <select
          v-model="projectId"
          class="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          @change="loadAll"
        >
          <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <button
          class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          :disabled="scheduling || !projectId"
          @click="runSchedule"
        >
          {{ scheduling ? '排期中…' : '📅 自动排期' }}
        </button>
        <div v-if="schedule" class="text-xs text-slate-500">
          项目周期：{{ schedule.projectStart.slice(0, 10) }} ~
          {{ schedule.projectEnd.slice(0, 10) }} · 关键任务
          {{ schedule.tasks.filter((t) => t.critical).length }} 个
        </div>
        <p v-if="errorMsg" class="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">
          {{ errorMsg }}
        </p>
      </div>
      <p v-if="overdueTarget" class="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
        ⚠️ 排期结束日期晚于目标完成日期（{{ project?.targetEndDate?.slice(0, 10) }}），存在延期风险
      </p>
    </div>

    <!-- 甘特图 -->
    <div
      v-if="scheduledTasks.length > 0"
      class="overflow-x-auto rounded-xl border border-slate-200 bg-white p-5"
    >
      <div class="flex">
        <!-- 左侧任务名列 -->
        <div class="w-56 shrink-0">
          <div class="h-10 border-b border-slate-100 text-xs font-medium text-slate-400">任务</div>
          <div class="h-8 border-b border-slate-100 text-xs text-slate-400">里程碑</div>
          <div
            v-for="t in scheduledTasks"
            :key="t.id"
            class="flex h-9 items-center gap-1 truncate border-b border-slate-50 pr-2 text-sm"
            :title="`${t.title}（${TASK_TYPE_LABELS[t.type]} / ${TASK_STATUS_LABELS[t.status]}）`"
          >
            <span
              class="rounded px-1 text-[10px]"
              :class="
                t.type === 'EPIC'
                  ? 'bg-indigo-50 text-indigo-600'
                  : t.type === 'STORY'
                    ? 'bg-blue-50 text-blue-600'
                    : 'bg-emerald-50 text-emerald-600'
              "
            >
              {{ TASK_TYPE_LABELS[t.type] }}
            </span>
            <span class="truncate" :class="{ 'font-semibold': t.type === 'EPIC' }">{{
              t.title
            }}</span>
          </div>
        </div>

        <!-- 右侧时间轴 -->
        <div class="relative" :style="{ width: `${timelineWidth}px` }">
          <!-- 日期刻度 -->
          <div class="flex h-10 border-b border-slate-100">
            <div
              v-for="d in days"
              :key="d"
              class="shrink-0 border-r border-slate-50 text-center text-[10px] text-slate-400"
              :style="{ width: `${DAY_WIDTH}px` }"
              :class="{ 'bg-slate-50': isWeekend(d) }"
            >
              <div v-if="dayLabel(d) === '1'" class="font-semibold text-slate-500">
                {{ monthLabel(d) }}
              </div>
              <div>{{ dayLabel(d) }}</div>
            </div>
          </div>
          <!-- 里程碑行 -->
          <div class="relative h-8 border-b border-slate-100">
            <span
              v-for="m in project?.milestones ?? []"
              :key="m.id"
              class="absolute top-1 -translate-x-1/2 text-sm"
              :style="{ left: `${offsetDays(m.dueDate) * DAY_WIDTH + DAY_WIDTH / 2}px` }"
              :title="`${m.name}（${m.dueDate.slice(0, 10)}）`"
            >
              🚩
            </span>
          </div>
          <!-- 任务条 -->
          <div
            v-for="t in scheduledTasks"
            :key="t.id"
            class="relative h-9 border-b border-slate-50"
          >
            <div
              class="absolute top-2 h-5 rounded"
              :class="barClass(t)"
              :style="{ left: `${barLeft(t)}px`, width: `${barWidth(t)}px` }"
              :title="`${t.title}：${t.plannedStart!.slice(0, 10)} ~ ${t.plannedEnd!.slice(0, 10)}`"
            ></div>
          </div>
          <!-- 今日线 -->
          <div
            v-if="todayOffset >= 0 && todayOffset < days.length"
            class="pointer-events-none absolute bottom-0 top-0 border-l-2 border-rose-400"
            :style="{ left: `${todayOffset * DAY_WIDTH + DAY_WIDTH / 2}px` }"
          ></div>
        </div>
      </div>
      <!-- 图例 -->
      <div class="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span><span class="mr-1 inline-block h-3 w-3 rounded bg-indigo-500"></span>Epic</span>
        <span><span class="mr-1 inline-block h-3 w-3 rounded bg-blue-400"></span>Story</span>
        <span><span class="mr-1 inline-block h-3 w-3 rounded bg-emerald-400"></span>Task</span>
        <span
          ><span class="mr-1 inline-block h-3 w-3 rounded ring-2 ring-rose-500"></span
          >关键路径</span
        >
        <span>🚩 里程碑</span>
        <span><span class="mr-1 inline-block h-3 border-l-2 border-rose-400"></span>今天</span>
      </div>
    </div>

    <!-- 未排期任务 -->
    <div v-if="unscheduledTasks.length > 0" class="rounded-xl border border-slate-200 bg-white p-5">
      <h3 class="text-sm font-semibold text-slate-600">
        未排期任务（{{ unscheduledTasks.length }}）
      </h3>
      <p class="mt-1 text-xs text-slate-400">点击上方「自动排期」按依赖与工期生成计划日期</p>
      <ul class="mt-2 flex flex-wrap gap-2">
        <li
          v-for="t in unscheduledTasks"
          :key="t.id"
          class="rounded-lg bg-slate-50 px-3 py-1 text-xs text-slate-600"
        >
          {{ t.title }}
        </li>
      </ul>
    </div>

    <!-- 空状态 -->
    <div
      v-if="scheduledTasks.length === 0 && unscheduledTasks.length === 0"
      class="flex min-h-60 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white"
    >
      <p class="max-w-sm text-center text-sm text-slate-400">
        该项目暂无任务。可先在任务管理页创建，或在 AI 助手页生成计划并审批入库
      </p>
    </div>
  </div>
</template>
