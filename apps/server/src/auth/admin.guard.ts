import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { CurrentUserShape } from './auth.service';

// 系统管理员守卫：用于用户管理等全局管理接口（在全局登录守卫之后执行）
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: CurrentUserShape }>();
    if (!request.user?.isAdmin) {
      throw new ForbiddenException('需要系统管理员权限');
    }
    return true;
  }
}
