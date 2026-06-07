import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { AuthUser } from './auth-user.interface';
import { UserService } from './user.service';

export const isAuthDisabled = (): boolean =>
  process.env.AUTH_DISABLED === 'true';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly userService: UserService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!isAuthDisabled()) {
      return (await super.canActivate(context)) as boolean;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const sub = (req.headers['x-user-sub'] as string) ?? 'dev-user';
    const email = (req.headers['x-user-email'] as string) ?? null;
    const rolesHeader = (req.headers['x-user-roles'] as string) ?? '';
    const roles = rolesHeader
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);

    const user = await this.userService.upsertFromToken(sub, email);
    const authUser: AuthUser = {
      userId: user.id,
      sub,
      email,
      roles,
      isAdmin: roles.includes('admin'),
    };
    (req as Request & { user: AuthUser }).user = authUser;
    return true;
  }
}
