
export type UserRole = 'staff' | 'manager' | 'admin';

export interface AppUser {
  uid: string; // Changed from id to uid to align with Firebase
  email: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  role: UserRole;
  createdAt?: string; // ISO date string, set upon user creation
  defaultSiteId?: string;
  defaultStallId?: string;

  // New fields for default filters
  defaultItemSearchTerm?: string;
  defaultItemCategoryFilter?: string;
  defaultItemStockStatusFilter?: string;
  defaultItemStallFilterOption?: string; // "all", "master", or stallId
  defaultSalesDateRangeFrom?: string; // ISO date string
  defaultSalesDateRangeTo?: string; // ISO date string
  defaultSalesStaffFilter?: string; // "all" or staff UID
}

export interface UserGoogleOAuthTokens {
  access_token: string;
  refresh_token: string; // Typically only provided on the first authorization
  scope: string;
  token_type: string; // Usually "Bearer"
  expiry_date: number; // Timestamp (milliseconds since epoch) when the access_token expires
  id_token?: string; // If 'openid' scope was requested
}
