import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentEventsService } from './agent-events.service';
import { AgentService } from './agent.service';

@Module({
  controllers: [AgentController],
  providers: [AgentService, AgentEventsService],
  exports: [AgentService],
})
export class AgentModule {}
