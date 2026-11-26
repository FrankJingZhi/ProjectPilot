import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AddMemberDto } from './dto/add-member.dto';
import type { UpdateMemberDto } from './dto/update-member.dto';

// 成员信息附带的最小用户字段
const USER_SELECT = { id: true, name: true, email: true } as const;

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  // 成员列表：项目内所有成员可见（指派任务时需要）
  list(projectId: string) {
    return this.prisma.projectMember.findMany({
      where: { projectId },
      include: { user: { select: USER_SELECT } },
      orderBy: { joinedAt: 'asc' },
    });
  }

  // 可邀请候选：尚未加入该项目且未禁用的用户（仅 OWNER/管理员可用）
  async candidates(projectId: string) {
    const members = await this.prisma.projectMember.findMany({
      where: { projectId },
      select: { userId: true },
    });
    return this.prisma.user.findMany({
      where: { disabled: false, id: { notIn: members.map((m) => m.userId) } },
      select: USER_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  async add(projectId: string, dto: AddMemberDto) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException(`项目不存在：${projectId}`);
    }
    if (project.ownerId === dto.userId) {
      throw new BadRequestException('项目拥有者已是成员，无需添加');
    }
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user || user.disabled) {
      throw new BadRequestException('用户不存在或已被禁用');
    }
    const existing = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: dto.userId } },
    });
    if (existing) {
      throw new ConflictException('该用户已是项目成员');
    }
    return this.prisma.projectMember.create({
      data: { projectId, userId: dto.userId, role: dto.role },
      include: { user: { select: USER_SELECT } },
    });
  }

  async updateRole(projectId: string, userId: string, dto: UpdateMemberDto) {
    await this.assertNotOwner(projectId, userId, '项目拥有者的角色不可修改');
    await this.ensureMember(projectId, userId);
    return this.prisma.projectMember.update({
      where: { projectId_userId: { projectId, userId } },
      data: { role: dto.role },
      include: { user: { select: USER_SELECT } },
    });
  }

  async remove(projectId: string, userId: string) {
    await this.assertNotOwner(projectId, userId, '项目拥有者不能被移除');
    await this.ensureMember(projectId, userId);
    // 移除成员后，其在本项目名下的任务变为未指派
    await this.prisma.task.updateMany({
      where: { projectId, assigneeId: userId },
      data: { assigneeId: null },
    });
    await this.prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId } },
    });
    return { deleted: true };
  }

  // 拥有者保护：角色固定为 OWNER，不可改、不可移除
  private async assertNotOwner(projectId: string, userId: string, message: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });
    if (!project) {
      throw new NotFoundException(`项目不存在：${projectId}`);
    }
    if (project.ownerId === userId) {
      throw new BadRequestException(message);
    }
  }

  private async ensureMember(projectId: string, userId: string) {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!member) {
      throw new NotFoundException('该用户不是项目成员');
    }
  }
}
