import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { AuthUser, UserRole } from './auth.types';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  // Resuelve la identidad a partir del `sub` del JWT. El rol viene del claim de
  // Auth0 (`roleFromClaim`): si el claim trae rol, manda y además lo sincronizamos
  // en User.role (espejo administrable). Si el claim NO viene (null), usamos el
  // espejo User.role de la BD como fallback. Crea el User en el primer login.
  async resolveUser(
    subject: string,
    email: string | null,
    roleFromClaim: UserRole | null = null,
  ): Promise<AuthUser> {
    const user = await this.prisma.user.upsert({
      where: { subject },
      update: {
        ...(email ? { email } : {}),
        ...(roleFromClaim ? { role: roleFromClaim } : {}),
      },
      create: {
        subject,
        email: email ?? undefined,
        role: roleFromClaim ?? 'user',
      },
    });

    return {
      sub: user.subject,
      email: user.email ?? null,
      role: roleFromClaim ?? AuthService.normalizeRole(user.role),
    };
  }

  async listUsers(): Promise<{
    data: Array<{
      subject: string;
      email: string | null;
      role: string;
      createdAt: Date;
    }>;
  }> {
    const users = await this.prisma.user.findMany({
      select: { subject: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    return { data: users };
  }

  private static normalizeRole(role: string): UserRole {
    return role === 'admin' ? 'admin' : 'user';
  }
}
