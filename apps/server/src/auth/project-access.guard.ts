import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { MemberRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUserShape } from './auth.service';
import { PROJECT_ROLE_KEY } from './decorators';

// 角色等级：数值越大权限越高
const ROLE_LEVEL: Record<MemberRole, number> = {
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

interface AccessRequest {
  params: Record<string, string | undefined>;
  user: CurrentUserShape;
}

// 项目权限守卫：按成员角色控制项目内数据的读写
// 项目 ID 来源：params.projectId（任务/Agent）→ params.id（项目本身）→ sessionId 反查
// 无项目上下文的接口（项目列表/创建）直接放行，由服务层按用户过滤
@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AccessRequest>();
    const user = request.user;
    // 系统管理员不受项目成员限制
    if (user.isAdmin) {
      return true;
    }
    const required =
      this.reflector.getAllAndOverride<MemberRole>(PROJECT_ROLE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'VIEWER';

    const projectId = await this.resolveProjectId(request.params);
    if (!projectId) {
      return true;
    }
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });
    if (!project) {
      throw new NotFoundException(`项目不存在：${projectId}`);
    }
    // 拥有者即使成员记录缺失也视为 OWNER（兜底）
    let role: MemberRole | null = project.ownerId === user.id ? 'OWNER' : null;
    if (!role) {
      const member = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: user.id } },
        select: { role: true },
      });
      role = member?.role ?? null;
    }
    if (!role) {
      throw new ForbiddenException('你不是该项目成员，无权访问');
    }
    if (ROLE_LEVEL[role] < ROLE_LEVEL[required]) {
      throw new ForbiddenException('当前项目角色无权执行此操作');
    }
    return true;
  }

  // 从路由参数解析项目 ID；会话类接口通过 sessionId 反查所属项目
  private async resolveProjectId(
    params: Record<string, string | undefined>,
  ): Promise<string | null> {
    if (params.projectId) {
      return params.projectId;
    }
    if (params.id) {
      return params.id;
    }
    if (params.sessionId) {
      const session = await this.prisma.agentSession.findUnique({
        where: { id: params.sessionId },
        select: { projectId: true },
      });
      if (!session) {
        throw new NotFoundException(`会话不存在：${params.sessionId}`);
      }
      return session.projectId;
    }
    return null;
  }
}
