import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TasksService } from './tasks.service';

// 任务指派相关用例：指派人必须是项目成员
describe('TasksService 指派', () => {
  const prisma = {
    project: { findUnique: vi.fn() },
    projectMember: { findUnique: vi.fn() },
    task: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  };
  const service = new TasksService(prisma as never);

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.project.findUnique.mockResolvedValue({ id: 'p1' });
    prisma.projectMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
    prisma.task.create.mockImplementation(({ data }) => Promise.resolve({ id: 't1', ...data }));
    prisma.task.findFirst.mockResolvedValue({
      id: 't1',
      projectId: 'p1',
      parentId: null,
      type: 'TASK',
    });
    prisma.task.update.mockImplementation(({ data }) => Promise.resolve({ id: 't1', ...data }));
  });

  it('创建时可指派项目成员', async () => {
    const task = await service.create('p1', { title: '任务', assigneeId: 'u2' });
    expect(task.assigneeId).toBe('u2');
  });

  it('指派非项目成员被拒绝', async () => {
    prisma.projectMember.findUnique.mockResolvedValue(null);
    await expect(
      service.create('p1', { title: '任务', assigneeId: 'outsider' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('更新时指派成员使用 connect', async () => {
    await service.update('p1', 't1', { assigneeId: 'u2' });
    const arg = prisma.task.update.mock.calls[0][0];
    expect(arg.data.assignee).toEqual({ connect: { id: 'u2' } });
  });

  it('更新时传 null 取消指派', async () => {
    await service.update('p1', 't1', { assigneeId: null });
    const arg = prisma.task.update.mock.calls[0][0];
    expect(arg.data.assignee).toEqual({ disconnect: true });
  });

  it('未传 assigneeId 时不改动指派', async () => {
    await service.update('p1', 't1', { title: '改名' });
    const arg = prisma.task.update.mock.calls[0][0];
    expect(arg.data.assignee).toBeUndefined();
  });

  it('列表支持按指派人过滤', async () => {
    prisma.task.findMany.mockResolvedValue([]);
    await service.findAll('p1', { assigneeId: 'u2' });
    expect(prisma.task.findMany.mock.calls[0][0].where.assigneeId).toBe('u2');
  });
});
