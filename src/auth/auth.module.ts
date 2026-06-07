import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { PrismaService } from '@/prisma.service';

// Exporta los guards y el service para que otros módulos puedan proteger sus
// rutas con @UseGuards(JwtAuthGuard, RolesGuard) cuando Andre agregue ownership.
@Module({
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard, PrismaService],
  exports: [AuthService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
