import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectsService } from './projects.service';

// 用 mocks 隔离数据库，单测只验证业务逻辑
describe('ProjectsService', () => {
  const prisma = {
    project: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  const service = new ProjectsService(prisma as never);
  const normalUser = { id: 'user-1', email: 'u@x.local', isAdmin: false };
  const adminUser = { id: 'admin-1', email: 'a@x.local', isAdmin: true };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('创建项目时当前用户成为 OWNER', async () => {
    prisma.project.create.mockImplementation(({ data }) => Promise.resolve({ id: 'p1', ...data }));
    await service.create({ name: '测试项目' }, 'user-1');
    const arg = prisma.project.create.mock.calls[0][0];
    expect(arg.data.ownerId).toBe('user-1');
    expect(arg.data.members.create).toEqual({ userId: 'user-1', role: 'OWNER' });
  });

  it('普通用户列表只查自己拥有或参与的项目', async () => {
    prisma.project.findMany.mockResolvedValue([]);
    await service.findAll(normalUser);
    expect(prisma.project.findMany.mock.calls[0][0].where).toEqual({
      OR: [{ ownerId: 'user-1' }, { members: { some: { userId: 'user-1' } } }],
    });
  });

  it('系统管理员列表不加归属过滤', async () => {
    prisma.project.findMany.mockResolvedValue([]);
    await service.findAll(adminUser);
    expect(prisma.project.findMany.mock.calls[0][0].where).toBeUndefined();
  });

  it('项目不存在时抛出 NotFoundException', async () => {
    prisma.project.findUnique.mockResolvedValue(null);
    await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('更新前先确认项目存在', async () => {
    prisma.project.findUnique.mockResolvedValue({ id: 'p1' });
    prisma.project.update.mockResolvedValue({ id: 'p1', name: '新名字' });
    await service.update('p1', { name: '新名字' });
    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p1' } }),
    );
  });

  it('删除项目返回 deleted 标记', async () => {
    prisma.project.findUnique.mockResolvedValue({ id: 'p1' });
    prisma.project.delete.mockResolvedValue({ id: 'p1' });
    await expect(service.remove('p1')).resolves.toEqual({ deleted: true });
  });
});
