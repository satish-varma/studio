
import * as z from "zod";

export const holidayFormSchema = z.object({
  name: z.string().min(2, { message: "Holiday name must be at least 2 characters." }),
  date: z.date({ required_error: "A date is required for the holiday." }),
  siteId: z.string().optional().nullable(), // null for global holiday
});

export type HolidayFormValues = z.infer<typeof holidayFormSchema>;

export interface Holiday {
  id: string; // Firestore document ID
  name: string;
  date: string; // Stored as YYYY-MM-DD
  siteId: string | null; // null indicates a global holiday for all sites
  createdAt: string; // ISO String
}
