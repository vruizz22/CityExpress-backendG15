import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import { CurrentUser } from './current-user.decorator';
import { AuthService } from './auth.service';
import { AuthUser } from './auth.types';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Cualquier usuario autenticado: el front lo usa para saber su identidad/rol.
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  // Solo admin: demuestra la separación de permisos (user → 403, sin token → 401).
  @Get('admin/users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  listUsers() {
    return this.authService.listUsers();
  }
}
