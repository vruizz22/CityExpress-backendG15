import { Module, Provider } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PrismaService } from '@/prisma.service';
import { JwtAuthGuard, isAuthDisabled } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';
import { RolesGuard } from './roles.guard';
import { UserService } from './user.service';

const strategyProviders: Provider[] = isAuthDisabled() ? [] : [JwtStrategy];

@Module({
  imports: [PassportModule],
  providers: [
    PrismaService,
    UserService,
    JwtAuthGuard,
    RolesGuard,
    ...strategyProviders,
  ],
  exports: [JwtAuthGuard, RolesGuard, UserService],
})
export class AuthModule {}
