import { AuthService } from './auth.service';
import { PrismaService } from '@/prisma.service';

describe('AuthService', () => {
  function build() {
    const prisma = {
      user: {
        upsert: jest.fn(),
        findMany: jest.fn(),
      },
    } as unknown as PrismaService;
    return { prisma, service: new AuthService(prisma) };
  }

  it('upsertea por subject y normaliza el rol "user" por defecto', async () => {
    const { prisma, service } = build();
    (prisma.user.upsert as jest.Mock).mockResolvedValueOnce({
      subject: 'auth0|1',
      email: 'a@b.com',
      role: 'user',
    });

    const user = await service.resolveUser('auth0|1', 'a@b.com');

    expect(user).toEqual({ sub: 'auth0|1', email: 'a@b.com', role: 'user' });
    const calls = (prisma.user.upsert as jest.Mock).mock.calls as Array<
      [{ where: { subject: string } }]
    >;
    expect(calls[0][0].where.subject).toBe('auth0|1');
  });

  it('mapea cualquier rol desconocido a "user"', async () => {
    const { prisma, service } = build();
    (prisma.user.upsert as jest.Mock).mockResolvedValueOnce({
      subject: 'auth0|2',
      email: null,
      role: 'superuser',
    });

    const user = await service.resolveUser('auth0|2', null);
    expect(user.role).toBe('user');
  });

  it('preserva el rol admin de la BD cuando no hay claim (fallback)', async () => {
    const { prisma, service } = build();
    (prisma.user.upsert as jest.Mock).mockResolvedValueOnce({
      subject: 'auth0|3',
      email: null,
      role: 'admin',
    });

    const user = await service.resolveUser('auth0|3', null);
    expect(user.role).toBe('admin');
  });

  it('el claim manda sobre la BD y sincroniza el espejo User.role', async () => {
    const { prisma, service } = build();
    // La BD dice "user", pero el claim dice "admin" → debe ganar el claim.
    (prisma.user.upsert as jest.Mock).mockResolvedValueOnce({
      subject: 'auth0|4',
      email: null,
      role: 'user',
    });

    const user = await service.resolveUser('auth0|4', null, 'admin');

    expect(user.role).toBe('admin');
    const calls = (prisma.user.upsert as jest.Mock).mock.calls as Array<
      [{ update: { role?: string }; create: { role?: string } }]
    >;
    // Sincroniza el espejo: el upsert escribe role=admin tanto en update como en create.
    expect(calls[0][0].update.role).toBe('admin');
    expect(calls[0][0].create.role).toBe('admin');
  });
});
