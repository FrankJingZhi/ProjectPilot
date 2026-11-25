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
import { CreateTaskDto } from './dto/create-task.dto';
import { QueryTaskDto } from './dto/query-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TasksService } from './tasks.service';

@Controller('projects/:projectId/tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Post()
  create(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: CreateTaskDto) {
    return this.tasks.create(projectId, dto);
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
}
