import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ProjectAccessGuard } from './project-access.guard';

// 全局认证模块：守卫与认证服务对所有业务模块可用
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        // 密钥必须显式配置，杜绝默认弱密钥上线
        if (!secret) {
          throw new Error('JWT_SECRET 未配置：请在 apps/server/.env 中设置随机密钥');
        }
        return { secret, signOptions: { expiresIn: '12h' } };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, ProjectAccessGuard],
  exports: [AuthService, JwtAuthGuard, ProjectAccessGuard, JwtModule],
})
export class AuthModule {}
