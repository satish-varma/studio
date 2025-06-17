
import * as z from "zod";

// --------------- Food Expense Tracking ---------------
export const foodExpenseCategories = [
  "Groceries",
  "Vegetables",
  "Dairy Products",
  "Meat & Poultry",
  "Beverages",
  "Packaging Supplies",
  "Cleaning Supplies",
  "Utilities",
  "Rent",
  "Other",
] as const;

export type FoodExpenseCategory = (typeof foodExpenseCategories)[number];

export const foodItemExpenseSchema = z.object({
  itemName: z.string().min(1, "Item name is required"),
  category: z.enum(foodExpenseCategories),
  quantity: z.coerce.number().positive("Quantity must be positive"),
  unit: z.string().min(1, "Unit is required (e.g., kg, ltr, pcs, box)"),
  pricePerUnit: z.coerce.number().min(0, "Price per unit must be non-negative"),
  totalCost: z.coerce.number().min(0, "Total cost must be non-negative"),
  purchaseDate: z.date({ required_error: "Purchase date is required." }),
  vendor: z.string().optional(),
  siteId: z.string().min(1, "Site ID is required"),
  stallId: z.string().min(1, "Stall ID is required"),
  recordedByUid: z.string().min(1, "Recorder UID is required"),
  notes: z.string().optional(),
});

export type FoodItemExpenseFormValues = z.infer<typeof foodItemExpenseSchema>;

export interface FoodItemExpense extends FoodItemExpenseFormValues {
  id: string;
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
}

// --------------- Food Sale Tracking ---------------
export const foodMealTypes = [
  "Breakfast",
  "Lunch",
  "Snacks",
  "Dinner",
  "Beverages",
  "Other",
] as const;

export type FoodMealType = (typeof foodMealTypes)[number];

export const foodSaleItemSchema = z.object({
  itemName: z.string().min(1, "Item name is required"),
  category: z.string().optional(), // Optional category for sold food item
  quantity: z.coerce.number().positive("Quantity must be positive"),
  pricePerUnit: z.coerce.number().min(0, "Price per unit must be non-negative"),
  totalPrice: z.coerce.number().min(0, "Total price must be non-negative"),
});

export type FoodSaleItem = z.infer<typeof foodSaleItemSchema>;

export const foodSaleTransactionSchema = z.object({
  mealType: z.enum(foodMealTypes),
  itemsSold: z.array(foodSaleItemSchema).min(1, "At least one item must be sold."),
  totalAmount: z.coerce.number().min(0, "Total amount must be non-negative"),
  saleDate: z.date({ required_error: "Sale date is required." }),
  siteId: z.string().min(1, "Site ID is required"),
  stallId: z.string().min(1, "Stall ID is required"),
  recordedByUid: z.string().min(1, "Recorder UID is required"),
  notes: z.string().optional(),
  paymentMethod: z.string().optional().default("Cash"), // e.g., Cash, Card, UPI
});

export type FoodSaleTransactionFormValues = z.infer<typeof foodSaleTransactionSchema>;

export interface FoodSaleTransaction extends FoodSaleTransactionFormValues {
  id: string;
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
}
