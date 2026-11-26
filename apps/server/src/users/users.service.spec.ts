import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersService } from './users.service';

// 管理员用户管理逻辑（onModuleInit 不在单测范围）
describe('UsersService 用户管理', () => {
  const prisma = {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
  };
  const config = { get: vi.fn() };
  const service = new UsersService(prisma as never, config as never);

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'u-new', email: data.email, name: data.name }),
    );
    prisma.user.update.mockImplementation(({ data }) => Promise.resolve({ id: 'u2', ...data }));
  });

  it('开通账号：密码以 scrypt 哈希存储', async () => {
    await service.create({ email: 'a@x.local', name: '小A', password: 'pass1234' });
    const arg = prisma.user.create.mock.calls[0][0];
    expect(arg.data.passwordHash.startsWith('scrypt:')).toBe(true);
    expect(arg.data.isAdmin).toBe(false);
  });

  it('邮箱重复返回冲突', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'exists' });
    await expect(
      service.create({ email: 'a@x.local', name: '小A', password: 'pass1234' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('目标用户不存在抛 NotFoundException', async () => {
    await expect(service.update('missing', { name: 'x' }, 'admin-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('管理员不能禁用自己', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'admin-1' });
    await expect(service.update('admin-1', { disabled: true }, 'admin-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('管理员不能撤销自己的管理员权限', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'admin-1' });
    await expect(service.update('admin-1', { isAdmin: false }, 'admin-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('重置密码时重新哈希', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u2' });
    await service.update('u2', { password: 'newpass123' }, 'admin-1');
    const arg = prisma.user.update.mock.calls[0][0];
    expect(arg.data.passwordHash.startsWith('scrypt:')).toBe(true);
  });

  it('禁用他人账号成功', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u2' });
    await service.update('u2', { disabled: true }, 'admin-1');
    expect(prisma.user.update.mock.calls[0][0].data.disabled).toBe(true);
  });
});
