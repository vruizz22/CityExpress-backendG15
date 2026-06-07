import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PackagesModule } from '@packages/packages.module';
import { RoutingModule } from '@/routing/routing.module';
import { RoutesModule } from '@/routes/routes.module';
import { AuthModule } from '@/auth/auth.module';

@Module({
  imports: [PackagesModule, RoutingModule, RoutesModule, AuthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
