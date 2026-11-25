import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiGet } from '@/api/client';

interface HealthResult {
  status: string;
  database: string;
  timestamp: string;
}

// 应用级状态：后端健康探测
export const useAppStore = defineStore('app', () => {
  const health = ref<HealthResult | null>(null);
  const healthError = ref<string | null>(null);
  const checking = ref(false);

  async function checkHealth(): Promise<void> {
    checking.value = true;
    healthError.value = null;
    try {
      health.value = await apiGet<HealthResult>('/health');
    } catch (err) {
      health.value = null;
      healthError.value = err instanceof Error ? err.message : '未知错误';
    } finally {
      checking.value = false;
    }
  }

  return { health, healthError, checking, checkHealth };
});
