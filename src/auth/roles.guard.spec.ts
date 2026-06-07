import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { AuthUser, UserRole } from './auth.types';

function buildContext(user?: AuthUser): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const admin: AuthUser = { sub: 's1', email: null, role: 'admin' };
  const normal: AuthUser = { sub: 's2', email: null, role: 'user' };

  function guardRequiring(roles: UserRole[] | undefined) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(roles),
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  }

  it('deja pasar cuando el handler no declara @Roles', () => {
    expect(guardRequiring(undefined).canActivate(buildContext(normal))).toBe(
      true,
    );
  });

  it('deja pasar a un admin en ruta admin-only', () => {
    expect(guardRequiring(['admin']).canActivate(buildContext(admin))).toBe(
      true,
    );
  });

  it('bloquea (403) a un user en ruta admin-only', () => {
    expect(() =>
      guardRequiring(['admin']).canActivate(buildContext(normal)),
    ).toThrow(ForbiddenException);
  });

  it('bloquea (403) si no hay usuario en el request', () => {
    expect(() =>
      guardRequiring(['admin']).canActivate(buildContext(undefined)),
    ).toThrow(ForbiddenException);
  });
});
