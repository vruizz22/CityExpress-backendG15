import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { AuthUser } from './auth-user.interface';
import { extractRoles, UserService } from './user.service';

interface Auth0Payload {
  sub: string;
  email?: string;
  [key: string]: unknown;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly userService: UserService) {
    const domain = process.env.AUTH0_DOMAIN;
    super({
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://${domain}/.well-known/jwks.json`,
      }),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      audience: process.env.AUTH0_AUDIENCE,
      issuer: `https://${domain}/`,
      algorithms: ['RS256'],
    });
  }

  async validate(payload: Auth0Payload): Promise<AuthUser> {
    const roles = extractRoles(payload);
    const user = await this.userService.upsertFromToken(
      payload.sub,
      payload.email ?? null,
    );
    return {
      userId: user.id,
      sub: payload.sub,
      email: payload.email ?? null,
      roles,
      isAdmin: roles.includes('admin'),
    };
  }
}
