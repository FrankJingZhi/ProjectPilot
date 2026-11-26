import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;

export type RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface RiskItem {
  level: RiskLevel;
  category: '延期' | '阻塞' | '里程碑' | '目标' | '排期';
  message: string;
}

export interface RiskReport {
  projectId: string;
  generatedAt: Date;
  summary: {
    total: number;
    done: number;
    inProgress: number;
    blocked: number;
    overdue: number;
    unscheduled: number;
    progressPercent: number;
  };
  risks: RiskItem[];
}

// 风险报告：基于真实任务/里程碑状态的确定性规则分析（不依赖 LLM）
@Injectable()
export class ReportService {
  constructor(private readonly prisma: PrismaService) {}

  async analyze(projectId: string): Promise<RiskReport> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { milestones: { orderBy: { dueDate: 'asc' } } },
    });
    if (!project) {
      throw new NotFoundException(`项目不存在：${projectId}`);
    }
    const tasks = await this.prisma.task.findMany({
      where: { projectId, status: { notIn: ['CANCELLED'] } },
      include: {
        dependencies: {
          include: { dependsOnTask: { select: { id: true, title: true, status: true } } },
        },
      },
    });

    const today = this.utcToday();
    const active = tasks.filter((t) => t.status !== 'DONE');
    const done = tasks.length - active.length;
    const overdue = active.filter((t) => t.plannedEnd && t.plannedEnd.getTime() < today);
    const blocked = active.filter(
      (t) =>
        t.status === 'BLOCKED' ||
        (t.status === 'TODO' &&
          t.dependencies.some(
            (d) => d.dependsOnTask.status !== 'DONE' && d.dependsOnTask.status !== 'CANCELLED',
          )),
    );
    const unscheduled = active.filter((t) => !t.plannedStart);

    const risks: RiskItem[] = [];

    // 目标日期风险：排期结束晚于目标，或项目已整体超期
    const maxEnd = tasks.reduce<number>(
      (max, t) => (t.plannedEnd && t.plannedEnd.getTime() > max ? t.plannedEnd.getTime() : max),
      0,
    );
    if (project.targetEndDate) {
      const target = project.targetEndDate.getTime();
      if (maxEnd > target) {
        risks.push({
          level: 'HIGH',
          category: '目标',
          message: `排期结束日期晚于目标完成日期 ${project.targetEndDate.toISOString().slice(0, 10)}，预计延期`,
        });
      } else if (target < today && done < tasks.length) {
        risks.push({
          level: 'HIGH',
          category: '目标',
          message: '项目已超过目标完成日期但仍有未完成任务',
        });
      }
    }

    // 任务延期
    if (overdue.length > 0) {
      risks.push({
        level: 'HIGH',
        category: '延期',
        message: `${overdue.length} 个任务已过计划结束日期仍未完成：${overdue
          .slice(0, 3)
          .map((t) => t.title)
          .join('、')}${overdue.length > 3 ? ' 等' : ''}`,
      });
    }

    // 里程碑风险
    for (const m of project.milestones) {
      if (m.status !== 'PENDING') continue;
      const due = m.dueDate.getTime();
      if (due < today) {
        risks.push({
          level: 'HIGH',
          category: '里程碑',
          message: `里程碑「${m.name}」已逾期（${m.dueDate.toISOString().slice(0, 10)}）`,
        });
      } else if (due - today <= 7 * DAY_MS) {
        risks.push({
          level: 'MEDIUM',
          category: '里程碑',
          message: `里程碑「${m.name}」将在 7 天内到期（${m.dueDate.toISOString().slice(0, 10)}），请确认相关任务进度`,
        });
      }
    }

    // 阻塞
    if (blocked.length > 0) {
      risks.push({
        level: 'MEDIUM',
        category: '阻塞',
        message: `${blocked.length} 个任务被阻塞或前置任务未完成：${blocked
          .slice(0, 3)
          .map((t) => t.title)
          .join('、')}${blocked.length > 3 ? ' 等' : ''}`,
      });
    }

    // 未排期
    if (unscheduled.length > 0) {
      risks.push({
        level: 'LOW',
        category: '排期',
        message: `${unscheduled.length} 个任务尚未排期，建议在项目计划页执行自动排期`,
      });
    }

    const order: Record<RiskLevel, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    risks.sort((a, b) => order[a.level] - order[b.level]);

    return {
      projectId,
      generatedAt: new Date(),
      summary: {
        total: tasks.length,
        done,
        inProgress: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
        blocked: blocked.length,
        overdue: overdue.length,
        unscheduled: unscheduled.length,
        progressPercent: tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0,
      },
      risks,
    };
  }

  private utcToday(): number {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  }
}
