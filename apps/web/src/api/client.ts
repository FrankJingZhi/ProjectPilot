// 统一 API 客户端：开发环境经 Vite 代理转发到后端
const BASE_URL = '/api';
const TOKEN_KEY = 'pp_token';

// 登录凭证存取（localStorage：刷新页面后保持登录态）
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

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
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  // 登录失效：清凭证回登录页（登录接口本身的 401 交给表单提示）
  if (res.status === 401 && path !== '/auth/login') {
    setToken(null);
    window.location.assign('/login');
    throw new Error('登录已过期，请重新登录');
  }
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

// SSE 订阅地址：先换 60 秒一次性票据，长期 JWT 不进 URL
export async function apiSseUrl(path: string): Promise<string> {
  const { ticket } = await apiPost<{ ticket: string }>('/auth/sse-ticket', {});
  return `${BASE_URL}${path}?ticket=${encodeURIComponent(ticket)}`;
}
