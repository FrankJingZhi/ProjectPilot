import { Module } from '@nestjs/common';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ReportService } from './report.service';

@Module({
  controllers: [ProjectsController, MembersController],
  providers: [ProjectsService, ReportService, MembersService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
