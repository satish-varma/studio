
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


// --------------- Food Sale Tracking (Payment Type Based) ---------------

const saleByPaymentTypeSchema = z.object({
  type: z.string().min(1, "Payment type name is required."),
  amount: z.coerce.number().min(0, "Amount must be a non-negative number.").default(0),
});

export type SaleByPaymentType = z.infer<typeof saleByPaymentTypeSchema>;

export const foodSaleTransactionFormSchema = z.object({
  saleDate: z.date({ required_error: "Sale date is required." }),
  salesByPaymentType: z.array(saleByPaymentTypeSchema).min(1, "At least one payment type must have a value greater than zero."),
  totalAmount: z.coerce.number().min(0.01, "Total amount must be greater than zero."),
  notes: z.string().optional().nullable(),
});


export type FoodSaleTransactionFormValues = z.infer<typeof foodSaleTransactionFormSchema>;

export interface FoodSaleTransaction extends Omit<FoodSaleTransactionFormValues, 'salesByPaymentType'> {
  id: string; // Firestore document ID (YYYY-MM-DD_stallId)
  salesByPaymentType: SaleByPaymentType[];
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
