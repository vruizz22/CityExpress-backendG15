import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PackagesModule } from '@packages/packages.module';
import { RoutingModule } from '@/routing/routing.module';

@Module({
  imports: [PackagesModule, RoutingModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
