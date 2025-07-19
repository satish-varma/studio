
export type UserRole = 'staff' | 'manager' | 'admin';
export type UserStatus = 'active' | 'inactive';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  role: UserRole;
  status?: UserStatus; // 'active' or 'inactive', defaults to 'active'
  createdAt?: string; // ISO date string, set upon user creation
  
  // For Staff:
  defaultSiteId: string | null; // Remains for staff
  defaultStallId: string | null; // Remains for staff

  // For Managers:
  managedSiteIds: string[] | null; // New: Array of site IDs a manager is responsible for

  // For all users (preferences):
  defaultItemSearchTerm: string | null;
  defaultItemCategoryFilter: string | null;
  defaultItemStockStatusFilter: string | null;
  defaultItemStallFilterOption: string | null; // "all", "master", or stallId
  defaultSalesDateRangeFrom: string | null; // ISO date string
  defaultSalesDateRangeTo: string | null; // ISO date string
  defaultSalesStaffFilter: string | null; // "all" or staff UID
}

// UserGoogleOAuthTokens type removed as the feature is deprecated.
