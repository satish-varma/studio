
export type UserRole = 'staff' | 'manager' | 'admin';

export interface AppUser {
  uid: string; // Changed from id to uid to align with Firebase
  email: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  role: UserRole;
  createdAt?: string; // ISO date string, set upon user creation
  defaultSiteId: string | null;
  defaultStallId: string | null;

  // New fields for default filters, changed to string | null
  defaultItemSearchTerm: string | null;
  defaultItemCategoryFilter: string | null;
  defaultItemStockStatusFilter: string | null;
  defaultItemStallFilterOption: string | null; // "all", "master", or stallId
  defaultSalesDateRangeFrom: string | null; // ISO date string
  defaultSalesDateRangeTo: string | null; // ISO date string
  defaultSalesStaffFilter: string | null; // "all" or staff UID
}

export interface UserGoogleOAuthTokens {
  access_token: string;
  refresh_token: string; // Typically only provided on the first authorization
  scope?: string | undefined; 
  token_type: string; // Usually "Bearer"
  expiry_date?: number | null | undefined; // Timestamp (milliseconds since epoch) when the access_token expires
  id_token?: string | null | undefined; // If 'openid' scope was requested, can be null
}

