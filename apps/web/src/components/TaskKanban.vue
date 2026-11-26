<script setup lang="ts">
import { computed } from 'vue';
import type { Task, TaskStatus } from '@/api/types';
import { TASK_PRIORITY_LABELS, TASK_TYPE_LABELS } from '@/api/types';

// 看板：四列状态流转，原生 HTML5 拖拽
const props = defineProps<{ tasks: Task[] }>();
const emit = defineEmits<{
  statusChange: [task: Task, status: TaskStatus];
  edit: [task: Task];
}>();

const COLUMNS: { status: TaskStatus; label: string; accent: string }[] = [
  { status: 'TODO', label: '待办', accent: 'border-t-slate-400' },
  { status: 'IN_PROGRESS', label: '进行中', accent: 'border-t-blue-500' },
  { status: 'BLOCKED', label: '受阻', accent: 'border-t-amber-500' },
  { status: 'DONE', label: '已完成', accent: 'border-t-emerald-500' },
];

const columns = computed(() =>
  COLUMNS.map((col) => ({
    ...col,
    items: props.tasks.filter((t) => t.status === col.status && t.status !== 'CANCELLED'),
  })),
);

// 前置任务未完成 => 受阻提示
function blockedBy(task: Task): string[] {
  return (task.dependencies ?? [])
    .filter((d) => d.dependsOnTask && !['DONE', 'CANCELLED'].includes(d.dependsOnTask.status))
    .map((d) => d.dependsOnTask!.title);
}

const typeClass: Record<string, string> = {
  EPIC: 'bg-purple-50 text-purple-600',
  STORY: 'bg-sky-50 text-sky-600',
  TASK: 'bg-slate-100 text-slate-500',
};
const priorityClass: Record<string, string> = {
  P0: 'text-rose-600',
  P1: 'text-amber-600',
  P2: 'text-slate-500',
  P3: 'text-slate-400',
};

function onDragStart(event: DragEvent, task: Task): void {
  event.dataTransfer?.setData('text/plain', task.id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function onDrop(event: DragEvent, status: TaskStatus): void {
  const id = event.dataTransfer?.getData('text/plain');
  const task = props.tasks.find((t) => t.id === id);
  if (task && task.status !== status) {
    emit('statusChange', task, status);
  }
}
</script>

<template>
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
    <div
      v-for="col in columns"
      :key="col.status"
      class="flex min-h-60 flex-col rounded-xl border border-slate-200 border-t-4 bg-slate-50/70"
      :class="col.accent"
      @dragover.prevent
      @drop="onDrop($event, col.status)"
    >
      <div class="flex items-center justify-between px-3 py-2.5">
        <span class="text-sm font-semibold text-slate-600">{{ col.label }}</span>
        <span class="rounded-full bg-white px-2 py-0.5 text-xs text-slate-400">
          {{ col.items.length }}
        </span>
      </div>
      <div class="flex-1 space-y-2 px-2 pb-2">
        <div
          v-for="task in col.items"
          :key="task.id"
          draggable="true"
          class="cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow active:cursor-grabbing"
          @dragstart="onDragStart($event, task)"
          @dblclick="emit('edit', task)"
        >
          <div class="flex items-start justify-between gap-2">
            <span class="text-sm font-medium leading-snug">{{ task.title }}</span>
            <span class="shrink-0 rounded px-1.5 py-0.5 text-[10px]" :class="typeClass[task.type]">
              {{ TASK_TYPE_LABELS[task.type] }}
            </span>
          </div>
          <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
            <span class="font-medium" :class="priorityClass[task.priority]">
              {{ TASK_PRIORITY_LABELS[task.priority] }}
            </span>
            <span v-if="task.assignee" class="rounded bg-blue-50 px-1.5 text-blue-600">
              👤 {{ task.assignee.name }}
            </span>
            <span v-if="task.assigneeRole">{{ task.assigneeRole }}</span>
            <span v-if="task.estimatedDays != null">{{ task.estimatedDays }} 天</span>
          </div>
          <div
            v-if="blockedBy(task).length > 0"
            class="mt-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700"
            :title="blockedBy(task).join('、')"
          >
            ⚠ 被阻塞：{{ blockedBy(task).join('、') }}
          </div>
        </div>
        <p v-if="col.items.length === 0" class="px-1 py-6 text-center text-xs text-slate-300">
          拖拽任务到此列
        </p>
      </div>
    </div>
  </div>
</template>
