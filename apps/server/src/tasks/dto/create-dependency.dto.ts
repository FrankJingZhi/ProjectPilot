import { DependencyType } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class CreateDependencyDto {
  // 前置任务：本任务必须等它完成
  @IsUUID()
  dependsOnTaskId!: string;

  @IsOptional()
  @IsEnum(DependencyType)
  type?: DependencyType;
}
