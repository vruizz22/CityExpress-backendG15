import { Module } from '@nestjs/common';
import { PackagesController } from '@packages/packages.controller';
import { PackagesService } from '@packages/packages.service';
import { PrismaService } from '@/prisma.service';
import { RoutingModule } from '@/routing/routing.module';

@Module({
  imports: [RoutingModule],
  controllers: [PackagesController],
  providers: [PackagesService, PrismaService],
})
export class PackagesModule {}
