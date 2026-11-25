import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
    HealthModule,
    ProjectsModule,
    TasksModule,
  ],
})
export class AppModule {}
