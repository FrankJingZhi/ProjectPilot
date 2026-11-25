import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  // 创建项目：同时把默认用户登记为 OWNER 成员
  async create(dto: CreateProjectDto) {
    const owner = await this.users.ensureDefaultUser();
    return this.prisma.project.create({
      data: {
        name: dto.name,
        description: dto.description,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        targetEndDate: dto.targetEndDate ? new Date(dto.targetEndDate) : null,
        ownerId: owner.id,
        members: { create: { userId: owner.id, role: 'OWNER' } },
      },
    });
  }

  // 项目列表：附带任务数量统计
  findAll() {
    return this.prisma.project.findMany({
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
