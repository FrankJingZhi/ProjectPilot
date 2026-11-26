import { UnauthorizedException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { hashPassword } from './password';

describe('AuthService', () => {
  const prisma = { user: { findUnique: vi.fn() } };
  const jwt = { signAsync: vi.fn().mockResolvedValue('signed-token') };
  const service = new AuthService(prisma as never, jwt as never);

  beforeEach(() => {
    vi.clearAllMocks();
    jwt.signAsync.mockResolvedValue('signed-token');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('login', () => {
    it('密码正确时返回 token 与用户信息', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'u@x.local',
        name: '用户',
        isAdmin: false,
        disabled: false,
        passwordHash: await hashPassword('pass123'),
      });
      const result = await service.login('u@x.local', 'pass123');
      expect(result.token).toBe('signed-token');
      expect(result.user).toEqual({ id: 'u1', email: 'u@x.local', name: '用户', isAdmin: false });
      expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 'u1', email: 'u@x.local', isAdmin: false });
    });

    it('密码错误 / 账号不存在 / 被禁用 / 未设密码统一拒绝', async () => {
      const hash = await hashPassword('pass123');
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'u@x.local',
        name: '用户',
        isAdmin: false,
        disabled: false,
        passwordHash: hash,
      });
      await expect(service.login('u@x.local', 'bad')).rejects.toBeInstanceOf(UnauthorizedException);
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login('u@x.local', 'pass123')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'u@x.local',
        name: '用户',
        isAdmin: false,
        disabled: true,
        passwordHash: hash,
      });
      await expect(service.login('u@x.local', 'pass123')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'u@x.local',
        name: '用户',
        isAdmin: false,
        disabled: false,
        passwordHash: '',
      });
      await expect(service.login('u@x.local', 'pass123')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('SSE 票据', () => {
    it('票据一次性使用：第二次核销返回 null', () => {
      const { ticket } = service.createSseTicket('u1');
      expect(service.consumeSseTicket(ticket)).toBe('u1');
      expect(service.consumeSseTicket(ticket)).toBeNull();
    });

    it('超过 60 秒的票据失效', () => {
      vi.useFakeTimers();
      const { ticket } = service.createSseTicket('u1');
      vi.advanceTimersByTime(61_000);
      expect(service.consumeSseTicket(ticket)).toBeNull();
    });

    it('不存在的票据返回 null', () => {
      expect(service.consumeSseTicket('nope')).toBeNull();
    });
  });
});
