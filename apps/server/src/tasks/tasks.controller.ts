import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreateDependencyDto } from './dto/create-dependency.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { QueryTaskDto } from './dto/query-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ScheduleService } from './schedule.service';
import { TasksService } from './tasks.service';

@Controller('projects/:projectId/tasks')
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly schedule: ScheduleService,
  ) {}

  @Post()
  create(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: CreateTaskDto) {
    return this.tasks.create(projectId, dto);
  }

  // 自动排期：按依赖与工期重算全部任务的计划起止日期
  @Post('schedule')
  reschedule(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.schedule.reschedule(projectId);
  }

  @Get()
  findAll(@Param('projectId', ParseUUIDPipe) projectId: string, @Query() query: QueryTaskDto) {
    return this.tasks.findAll(projectId, query);
  }

  @Get(':id')
  findOne(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasks.findOne(projectId, id);
  }

  @Patch(':id')
  update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.update(projectId, id, dto);
  }

  @Delete(':id')
  remove(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasks.remove(projectId, id);
  }

  // ==================== 任务依赖 ====================

  @Get(':id/dependencies')
  listDependencies(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasks.listDependencies(projectId, id);
  }

  @Post(':id/dependencies')
  addDependency(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDependencyDto,
  ) {
    return this.tasks.addDependency(projectId, id, dto.dependsOnTaskId, dto.type);
  }

  @Delete(':id/dependencies/:dependencyId')
  removeDependency(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('dependencyId', ParseUUIDPipe) dependencyId: string,
  ) {
    return this.tasks.removeDependency(projectId, id, dependencyId);
  }
}
