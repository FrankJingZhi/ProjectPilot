<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { apiDelete, apiGet, apiPost } from '@/api/client';
import type { Project } from '@/api/types';
import { PROJECT_STATUS_LABELS } from '@/api/types';
import AppModal from '@/components/AppModal.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';

const projects = ref<Project[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);

// 新建项目表单
const createOpen = ref(false);
const saving = ref(false);
const formError = ref<string | null>(null);
const form = ref({ name: '', description: '', targetEndDate: '' });

// 删除确认
const deleteTarget = ref<Project | null>(null);
const deleting = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    projects.value = await apiGet<Project[]>('/projects');
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

async function createProject(): Promise<void> {
  saving.value = true;
  formError.value = null;
  try {
    await apiPost('/projects', {
      name: form.value.name,
      description: form.value.description || undefined,
      targetEndDate: form.value.targetEndDate || undefined,
    });
    createOpen.value = false;
    form.value = { name: '', description: '', targetEndDate: '' };
    await load();
  } catch (err) {
    formError.value = err instanceof Error ? err.message : '创建失败';
  } finally {
    saving.value = false;
  }
}

async function confirmDelete(): Promise<void> {
  if (!deleteTarget.value) return;
  deleting.value = true;
  try {
    await apiDelete(`/projects/${deleteTarget.value.id}`);
    deleteTarget.value = null;
    await load();
  } finally {
    deleting.value = false;
  }
}

function formatDate(value: string | null): string {
  return value ? value.slice(0, 10) : '—';
}

onMounted(load);
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <p class="text-sm text-slate-500">共 {{ projects.length }} 个项目</p>
      <button
        class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        @click="createOpen = true"
      >
        ＋ 新建项目
      </button>
    </div>

    <p v-if="loadError" class="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">
      {{ loadError }}
    </p>
    <p v-if="loading" class="text-sm text-slate-400">加载中…</p>

    <!-- 空状态 -->
    <div
      v-if="!loading && projects.length === 0"
      class="flex min-h-60 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white"
    >
      <div class="text-center">
        <div class="text-lg font-semibold text-slate-600">还没有项目</div>
        <p class="mt-2 text-sm text-slate-400">
          点击右上角「新建项目」开始，第 4 步起可交给 AI 助手自动规划
        </p>
      </div>
    </div>

    <!-- 项目卡片 -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <div
        v-for="project in projects"
        :key="project.id"
        class="flex flex-col rounded-xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md"
      >
        <div class="flex items-start justify-between gap-2">
          <RouterLink
            :to="`/projects/${project.id}`"
            class="text-base font-semibold text-slate-800 hover:text-blue-600"
          >
            {{ project.name }}
          </RouterLink>
          <span class="shrink-0 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs text-blue-600">
            {{ PROJECT_STATUS_LABELS[project.status] }}
          </span>
        </div>
        <p class="mt-2 line-clamp-2 min-h-10 text-sm text-slate-500">
          {{ project.description || '暂无描述' }}
        </p>
        <div class="mt-4 flex items-center justify-between text-xs text-slate-400">
          <span>任务 {{ project._count?.tasks ?? 0 }} 个</span>
          <span>目标 {{ formatDate(project.targetEndDate) }}</span>
        </div>
        <div class="mt-4 flex gap-2 border-t border-slate-100 pt-3">
          <RouterLink
            :to="`/projects/${project.id}`"
            class="rounded-lg border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-50"
          >
            打开
          </RouterLink>
          <button
            class="rounded-lg border border-rose-200 px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50"
            @click="deleteTarget = project"
          >
            删除
          </button>
        </div>
      </div>
    </div>

    <!-- 新建项目弹窗 -->
    <AppModal :open="createOpen" title="新建项目" @close="createOpen = false">
      <form class="space-y-4" @submit.prevent="createProject">
        <div>
          <label class="mb-1 block text-sm font-medium">项目名称 *</label>
          <input
            v-model="form.name"
            required
            maxlength="100"
            class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="例如：在线 Markdown 编辑器"
          />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium">项目描述</label>
          <textarea
            v-model="form.description"
            rows="3"
            maxlength="2000"
            class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="目标、技术栈、范围…"
          ></textarea>
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium">目标完成日期</label>
          <input
            v-model="form.targetEndDate"
            type="date"
            class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <p v-if="formError" class="text-sm text-rose-600">{{ formError }}</p>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50"
            @click="createOpen = false"
          >
            取消
          </button>
          <button
            type="submit"
            :disabled="saving || !form.name.trim()"
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {{ saving ? '创建中…' : '创建' }}
          </button>
        </div>
      </form>
    </AppModal>

    <!-- 删除确认 -->
    <ConfirmDialog
      :open="deleteTarget !== null"
      title="删除项目"
      :message="`确定删除项目「${deleteTarget?.name}」吗？其下所有任务、需求、里程碑将一并删除，不可恢复。`"
      :loading="deleting"
      @confirm="confirmDelete"
      @cancel="deleteTarget = null"
    />
  </div>
</template>
