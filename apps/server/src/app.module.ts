import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AgentModule } from './agent/agent.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    // 全局配置：读取 apps/server/.env
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    UsersModule,
    AuthModule,
    HealthModule,
    ProjectsModule,
    TasksModule,
    AgentModule,
  ],
  providers: [
    // 全局登录守卫：除 @Public 接口外一律要求 JWT
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
