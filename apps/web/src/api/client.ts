// 统一 API 客户端：开发环境经 Vite 代理转发到后端
const BASE_URL = '/api';

// 解析后端错误响应，抛出可读信息
async function parseError(res: Response): Promise<never> {
  let message = `请求失败：${res.status} ${res.statusText}`;
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (body.message) {
      message = Array.isArray(body.message) ? body.message.join('；') : body.message;
    }
  } catch {
    // 响应体非 JSON 时保留默认信息
  }
  throw new Error(message);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    await parseError(res);
  }
  return (await res.json()) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path);
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' });
}
