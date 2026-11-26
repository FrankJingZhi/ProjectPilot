import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { AgentService } from './agent.service';
import { ReplyDto } from './dto/reply.dto';
import { StartPlanDto } from './dto/start-plan.dto';

@Controller()
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  // 发起需求规划
  @Post('projects/:projectId/agent/plan')
  startPlan(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: StartPlanDto) {
    return this.agent.startPlanning(projectId, dto.requirement);
  }

  // 回答澄清问题，继续规划
  @Post('agent/sessions/:sessionId/reply')
  reply(@Param('sessionId', ParseUUIDPipe) sessionId: string, @Body() dto: ReplyDto) {
    return this.agent.reply(sessionId, dto.answers);
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
