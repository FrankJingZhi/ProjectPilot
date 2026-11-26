import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AgentEventsService } from './agent-events.service';
import { buildPlannerGraph, type AuditEntry } from './planner.graph';
import { validatePlan } from './plan-validator';
import type { ProjectPlan, RequirementAnalysis } from './schemas';

// 会话 state 字段结构（存于 agent_sessions.state）
interface SessionState {
  requirement: string;
  analysis?: RequirementAnalysis | null;
  plan?: ProjectPlan | null;
}

export interface PlanningResult {
  sessionId: string;
  status: 'WAITING_INPUT' | 'PLANNED';
  analysis: RequirementAnalysis | null;
  questions?: string[];
  plan?: ProjectPlan | null;
}

// 审批入库结果：真实写入的任务/依赖/里程碑数量
export interface ApproveResult {
  sessionId: string;
  status: 'COMPLETED';
  tasksCreated: number;
  dependenciesCreated: number;
  milestonesCreated: number;
}

@Injectable()
export class AgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly events: AgentEventsService,
  ) {}

  // 发起规划：创建会话 → 记录用户消息 → 运行工作流
  async startPlanning(
    projectId: string,
    requirement: string,
    userId: string,
  ): Promise<{ sessionId: string; status: 'ACTIVE' }> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { tasks: { select: { title: true, type: true, status: true } } },
    });
    if (!project) {
      throw new NotFoundException(`项目不存在：${projectId}`);
    }
    const session = await this.prisma.agentSession.create({
      data: {
        projectId,
        userId,
        title: requirement.slice(0, 50),
        status: 'ACTIVE',
      },
    });
    await this.addMessage(session.id, 'USER', requirement);
    // 异步执行工作流，进度与结果通过 SSE 推送，接口立即返回会话 ID
    void this.runGraph(session.id, requirement, this.buildContext(project));
    return { sessionId: session.id, status: 'ACTIVE' };
  }

  // 回答澄清问题：合并补充信息后重新运行工作流
  async reply(
    sessionId: string,
    answers: string,
  ): Promise<{ sessionId: string; status: 'ACTIVE' }> {
    const session = await this.prisma.agentSession.findUnique({
      where: { id: sessionId },
      include: {
        project: { include: { tasks: { select: { title: true, type: true, status: true } } } },
      },
    });
    if (!session) {
      throw new NotFoundException(`会话不存在：${sessionId}`);
    }
    if (session.status !== 'WAITING_INPUT') {
      throw new BadRequestException('该会话当前不在等待补充需求状态');
    }
    const state = (session.state ?? {}) as unknown as SessionState;
    const requirement = `${state.requirement ?? ''}\n\n用户补充信息：\n${answers}`;
    await this.addMessage(sessionId, 'USER', answers);
    await this.prisma.agentSession.update({
      where: { id: sessionId },
      data: { status: 'ACTIVE' },
    });
    void this.runGraph(sessionId, requirement, this.buildContext(session.project));
    return { sessionId, status: 'ACTIVE' };
  }

  // 会话列表
  listSessions(projectId: string) {
    return this.prisma.agentSession.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, status: true, createdAt: true, updatedAt: true },
    });
  }

  // 会话详情：消息 + 执行审计 + 状态快照
  async getSession(sessionId: string) {
    const session = await this.prisma.agentSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        executions: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!session) {
      throw new NotFoundException(`会话不存在：${sessionId}`);
    }
    return session;
  }

  // 审批通过：把计划提案写入真实任务/依赖/里程碑（事务保证原子性）
  async approvePlan(sessionId: string): Promise<ApproveResult> {
    const session = await this.prisma.agentSession.findUnique({
      where: { id: sessionId },
      include: { project: true },
    });
    if (!session) {
      throw new NotFoundException(`会话不存在：${sessionId}`);
    }
    if (session.status !== 'WAITING_APPROVAL') {
      throw new BadRequestException('该会话当前不在等待审批状态');
    }
    const state = (session.state ?? {}) as unknown as SessionState;
    const plan = state.plan;
    if (!plan) {
      throw new BadRequestException('会话中没有可入库的计划');
    }
    // 入库前再做一次硬校验，防止快照被篡改或规则升级后旧计划不合法
    const errors = validatePlan(plan);
    if (errors.length > 0) {
      const message = errors.join('；');
      await this.addExecution(sessionId, {
        toolName: 'apply_plan',
        input: { taskCount: plan.tasks.length },
        output: { errors },
        status: 'FAILED',
        error: message,
      });
      throw new BadRequestException(`计划校验未通过，已阻止入库：${message}`);
    }

    try {
      const summary = await this.prisma.$transaction(async (tx) => {
        // 1) 按下标顺序创建任务（校验器保证父先子后），记录下标 → 真实 ID 映射
        const idMap: string[] = [];
        for (const [i, t] of plan.tasks.entries()) {
          const created = await tx.task.create({
            data: {
              projectId: session.projectId,
              parentId: t.parentIndex !== null ? idMap[t.parentIndex] : null,
              title: t.title,
              description: t.description,
              type: t.type,
              priority: t.priority,
              assigneeRole: t.assigneeRole,
              estimatedDays: t.estimatedDays,
              sortOrder: i,
            },
          });
          idMap.push(created.id);
        }
        // 2) 依赖：下标转真实 ID，去重避免撞唯一约束
        const seen = new Set<string>();
        let dependenciesCreated = 0;
        for (const [i, t] of plan.tasks.entries()) {
          for (const d of t.dependsOnIndexes) {
            const key = `${i}:${d}`;
            if (seen.has(key)) continue;
            seen.add(key);
            await tx.taskDependency.create({
              data: { taskId: idMap[i], dependsOnTaskId: idMap[d] },
            });
            dependenciesCreated += 1;
          }
        }
        // 3) 里程碑：项目开始日期（未设置则今天）+ 偏移天数
        const base = session.project.startDate ?? new Date();
        for (const m of plan.milestones) {
          const dueDate = new Date(base);
          dueDate.setDate(dueDate.getDate() + m.offsetDays);
          await tx.milestone.create({
            data: {
              projectId: session.projectId,
              name: m.name,
              description: m.description,
              dueDate,
            },
          });
        }
        // 4) 需求存档：确认后的原始需求与分析结果
        await tx.requirement.create({
          data: {
            projectId: session.projectId,
            content: state.requirement,
            analysis: (state.analysis ?? undefined) as Prisma.InputJsonValue | undefined,
            status: 'CONFIRMED',
          },
        });
        // 5) 会话完成
        await tx.agentSession.update({
          where: { id: sessionId },
          data: { status: 'COMPLETED' },
        });
        return {
          tasksCreated: idMap.length,
          dependenciesCreated,
          milestonesCreated: plan.milestones.length,
        };
      });

      await this.addExecution(sessionId, {
        toolName: 'apply_plan',
        input: { taskCount: plan.tasks.length, milestoneCount: plan.milestones.length },
        output: summary,
        status: 'SUCCESS',
      });
      await this.addMessage(
        sessionId,
        'ASSISTANT',
        `计划已入库：${summary.tasksCreated} 个任务、${summary.dependenciesCreated} 条依赖、${summary.milestonesCreated} 个里程碑。`,
        summary,
      );
      return { sessionId, status: 'COMPLETED', ...summary };
    } catch (err) {
      // 事务已回滚，会话保持待审批，用户可修正后重试
      const message = err instanceof Error ? err.message : String(err);
      await this.addExecution(sessionId, {
        toolName: 'apply_plan',
        input: { taskCount: plan.tasks.length },
        status: 'FAILED',
        error: message,
      });
      await this.addMessage(sessionId, 'ASSISTANT', `计划入库失败：${message}`);
      throw new BadRequestException(`计划入库失败：${message}`);
    }
  }

  // 审批拒绝：不写入任何业务数据，会话终止并记录 REJECTED 审计
  async rejectPlan(sessionId: string): Promise<{ sessionId: string; status: 'FAILED' }> {
    const session = await this.prisma.agentSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException(`会话不存在：${sessionId}`);
    }
    if (session.status !== 'WAITING_APPROVAL') {
      throw new BadRequestException('该会话当前不在等待审批状态');
    }
    await this.prisma.agentSession.update({
      where: { id: sessionId },
      data: { status: 'FAILED' },
    });
    await this.addExecution(sessionId, {
      toolName: 'apply_plan',
      input: { rejected: true },
      status: 'REJECTED',
    });
    await this.addMessage(
      sessionId,
      'ASSISTANT',
      '计划已被拒绝，未写入任何任务。可修改需求后重新发起规划。',
    );
    return { sessionId, status: 'FAILED' };
  }

  // ==================== 内部实现 ====================

  private createModel(): ChatOpenAI {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        '尚未配置模型 API：请在 apps/server/.env 中填写 OPENAI_API_KEY（可选 OPENAI_BASE_URL / OPENAI_MODEL）',
      );
    }
    return new ChatOpenAI({
      apiKey,
      model: this.config.get<string>('OPENAI_MODEL', 'gpt-4o-mini'),
      temperature: 0.2,
      configuration: {
        baseURL: this.config.get<string>('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
      },
    });
  }

  private buildContext(project: {
    name: string;
    description: string | null;
    targetEndDate: Date | null;
    tasks: { title: string; type: string; status: string }[];
  }): string {
    const lines = [
      `项目名称：${project.name}`,
      `项目描述：${project.description ?? '无'}`,
      `目标完成日期：${project.targetEndDate ? project.targetEndDate.toISOString().slice(0, 10) : '未定'}`,
    ];
    if (project.tasks.length > 0) {
      lines.push(
        `已有任务：${project.tasks.map((t) => `${t.title}(${t.type}/${t.status})`).join('、')}`,
      );
    }
    return lines.join('\n');
  }

  private async runGraph(
    sessionId: string,
    requirement: string,
    projectContext: string,
  ): Promise<void> {
    // 开启本轮 SSE 通道；审计回调同时落库并推送节点进度
    this.events.begin(sessionId);
    const audit = async (entry: AuditEntry): Promise<void> => {
      await this.addExecution(sessionId, entry);
      this.events.publish(sessionId, {
        type: 'node',
        toolName: entry.toolName,
        status: entry.status,
      });
    };

    try {
      const model = this.createModel();
      const graph = buildPlannerGraph(model, audit);
      const result = await graph.invoke({ requirement, projectContext });
      const analysis = result.analysis ?? null;

      // 需求不完整：进入等待补充状态
      if (!analysis?.complete) {
        const questions = analysis?.questions ?? [];
        const state: SessionState = { requirement, analysis };
        await this.prisma.agentSession.update({
          where: { id: sessionId },
          data: { status: 'WAITING_INPUT', state: state as unknown as Prisma.InputJsonValue },
        });
        await this.addMessage(
          sessionId,
          'ASSISTANT',
          `需求还需要澄清以下问题：\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`,
        );
        this.events.publish(sessionId, {
          type: 'result',
          result: { sessionId, status: 'WAITING_INPUT', analysis, questions },
        });
        return;
      }

      // 计划生成完毕：保存提案并等待人工审批（审批通过后才写入真实任务）
      const plan = result.plan ?? null;
      const state: SessionState = { requirement, analysis, plan };
      await this.prisma.agentSession.update({
        where: { id: sessionId },
        data: { status: 'WAITING_APPROVAL', state: state as unknown as Prisma.InputJsonValue },
      });
      await this.addMessage(
        sessionId,
        'ASSISTANT',
        `已生成开发计划：${plan?.tasks.length ?? 0} 个任务、${plan?.milestones.length ?? 0} 个里程碑。等待用户审批后入库。`,
        { plan },
      );
      this.events.publish(sessionId, {
        type: 'result',
        result: { sessionId, status: 'PLANNED', analysis, plan },
      });
    } catch (err) {
      // 异步执行：错误不再抛给 HTTP，而是落库并通过 SSE 推送
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.agentSession.update({
        where: { id: sessionId },
        data: { status: 'FAILED' },
      });
      await this.addMessage(sessionId, 'ASSISTANT', `规划失败：${message}`);
      this.events.publish(sessionId, { type: 'error', message });
    } finally {
      this.events.complete(sessionId);
    }
  }

  // 统一写入执行审计（工作流节点与审批动作共用）
  private async addExecution(sessionId: string, entry: AuditEntry): Promise<void> {
    await this.prisma.agentExecution.create({
      data: {
        sessionId,
        toolName: entry.toolName,
        input: entry.input as Prisma.InputJsonValue,
        output: (entry.output ?? undefined) as Prisma.InputJsonValue | undefined,
        status: entry.status,
        error: entry.error,
        startedAt: new Date(),
        finishedAt: new Date(),
      },
    });
  }

  private async addMessage(
    sessionId: string,
    role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL',
    content: string,
    metadata?: unknown,
  ): Promise<void> {
    await this.prisma.agentMessage.create({
      data: {
        sessionId,
        role,
        content,
        metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
