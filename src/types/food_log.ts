
export type FoodStallActivityType =
  | 'EXPENSE_RECORDED'
  | 'SALE_RECORDED_OR_UPDATED';

export interface FoodStallActivityLog {
  id?: string; // Firestore document ID
  siteId: string;
  stallId: string;
  userId: string;
  userName?: string;
  timestamp: string; // ISO string
  type: FoodStallActivityType;
  relatedDocumentId: string; // ID of the FoodItemExpense or FoodSaleTransaction document
  details: {
    // Expense details
    expenseCategory?: string;
    totalCost?: number;
    vendor?: string;
    // Sale details
    totalAmount?: number;
    // Common
    notes?: string | null;
  };
}
