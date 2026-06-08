import { Module } from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { ReceivedTableRepository } from './received-table.repository';
import { RouteComputationService } from './route-computation.service';

// RF02
@Module({
  providers: [PrismaService, ReceivedTableRepository, RouteComputationService],
  exports: [ReceivedTableRepository, RouteComputationService],
})
export class RoutingCalcModule {}
