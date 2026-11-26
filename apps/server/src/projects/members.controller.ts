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
import { ProjectRole } from '../auth/decorators';
import { ProjectAccessGuard } from '../auth/project-access.guard';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { MembersService } from './members.service';

// 成员管理：列表对项目成员开放（指派需要），增删改仅 OWNER/系统管理员
@UseGuards(ProjectAccessGuard)
@ProjectRole('VIEWER')
@Controller('projects/:projectId/members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  list(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.members.list(projectId);
  }

  // 可邀请用户候选（放在 :userId 之前避免路由歧义）
  @Get('candidates')
  @ProjectRole('OWNER')
  candidates(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.members.candidates(projectId);
  }

  @Post()
  @ProjectRole('OWNER')
  add(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: AddMemberDto) {
    return this.members.add(projectId, dto);
  }

  @Patch(':userId')
  @ProjectRole('OWNER')
  updateRole(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.members.updateRole(projectId, userId, dto);
  }

  @Delete(':userId')
  @ProjectRole('OWNER')
  remove(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.members.remove(projectId, userId);
  }
}
