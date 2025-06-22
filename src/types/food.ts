
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


// --------------- Food Sale Tracking (Meal Time & Payment Type Based) ---------------

const paymentBreakdownSchema = z.object({
  hungerbox: z.coerce.number().min(0).default(0),
  upi: z.coerce.number().min(0).default(0),
  other: z.coerce.number().min(0).default(0),
});

export type PaymentBreakdown = z.infer<typeof paymentBreakdownSchema>;

export const foodSaleTransactionFormSchema = z.object({
  saleDate: z.date({ required_error: "Sale date is required." }),
  breakfast: paymentBreakdownSchema.optional().default({ hungerbox: 0, upi: 0, other: 0 }),
  lunch: paymentBreakdownSchema.optional().default({ hungerbox: 0, upi: 0, other: 0 }),
  dinner: paymentBreakdownSchema.optional().default({ hungerbox: 0, upi: 0, other: 0 }),
  snacks: paymentBreakdownSchema.optional().default({ hungerbox: 0, upi: 0, other: 0 }),
  totalAmount: z.coerce.number().min(0),
  notes: z.string().optional().nullable(),
});


export type FoodSaleTransactionFormValues = z.infer<typeof foodSaleTransactionFormSchema>;

export interface FoodSaleTransaction extends Omit<FoodSaleTransactionFormValues, 'breakfast' | 'lunch' | 'dinner' | 'snacks'> {
  id: string; // Firestore document ID (YYYY-MM-DD_stallId)
  breakfast: PaymentBreakdown;
  lunch: PaymentBreakdown;
  dinner: PaymentBreakdown;
  snacks: PaymentBreakdown;
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
