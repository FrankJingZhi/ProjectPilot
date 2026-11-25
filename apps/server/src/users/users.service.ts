import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_USER_ID } from './users.constants';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // 确保默认本地用户存在（个人版：所有项目暂挂在该用户名下）
  async ensureDefaultUser() {
    return this.prisma.user.upsert({
      where: { id: DEFAULT_USER_ID },
      update: {},
      create: {
        id: DEFAULT_USER_ID,
        email: 'owner@projectpilot.local',
        name: '本地用户',
        // 第一版无登录认证，密码字段留空，后续引入认证时补齐
        passwordHash: '',
      },
    });
  }
}
