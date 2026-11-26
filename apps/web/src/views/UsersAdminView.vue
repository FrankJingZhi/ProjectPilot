<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { apiGet, apiPatch, apiPost } from '@/api/client';
import type { ManagedUser } from '@/api/types';
import AppModal from '@/components/AppModal.vue';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const users = ref<ManagedUser[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const actionError = ref<string | null>(null);

// 开通账号表单
const createOpen = ref(false);
const createForm = ref({ name: '', email: '', password: '', isAdmin: false });
const createError = ref<string | null>(null);
const creating = ref(false);

// 重置密码
const resetTarget = ref<ManagedUser | null>(null);
const resetPasswordValue = ref('');
const resetError = ref<string | null>(null);
const resetting = ref(false);

const isAdmin = computed(() => auth.user?.isAdmin ?? false);

async function load(): Promise<void> {
  if (!isAdmin.value) {
    loading.value = false;
    return;
  }
  loading.value = true;
  loadError.value = null;
  try {
    users.value = await apiGet<ManagedUser[]>('/users');
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  if (!auth.user) {
    await auth.fetchMe();
  }
  await load();
});

function openCreate(): void {
  createForm.value = { name: '', email: '', password: '', isAdmin: false };
  createError.value = null;
  createOpen.value = true;
}

async function createUser(): Promise<void> {
  if (createForm.value.password.length < 8) {
    createError.value = '密码至少 8 位';
    return;
  }
  creating.value = true;
  createError.value = null;
  try {
    await apiPost('/users', { ...createForm.value, email: createForm.value.email.trim() });
    createOpen.value = false;
    await load();
  } catch (err) {
    createError.value = err instanceof Error ? err.message : '开通失败';
  } finally {
    creating.value = false;
  }
}

async function toggleDisabled(user: ManagedUser): Promise<void> {
  actionError.value = null;
  try {
    await apiPatch(`/users/${user.id}`, { disabled: !user.disabled });
    await load();
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : '操作失败';
  }
}

function openReset(user: ManagedUser): void {
  resetTarget.value = user;
  resetPasswordValue.value = '';
  resetError.value = null;
}

async function resetPassword(): Promise<void> {
  if (!resetTarget.value) return;
  if (resetPasswordValue.value.length < 8) {
    resetError.value = '密码至少 8 位';
    return;
  }
  resetting.value = true;
  resetError.value = null;
  try {
    await apiPatch(`/users/${resetTarget.value.id}`, { password: resetPasswordValue.value });
    resetTarget.value = null;
  } catch (err) {
    resetError.value = err instanceof Error ? err.message : '重置失败';
  } finally {
    resetting.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- 非管理员提示 -->
    <div
      v-if="!isAdmin && !loading"
      class="flex min-h-60 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white"
    >
      <p class="text-sm text-slate-400">仅系统管理员可访问用户管理</p>
    </div>

    <template v-else>
      <div class="flex items-center justify-between">
        <p class="text-sm text-slate-500">团队账号由管理员开通，不开放注册</p>
        <button
          class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          @click="openCreate"
        >
          ＋ 开通账号
        </button>
      </div>
      <p v-if="loadError" class="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">
        {{ loadError }}
      </p>
      <p v-if="actionError" class="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">
        {{ actionError }}
      </p>
      <p v-if="loading" class="text-sm text-slate-400">加载中…</p>

      <div v-if="!loading" class="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-100 text-left text-xs text-slate-400">
              <th class="px-4 py-3 font-medium">姓名</th>
              <th class="px-4 py-3 font-medium">邮箱</th>
              <th class="px-4 py-3 font-medium">身份</th>
              <th class="px-4 py-3 font-medium">状态</th>
              <th class="px-4 py-3 font-medium">创建时间</th>
              <th class="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="u in users"
              :key="u.id"
              class="border-b border-slate-50 hover:bg-slate-50/60"
            >
              <td class="px-4 py-3">{{ u.name }}</td>
              <td class="px-4 py-3 text-slate-500">{{ u.email }}</td>
              <td class="px-4 py-3">
                <span
                  class="rounded px-2 py-0.5 text-xs"
                  :class="u.isAdmin ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'"
                >
                  {{ u.isAdmin ? '系统管理员' : '普通用户' }}
                </span>
              </td>
              <td class="px-4 py-3">
                <span
                  class="rounded px-2 py-0.5 text-xs"
                  :class="
                    u.disabled ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
                  "
                >
                  {{ u.disabled ? '已禁用' : '正常' }}
                </span>
              </td>
              <td class="px-4 py-3 text-slate-500">{{ u.createdAt.slice(0, 10) }}</td>
              <td class="px-4 py-3">
                <div class="flex gap-2">
                  <button class="text-xs text-blue-600 hover:underline" @click="openReset(u)">
                    重置密码
                  </button>
                  <button
                    v-if="u.id !== auth.user?.id"
                    class="text-xs hover:underline"
                    :class="u.disabled ? 'text-emerald-600' : 'text-rose-600'"
                    @click="toggleDisabled(u)"
                  >
                    {{ u.disabled ? '启用' : '禁用' }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- 开通账号弹窗 -->
    <AppModal :open="createOpen" title="开通账号" @close="createOpen = false">
      <form class="space-y-4" @submit.prevent="createUser">
        <div>
          <label class="mb-1 block text-sm font-medium">姓名 *</label>
          <input
            v-model="createForm.name"
            required
            maxlength="50"
            class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium">邮箱 *</label>
          <input
            v-model="createForm.email"
            type="email"
            required
            class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium">初始密码 *（至少 8 位）</label>
          <input
            v-model="createForm.password"
            type="text"
            required
            minlength="8"
            class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <p class="mt-1 text-xs text-slate-400">请线下告知成员，成员登录后可由管理员重置</p>
        </div>
        <label class="flex items-center gap-2 text-sm">
          <input v-model="createForm.isAdmin" type="checkbox" class="rounded" />
          设为系统管理员
        </label>
        <p v-if="createError" class="text-sm text-rose-600">{{ createError }}</p>
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
            :disabled="creating"
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {{ creating ? '开通中…' : '开通' }}
          </button>
        </div>
      </form>
    </AppModal>

    <!-- 重置密码弹窗 -->
    <AppModal
      :open="resetTarget !== null"
      :title="`重置密码：${resetTarget?.name ?? ''}`"
      @close="resetTarget = null"
    >
      <form class="space-y-4" @submit.prevent="resetPassword">
        <div>
          <label class="mb-1 block text-sm font-medium">新密码（至少 8 位）</label>
          <input
            v-model="resetPasswordValue"
            type="text"
            required
            minlength="8"
            class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <p v-if="resetError" class="text-sm text-rose-600">{{ resetError }}</p>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50"
            @click="resetTarget = null"
          >
            取消
          </button>
          <button
            type="submit"
            :disabled="resetting"
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {{ resetting ? '重置中…' : '确认重置' }}
          </button>
        </div>
      </form>
    </AppModal>
  </div>
</template>
