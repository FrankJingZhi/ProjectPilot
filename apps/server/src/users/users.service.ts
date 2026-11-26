import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hashPassword } from '../auth/password';
import { PrismaService } from '../prisma/prisma.service';
import { ADMIN_USER_ID } from './users.constants';

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // 启动时初始化管理员账号（幂等）：个人版默认用户升级为系统管理员
  async onModuleInit(): Promise<void> {
    const admin = await this.prisma.user.upsert({
      where: { id: ADMIN_USER_ID },
      update: { isAdmin: true },
      create: {
        id: ADMIN_USER_ID,
        email: 'owner@projectpilot.local',
        name: '系统管理员',
        passwordHash: '',
        isAdmin: true,
      },
    });
    // 首次部署：用环境变量设置初始密码；之后由用户管理功能维护
    if (!admin.passwordHash) {
      const initial = this.config.get<string>('ADMIN_INITIAL_PASSWORD');
      if (initial) {
        await this.prisma.user.update({
          where: { id: admin.id },
          data: { passwordHash: await hashPassword(initial) },
        });
        this.logger.log('已根据 ADMIN_INITIAL_PASSWORD 初始化管理员密码');
      } else {
        this.logger.warn('管理员尚未设置密码：请在 .env 配置 ADMIN_INITIAL_PASSWORD 后重启服务');
      }
    }
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }
}
