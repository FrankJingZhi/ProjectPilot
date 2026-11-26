import { Module } from '@nestjs/common';
import { ScheduleService } from './schedule.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  controllers: [TasksController],
  providers: [TasksService, ScheduleService],
  exports: [TasksService],
})
export class TasksModule {}
