import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthService, type JwtPayload } from './auth.service';
import { ALLOW_SSE_TICKET_KEY, IS_PUBLIC_KEY } from './decorators';

// 全局登录守卫：默认所有接口都要求 Bearer JWT
// 例外：@Public 标记的接口；@AllowSseTicket 标记的 SSE 接口可用 ?ticket= 短期票据
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      query: Record<string, unknown>;
      user?: unknown;
    }>();

    // SSE 票据通道：仅在明确标记的接口上生效，票据一次性核销
    const allowTicket = this.reflector.getAllAndOverride<boolean>(ALLOW_SSE_TICKET_KEY, targets);
    const ticket = typeof request.query?.ticket === 'string' ? request.query.ticket : null;
    if (allowTicket && ticket) {
      const userId = this.auth.consumeSseTicket(ticket);
      if (!userId) {
        throw new UnauthorizedException('SSE 票据无效或已过期');
      }
      request.user = await this.auth.loadUser(userId);
      return true;
    }

    const header = request.headers?.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('未登录');
    }
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(header.slice(7));
      request.user = { id: payload.sub, email: payload.email, isAdmin: payload.isAdmin };
    } catch {
      throw new UnauthorizedException('登录已过期，请重新登录');
    }
    return true;
  }
}
