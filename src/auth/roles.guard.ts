import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { AuthUser, UserRole } from './auth.types';

// Debe correr DESPUÉS de JwtAuthGuard (que pobla req.user). Si el handler no
// declara @Roles, deja pasar; si declara, exige que el rol del usuario calce.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException('Se requiere autenticación');
    }
    if (!required.includes(user.role)) {
      throw new ForbiddenException('Rol insuficiente');
    }
    return true;
  }
}
