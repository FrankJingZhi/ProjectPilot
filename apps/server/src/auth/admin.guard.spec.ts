import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AdminGuard } from './admin.guard';

function makeContext(user: unknown) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as never;
}

describe('AdminGuard', () => {
  const guard = new AdminGuard();

  it('系统管理员放行', () => {
    expect(guard.canActivate(makeContext({ id: 'a1', isAdmin: true }))).toBe(true);
  });

  it('普通用户拒绝', () => {
    expect(() => guard.canActivate(makeContext({ id: 'u1', isAdmin: false }))).toThrow(
      ForbiddenException,
    );
  });

  it('无用户信息拒绝', () => {
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });
});
