
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
export const paymentMethods = [
    "Cash",
    "Card",
    "UPI",
    "HungerBox",
    "Other",
] as const;

export const salePaymentsSchema = z.object({
    cash: z.coerce.number().min(0, "Amount must be non-negative").default(0),
    card: z.coerce.number().min(0, "Amount must be non-negative").default(0),
    upi: z.coerce.number().min(0, "Amount must be non-negative").default(0),
    hungerbox: z.coerce.number().min(0, "Amount must be non-negative").default(0),
    other: z.coerce.number().min(0, "Amount must be non-negative").default(0),
});

export type SalePayments = z.infer<typeof salePaymentsSchema>;

export const foodSaleTransactionFormSchema = z.object({
  breakfastSales: z.coerce.number().min(0, "Sales must be non-negative").optional(),
  lunchSales: z.coerce.number().min(0, "Sales must be non-negative").optional(),
  dinnerSales: z.coerce.number().min(0, "Sales must be non-negative").optional(),
  snacksSales: z.coerce.number().min(0, "Sales must be non-negative").optional(),
  
  totalAmount: z.coerce.number().min(0, "Total amount must be non-negative"),
  saleDate: z.date({ required_error: "Sale date is required." }),
  notes: z.string().optional().nullable(),
  payments: salePaymentsSchema,
}).refine(data => 
  (data.breakfastSales || 0) + 
  (data.lunchSales || 0) + 
  (data.dinnerSales || 0) + 
  (data.snacksSales || 0) > 0, 
  {
    message: "At least one sales category must have a value greater than zero.",
    path: ["totalAmount"], 
  }
).refine(data => {
    const salesTotal = (data.breakfastSales || 0) + (data.lunchSales || 0) + (data.dinnerSales || 0) + (data.snacksSales || 0);
    const paymentsTotal = (data.payments.cash || 0) + (data.payments.card || 0) + (data.payments.upi || 0) + (data.payments.hungerbox || 0) + (data.payments.other || 0);
    return Math.abs(salesTotal - paymentsTotal) < 0.01; // Allow for floating point inaccuracies
}, {
    message: "Total of all payment methods must equal the total sales amount.",
    path: ["payments"],
});


export type FoodSaleTransactionFormValues = z.infer<typeof foodSaleTransactionFormSchema>;

export interface FoodSaleTransaction extends Omit<FoodSaleTransactionFormValues, 'payments'> {
  id: string; // Firestore document ID (YYYY-MM-DD_stallId)
  payments: SalePayments;
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
