import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { verifyPassword } from './password';

// JWT 载荷结构
export interface JwtPayload {
  sub: string;
  email: string;
  isAdmin: boolean;
}

// 挂载到 request.user 的当前用户
export interface CurrentUserShape {
  id: string;
  email: string;
  isAdmin: boolean;
}

// 对外返回的用户信息（不含敏感字段）
export interface SafeUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
}

interface SseTicket {
  userId: string;
  expiresAt: number;
}

// SSE 票据有效期：60 秒、一次性使用
const SSE_TICKET_TTL_MS = 60_000;

@Injectable()
export class AuthService {
  // 票据存内存即可：单实例部署，重启后前端重新换票，无业务损失
  private readonly tickets = new Map<string, SseTicket>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  // 登录：校验密码后签发 JWT
  async login(email: string, password: string): Promise<{ token: string; user: SafeUser }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // 统一报错文案，避免泄露"账号是否存在"
    if (
      !user ||
      user.disabled ||
      !user.passwordHash ||
      !(await verifyPassword(password, user.passwordHash))
    ) {
      throw new UnauthorizedException('邮箱或密码错误');
    }
    const payload: JwtPayload = { sub: user.id, email: user.email, isAdmin: user.isAdmin };
    const token = await this.jwt.signAsync(payload);
    return {
      token,
      user: { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin },
    };
  }

  // 当前用户信息（前端刷新页面后恢复登录态）
  async me(userId: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.disabled) {
      throw new UnauthorizedException('账号不存在或已被禁用');
    }
    return { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin };
  }

  // 按 ID 加载用户（SSE 票据换用户时用）
  async loadUser(userId: string): Promise<CurrentUserShape> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.disabled) {
      throw new UnauthorizedException('账号不存在或已被禁用');
    }
    return { id: user.id, email: user.email, isAdmin: user.isAdmin };
  }

  // 签发 SSE 短期票据：长期 JWT 不进 URL，避免被日志/历史记录泄露
  createSseTicket(userId: string): { ticket: string } {
    this.cleanupTickets();
    const ticket = randomBytes(24).toString('hex');
    this.tickets.set(ticket, { userId, expiresAt: Date.now() + SSE_TICKET_TTL_MS });
    return { ticket };
  }

  // 核销票据：一次性使用，取出即作废；过期返回 null
  consumeSseTicket(ticket: string): string | null {
    const entry = this.tickets.get(ticket);
    if (!entry) {
      return null;
    }
    this.tickets.delete(ticket);
    return entry.expiresAt >= Date.now() ? entry.userId : null;
  }

  // 顺手清理过期票据，防止 Map 无限增长
  private cleanupTickets(): void {
    const now = Date.now();
    for (const [key, value] of this.tickets) {
      if (value.expiresAt < now) {
        this.tickets.delete(key);
      }
    }
  }
}
