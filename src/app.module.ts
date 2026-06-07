import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PackagesModule } from '@packages/packages.module';
import { RoutingModule } from '@/routing/routing.module';
import { RoutesModule } from '@/routes/routes.module';
import { JobsModule } from '@/jobs/jobs.module';

@Module({
  imports: [PackagesModule, RoutingModule, RoutesModule, JobsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
