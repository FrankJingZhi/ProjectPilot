import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScheduleService } from './schedule.service';

const DAY = 24 * 60 * 60 * 1000;
const BASE = new Date('2026-11-25T00:00:00Z');

// 构造任务 fixture
function task(
  id: string,
  estimatedDays: number | null,
  deps: { dependsOnTaskId: string; type?: string }[] = [],
) {
  return {
    id,
    title: `任务${id}`,
    estimatedDays,
    status: 'TODO',
    dependencies: deps.map((d) => ({ type: 'FINISH_TO_START', ...d })),
  };
}

describe('ScheduleService', () => {
  const tx = { task: { update: vi.fn() } };
  const prisma = {
    project: { findUnique: vi.fn() },
    task: { findMany: vi.fn() },
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const service = new ScheduleService(prisma as never);

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.project.findUnique.mockResolvedValue({ id: 'p1', startDate: BASE });
  });

  it('项目不存在时抛 NotFoundException', async () => {
    prisma.project.findUnique.mockResolvedValue(null);
    await expect(service.reschedule('p1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('链式 FS 依赖：后置任务从前置结束日开始', async () => {
    prisma.task.findMany.mockResolvedValue([
      task('a', 2),
      task('b', 1, [{ dependsOnTaskId: 'a' }]),
    ]);
    const result = await service.reschedule('p1');
    const a = result.tasks.find((t) => t.id === 'a')!;
    const b = result.tasks.find((t) => t.id === 'b')!;
    expect(a.plannedStart.getTime()).toBe(BASE.getTime());
    expect(a.plannedEnd.getTime()).toBe(BASE.getTime() + 2 * DAY);
    expect(b.plannedStart.getTime()).toBe(a.plannedEnd.getTime());
    expect(b.plannedEnd.getTime()).toBe(BASE.getTime() + 3 * DAY);
    expect(result.projectEnd.getTime()).toBe(BASE.getTime() + 3 * DAY);
    // 链上两个任务都没有浮动时间，均为关键路径
    expect(a.critical).toBe(true);
    expect(b.critical).toBe(true);
  });

  it('无依赖任务并行排期，非关键任务有浮动时间', async () => {
    prisma.task.findMany.mockResolvedValue([task('a', 2), task('b', 1)]);
    const result = await service.reschedule('p1');
    const b = result.tasks.find((t) => t.id === 'b')!;
    expect(b.plannedStart.getTime()).toBe(BASE.getTime());
    expect(b.slackDays).toBe(1);
    expect(b.critical).toBe(false);
  });

  it('循环依赖时拒绝排期且不落库', async () => {
    prisma.task.findMany.mockResolvedValue([
      task('a', 1, [{ dependsOnTaskId: 'b' }]),
      task('b', 1, [{ dependsOnTaskId: 'a' }]),
    ]);
    await expect(service.reschedule('p1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('SS 依赖：后置任务与前置任务同时开始', async () => {
    prisma.task.findMany.mockResolvedValue([
      task('a', 2),
      task('b', 1, [{ dependsOnTaskId: 'a', type: 'START_TO_START' }]),
    ]);
    const result = await service.reschedule('p1');
    const b = result.tasks.find((t) => t.id === 'b')!;
    expect(b.plannedStart.getTime()).toBe(BASE.getTime());
  });

  it('FF 依赖：后置任务结束不早于前置结束', async () => {
    prisma.task.findMany.mockResolvedValue([
      task('a', 3),
      task('b', 1, [{ dependsOnTaskId: 'a', type: 'FINISH_TO_FINISH' }]),
    ]);
    const result = await service.reschedule('p1');
    const a = result.tasks.find((t) => t.id === 'a')!;
    const b = result.tasks.find((t) => t.id === 'b')!;
    expect(b.plannedEnd.getTime()).toBe(a.plannedEnd.getTime());
    expect(b.plannedStart.getTime()).toBe(a.plannedEnd.getTime() - DAY);
  });

  it('未填工期按 1 天估算', async () => {
    prisma.task.findMany.mockResolvedValue([task('a', null)]);
    const result = await service.reschedule('p1');
    expect(result.tasks[0].plannedEnd.getTime()).toBe(BASE.getTime() + DAY);
  });

  it('排期结果写回每个任务的计划起止日期', async () => {
    prisma.task.findMany.mockResolvedValue([task('a', 1)]);
    await service.reschedule('p1');
    expect(tx.task.update).toHaveBeenCalledWith({
      where: { id: 'a' },
      data: { plannedStart: BASE, plannedEnd: new Date(BASE.getTime() + DAY) },
    });
  });

  it('查询时排除已取消任务', async () => {
    prisma.task.findMany.mockResolvedValue([]);
    await service.reschedule('p1');
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: 'p1', status: { notIn: ['CANCELLED'] } },
      }),
    );
  });
});
