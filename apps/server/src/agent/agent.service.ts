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
import { DEFAULT_USER_ID } from '../users/users.constants';
import { buildPlannerGraph, type AuditEntry } from './planner.graph';
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

@Injectable()
export class AgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // 发起规划：创建会话 → 记录用户消息 → 运行工作流
  async startPlanning(projectId: string, requirement: string): Promise<PlanningResult> {
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
        userId: DEFAULT_USER_ID,
        title: requirement.slice(0, 50),
        status: 'ACTIVE',
      },
    });
    await this.addMessage(session.id, 'USER', requirement);
    return this.runGraph(session.id, requirement, this.buildContext(project));
  }

  // 回答澄清问题：合并补充信息后重新运行工作流
  async reply(sessionId: string, answers: string): Promise<PlanningResult> {
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
    return this.runGraph(sessionId, requirement, this.buildContext(session.project));
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
  ): Promise<PlanningResult> {
    // 审计回调：每个节点执行都落库，保证可追溯
    const audit = async (entry: AuditEntry): Promise<void> => {
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
        return { sessionId, status: 'WAITING_INPUT', analysis, questions };
      }

      // 计划生成完毕：保存提案（第 5 步审批后才写入真实任务）
      const plan = result.plan ?? null;
      const state: SessionState = { requirement, analysis, plan };
      await this.prisma.agentSession.update({
        where: { id: sessionId },
        data: { status: 'COMPLETED', state: state as unknown as Prisma.InputJsonValue },
      });
      await this.addMessage(
        sessionId,
        'ASSISTANT',
        `已生成开发计划：${plan?.tasks.length ?? 0} 个任务、${plan?.milestones.length ?? 0} 个里程碑。等待用户确认后入库。`,
        { plan },
      );
      return { sessionId, status: 'PLANNED', analysis, plan };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.agentSession.update({
        where: { id: sessionId },
        data: { status: 'FAILED' },
      });
      await this.addMessage(sessionId, 'ASSISTANT', `规划失败：${message}`);
      if (err instanceof ServiceUnavailableException) throw err;
      throw new BadRequestException(`Agent 规划失败：${message}`);
    }
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
