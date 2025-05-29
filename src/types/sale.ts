
export interface SoldItem {
  itemId: string;
  name: string;
  quantity: number;
  pricePerUnit: number; // Assuming price is recorded at time of sale
  totalPrice: number;
}

export interface SaleTransaction {
  id: string;
  items: SoldItem[];
  totalAmount: number;
  transactionDate: string; // ISO date string
  staffId: string; // ID of the staff member who recorded the sale
  staffName?: string; // Optional: name for display
  isDeleted?: boolean; // For soft delete
  deletedBy?: string; // UID of admin who deleted
  deletedAt?: string; // ISO date string of deletion
  deletionJustification?: string; // Reason for deletion
}
