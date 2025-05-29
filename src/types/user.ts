
export type UserRole = 'staff' | 'manager' | 'admin';

export interface AppUser {
  uid: string; // Changed from id to uid to align with Firebase
  email: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  role: UserRole;
  createdAt?: string; // ISO date string, set upon user creation
}
