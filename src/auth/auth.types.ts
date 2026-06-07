export type UserRole = 'admin' | 'user';

export interface AuthUser {
  sub: string;
  email: string | null;
  role: UserRole;
}

// Express Request enriquecido por el JwtAuthGuard.
export interface AuthenticatedRequest {
  user?: AuthUser;
  headers: Record<string, string | string[] | undefined>;
}
