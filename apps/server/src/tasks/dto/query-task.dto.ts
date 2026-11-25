import { TaskStatus, TaskType } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

// 任务列表查询过滤条件
export class QueryTaskDto {
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskType)
  type?: TaskType;
}
