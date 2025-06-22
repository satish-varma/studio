
import * as z from "zod";
import type { Timestamp } from "firebase/firestore";

// --------------- Food Expense Tracking ---------------
export const foodExpenseCategories = [
  "Groceries",
  "Vegetables",
  "Fruits",
  "Dairy Products",
  "Meat & Poultry",
  "Bakery",
  "Beverages (Raw Material)", // e.g., coffee beans, tea leaves, syrups
  "Spices & Condiments",
  "Packaging Supplies",
  "Cleaning Supplies",
  "Equipment Maintenance",
  "Rent & Utilities",
  "Staff Salaries",
  "Marketing & Promotion",
  "Delivery Costs",
  "Licenses & Permits",
  "Miscellaneous",
] as const;

export type FoodExpenseCategory = (typeof foodExpenseCategories)[number];

export const foodItemExpenseFormSchema = z.object({
  itemName: z.string().min(1, "Item name is required"),
  category: z.enum(foodExpenseCategories, { required_error: "Category is required" }),
  quantity: z.coerce.number().positive("Quantity must be a positive number"),
  unit: z.string().min(1, "Unit is required (e.g., kg, ltr, pcs, box)"),
  pricePerUnit: z.coerce.number().min(0, "Price per unit must be non-negative"),
  totalCost: z.coerce.number().min(0, "Total cost must be non-negative"),
  purchaseDate: z.date({ required_error: "Purchase date is required." }),
  vendor: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type FoodItemExpenseFormValues = z.infer<typeof foodItemExpenseFormSchema>;

export interface FoodItemExpense extends FoodItemExpenseFormValues {
  id: string; // Firestore document ID
  siteId: string;
  stallId: string;
  recordedByUid: string;
  recordedByName?: string; // Optional: store user's name for easier display
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
}

export interface FoodItemExpenseAdmin extends Omit<FoodItemExpense, 'purchaseDate' | 'createdAt' | 'updatedAt'> {
  purchaseDate: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}


// --------------- Food Sale Tracking ---------------
export const foodMealTypes = [
  "Breakfast",
  "Lunch",
  "Dinner",
  "Snacks & Appetizers",
  "Desserts",
  "Beverages (Prepared)", // e.g., coffee, tea, juice sold
  "Combos & Platters",
  "Other",
] as const;

export type FoodMealType = (typeof foodMealTypes)[number];

export const foodSaleItemSchema = z.object({
  itemName: z.string().min(1, "Item name is required"),
  category: z.string().optional().nullable(), // Optional category for sold food item
  quantity: z.coerce.number().positive("Quantity must be positive"),
  pricePerUnit: z.coerce.number().min(0, "Price per unit must be non-negative"),
  totalPrice: z.coerce.number().min(0, "Total price must be non-negative"),
});

export type FoodSaleItem = z.infer<typeof foodSaleItemSchema>;

export const foodSaleTransactionFormSchema = z.object({
  mealType: z.enum(foodMealTypes).optional().nullable(),
  itemsSold: z.array(foodSaleItemSchema).min(1, "At least one item must be sold."),
  totalAmount: z.coerce.number().min(0, "Total amount must be non-negative"),
  saleDate: z.date({ required_error: "Sale date is required." }), // Should be datetime
  notes: z.string().optional().nullable(),
  paymentMethod: z.string().optional().nullable().default("Cash"),
});

export type FoodSaleTransactionFormValues = z.infer<typeof foodSaleTransactionFormSchema>;

export interface FoodSaleTransaction extends FoodSaleTransactionFormValues {
  id: string; // Firestore document ID
  siteId: string;
  stallId: string;
  recordedByUid: string;
  recordedByName?: string; // Optional
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
}


export interface FoodSaleTransactionAdmin extends Omit<FoodSaleTransaction, 'saleDate' | 'createdAt' | 'updatedAt'> {
  saleDate: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
      