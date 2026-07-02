import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

// RF01
@Injectable()
export class SubscriptionTickGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const secret = process.env.SUBSCRIPTION_TICK_SECRET;
    if (!secret) {
      return true;
    }
    const req = context.switchToHttp().getRequest<Request>();
    if (req.headers['x-tick-secret'] !== secret) {
      throw new UnauthorizedException('Tick secret inválido');
    }
    return true;
  }
}
