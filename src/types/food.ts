
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
  "Groceries",
  "Vegetables",
  "MRP",
  "Chat",
  "Fruits",
  "Dairy Products",
  "Bakery",
  "Delivery Costs",
  "Meat & Poultry",
  "Beverages (Raw Material)",
  "Cleaning Supplies",
  "Rent & Utilities",
  "Miscellaneous",
  "Other",
] as const;


export type FoodExpenseCategory = (typeof foodExpenseCategories)[number];

export const paymentMethods = ["Cash", "Card", "UPI", "Other"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

// Define a base object schema without refinements
const baseFoodExpenseSchema = z.object({
  category: z.string().min(1, { message: "Category is required." }),
  otherCategoryDetails: z.string().optional().nullable(),
  totalCost: z.coerce.number().positive("Total cost must be a positive number"),
  paymentMethod: z.string().min(1, { message: "Payment method is required." }),
  otherPaymentMethodDetails: z.string().optional().nullable(),
  purchaseDate: z.date({ required_error: "Purchase date is required." }),
  vendor: z.string({ required_error: "Vendor selection is required." }).min(1, "Vendor selection is required."),
  otherVendorDetails: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  billImageUrl: z.string().url({ message: "Please enter a valid URL." }).optional().or(z.literal("")),
});


// Now, apply refinements for the creation form schema
export const foodExpenseFormSchema = baseFoodExpenseSchema.refine(data => {
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
    if (data.category === "Other" && (!data.otherCategoryDetails || data.otherCategoryDetails.trim() === "")) {
        return false;
    }
    return true;
}, {
    message: "Please specify the 'other' category name.",
    path: ["otherCategoryDetails"],
});


// New schema for the edit form, extending the BASE schema before refinements
export const foodExpenseEditFormSchema = baseFoodExpenseSchema.extend({
    siteId: z.string().min(1, "Site is required."),
    stallId: z.string().min(1, "Stall is required."),
});


export type FoodItemExpenseFormValues = z.infer<typeof foodExpenseFormSchema>;
export type FoodItemExpenseEditFormValues = z.infer<typeof foodExpenseEditFormSchema>;


export interface FoodItemExpense {
  id: string; // Firestore document ID
  category: FoodExpenseCategory | string; // Allow custom strings
  totalCost: number;
  paymentMethod: PaymentMethod | string;
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

// --------------- Food Expense Presets ---------------
export interface FoodExpensePreset {
  id: string; // Firestore document ID
  category: FoodExpenseCategory | string;
  defaultVendor?: string;
  defaultPaymentMethod?: PaymentMethod | string;
  defaultNotes?: string;
  defaultTotalCost?: number;
  createdAt: string; // ISO date string
}

export const foodExpensePresetFormSchema = z.object({
  category: z.enum(foodExpenseCategories, { required_error: "Category is required" }),
  defaultVendor: z.string().optional(),
  defaultPaymentMethod: z.enum(paymentMethods).optional(),
  defaultNotes: z.string().optional(),
  defaultTotalCost: z.coerce.number().min(0).optional(),
});

export type FoodExpensePresetFormValues = z.infer<typeof foodExpensePresetFormSchema>;


// --------------- Food Sale Tracking (Simplified Daily Total) ---------------
export const foodSaleTypes = ["Non-MRP", "MRP"] as const;
export type FoodSaleType = (typeof foodSaleTypes)[number];

// Refactored to a flat structure for easier CSV mapping and form handling.
export const foodSaleTransactionFormSchema = z.object({
  saleDate: z.date({ required_error: "Sale date is required." }),
  saleType: z.enum(foodSaleTypes).default("Non-MRP"),
  hungerboxSales: z.coerce.number().min(0).default(0),
  upiSales: z.coerce.number().min(0).default(0),
  totalAmount: z.coerce.number().min(0),
  notes: z.string().optional().nullable(),
});


export type FoodSaleTransactionFormValues = z.infer<typeof foodSaleTransactionFormSchema>;

export interface FoodSaleTransaction {
  id: string; // Firestore document ID (YYYY-MM-DD_stallId_saleType)
  saleDate: Date | Timestamp;
  siteId: string;
  stallId: string;
  saleType: FoodSaleType;
  hungerboxSales: number;
  upiSales: number;
  totalAmount: number;
  notes: string | null | undefined;
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
