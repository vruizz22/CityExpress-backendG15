import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma.service';

export const ROLES_CLAIM =
  process.env.AUTH0_ROLES_CLAIM ?? 'https://cityexpress/roles';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertFromToken(
    subject: string,
    email?: string | null,
  ): Promise<{ id: string }> {
    const user = await this.prisma.user.upsert({
      where: { subject },
      update: email ? { email } : {},
      create: { subject, email: email ?? null },
      select: { id: true },
    });
    return user;
  }
}

export function extractRoles(payload: Record<string, unknown>): string[] {
  const claim = payload[ROLES_CLAIM] ?? payload['permissions'];
  if (Array.isArray(claim)) {
    return claim.filter((r): r is string => typeof r === 'string');
  }
  return [];
}
