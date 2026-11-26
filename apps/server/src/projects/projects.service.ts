import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CurrentUserShape } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  // 创建项目：当前登录用户成为拥有者，并登记 OWNER 成员记录
  async create(dto: CreateProjectDto, ownerId: string) {
    return this.prisma.project.create({
      data: {
        name: dto.name,
        description: dto.description,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        targetEndDate: dto.targetEndDate ? new Date(dto.targetEndDate) : null,
        ownerId,
        members: { create: { userId: ownerId, role: 'OWNER' } },
      },
    });
  }

  // 项目列表：普通用户只见自己拥有或参与的项目；系统管理员可见全部
  findAll(user: CurrentUserShape) {
    return this.prisma.project.findMany({
      where: user.isAdmin
        ? undefined
        : { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { tasks: true } } },
    });
  }

  // 项目详情：附带需求、里程碑与任务统计
  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        requirements: { orderBy: { createdAt: 'asc' } },
        milestones: { orderBy: { dueDate: 'asc' } },
        _count: { select: { tasks: true } },
      },
    });
    if (!project) {
      throw new NotFoundException(`项目不存在：${id}`);
    }
    return project;
  }

  async update(id: string, dto: UpdateProjectDto) {
    await this.findOne(id);
    const data: Prisma.ProjectUpdateInput = {
      name: dto.name,
      description: dto.description,
      status: dto.status,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      targetEndDate: dto.targetEndDate ? new Date(dto.targetEndDate) : undefined,
    };
    return this.prisma.project.update({ where: { id }, data });
  }

  // 删除项目：数据库级联清理任务、需求、里程碑等
  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.project.delete({ where: { id } });
    return { deleted: true };
  }
}
