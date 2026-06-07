import { SetMetadata } from '@nestjs/common';
import { UserRole } from './auth.types';

export const ROLES_KEY = 'roles';

// Marca un handler/controlador con los roles permitidos. Se evalúa en RolesGuard.
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
