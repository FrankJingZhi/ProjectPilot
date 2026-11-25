<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/client';
import type { Project, Task, TaskPriority, TaskStatus, TaskType } from '@/api/types';
import {
  PROJECT_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_TYPE_LABELS,
} from '@/api/types';
import AppModal from '@/components/AppModal.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import TaskKanban from '@/components/TaskKanban.vue';

const route = useRoute();
const projectId = route.params.id as string;

const project = ref<Project | null>(null);
const tasks = ref<Task[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const statusFilter = ref<TaskStatus | ''>('');
// 视图模式：列表 / 看板（支持 ?view=kanban 直达）
const viewMode = ref<'list' | 'kanban'>(route.query.view === 'kanban' ? 'kanban' : 'list');

// 任务表单（新建/编辑共用）
const taskModalOpen = ref(false);
const editingTask = ref<Task | null>(null);
const saving = ref(false);
const formError = ref<string | null>(null);
const emptyForm = {
  title: '',
  description: '',
  type: 'TASK' as TaskType,
  parentId: '',
  priority: 'P1' as TaskPriority,
  assigneeRole: '',
  estimatedDays: '',
  plannedStart: '',
  plannedEnd: '',
};
const form = ref({ ...emptyForm });

// 依赖编辑：id 为 null 表示本次新增；removedDeps 记录本次删除
interface DepItem {
  id: string | null;
  dependsOnTaskId: string;
  title: string;
}
const formDeps = ref<DepItem[]>([]);
const removedDeps = ref<string[]>([]);
const depToAdd = ref('');

// 删除确认
const deleteTarget = ref<Task | null>(null);
const deleting = ref(false);

const STATUS_OPTIONS = Object.keys(TASK_STATUS_LABELS) as TaskStatus[];
const TYPE_OPTIONS = Object.keys(TASK_TYPE_LABELS) as TaskType[];
const PRIORITY_OPTIONS = Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[];

// 可作为父任务的候选（Epic/Story，编辑时排除自身）
const parentOptions = computed(() =>
  tasks.value.filter((t) => t.type !== 'TASK' && t.id !== editingTask.value?.id),
);

// 可作为前置任务的候选（排除自身与已选）
const depCandidates = computed(() =>
  tasks.value.filter(
    (t) =>
      t.id !== editingTask.value?.id && !formDeps.value.some((d) => d.dependsOnTaskId === t.id),
  ),
);

// 表格行：无过滤时按层级 DFS 排序并计算缩进深度
interface Row {
  task: Task;
  depth: number;
}
const rows = computed<Row[]>(() => {
  if (statusFilter.value) {
    return tasks.value
      .filter((t) => t.status === statusFilter.value)
      .map((task) => ({ task, depth: 0 }));
  }
  const byParent = new Map<string | null, Task[]>();
  for (const task of tasks.value) {
    const key = task.parentId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(task);
  }
  const result: Row[] = [];
  const walk = (parentId: string | null, depth: number): void => {
    for (const task of byParent.get(parentId) ?? []) {
      result.push({ task, depth });
      walk(task.id, depth + 1);
    }
  };
  walk(null, 0);
  for (const task of tasks.value) {
    if (!result.some((r) => r.task.id === task.id)) {
      result.push({ task, depth: 0 });
    }
  }
  return result;
});

const stats = computed(() => {
  const total = tasks.value.length;
  const done = tasks.value.filter((t) => t.status === 'DONE').length;
  return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
});

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    const [p, t] = await Promise.all([
      apiGet<Project>(`/projects/${projectId}`),
      apiGet<Task[]>(`/projects/${projectId}/tasks`),
    ]);
    project.value = p;
    tasks.value = t;
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

function openCreate(): void {
  editingTask.value = null;
  form.value = { ...emptyForm };
  formDeps.value = [];
  removedDeps.value = [];
  depToAdd.value = '';
  formError.value = null;
  taskModalOpen.value = true;
}

async function openEdit(task: Task): Promise<void> {
  editingTask.value = task;
  form.value = {
    title: task.title,
    description: task.description ?? '',
    type: task.type,
    parentId: task.parentId ?? '',
    priority: task.priority,
    assigneeRole: task.assigneeRole ?? '',
    estimatedDays: task.estimatedDays != null ? String(task.estimatedDays) : '',
    plannedStart: task.plannedStart ? task.plannedStart.slice(0, 10) : '',
    plannedEnd: task.plannedEnd ? task.plannedEnd.slice(0, 10) : '',
  };
  formDeps.value = [];
  removedDeps.value = [];
  depToAdd.value = '';
  formError.value = null;
  taskModalOpen.value = true;
  // 拉取任务详情以获得完整依赖信息
  try {
    const detail = await apiGet<
      Task & {
        dependencies?: { id: string; dependsOnTaskId: string; dependsOnTask?: { title: string } }[];
      }
    >(`/projects/${projectId}/tasks/${task.id}`);
    formDeps.value = (detail.dependencies ?? []).map((d) => ({
      id: d.id,
      dependsOnTaskId: d.dependsOnTaskId,
      title: d.dependsOnTask?.title ?? d.dependsOnTaskId,
    }));
  } catch {
    // 依赖加载失败不阻塞编辑表单
  }
}

function addDep(): void {
  if (!depToAdd.value) return;
  const target = tasks.value.find((t) => t.id === depToAdd.value);
  formDeps.value.push({
    id: null,
    dependsOnTaskId: depToAdd.value,
    title: target?.title ?? depToAdd.value,
  });
  depToAdd.value = '';
}

function removeDep(index: number): void {
  const item = formDeps.value[index];
  if (item.id) removedDeps.value.push(item.id);
  formDeps.value.splice(index, 1);
}

async function saveTask(): Promise<void> {
  saving.value = true;
  formError.value = null;
  const payload = {
    title: form.value.title,
    description: form.value.description || undefined,
    type: form.value.type,
    parentId: form.value.parentId || null,
    priority: form.value.priority,
    assigneeRole: form.value.assigneeRole || undefined,
    estimatedDays: form.value.estimatedDays ? Number(form.value.estimatedDays) : undefined,
    plannedStart: form.value.plannedStart || undefined,
    plannedEnd: form.value.plannedEnd || undefined,
  };
  try {
    let taskId: string;
    if (editingTask.value) {
      taskId = editingTask.value.id;
      await apiPatch(`/projects/${projectId}/tasks/${taskId}`, payload);
    } else {
      const created = await apiPost<Task>(`/projects/${projectId}/tasks`, payload);
      taskId = created.id;
    }
    // 同步依赖：先删后增
    for (const depId of removedDeps.value) {
      await apiDelete(`/projects/${projectId}/tasks/${taskId}/dependencies/${depId}`);
    }
    for (const dep of formDeps.value.filter((d) => d.id === null)) {
      await apiPost(`/projects/${projectId}/tasks/${taskId}/dependencies`, {
        dependsOnTaskId: dep.dependsOnTaskId,
      });
    }
    taskModalOpen.value = false;
    await load();
  } catch (err) {
    formError.value = err instanceof Error ? err.message : '保存失败';
  } finally {
    saving.value = false;
  }
}

// 表格/看板内快捷切换状态
async function changeStatus(task: Task, status: TaskStatus): Promise<void> {
  try {
    await apiPatch(`/projects/${projectId}/tasks/${task.id}`, { status });
    await load();
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : '状态更新失败';
  }
}

async function confirmDelete(): Promise<void> {
  if (!deleteTarget.value) return;
  deleting.value = true;
  try {
    await apiDelete(`/projects/${projectId}/tasks/${deleteTarget.value.id}`);
    deleteTarget.value = null;
    await load();
  } finally {
    deleting.value = false;
  }
}

const statusClass: Record<TaskStatus, string> = {
  TODO: 'bg-slate-100 text-slate-600',
  IN_PROGRESS: 'bg-blue-50 text-blue-600',
  BLOCKED: 'bg-amber-50 text-amber-600',
  DONE: 'bg-emerald-50 text-emerald-600',
  CANCELLED: 'bg-slate-100 text-slate-400',
};
const typeClass: Record<TaskType, string> = {
  EPIC: 'bg-purple-50 text-purple-600',
  STORY: 'bg-sky-50 text-sky-600',
  TASK: 'bg-slate-100 text-slate-500',
};
const priorityClass: Record<TaskPriority, string> = {
  P0: 'text-rose-600',
  P1: 'text-amber-600',
  P2: 'text-slate-600',
  P3: 'text-slate-400',
};

onMounted(load);
</script>

<template>
  <div class="space-y-4">
    <RouterLink to="/projects" class="inline-block text-sm text-blue-600 hover:underline">
      ← 返回项目列表
    </RouterLink>

    <p v-if="loadError" class="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">
      {{ loadError }}
    </p>
    <p v-if="loading" class="text-sm text-slate-400">加载中…</p>

    <template v-if="project">
      <!-- 项目信息 -->
      <div class="rounded-xl border border-slate-200 bg-white p-5">
        <div class="flex flex-wrap items-center gap-3">
          <h2 class="text-lg font-semibold">{{ project.name }}</h2>
          <span class="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs text-blue-600">
            {{ PROJECT_STATUS_LABELS[project.status] }}
          </span>
        </div>
        <p class="mt-2 text-sm text-slate-500">{{ project.description || '暂无描述' }}</p>
        <div class="mt-4 flex flex-wrap items-center gap-6 text-sm text-slate-500">
          <span>任务 {{ stats.total }} 个</span>
          <span>已完成 {{ stats.done }} 个</span>
          <div class="flex items-center gap-2">
            <div class="h-2 w-32 overflow-hidden rounded-full bg-slate-100">
              <div class="h-full bg-emerald-500" :style="{ width: `${stats.percent}%` }"></div>
            </div>
            <span>{{ stats.percent }}%</span>
          </div>
        </div>
      </div>

      <!-- 工具栏：视图切换 + 过滤 + 新建 -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="flex overflow-hidden rounded-lg border border-slate-200 text-sm">
            <button
              class="px-3 py-2"
              :class="viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-white hover:bg-slate-50'"
              @click="viewMode = 'list'"
            >
              列表
            </button>
            <button
              class="px-3 py-2"
              :class="
                viewMode === 'kanban' ? 'bg-blue-600 text-white' : 'bg-white hover:bg-slate-50'
              "
              @click="viewMode = 'kanban'"
            >
              看板
            </button>
          </div>
          <select
            v-if="viewMode === 'list'"
            v-model="statusFilter"
            class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">全部状态</option>
            <option v-for="s in STATUS_OPTIONS" :key="s" :value="s">
              {{ TASK_STATUS_LABELS[s] }}
            </option>
          </select>
        </div>
        <button
          class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          @click="openCreate"
        >
          ＋ 新建任务
        </button>
      </div>

      <!-- 看板视图 -->
      <TaskKanban
        v-if="viewMode === 'kanban'"
        :tasks="tasks"
        @status-change="changeStatus"
        @edit="openEdit"
      />

      <!-- 列表视图 -->
      <div v-else class="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-100 text-left text-xs text-slate-400">
              <th class="px-4 py-3 font-medium">任务</th>
              <th class="px-4 py-3 font-medium">类型</th>
              <th class="px-4 py-3 font-medium">状态</th>
              <th class="px-4 py-3 font-medium">优先级</th>
              <th class="px-4 py-3 font-medium">负责角色</th>
              <th class="px-4 py-3 font-medium">工期(天)</th>
              <th class="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="rows.length === 0">
              <td colspan="7" class="px-4 py-10 text-center text-slate-400">
                暂无任务，点击「新建任务」添加
              </td>
            </tr>
            <tr
              v-for="{ task, depth } in rows"
              :key="task.id"
              class="border-b border-slate-50 hover:bg-slate-50/60"
            >
              <td class="px-4 py-3">
                <span
                  :style="{ paddingLeft: `${depth * 20}px` }"
                  class="inline-flex items-center gap-1.5"
                >
                  <span v-if="depth > 0" class="text-slate-300">└</span>
                  <span :class="{ 'text-slate-400 line-through': task.status === 'CANCELLED' }">
                    {{ task.title }}
                  </span>
                  <span
                    v-if="(task.dependencies?.length ?? 0) > 0"
                    class="rounded bg-slate-100 px-1.5 text-[10px] text-slate-500"
                    title="前置任务数量"
                  >
                    依赖 {{ task.dependencies!.length }}
                  </span>
                </span>
              </td>
              <td class="px-4 py-3">
                <span class="rounded px-2 py-0.5 text-xs" :class="typeClass[task.type]">
                  {{ TASK_TYPE_LABELS[task.type] }}
                </span>
              </td>
              <td class="px-4 py-3">
                <select
                  :value="task.status"
                  class="rounded px-2 py-1 text-xs focus:outline-none"
                  :class="statusClass[task.status]"
                  @change="
                    changeStatus(task, ($event.target as HTMLSelectElement).value as TaskStatus)
                  "
                >
                  <option v-for="s in STATUS_OPTIONS" :key="s" :value="s">
                    {{ TASK_STATUS_LABELS[s] }}
                  </option>
                </select>
              </td>
              <td class="px-4 py-3 text-xs font-medium" :class="priorityClass[task.priority]">
                {{ task.priority }}
              </td>
              <td class="px-4 py-3 text-slate-500">{{ task.assigneeRole || '—' }}</td>
              <td class="px-4 py-3 text-slate-500">{{ task.estimatedDays ?? '—' }}</td>
              <td class="px-4 py-3">
                <div class="flex gap-2">
                  <button class="text-xs text-blue-600 hover:underline" @click="openEdit(task)">
                    编辑
                  </button>
                  <button
                    class="text-xs text-rose-600 hover:underline"
                    @click="deleteTarget = task"
                  >
                    删除
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- 新建/编辑任务弹窗 -->
    <AppModal
      :open="taskModalOpen"
      :title="editingTask ? '编辑任务' : '新建任务'"
      @close="taskModalOpen = false"
    >
      <form class="space-y-4" @submit.prevent="saveTask">
        <div>
          <label class="mb-1 block text-sm font-medium">任务标题 *</label>
          <input
            v-model="form.title"
            required
            maxlength="200"
            class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="mb-1 block text-sm font-medium">类型</label>
            <select
              v-model="form.type"
              class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option v-for="t in TYPE_OPTIONS" :key="t" :value="t">
                {{ TASK_TYPE_LABELS[t] }}
              </option>
            </select>
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium">父任务</label>
            <select
              v-model="form.parentId"
              class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">无（顶层）</option>
              <option v-for="p in parentOptions" :key="p.id" :value="p.id">
                {{ TASK_TYPE_LABELS[p.type] }} · {{ p.title }}
              </option>
            </select>
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium">优先级</label>
            <select
              v-model="form.priority"
              class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option v-for="p in PRIORITY_OPTIONS" :key="p" :value="p">
                {{ TASK_PRIORITY_LABELS[p] }}
              </option>
            </select>
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium">负责角色</label>
            <input
              v-model="form.assigneeRole"
              maxlength="50"
              placeholder="前端 / 后端 / 测试…"
              class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium">估算工期(天)</label>
            <input
              v-model="form.estimatedDays"
              type="number"
              min="0"
              step="0.5"
              class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium">计划开始</label>
            <input
              v-model="form.plannedStart"
              type="date"
              class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium">计划结束</label>
            <input
              v-model="form.plannedEnd"
              type="date"
              class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium">任务描述</label>
          <textarea
            v-model="form.description"
            rows="3"
            maxlength="5000"
            class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          ></textarea>
        </div>

        <!-- 前置任务（依赖）管理 -->
        <div class="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
          <label class="mb-2 block text-sm font-medium">前置任务（本任务需等它们完成）</label>
          <ul v-if="formDeps.length > 0" class="mb-2 space-y-1">
            <li
              v-for="(dep, index) in formDeps"
              :key="dep.dependsOnTaskId"
              class="flex items-center justify-between rounded bg-white px-3 py-1.5 text-sm"
            >
              <span>{{ dep.title }}</span>
              <button
                type="button"
                class="text-xs text-rose-500 hover:underline"
                @click="removeDep(index)"
              >
                移除
              </button>
            </li>
          </ul>
          <p v-else class="mb-2 text-xs text-slate-400">暂无前置任务</p>
          <div class="flex gap-2">
            <select
              v-model="depToAdd"
              class="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">选择前置任务…</option>
              <option v-for="t in depCandidates" :key="t.id" :value="t.id">
                {{ TASK_TYPE_LABELS[t.type] }} · {{ t.title }}
              </option>
            </select>
            <button
              type="button"
              class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
              :disabled="!depToAdd"
              @click="addDep"
            >
              添加
            </button>
          </div>
        </div>

        <p v-if="formError" class="text-sm text-rose-600">{{ formError }}</p>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50"
            @click="taskModalOpen = false"
          >
            取消
          </button>
          <button
            type="submit"
            :disabled="saving || !form.title.trim()"
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </div>
      </form>
    </AppModal>

    <!-- 删除任务确认 -->
    <ConfirmDialog
      :open="deleteTarget !== null"
      title="删除任务"
      :message="`确定删除任务「${deleteTarget?.title}」吗？其子任务将提升为顶层任务。`"
      :loading="deleting"
      @confirm="confirmDelete"
      @cancel="deleteTarget = null"
    />
  </div>
</template>
