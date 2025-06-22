
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
  "Beverages (Raw Material)",
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

export const paymentMethods = ["Cash", "Card", "UPI", "Other"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

// New, simplified schema
export const foodExpenseFormSchema = z.object({
  category: z.enum(foodExpenseCategories, { required_error: "Category is required" }),
  totalCost: z.coerce.number().positive("Total cost must be a positive number"),
  paymentMethod: z.enum(paymentMethods, { required_error: "Payment method is required." }),
  purchaseDate: z.date({ required_error: "Purchase date is required." }),
  vendor: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  billImageUrl: z.string().url({ message: "Please enter a valid URL." }).optional().or(z.literal("")),
});

export type FoodItemExpenseFormValues = z.infer<typeof foodExpenseFormSchema>;

// This interface is now simplified and doesn't contain the item-specific fields.
export interface FoodItemExpense {
  id: string; // Firestore document ID
  category: FoodExpenseCategory;
  totalCost: number;
  paymentMethod: PaymentMethod;
  purchaseDate: Date | Timestamp;
  vendor?: string | null;
  notes?: string | null;
  billImageUrl?: string | null;
  siteId: string;
  stallId: string;
  recordedByUid: string;
  recordedByName?: string; // Optional: store user's name for easier display
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
}

// Admin type for Firestore admin operations (if needed)
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
