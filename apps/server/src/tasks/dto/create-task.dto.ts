import { TaskPriority, TaskType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

export class CreateTaskDto {
  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 5000)
  description?: string;

  @IsOptional()
  @IsEnum(TaskType)
  type?: TaskType;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  assigneeRole?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedDays?: number;

  @IsOptional()
  @IsDateString()
  plannedStart?: string;

  @IsOptional()
  @IsDateString()
  plannedEnd?: string;
}
