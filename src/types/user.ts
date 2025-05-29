export type UserRole = 'staff' | 'manager' | 'admin';

export interface AppUser {
  id: string;
  email: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  role: UserRole;
}
