import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportService } from './report.service';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date();
const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

// 任务 fixture：默认未排期、待办
function task(partial: Record<string, unknown> = {}) {
  return {
    id: 't1',
    title: '任务',
    status: 'TODO',
    plannedStart: null,
    plannedEnd: null,
    dependencies: [],
    ...partial,
  };
}

describe('ReportService', () => {
  const prisma = {
    project: { findUnique: vi.fn() },
    task: { findMany: vi.fn() },
  };
  const service = new ReportService(prisma as never);

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.project.findUnique.mockResolvedValue({
      id: 'p1',
      targetEndDate: null,
      milestones: [],
    });
    prisma.task.findMany.mockResolvedValue([]);
  });

  it('项目不存在时抛 NotFoundException', async () => {
    prisma.project.findUnique.mockResolvedValue(null);
    await expect(service.analyze('p1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('已过计划结束日期且未完成的任务计为延期（HIGH）', async () => {
    prisma.task.findMany.mockResolvedValue([
      task({ plannedEnd: new Date(today - DAY) }),
      task({ id: 't2', status: 'DONE', plannedEnd: new Date(today - DAY) }),
    ]);
    const report = await service.analyze('p1');
    expect(report.summary.overdue).toBe(1);
    expect(report.risks.some((r) => r.level === 'HIGH' && r.category === '延期')).toBe(true);
  });

  it('前置任务未完成时计为阻塞（MEDIUM）', async () => {
    prisma.task.findMany.mockResolvedValue([
      task({
        dependencies: [{ dependsOnTask: { id: 'p', title: '前置', status: 'IN_PROGRESS' } }],
      }),
    ]);
    const report = await service.analyze('p1');
    expect(report.summary.blocked).toBe(1);
    expect(report.risks.some((r) => r.category === '阻塞')).toBe(true);
  });

  it('逾期里程碑为 HIGH，7 天内到期为 MEDIUM', async () => {
    prisma.project.findUnique.mockResolvedValue({
      id: 'p1',
      targetEndDate: null,
      milestones: [
        { name: 'M1', status: 'PENDING', dueDate: new Date(today - DAY) },
        { name: 'M2', status: 'PENDING', dueDate: new Date(today + 3 * DAY) },
        { name: 'M3', status: 'COMPLETED', dueDate: new Date(today - DAY) },
      ],
    });
    const report = await service.analyze('p1');
    const m1 = report.risks.find((r) => r.message.includes('M1'))!;
    const m2 = report.risks.find((r) => r.message.includes('M2'))!;
    expect(m1.level).toBe('HIGH');
    expect(m2.level).toBe('MEDIUM');
    expect(report.risks.some((r) => r.message.includes('M3'))).toBe(false);
  });

  it('排期结束晚于目标日期时提示延期风险', async () => {
    prisma.project.findUnique.mockResolvedValue({
      id: 'p1',
      targetEndDate: new Date(today + DAY),
      milestones: [],
    });
    prisma.task.findMany.mockResolvedValue([task({ plannedEnd: new Date(today + 5 * DAY) })]);
    const report = await service.analyze('p1');
    expect(report.risks.some((r) => r.category === '目标' && r.level === 'HIGH')).toBe(true);
  });

  it('未排期任务提示 LOW 风险', async () => {
    prisma.task.findMany.mockResolvedValue([task()]);
    const report = await service.analyze('p1');
    expect(report.summary.unscheduled).toBe(1);
    expect(report.risks.some((r) => r.level === 'LOW' && r.category === '排期')).toBe(true);
  });

  it('进度百分比按已完成任务计算', async () => {
    prisma.task.findMany.mockResolvedValue([
      task({ status: 'DONE' }),
      task({ id: 't2' }),
      task({ id: 't3' }),
      task({ id: 't4' }),
    ]);
    const report = await service.analyze('p1');
    expect(report.summary.progressPercent).toBe(25);
  });

  it('风险按 HIGH → MEDIUM → LOW 排序', async () => {
    prisma.task.findMany.mockResolvedValue([
      task({ plannedEnd: new Date(today - DAY) }),
      task({ id: 't2' }),
    ]);
    const report = await service.analyze('p1');
    const levels = report.risks.map((r) => r.level);
    const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    for (let i = 1; i < levels.length; i++) {
      expect(rank[levels[i]]).toBeGreaterThanOrEqual(rank[levels[i - 1]]);
    }
  });
});
