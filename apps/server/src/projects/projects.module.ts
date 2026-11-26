import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ReportService } from './report.service';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService, ReportService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
