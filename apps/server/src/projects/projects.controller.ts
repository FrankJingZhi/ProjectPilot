import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { CurrentUserShape } from '../auth/auth.service';
import { CurrentUser, ProjectRole } from '../auth/decorators';
import { ProjectAccessGuard } from '../auth/project-access.guard';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';
import { ReportService } from './report.service';

// 默认项目成员可读；写操作按方法单独提权
@UseGuards(ProjectAccessGuard)
@ProjectRole('VIEWER')
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly report: ReportService,
  ) {}

  @Post()
  create(@CurrentUser() user: CurrentUserShape, @Body() dto: CreateProjectDto) {
    return this.projects.create(dto, user.id);
  }

  @Get()
  findAll(@CurrentUser() user: CurrentUserShape) {
    return this.projects.findAll(user);
  }

  // 风险报告：延期/阻塞/里程碑/目标风险的确定性分析
  @Get(':id/report')
  riskReport(@Param('id', ParseUUIDPipe) id: string) {
    return this.report.analyze(id);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.projects.findOne(id);
  }

  @Patch(':id')
  @ProjectRole('MEMBER')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(id, dto);
  }

  // 删除项目：仅拥有者或系统管理员
  @Delete(':id')
  @ProjectRole('OWNER')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.projects.remove(id);
  }
}
