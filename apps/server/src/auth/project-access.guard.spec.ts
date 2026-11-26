import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectAccessGuard } from './project-access.guard';

// 构造最小 ExecutionContext：只带路由参数与当前用户
function makeContext(params: Record<string, string>, user: unknown) {
  const request = { params, user };
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

describe('ProjectAccessGuard', () => {
  const prisma = {
    project: { findUnique: vi.fn() },
    projectMember: { findUnique: vi.fn() },
    agentSession: { findUnique: vi.fn() },
  };
  // 默认要求 VIEWER，用例按需覆盖
  const reflector = { getAllAndOverride: vi.fn() };
  const guard = new ProjectAccessGuard(prisma as never, reflector as never);
  const member = { id: 'u1', email: 'u@x.local', isAdmin: false };
  const admin = { id: 'a1', email: 'a@x.local', isAdmin: true };

  beforeEach(() => {
    vi.clearAllMocks();
    reflector.getAllAndOverride.mockReturnValue('VIEWER');
    prisma.project.findUnique.mockResolvedValue({ ownerId: 'someone-else' });
    prisma.projectMember.findUnique.mockResolvedValue(null);
  });

  it('系统管理员直接放行', async () => {
    await expect(guard.canActivate(makeContext({ id: 'p1' }, admin))).resolves.toBe(true);
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it('无项目上下文（列表/创建）放行', async () => {
    await expect(guard.canActivate(makeContext({}, member))).resolves.toBe(true);
  });

  it('项目不存在抛 NotFoundException', async () => {
    prisma.project.findUnique.mockResolvedValue(null);
    await expect(guard.canActivate(makeContext({ id: 'p1' }, member))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('非成员访问被拒绝', async () => {
    await expect(guard.canActivate(makeContext({ id: 'p1' }, member))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('拥有者即使缺成员记录也按 OWNER 放行', async () => {
    prisma.project.findUnique.mockResolvedValue({ ownerId: 'u1' });
    reflector.getAllAndOverride.mockReturnValue('OWNER');
    await expect(guard.canActivate(makeContext({ id: 'p1' }, member))).resolves.toBe(true);
  });

  it('VIEWER 可读但不可写', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({ role: 'VIEWER' });
    await expect(guard.canActivate(makeContext({ projectId: 'p1' }, member))).resolves.toBe(true);
    reflector.getAllAndOverride.mockReturnValue('MEMBER');
    await expect(
      guard.canActivate(makeContext({ projectId: 'p1' }, member)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('MEMBER 可写但不可删除项目（OWNER 级）', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
    reflector.getAllAndOverride.mockReturnValue('MEMBER');
    await expect(guard.canActivate(makeContext({ id: 'p1' }, member))).resolves.toBe(true);
    reflector.getAllAndOverride.mockReturnValue('OWNER');
    await expect(guard.canActivate(makeContext({ id: 'p1' }, member))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('会话类接口通过 sessionId 反查项目再校验', async () => {
    prisma.agentSession.findUnique.mockResolvedValue({ projectId: 'p1' });
    prisma.projectMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
    reflector.getAllAndOverride.mockReturnValue('MEMBER');
    await expect(guard.canActivate(makeContext({ sessionId: 's1' }, member))).resolves.toBe(true);
    expect(prisma.projectMember.findUnique).toHaveBeenCalledWith({
      where: { projectId_userId: { projectId: 'p1', userId: 'u1' } },
      select: { role: true },
    });
  });

  it('会话不存在抛 NotFoundException', async () => {
    prisma.agentSession.findUnique.mockResolvedValue(null);
    await expect(
      guard.canActivate(makeContext({ sessionId: 'missing' }, member)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
