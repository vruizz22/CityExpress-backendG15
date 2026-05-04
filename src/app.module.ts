import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PackagesModule } from '@packages/packages.module';
import { RoutesModule } from '@routes/routes.module';
import { AuditModule } from '@audit/audit.module';
import { RoutingModule } from '@/routing/routing.module';

@Module({
  imports: [PackagesModule, RoutesModule, AuditModule, RoutingModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
