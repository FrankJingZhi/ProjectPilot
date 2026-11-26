import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;

// 排期结果中的单个任务
export interface ScheduledTask {
  id: string;
  title: string;
  plannedStart: Date;
  plannedEnd: Date;
  slackDays: number;
  critical: boolean;
}

export interface ScheduleResult {
  projectId: string;
  projectStart: Date;
  projectEnd: Date;
  tasks: ScheduledTask[];
}

// 自动排期：拓扑排序 + 依赖约束正向推算起止日期，反向推算浮动时间（关键路径）
@Injectable()
export class ScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async reschedule(projectId: string): Promise<ScheduleResult> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException(`项目不存在：${projectId}`);
    }
    const tasks = await this.prisma.task.findMany({
      where: { projectId, status: { notIn: ['CANCELLED'] } },
      include: { dependencies: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    // 归一化到 UTC 零点，避免时区造成日期漂移
    const base = this.toUtcDay(project.startDate ?? new Date());
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const durationOf = (t: (typeof tasks)[number]): number =>
      Math.max(1, Math.ceil(t.estimatedDays ?? 1));

    // Kahn 拓扑排序：前置任务先排；顺带检测循环依赖
    const indegree = new Map<string, number>();
    const successors = new Map<string, string[]>();
    for (const t of tasks) {
      const deps = t.dependencies.filter((d) => byId.has(d.dependsOnTaskId));
      indegree.set(t.id, deps.length);
      for (const d of deps) {
        const list = successors.get(d.dependsOnTaskId) ?? [];
        list.push(t.id);
        successors.set(d.dependsOnTaskId, list);
      }
    }
    const queue = tasks.filter((t) => indegree.get(t.id) === 0).map((t) => t.id);
    const order: string[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      order.push(id);
      for (const next of successors.get(id) ?? []) {
        const left = (indegree.get(next) ?? 0) - 1;
        indegree.set(next, left);
        if (left === 0) queue.push(next);
      }
    }
    if (order.length !== tasks.length) {
      throw new BadRequestException('任务依赖存在循环，无法排期');
    }

    // 正向推算：最早开始/结束
    const starts = new Map<string, Date>();
    const ends = new Map<string, Date>();
    for (const id of order) {
      const t = byId.get(id)!;
      const days = durationOf(t);
      let start = base;
      let ffFloor: Date | null = null;
      for (const d of t.dependencies) {
        const predStart = starts.get(d.dependsOnTaskId);
        const predEnd = ends.get(d.dependsOnTaskId);
        if (!predStart || !predEnd) continue;
        if (d.type === 'START_TO_START') {
          if (predStart > start) start = predStart;
        } else if (d.type === 'FINISH_TO_FINISH') {
          if (!ffFloor || predEnd > ffFloor) ffFloor = predEnd;
        } else if (predEnd > start) {
          // FINISH_TO_START（默认）：前置完成后才能开始
          start = predEnd;
        }
      }
      let end = new Date(start.getTime() + days * DAY_MS);
      if (ffFloor && ffFloor > end) {
        end = ffFloor;
        start = new Date(end.getTime() - days * DAY_MS);
      }
      starts.set(id, start);
      ends.set(id, end);
    }

    const projectEnd = new Date(
      Math.max(base.getTime(), ...[...ends.values()].map((d) => d.getTime())),
    );

    // 反向推算：最晚开始/结束与浮动时间（按 FS 约束近似，SS/FF 场景供参考）
    const latestStarts = new Map<string, Date>();
    const latestEnds = new Map<string, Date>();
    for (const id of [...order].reverse()) {
      const t = byId.get(id)!;
      const days = durationOf(t);
      let latestEnd = projectEnd;
      for (const next of successors.get(id) ?? []) {
        const nextLatestStart = latestStarts.get(next);
        if (nextLatestStart && nextLatestStart < latestEnd) latestEnd = nextLatestStart;
      }
      const latestStart = new Date(latestEnd.getTime() - days * DAY_MS);
      latestEnds.set(id, latestEnd);
      latestStarts.set(id, latestStart);
    }

    const scheduled: ScheduledTask[] = order.map((id) => {
      const t = byId.get(id)!;
      const start = starts.get(id)!;
      const slackDays = Math.round((latestStarts.get(id)!.getTime() - start.getTime()) / DAY_MS);
      return {
        id,
        title: t.title,
        plannedStart: start,
        plannedEnd: ends.get(id)!,
        slackDays,
        critical: slackDays === 0,
      };
    });

    // 落库：批量写回计划起止日期
    await this.prisma.$transaction(async (tx) => {
      for (const s of scheduled) {
        await tx.task.update({
          where: { id: s.id },
          data: { plannedStart: s.plannedStart, plannedEnd: s.plannedEnd },
        });
      }
    });

    return { projectId, projectStart: base, projectEnd, tasks: scheduled };
  }

  private toUtcDay(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
}
