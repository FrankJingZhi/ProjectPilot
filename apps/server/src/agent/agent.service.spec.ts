import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentService } from './agent.service';
import type { ProjectPlan } from './schemas';

// 屏蔽真实 LangGraph 构建，invoke 结果由各用例控制
const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock('./planner.graph', () => ({
  buildPlannerGraph: () => ({ invoke: invokeMock }),
}));

// 合法计划：EPIC(0) → TASK(1)，任务1 依赖任务0
function validPlan(): ProjectPlan {
  return {
    tasks: [
      {
        title: '模块',
        description: '',
        type: 'EPIC',
        priority: 'P0',
        assigneeRole: '前后端',
        estimatedDays: 2,
        parentIndex: null,
        dependsOnIndexes: [],
      },
      {
        title: '实现',
        description: '',
        type: 'TASK',
        priority: 'P1',
        assigneeRole: '后端',
        estimatedDays: 1,
        parentIndex: 0,
        dependsOnIndexes: [0],
      },
    ],
    milestones: [{ name: 'M1', description: '首个里程碑', offsetDays: 3 }],
    risks: [],
  };
}

describe('AgentService', () => {
  // 事务客户端 mock
  const tx = {
    task: { create: vi.fn() },
    taskDependency: { create: vi.fn() },
    milestone: { create: vi.fn() },
    requirement: { create: vi.fn() },
    agentSession: { update: vi.fn() },
  };
  const prisma = {
    project: { findUnique: vi.fn() },
    agentSession: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    agentMessage: { create: vi.fn() },
    agentExecution: { create: vi.fn() },
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const config = {
    get: vi.fn((key: string, fallback?: unknown) =>
      key === 'OPENAI_API_KEY' ? 'test-key' : fallback,
    ),
  };
  const events = { begin: vi.fn(), publish: vi.fn(), complete: vi.fn() };
  const service = new AgentService(prisma as never, config as never, events as never);

  // 待审批会话 fixture
  function waitingSession(plan: ProjectPlan | null = validPlan()) {
    return {
      id: 's1',
      projectId: 'p1',
      status: 'WAITING_APPROVAL',
      state: { requirement: '需求', analysis: { summary: '概括' }, plan },
      project: { id: 'p1', startDate: new Date('2026-11-25T00:00:00Z') },
    };
  }

  let taskSeq = 0;
  beforeEach(() => {
    vi.clearAllMocks();
    taskSeq = 0;
    tx.task.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      taskSeq += 1;
      return Promise.resolve({ id: `t${taskSeq}`, ...data });
    });
  });

  describe('approvePlan', () => {
    it('会话不存在时抛 NotFoundException', async () => {
      prisma.agentSession.findUnique.mockResolvedValue(null);
      await expect(service.approvePlan('s1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('状态不是 WAITING_APPROVAL 时拒绝审批', async () => {
      prisma.agentSession.findUnique.mockResolvedValue({
        ...waitingSession(),
        status: 'COMPLETED',
      });
      await expect(service.approvePlan('s1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('会话中没有计划时拒绝审批', async () => {
      prisma.agentSession.findUnique.mockResolvedValue(waitingSession(null));
      await expect(service.approvePlan('s1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('计划非法时阻止入库并写失败审计', async () => {
      const plan = validPlan();
      plan.tasks[1].parentIndex = 5; // 父下标越界
      prisma.agentSession.findUnique.mockResolvedValue(waitingSession(plan));
      await expect(service.approvePlan('s1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.agentExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ toolName: 'apply_plan', status: 'FAILED' }),
        }),
      );
    });

    it('合法计划入库：任务按序创建、父子与依赖映射为真实 ID', async () => {
      prisma.agentSession.findUnique.mockResolvedValue(waitingSession());
      const result = await service.approvePlan('s1');

      expect(result).toEqual({
        sessionId: 's1',
        status: 'COMPLETED',
        tasksCreated: 2,
        dependenciesCreated: 1,
        milestonesCreated: 1,
      });
      // 第一个任务顶层，第二个任务挂到第一个的真实 ID 下
      expect(tx.task.create.mock.calls[0][0].data).toMatchObject({
        parentId: null,
        sortOrder: 0,
        type: 'EPIC',
      });
      expect(tx.task.create.mock.calls[1][0].data).toMatchObject({
        parentId: 't1',
        sortOrder: 1,
        type: 'TASK',
      });
      // 依赖下标 [0] → 真实 ID t1
      expect(tx.taskDependency.create).toHaveBeenCalledWith({
        data: { taskId: 't2', dependsOnTaskId: 't1' },
      });
      // 里程碑：开始日期 + 3 天
      expect(tx.milestone.create.mock.calls[0][0].data.dueDate.toISOString().slice(0, 10)).toBe(
        '2026-11-28',
      );
      // 需求存档为已确认
      expect(tx.requirement.create.mock.calls[0][0].data).toMatchObject({
        content: '需求',
        status: 'CONFIRMED',
      });
      // 会话置为完成，审计成功
      expect(tx.agentSession.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { status: 'COMPLETED' },
      });
      expect(prisma.agentExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ toolName: 'apply_plan', status: 'SUCCESS' }),
        }),
      );
    });

    it('重复依赖下标去重，只创建一条依赖', async () => {
      const plan = validPlan();
      plan.tasks[1].dependsOnIndexes = [0, 0];
      prisma.agentSession.findUnique.mockResolvedValue(waitingSession(plan));
      const result = await service.approvePlan('s1');
      expect(result.dependenciesCreated).toBe(1);
      expect(tx.taskDependency.create).toHaveBeenCalledTimes(1);
    });

    it('事务失败时写失败审计并抛 BadRequest，会话保持待审批', async () => {
      prisma.agentSession.findUnique.mockResolvedValue(waitingSession());
      tx.task.create.mockRejectedValue(new Error('数据库写入失败'));
      await expect(service.approvePlan('s1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.agentExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ toolName: 'apply_plan', status: 'FAILED' }),
        }),
      );
    });
  });

  describe('rejectPlan', () => {
    it('拒绝后不写业务数据，会话终止并记录 REJECTED 审计', async () => {
      prisma.agentSession.findUnique.mockResolvedValue(waitingSession());
      const result = await service.rejectPlan('s1');
      expect(result.status).toBe('FAILED');
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.agentSession.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { status: 'FAILED' },
      });
      expect(prisma.agentExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ toolName: 'apply_plan', status: 'REJECTED' }),
        }),
      );
    });

    it('状态不是 WAITING_APPROVAL 时拒绝操作', async () => {
      prisma.agentSession.findUnique.mockResolvedValue({
        ...waitingSession(),
        status: 'WAITING_INPUT',
      });
      await expect(service.rejectPlan('s1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('startPlanning', () => {
    it('计划生成后会话进入 WAITING_APPROVAL 而非直接完成', async () => {
      prisma.project.findUnique.mockResolvedValue({
        id: 'p1',
        name: '项目',
        description: null,
        targetEndDate: null,
        tasks: [],
      });
      prisma.agentSession.create.mockResolvedValue({ id: 's1' });
      invokeMock.mockResolvedValue({
        analysis: {
          summary: '概括',
          features: [],
          constraints: [],
          acceptanceCriteria: [],
          complete: true,
          questions: [],
        },
        plan: validPlan(),
      });

      const result = await service.startPlanning('p1', '做一个任务管理系统', 'user-1');
      // 会话必须记录真实发起用户
      expect(prisma.agentSession.create.mock.calls[0][0].data.userId).toBe('user-1');
      // 接口立即返回，工作流在后台异步执行
      expect(result.status).toBe('ACTIVE');
      await vi.waitFor(() => {
        expect(prisma.agentSession.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: 'WAITING_APPROVAL' }),
          }),
        );
      });
      // complete 在 finally 中最后执行，等它出现即可保证 publish 已完成
      await vi.waitFor(() => {
        expect(events.complete).toHaveBeenCalledWith('s1');
      });
      expect(events.publish).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ type: 'result' }),
      );
    });

    it('工作流失败时会话置 FAILED 并推送错误事件', async () => {
      prisma.project.findUnique.mockResolvedValue({
        id: 'p1',
        name: '项目',
        description: null,
        targetEndDate: null,
        tasks: [],
      });
      prisma.agentSession.create.mockResolvedValue({ id: 's1' });
      invokeMock.mockRejectedValue(new Error('模型调用失败'));

      await service.startPlanning('p1', '需求', 'user-1');
      await vi.waitFor(() => {
        expect(prisma.agentSession.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: 'FAILED' }),
          }),
        );
      });
      await vi.waitFor(() => {
        expect(events.publish).toHaveBeenCalledWith('s1', {
          type: 'error',
          message: '模型调用失败',
        });
      });
    });
  });
});
