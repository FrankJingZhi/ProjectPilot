import {
  Body,
  Controller,
  Get,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Post,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import type { CurrentUserShape } from '../auth/auth.service';
import { AllowSseTicket, CurrentUser, ProjectRole } from '../auth/decorators';
import { ProjectAccessGuard } from '../auth/project-access.guard';
import { AgentEventsService } from './agent-events.service';
import { AgentService } from './agent.service';
import { ReplyDto } from './dto/reply.dto';
import { StartPlanDto } from './dto/start-plan.dto';

// 默认项目成员可读；发起规划/回复/审批要求 MEMBER 及以上
@UseGuards(ProjectAccessGuard)
@ProjectRole('VIEWER')
@Controller()
export class AgentController {
  constructor(
    private readonly agent: AgentService,
    private readonly events: AgentEventsService,
  ) {}

  // 发起需求规划（异步执行，立即返回会话 ID，进度走 SSE）
  @Post('projects/:projectId/agent/plan')
  @ProjectRole('MEMBER')
  startPlan(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: CurrentUserShape,
    @Body() dto: StartPlanDto,
  ) {
    return this.agent.startPlanning(projectId, dto.requirement, user.id);
  }

  // 回答澄清问题，继续规划（异步执行，进度走 SSE）
  @Post('agent/sessions/:sessionId/reply')
  @ProjectRole('MEMBER')
  reply(@Param('sessionId', ParseUUIDPipe) sessionId: string, @Body() dto: ReplyDto) {
    return this.agent.reply(sessionId, dto.answers);
  }

  // SSE：订阅会话的实时进度与最终结果（允许短期票据鉴权）
  @Sse('agent/sessions/:sessionId/events')
  @AllowSseTicket()
  streamEvents(@Param('sessionId', ParseUUIDPipe) sessionId: string): Observable<MessageEvent> {
    return this.events.stream(sessionId).pipe(map((event) => ({ data: event }) as MessageEvent));
  }

  // 审批通过：计划提案写入真实任务/依赖/里程碑
  @Post('agent/sessions/:sessionId/approve')
  @ProjectRole('MEMBER')
  approve(@Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.agent.approvePlan(sessionId);
  }

  // 审批拒绝：不写入业务数据，会话终止
  @Post('agent/sessions/:sessionId/reject')
  @ProjectRole('MEMBER')
  reject(@Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.agent.rejectPlan(sessionId);
  }

  // 项目的会话列表
  @Get('projects/:projectId/agent/sessions')
  listSessions(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.agent.listSessions(projectId);
  }

  // 会话详情（消息 + 执行审计）
  @Get('agent/sessions/:sessionId')
  getSession(@Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.agent.getSession(sessionId);
  }
}
