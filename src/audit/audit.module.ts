import { Module } from '@nestjs/common';
import { AuditService } from '@audit/audit.service';
import { PrismaService } from '@/prisma.service';

@Module({
  providers: [AuditService, PrismaService],
  exports: [AuditService],
})
export class AuditModule {}
