import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hashPassword } from '../auth/password';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import { ADMIN_USER_ID } from './users.constants';

// 对外返回的用户字段（绝不含密码哈希）
const SAFE_SELECT = {
  id: true,
  email: true,
  name: true,
  isAdmin: true,
  disabled: true,
  createdAt: true,
} as const;

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

  // ==================== 管理员用户管理 ====================

  list() {
    return this.prisma.user.findMany({ select: SAFE_SELECT, orderBy: { createdAt: 'asc' } });
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('该邮箱已注册');
    }
    return this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash: await hashPassword(dto.password),
        isAdmin: dto.isAdmin ?? false,
      },
      select: SAFE_SELECT,
    });
  }

  async update(id: string, dto: UpdateUserDto, actorId: string) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) {
      throw new NotFoundException(`用户不存在：${id}`);
    }
    // 自我保护：避免管理员把自己锁在系统外
    if (id === actorId && dto.disabled === true) {
      throw new BadRequestException('不能禁用自己的账号');
    }
    if (id === actorId && dto.isAdmin === false) {
      throw new BadRequestException('不能撤销自己的管理员权限');
    }
    return this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        disabled: dto.disabled,
        isAdmin: dto.isAdmin,
        passwordHash: dto.password ? await hashPassword(dto.password) : undefined,
      },
      select: SAFE_SELECT,
    });
  }
}
