
export type FoodStallActivityType =
  | 'EXPENSE_RECORDED'
  | 'EXPENSE_UPDATED'
  | 'EXPENSE_BULK_IMPORTED'
  | 'SALE_RECORDED_OR_UPDATED'
  | 'SALE_BULK_IMPORTED';

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
    // Bulk import details
    processedCount?: number;
    // Common
    notes?: string | null;
  };
}
