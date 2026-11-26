import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ALLOW_SSE_TICKET_KEY, IS_PUBLIC_KEY } from './decorators';
import { JwtAuthGuard } from './jwt-auth.guard';

interface FakeRequest {
  headers: Record<string, string | undefined>;
  query: Record<string, unknown>;
  user?: unknown;
}

function makeContext(request: FakeRequest) {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

describe('JwtAuthGuard', () => {
  const jwt = { verifyAsync: vi.fn() };
  const reflector = { getAllAndOverride: vi.fn() };
  const auth = {
    consumeSseTicket: vi.fn(),
    loadUser: vi.fn(),
  };
  const guard = new JwtAuthGuard(jwt as never, reflector as never, auth as never);

  beforeEach(() => {
    vi.clearAllMocks();
    reflector.getAllAndOverride.mockReturnValue(false);
  });

  it('@Public 接口直接放行', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => key === IS_PUBLIC_KEY);
    await expect(guard.canActivate(makeContext({ headers: {}, query: {} }))).resolves.toBe(true);
  });

  it('缺少 Authorization 头返回 401', async () => {
    await expect(guard.canActivate(makeContext({ headers: {}, query: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('合法 JWT 挂载当前用户', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'u1', email: 'u@x.local', isAdmin: false });
    const request: FakeRequest = {
      headers: { authorization: 'Bearer good-token' },
      query: {},
    };
    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(request.user).toEqual({ id: 'u1', email: 'u@x.local', isAdmin: false });
  });

  it('过期/伪造 JWT 返回 401', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('expired'));
    await expect(
      guard.canActivate(makeContext({ headers: { authorization: 'Bearer bad' }, query: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('SSE 接口可用一次性票据鉴权', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => key === ALLOW_SSE_TICKET_KEY);
    auth.consumeSseTicket.mockReturnValue('u1');
    auth.loadUser.mockResolvedValue({ id: 'u1', email: 'u@x.local', isAdmin: false });
    const request: FakeRequest = { headers: {}, query: { ticket: 't1' } };
    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(auth.consumeSseTicket).toHaveBeenCalledWith('t1');
    expect(request.user).toEqual({ id: 'u1', email: 'u@x.local', isAdmin: false });
  });

  it('无效票据返回 401', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => key === ALLOW_SSE_TICKET_KEY);
    auth.consumeSseTicket.mockReturnValue(null);
    await expect(
      guard.canActivate(makeContext({ headers: {}, query: { ticket: 'bad' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('未标记 SSE 的接口不接受票据（仍要求请求头）', async () => {
    await expect(
      guard.canActivate(makeContext({ headers: {}, query: { ticket: 't1' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(auth.consumeSseTicket).not.toHaveBeenCalled();
  });
});
