
import * as z from "zod";

export const STALL_TYPES = [
  "Retail Counter",
  "Storage Room",
  "Pop-up Booth",
  "Display Area",
  "Service Desk",
  "Food Stall",
  "Information Kiosk",
  "Warehouse Section",
  "Other",
] as const;

export const stallFormSchema = z.object({
  name: z.string().min(2, { message: "Stall name must be at least 2 characters." }),
  siteId: z.string().min(1, { message: "Site ID is required." }), // Hidden field, but good for validation
  stallType: z.enum(STALL_TYPES, {
    required_error: "You need to select a stall type.",
  }),
  // Add any other stall-specific fields here, e.g., dimensions, specific equipment, etc.
});

export type StallFormValues = z.infer<typeof stallFormSchema>;

export interface Stall extends StallFormValues {
  id: string;
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
}
