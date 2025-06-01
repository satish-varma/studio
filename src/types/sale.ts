
import type { Timestamp } from "firebase/firestore"; // For client-side type hint

export interface SoldItem {
  itemId: string;
  name: string;
  quantity: number;
  pricePerUnit: number; 
  totalPrice: number;
}

export interface SaleTransaction {
  id: string;
  items: SoldItem[];
  totalAmount: number;
  transactionDate: string; // ISO date string for client, Firestore Timestamp on server/admin SDK
  staffId: string; 
  staffName?: string; 
  isDeleted?: boolean; 
  deletedBy?: string; 
  deletedAt?: string; 
  deletionJustification?: string; 
  siteId?: string | null; 
  stallId?: string | null; 
}

// Type for data structure when using Firestore Admin SDK
export interface SaleTransactionAdmin extends Omit<SaleTransaction, 'transactionDate' | 'deletedAt'> {
  transactionDate: Timestamp; // Firestore Admin Timestamp
  deletedAt?: Timestamp; // Firestore Admin Timestamp
}
