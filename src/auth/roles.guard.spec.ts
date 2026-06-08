import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { AuthUser } from './auth-user.interface';

const ctxWith = (user?: Partial<AuthUser>): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  }) as unknown as ExecutionContext;

const guardWith = (required: string[] | undefined) => {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(required),
  } as unknown as Reflector;
  return new RolesGuard(reflector);
};

describe('RolesGuard', () => {
  it('permite cuando no hay roles requeridos', () => {
    expect(guardWith(undefined).canActivate(ctxWith({ roles: [] }))).toBe(true);
  });

  it('permite a un admin acceder a endpoint @Roles(admin)', () => {
    const guard = guardWith(['admin']);
    expect(
      guard.canActivate(ctxWith({ roles: ['admin'], isAdmin: true })),
    ).toBe(true);
  });

  it('bloquea a un usuario sin el rol requerido', () => {
    const guard = guardWith(['admin']);
    expect(() => guard.canActivate(ctxWith({ roles: ['user'] }))).toThrow(
      ForbiddenException,
    );
  });
});
