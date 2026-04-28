import { Module } from '@nestjs/common';
import { PackagesController } from '@packages/packages.controller';
import { PackagesService } from '@packages/packages.service';
import { PrismaService } from '@/prisma.service';

@Module({
  controllers: [PackagesController],
  providers: [PackagesService, PrismaService],
})
export class PackagesModule {}
