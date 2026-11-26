import { TaskStatus, TaskType } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

// 任务列表查询过滤条件
export class QueryTaskDto {
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskType)
  type?: TaskType;

  // 按指派人过滤（前端"我的任务"传当前用户 ID）
  @IsOptional()
  @IsUUID()
  assigneeId?: string;
}
