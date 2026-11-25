// 统一 API 客户端：开发环境经 Vite 代理转发到后端
const BASE_URL = '/api';

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`请求失败：${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}
