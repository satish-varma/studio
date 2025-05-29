
export interface Site {
  id: string;
  name: string;
  location?: string; // Optional, e.g., "City, State" or "Mall Name"
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
}

export const siteFormSchema = { // Using a simple object for Zod schema inference in the form
  name: { min: 2, message: "Site name must be at least 2 characters." },
  location: { optional: true },
};

export type SiteFormValues = {
  name: string;
  location?: string;
};
