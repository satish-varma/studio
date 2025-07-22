
import * as z from "zod";
import type { Timestamp } from "firebase/firestore";

// --------------- Food Vendor Management ---------------
export interface FoodVendor {
  id: string; // Firestore document ID
  name: string;
  createdAt: string; // ISO date string
}

// --------------- Food Expense Tracking ---------------
export const foodExpenseCategories = [
  "Bakery",
  "Beverages (Raw Material)",
  "Chat",
  "Cleaning Supplies",
  "Dairy Products",
  "Delivery Costs",
  "Fruits",
  "Groceries",
  "Meat & Poultry",
  "Miscellaneous",
  "MRP",
  "Rent & Utilities",
  "Vegetables",
  "Other",
] as const;

export type FoodExpenseCategory = (typeof foodExpenseCategories)[number];

export const paymentMethods = ["Cash", "Card", "UPI", "Other"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export const foodExpenseFormSchema = z.object({
  category: z.enum(foodExpenseCategories, { required_error: "Category is required" }),
  otherCategoryDetails: z.string().optional().nullable(), // New field for custom category
  totalCost: z.coerce.number().positive("Total cost must be a positive number"),
  paymentMethod: z.enum(paymentMethods, { required_error: "Payment method is required." }),
  otherPaymentMethodDetails: z.string().optional().nullable(),
  purchaseDate: z.date({ required_error: "Purchase date is required." }),
  vendor: z.string({ required_error: "Vendor selection is required." }).min(1, "Vendor selection is required."),
  otherVendorDetails: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  billImageUrl: z.string().url({ message: "Please enter a valid URL." }).optional().or(z.literal("")),
}).refine(data => {
    if (data.paymentMethod === "Other" && (!data.otherPaymentMethodDetails || data.otherPaymentMethodDetails.trim() === "")) {
        return false;
    }
    return true;
}, {
    message: "Please specify the 'other' payment method.",
    path: ["otherPaymentMethodDetails"],
}).refine(data => {
    if (data.vendor === "Other" && (!data.otherVendorDetails || data.otherVendorDetails.trim() === "")) {
        return false;
    }
    return true;
}, {
    message: "Please specify the vendor name.",
    path: ["otherVendorDetails"],
}).refine(data => {
    // New refinement for custom category
    if (data.category === "Other" && (!data.otherCategoryDetails || data.otherCategoryDetails.trim() === "")) {
        return false;
    }
    return true;
}, {
    message: "Please specify the 'other' category name.",
    path: ["otherCategoryDetails"],
});


export type FoodItemExpenseFormValues = z.infer<typeof foodExpenseFormSchema>;

export interface FoodItemExpense {
  id: string; // Firestore document ID
  category: FoodExpenseCategory | string; // Allow custom strings
  totalCost: number;
  paymentMethod: PaymentMethod;
  otherPaymentMethodDetails?: string | null;
  purchaseDate: Date | Timestamp;
  vendor?: string | null; // Changed from enum to string
  otherVendorDetails?: string | null;
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
