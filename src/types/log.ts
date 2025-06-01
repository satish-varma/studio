
export type StockMovementType =
  | 'CREATE_MASTER'
  | 'CREATE_STALL_DIRECT' // Item created directly at stall, not from master
  | 'ALLOCATE_TO_STALL' // Master stock quantity change due to allocation
  | 'RECEIVE_ALLOCATION' // Stall stock received from master
  | 'RETURN_TO_MASTER' // Stall stock quantity change due to return
  | 'RECEIVE_RETURN_FROM_STALL' // Master stock received from stall
  | 'SALE_FROM_STALL' // Stall stock sold
  | 'SALE_AFFECTS_MASTER' // Master stock reduced due to linked stall sale
  | 'DIRECT_STALL_UPDATE'
  | 'DIRECT_MASTER_UPDATE'
  | 'TRANSFER_OUT_FROM_STALL'
  | 'TRANSFER_IN_TO_STALL'
  | 'BATCH_STALL_UPDATE_SET' // Indicates quantity was set, not just delta. Could be complex to get 'before' for each.
  | 'BATCH_STALL_DELETE'
  | 'DELETE_STALL_ITEM' // Single stall item deletion
  | 'DELETE_MASTER_ITEM'; // Single master item deletion

export interface StockMovementLog {
  id?: string; // Firestore document ID
  stockItemId: string; // ID of the stockItems document this log directly pertains to
  linkedStockItemId?: string | null; // e.g., for ALLOCATE, if stockItemId is master, this is stall item. If stockItemId is stall, this is master.
  masterStockItemIdForContext?: string | null; // originalMasterItemId of the stockItem if it's a stall item, for easier querying.
  siteId: string;
  stallId?: string | null; // Stall ID of the stockItemId
  type: StockMovementType;
  quantityChange: number; // Positive for increase, negative for decrease relative to the stockItemId
  quantityBefore: number;
  quantityAfter: number;
  userId: string;
  userName?: string;
  timestamp: string; // ISO string
  notes?: string; // e.g., Sale ID, Destination/Source Stall ID for transfer, Justification, "Batch operation"
  relatedTransactionId?: string; // Could be Firestore transaction ID or a custom one for grouping related movements (e.g. sale + master update)
}
