// 认证与项目权限相关装饰器
import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { MemberRole } from '@prisma/client';
import type { CurrentUserShape } from './auth.service';

// 标记接口无需登录（如登录接口本身）
export const IS_PUBLIC_KEY = 'auth:public';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// 标记 SSE 接口允许用短期票据鉴权（EventSource 无法携带请求头）
export const ALLOW_SSE_TICKET_KEY = 'auth:sse-ticket';
export const AllowSseTicket = () => SetMetadata(ALLOW_SSE_TICKET_KEY, true);

// 声明访问项目所需的最低成员角色（配合 ProjectAccessGuard）
export const PROJECT_ROLE_KEY = 'auth:project-role';
export const ProjectRole = (role: MemberRole) => SetMetadata(PROJECT_ROLE_KEY, role);

// 从请求中取出当前登录用户（由 JwtAuthGuard 挂载）
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserShape => {
    const request = ctx.switchToHttp().getRequest<{ user: CurrentUserShape }>();
    return request.user;
  },
);
