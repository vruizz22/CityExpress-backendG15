import { Module } from '@nestjs/common';
import { RoutingModule } from '@/routing/routing.module';
import { DevSeedService } from './dev-seed.service';

@Module({
  imports: [RoutingModule],
  providers: [DevSeedService],
})
export class DevSeedModule {}
