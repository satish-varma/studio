
export type UserRole = 'staff' | 'manager' | 'admin';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  role: UserRole;
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

// This type is no longer used and can be removed.
// It was specific to the Google Sheets integration.
export interface UserGoogleOAuthTokens {
  access_token: string;
  refresh_token: string;
  scope?: string | undefined;
  token_type: string;
  expiry_date?: number | null | undefined;
  id_token?: string | null | undefined;
}
