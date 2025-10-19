import * as z from "zod";

export const stockItemSchema = z.object({
  name: z.string().min(2, { message: "Item name must be at least 2 characters." }),
  category: z.string().min(2, { message: "Category must be at least 2 characters." }),
  description: z.string().optional(),
  quantity: z.coerce.number().int().min(0, { message: "Quantity cannot be negative." }),
  unit: z.string().min(1, { message: "Unit is required (e.g., pcs, kg, ltr)." }),
  price: z.coerce.number().min(0.00, { message: "Selling price must be a non-negative value." }),
  costPrice: z.coerce.number().min(0, { message: "Cost price must be a non-negative value." }).optional().default(0),
  lowStockThreshold: z.coerce.number().int().min(0, { message: "Low stock threshold cannot be negative." }),
  imageUrl: z.string().url({ message: "Please enter a valid URL for the image." }).optional().or(z.literal('')),
  siteId: z.string().nullable().optional(),
  stallId: z.string().nullable().optional(),
  originalMasterItemId: z.string().nullable().optional(), // Link to master stock if allocated
});

export type StockItemFormValues = z.infer<typeof stockItemSchema>;

export interface StockItem extends StockItemFormValues {
  id: string;
  lastUpdated: string; // ISO date string for Firestore, will be AdminTimestamp on server
  // siteId and stallId are now explicitly part of StockItemFormValues and can be null/undefined
  // An item with a siteId and null stallId is considered "master stock" for that site.
  // originalMasterItemId links a stall item back to its master stock origin.
}
