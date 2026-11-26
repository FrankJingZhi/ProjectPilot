import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MembersService } from './members.service';

describe('MembersService', () => {
  const prisma = {
    project: { findUnique: vi.fn() },
    projectMember: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    task: { updateMany: vi.fn() },
  };
  const service = new MembersService(prisma as never);

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.project.findUnique.mockResolvedValue({ id: 'p1', ownerId: 'owner-1' });
    prisma.user.findUnique.mockResolvedValue({ id: 'u2', disabled: false });
    prisma.projectMember.findUnique.mockResolvedValue(null);
    prisma.projectMember.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'm1', ...data }),
    );
  });

  it('添加成员成功', async () => {
    const member = await service.add('p1', { userId: 'u2', role: 'MEMBER' });
    expect(member).toMatchObject({ projectId: 'p1', userId: 'u2', role: 'MEMBER' });
  });

  it('不能把拥有者再加为成员', async () => {
    await expect(service.add('p1', { userId: 'owner-1', role: 'MEMBER' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('被禁用的用户不能加入', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u2', disabled: true });
    await expect(service.add('p1', { userId: 'u2', role: 'MEMBER' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('重复添加返回冲突', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({ id: 'm1', role: 'MEMBER' });
    await expect(service.add('p1', { userId: 'u2', role: 'MEMBER' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('拥有者角色不可修改、不可移除', async () => {
    await expect(service.updateRole('p1', 'owner-1', { role: 'MEMBER' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.remove('p1', 'owner-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('修改非成员角色抛 NotFoundException', async () => {
    await expect(service.updateRole('p1', 'u2', { role: 'ADMIN' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('修改成员角色成功', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({ id: 'm1', role: 'MEMBER' });
    prisma.projectMember.update.mockResolvedValue({ id: 'm1', role: 'ADMIN' });
    await service.updateRole('p1', 'u2', { role: 'ADMIN' });
    expect(prisma.projectMember.update.mock.calls[0][0].data).toEqual({ role: 'ADMIN' });
  });

  it('移除成员成功', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({ id: 'm1', role: 'MEMBER' });
    prisma.projectMember.delete.mockResolvedValue({ id: 'm1' });
    await expect(service.remove('p1', 'u2')).resolves.toEqual({ deleted: true });
    // 名下任务同步取消指派
    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: { projectId: 'p1', assigneeId: 'u2' },
      data: { assigneeId: null },
    });
  });

  it('候选列表排除已有成员', async () => {
    prisma.projectMember.findMany.mockResolvedValue([{ userId: 'u2' }]);
    prisma.user.findMany.mockResolvedValue([]);
    await service.candidates('p1');
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
      disabled: false,
      id: { notIn: ['u2'] },
    });
  });
});
