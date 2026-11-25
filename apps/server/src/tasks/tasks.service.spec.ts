import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TasksService } from './tasks.service';

describe('TasksService', () => {
  const prisma = {
    project: { findUnique: vi.fn() },
    taskDependency: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    task: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  const service = new TasksService(prisma as never);

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.project.findUnique.mockResolvedValue({ id: 'p1' });
  });

  it('项目不存在时创建任务抛 NotFoundException', async () => {
    prisma.project.findUnique.mockResolvedValue(null);
    await expect(service.create('p1', { title: '任务' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('TASK 类型下不允许挂子任务', async () => {
    prisma.task.findFirst.mockResolvedValue({ id: 'parent', type: 'TASK', projectId: 'p1' });
    await expect(
      service.create('p1', { title: '子任务', parentId: 'parent' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('EPIC 下允许挂 STORY', async () => {
    prisma.task.findFirst.mockResolvedValue({ id: 'parent', type: 'EPIC', projectId: 'p1' });
    prisma.task.create.mockImplementation(({ data }) => Promise.resolve({ id: 't1', ...data }));
    const task = await service.create('p1', { title: '故事', type: 'STORY', parentId: 'parent' });
    expect(task.parentId).toBe('parent');
  });

  it('STORY 下不允许再挂 STORY', async () => {
    prisma.task.findFirst.mockResolvedValue({ id: 'parent', type: 'STORY', projectId: 'p1' });
    await expect(
      service.create('p1', { title: '子故事', type: 'STORY', parentId: 'parent' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('任务不能作为自己的父任务', async () => {
    prisma.task.findFirst.mockResolvedValue({
      id: 't1',
      projectId: 'p1',
      type: 'TASK',
      parentId: null,
    });
    await expect(service.update('p1', 't1', { parentId: 't1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('挂载到自身后代下会形成循环，应拒绝', async () => {
    // t1 想挂到 t2 下，但 t2 的父任务是 t1
    prisma.task.findFirst.mockImplementation(({ where, select }) => {
      if (select?.parentId) {
        return Promise.resolve({ parentId: 't1' }); // t2 的父任务是 t1
      }
      if (where.id === 't1') {
        return Promise.resolve({ id: 't1', projectId: 'p1', type: 'TASK', parentId: null });
      }
      return Promise.resolve({ id: where.id, projectId: 'p1', type: 'EPIC', parentId: null });
    });
    await expect(service.update('p1', 't1', { parentId: 't2' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('删除不存在的任务抛 NotFoundException', async () => {
    prisma.task.findFirst.mockResolvedValue(null);
    await expect(service.remove('p1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('任务不能依赖自己', async () => {
    prisma.task.findFirst.mockResolvedValue({
      id: 't1',
      projectId: 'p1',
      type: 'TASK',
      parentId: null,
    });
    await expect(service.addDependency('p1', 't1', 't1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('重复依赖应被拒绝', async () => {
    prisma.task.findFirst.mockImplementation(({ where }) =>
      Promise.resolve({ id: where.id, projectId: 'p1', type: 'TASK', parentId: null }),
    );
    prisma.taskDependency.findUnique.mockResolvedValue({ id: 'dep-1' });
    await expect(service.addDependency('p1', 't1', 't2')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('循环依赖应被拒绝（t2 已依赖 t1，再让 t1 依赖 t2）', async () => {
    prisma.task.findFirst.mockImplementation(({ where }) =>
      Promise.resolve({ id: where.id, projectId: 'p1', type: 'TASK', parentId: null }),
    );
    prisma.taskDependency.findUnique.mockResolvedValue(null);
    // t2 的依赖链指向 t1
    prisma.taskDependency.findMany.mockImplementation(({ where }) =>
      Promise.resolve(where.taskId === 't2' ? [{ dependsOnTaskId: 't1' }] : []),
    );
    await expect(service.addDependency('p1', 't1', 't2')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('合法依赖创建成功', async () => {
    prisma.task.findFirst.mockImplementation(({ where }) =>
      Promise.resolve({ id: where.id, projectId: 'p1', type: 'TASK', parentId: null }),
    );
    prisma.taskDependency.findUnique.mockResolvedValue(null);
    prisma.taskDependency.findMany.mockResolvedValue([]);
    prisma.taskDependency.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'dep-new', ...data }),
    );
    const dep = await service.addDependency('p1', 't1', 't2');
    expect(dep.dependsOnTaskId).toBe('t2');
  });
});
