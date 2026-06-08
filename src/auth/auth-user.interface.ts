export interface AuthUser {
  userId: string;
  sub: string;
  email: string | null;
  roles: string[];
  isAdmin: boolean;
}
