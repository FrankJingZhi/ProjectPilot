import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiGet, apiPost, getToken, setToken } from '@/api/client';
import type { AuthUser } from '@/api/types';

// 登录态：token 持久化在 localStorage，用户信息刷新后通过 /auth/me 恢复
export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(getToken());
  const user = ref<AuthUser | null>(null);

  async function login(email: string, password: string): Promise<void> {
    const result = await apiPost<{ token: string; user: AuthUser }>('/auth/login', {
      email,
      password,
    });
    token.value = result.token;
    setToken(result.token);
    user.value = result.user;
  }

  async function fetchMe(): Promise<void> {
    if (!token.value) return;
    try {
      user.value = await apiGet<AuthUser>('/auth/me');
    } catch {
      // 401 已由 client 统一跳转登录页，这里无需重复处理
    }
  }

  function logout(): void {
    token.value = null;
    user.value = null;
    setToken(null);
  }

  return { token, user, login, fetchMe, logout };
});
