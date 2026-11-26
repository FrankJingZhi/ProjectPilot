import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaskType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { QueryTaskDto } from './dto/query-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

// 层级规则：Epic 下可挂 Story/Task，Story 下只能挂 Task，Task 不能再挂子任务
const ALLOWED_CHILD_TYPES: Record<TaskType, TaskType[]> = {
  EPIC: ['STORY', 'TASK'],
  STORY: ['TASK'],
  TASK: [],
};

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(projectId: string, dto: CreateTaskDto) {
    await this.ensureProject(projectId);
    if (dto.parentId) {
      await this.validateParent(projectId, dto.parentId, dto.type ?? 'TASK');
    }
    if (dto.assigneeId) {
      await this.validateAssignee(projectId, dto.assigneeId);
    }
    return this.prisma.task.create({
      data: {
        projectId,
        title: dto.title,
        description: dto.description,
        type: dto.type ?? 'TASK',
        priority: dto.priority ?? 'P1',
        parentId: dto.parentId ?? null,
        assigneeRole: dto.assigneeRole,
        assigneeId: dto.assigneeId ?? null,
        estimatedDays: dto.estimatedDays,
        plannedStart: dto.plannedStart ? new Date(dto.plannedStart) : null,
        plannedEnd: dto.plannedEnd ? new Date(dto.plannedEnd) : null,
      },
    });
  }

  // 任务列表：支持按状态/类型过滤，返回扁平结构由前端组装树
  async findAll(projectId: string, query: QueryTaskDto) {
    await this.ensureProject(projectId);
    return this.prisma.task.findMany({
      where: { projectId, status: query.status, type: query.type, assigneeId: query.assigneeId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        _count: { select: { children: true } },
        dependencies: {
          include: { dependsOnTask: { select: { id: true, title: true, status: true } } },
        },
      },
    });
  }

  async findOne(projectId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, projectId },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        children: { orderBy: { sortOrder: 'asc' } },
        dependencies: { include: { dependsOnTask: true } },
        dependents: { include: { task: true } },
      },
    });
    if (!task) {
      throw new NotFoundException(`任务不存在：${id}`);
    }
    return task;
  }

  async update(projectId: string, id: string, dto: UpdateTaskDto) {
    const existing = await this.findOne(projectId, id);
    // 变更父任务时重新校验层级与循环
    if (dto.parentId !== undefined && dto.parentId !== existing.parentId) {
      if (dto.parentId === id) {
        throw new BadRequestException('任务不能作为自己的父任务');
      }
      if (dto.parentId) {
        await this.validateParent(projectId, dto.parentId, existing.type);
        await this.assertNotDescendant(projectId, id, dto.parentId);
      }
    }
    if (dto.assigneeId) {
      await this.validateAssignee(projectId, dto.assigneeId);
    }
    const data: Prisma.TaskUpdateInput = {
      title: dto.title,
      description: dto.description,
      type: dto.type,
      status: dto.status,
      priority: dto.priority,
      assigneeRole: dto.assigneeRole,
      estimatedDays: dto.estimatedDays,
      plannedStart: dto.plannedStart ? new Date(dto.plannedStart) : undefined,
      plannedEnd: dto.plannedEnd ? new Date(dto.plannedEnd) : undefined,
      parent:
        dto.parentId === undefined
          ? undefined
          : dto.parentId
            ? { connect: { id: dto.parentId } }
            : { disconnect: true },
      assignee:
        dto.assigneeId === undefined
          ? undefined
          : dto.assigneeId
            ? { connect: { id: dto.assigneeId } }
            : { disconnect: true },
    };
    return this.prisma.task.update({ where: { id }, data });
  }

  // 删除任务：子任务自动提升为顶层（外键 SetNull），依赖记录级联删除
  async remove(projectId: string, id: string) {
    await this.findOne(projectId, id);
    await this.prisma.task.delete({ where: { id } });
    return { deleted: true };
  }

  // 校验指派人：必须是该项目成员
  private async validateAssignee(projectId: string, userId: string) {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!member) {
      throw new BadRequestException('指派人必须是该项目成员');
    }
  }

  private async ensureProject(projectId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException(`项目不存在：${projectId}`);
    }
  }

  // 校验父任务：必须同项目、类型允许挂载
  private async validateParent(projectId: string, parentId: string, childType: TaskType) {
    const parent = await this.prisma.task.findFirst({ where: { id: parentId, projectId } });
    if (!parent) {
      throw new BadRequestException('父任务不存在或不属于该项目');
    }
    if (!ALLOWED_CHILD_TYPES[parent.type].includes(childType)) {
      throw new BadRequestException(
        `${parent.type} 类型任务下不允许挂载 ${childType}（层级规则：Epic → Story → Task）`,
      );
    }
  }

  // 防止循环：新父任务不能是当前任务的后代
  private async assertNotDescendant(projectId: string, taskId: string, newParentId: string) {
    let cursor: string | null = newParentId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === taskId) {
        throw new BadRequestException('不能将任务挂载到其自身的子任务下（会形成循环）');
      }
      if (seen.has(cursor)) break;
      seen.add(cursor);
      const row: { parentId: string | null } | null = await this.prisma.task.findFirst({
        where: { id: cursor, projectId },
        select: { parentId: true },
      });
      cursor = row?.parentId ?? null;
    }
  }

  // ==================== 任务依赖 ====================

  // 查询任务的依赖列表
  async listDependencies(projectId: string, taskId: string) {
    const task = await this.findOne(projectId, taskId);
    return task.dependencies;
  }

  // 新增依赖：校验同项目、非自依赖、不重复、不成环
  async addDependency(projectId: string, taskId: string, dependsOnTaskId: string, type?: string) {
    await this.findOne(projectId, taskId);
    if (taskId === dependsOnTaskId) {
      throw new BadRequestException('任务不能依赖自己');
    }
    const predecessor = await this.prisma.task.findFirst({
      where: { id: dependsOnTaskId, projectId },
    });
    if (!predecessor) {
      throw new BadRequestException('前置任务不存在或不属于该项目');
    }
    const existing = await this.prisma.taskDependency.findUnique({
      where: { taskId_dependsOnTaskId: { taskId, dependsOnTaskId } },
    });
    if (existing) {
      throw new BadRequestException('该依赖关系已存在');
    }
    await this.assertNoDependencyCycle(taskId, dependsOnTaskId);
    return this.prisma.taskDependency.create({
      data: {
        taskId,
        dependsOnTaskId,
        type: (type as never) ?? 'FINISH_TO_START',
      },
      include: { dependsOnTask: true },
    });
  }

  // 删除依赖
  async removeDependency(projectId: string, taskId: string, dependencyId: string) {
    const dependency = await this.prisma.taskDependency.findFirst({
      where: { id: dependencyId, taskId, task: { projectId } },
    });
    if (!dependency) {
      throw new NotFoundException(`依赖关系不存在：${dependencyId}`);
    }
    await this.prisma.taskDependency.delete({ where: { id: dependencyId } });
    return { deleted: true };
  }

  // 防环：从前置任务出发沿依赖链遍历，若能回到当前任务则会成环
  private async assertNoDependencyCycle(taskId: string, dependsOnTaskId: string) {
    const stack = [dependsOnTaskId];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === taskId) {
        throw new BadRequestException('该依赖会形成循环（A 依赖 B，B 又依赖 A）');
      }
      if (seen.has(current)) continue;
      seen.add(current);
      const deps = await this.prisma.taskDependency.findMany({
        where: { taskId: current },
        select: { dependsOnTaskId: true },
      });
      stack.push(...deps.map((d) => d.dependsOnTaskId));
    }
  }
}
