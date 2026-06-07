import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import { AuthService } from './auth.service';
import { AuthUser, UserRole } from './auth.types';

// Valida el access token de Auth0 (firma vía JWKS + iss/aud/exp) y pobla
// `req.user` con la identidad ya resuelta (incluye el rol desde la BD).
// Es defensa en profundidad: el gateway sigue validando, pero acá derivamos
// el usuario real desde el JWT (lo que el front espera para "mis envíos").
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private jwks?: JWTVerifyGetKey;
  private issuer?: string;
  private audience?: string;

  constructor(private readonly authService: AuthService) {}

  // Resolución perezosa: no revienta el bootstrap si las env no están
  // configuradas (dev/local sin Auth0); solo falla al golpear una ruta protegida.
  private getConfig(): {
    jwks: JWTVerifyGetKey;
    issuer: string;
    audience: string;
  } {
    if (!this.jwks) {
      const issuer = process.env.AUTH0_ISSUER;
      const audience = process.env.AUTH0_AUDIENCE;
      if (!issuer || !audience) {
        throw new Error('AUTH0_ISSUER y AUTH0_AUDIENCE deben estar seteadas');
      }
      this.issuer = issuer;
      this.audience = audience;
      this.jwks = createRemoteJWKSet(new URL('.well-known/jwks.json', issuer));
    }
    return {
      jwks: this.jwks,
      issuer: this.issuer!,
      audience: this.audience!,
    };
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: AuthUser;
    }>();

    const token = this.extractToken(req.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Falta el token Bearer');
    }

    const { jwks, issuer, audience } = this.getConfig();

    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, jwks, { issuer, audience }));
    } catch {
      throw new UnauthorizedException('Token inválido');
    }

    if (!payload.sub) {
      throw new UnauthorizedException('El token no tiene subject');
    }

    const email = typeof payload.email === 'string' ? payload.email : null;
    const roleFromClaim = this.parseRolesClaim(payload);
    req.user = await this.authService.resolveUser(
      payload.sub,
      email,
      roleFromClaim,
    );
    return true;
  }

  // RNF05: el claim de Auth0 es la fuente de verdad del rol. Si el claim viene,
  // manda (admin si la lista lo incluye, si no "user"); si NO viene, devolvemos
  // null y el AuthService cae al espejo User.role de la BD (fallback durante la
  // transición / para bootstrap por SQL). El nombre del claim es configurable.
  private parseRolesClaim(payload: JWTPayload): UserRole | null {
    const claimName =
      process.env.AUTH0_ROLES_CLAIM ?? 'https://cityexpress/roles';
    const raw = payload[claimName];
    const roles = Array.isArray(raw)
      ? raw.filter((r): r is string => typeof r === 'string')
      : typeof raw === 'string'
        ? [raw]
        : [];
    if (roles.length === 0) {
      return null;
    }
    return roles.includes('admin') ? 'admin' : 'user';
  }

  private extractToken(header: string | string[] | undefined): string | null {
    const raw = Array.isArray(header) ? header[0] : header;
    if (!raw) {
      return null;
    }
    const [scheme, value] = raw.split(' ');
    return scheme === 'Bearer' && value ? value : null;
  }
}
