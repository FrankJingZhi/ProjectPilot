<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const email = ref('');
const password = ref('');
const errorMsg = ref<string | null>(null);
const submitting = ref(false);

async function submit(): Promise<void> {
  if (!email.value.trim() || !password.value) {
    errorMsg.value = '请输入邮箱和密码';
    return;
  }
  submitting.value = true;
  errorMsg.value = null;
  try {
    await auth.login(email.value.trim(), password.value);
    // 登录成功后回到原目标页面
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard';
    await router.replace(redirect);
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : '登录失败';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="flex h-full items-center justify-center bg-slate-100">
    <div class="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
      <div class="mb-6 text-center">
        <div class="text-3xl">🧭</div>
        <h1 class="mt-2 text-xl font-semibold text-slate-900">ProjectPilot</h1>
        <p class="mt-1 text-sm text-slate-500">AI 项目管理智能体 · 团队登录</p>
      </div>
      <form class="space-y-4" @submit.prevent="submit">
        <div>
          <label class="mb-1 block text-sm font-medium text-slate-700" for="email">邮箱</label>
          <input
            id="email"
            v-model="email"
            type="email"
            autocomplete="username"
            class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-slate-700" for="password">密码</label>
          <input
            id="password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="••••••••"
          />
        </div>
        <p v-if="errorMsg" class="text-sm text-red-600">{{ errorMsg }}</p>
        <button
          type="submit"
          :disabled="submitting"
          class="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
        >
          {{ submitting ? '登录中…' : '登录' }}
        </button>
      </form>
      <p class="mt-6 text-center text-xs text-slate-400">
        账号由管理员开通，忘记密码请联系管理员重置
      </p>
    </div>
  </div>
</template>
