
import * as z from "zod";

export const stockItemSchema = z.object({
  name: z.string().min(2, { message: "Item name must be at least 2 characters." }),
  category: z.string().min(2, { message: "Category must be at least 2 characters." }),
  quantity: z.coerce.number().int().min(0, { message: "Quantity cannot be negative." }),
  unit: z.string().min(1, { message: "Unit is required (e.g., pcs, kg, ltr)." }),
  price: z.coerce.number().min(0.00, { message: "Price must be a non-negative value." }), // Allow 0 for price if item is free/not for sale
  lowStockThreshold: z.coerce.number().int().min(0, { message: "Low stock threshold cannot be negative." }),
  imageUrl: z.string().url({ message: "Please enter a valid URL for the image." }).optional().or(z.literal('')),
  siteId: z.string().nullable().optional(), 
  stallId: z.string().nullable().optional(),
});

export type StockItemFormValues = z.infer<typeof stockItemSchema>;

export interface StockItem extends StockItemFormValues {
  id: string;
  lastUpdated: string; // ISO date string for Firestore, will be AdminTimestamp on server
  // siteId and stallId are now part of StockItemFormValues
}
