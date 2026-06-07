import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { jwtVerify } from 'jose';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from './auth.service';
import { AuthUser } from './auth.types';

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(() => 'jwks'),
  jwtVerify: jest.fn(),
}));

const jwtVerifyMock = jwtVerify as jest.MockedFunction<typeof jwtVerify>;

function contextWithAuth(authorization?: string): {
  ctx: ExecutionContext;
  req: { headers: Record<string, string | undefined>; user?: AuthUser };
} {
  const req = { headers: { authorization }, user: undefined } as {
    headers: Record<string, string | undefined>;
    user?: AuthUser;
  };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { ctx, req };
}

describe('JwtAuthGuard', () => {
  const authService = {
    resolveUser: jest.fn(),
  } as unknown as AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AUTH0_ISSUER = 'https://tenant.auth0.com/';
    process.env.AUTH0_AUDIENCE = 'https://api.andresitowan.com';
  });

  it('rechaza (401) cuando no hay header Authorization', async () => {
    const guard = new JwtAuthGuard(authService);
    const { ctx } = contextWithAuth(undefined);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(jwtVerifyMock).not.toHaveBeenCalled();
  });

  it('rechaza (401) cuando la firma del token es inválida', async () => {
    jwtVerifyMock.mockRejectedValueOnce(new Error('bad signature'));
    const guard = new JwtAuthGuard(authService);
    const { ctx } = contextWithAuth('Bearer abc.def.ghi');
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('sin claim de roles, delega el rol a la BD (fallback: roleFromClaim=null)', async () => {
    jwtVerifyMock.mockResolvedValueOnce({
      payload: { sub: 'auth0|123', email: 'a@b.com' },
    } as unknown as Awaited<ReturnType<typeof jwtVerify>>);
    const resolved: AuthUser = {
      sub: 'auth0|123',
      email: 'a@b.com',
      role: 'user',
    };
    (authService.resolveUser as jest.Mock).mockResolvedValueOnce(resolved);

    const guard = new JwtAuthGuard(authService);
    const { ctx, req } = contextWithAuth('Bearer good.token.here');

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(authService.resolveUser).toHaveBeenCalledWith(
      'auth0|123',
      'a@b.com',
      null,
    );
    expect(req.user).toEqual(resolved);
  });

  it('con claim admin, pasa role="admin" como fuente de verdad', async () => {
    jwtVerifyMock.mockResolvedValueOnce({
      payload: {
        sub: 'auth0|123',
        email: 'a@b.com',
        'https://cityexpress/roles': ['admin', 'whatever'],
      },
    } as unknown as Awaited<ReturnType<typeof jwtVerify>>);
    (authService.resolveUser as jest.Mock).mockResolvedValueOnce({
      sub: 'auth0|123',
      email: 'a@b.com',
      role: 'admin',
    });

    const guard = new JwtAuthGuard(authService);
    const { ctx } = contextWithAuth('Bearer good.token.here');

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(authService.resolveUser).toHaveBeenCalledWith(
      'auth0|123',
      'a@b.com',
      'admin',
    );
  });

  it('con claim sin admin, pasa role="user"', async () => {
    jwtVerifyMock.mockResolvedValueOnce({
      payload: {
        sub: 'auth0|123',
        'https://cityexpress/roles': ['user'],
      },
    } as unknown as Awaited<ReturnType<typeof jwtVerify>>);
    (authService.resolveUser as jest.Mock).mockResolvedValueOnce({
      sub: 'auth0|123',
      email: null,
      role: 'user',
    });

    const guard = new JwtAuthGuard(authService);
    const { ctx } = contextWithAuth('Bearer good.token.here');

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(authService.resolveUser).toHaveBeenCalledWith(
      'auth0|123',
      null,
      'user',
    );
  });

  it('falla si faltan las env de Auth0', async () => {
    delete process.env.AUTH0_ISSUER;
    const guard = new JwtAuthGuard(authService);
    const { ctx } = contextWithAuth('Bearer good.token.here');
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      'AUTH0_ISSUER y AUTH0_AUDIENCE',
    );
  });
});
