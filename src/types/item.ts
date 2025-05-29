export interface StockItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string; // e.g., 'pcs', 'kg', 'ltr'
  lowStockThreshold: number;
  imageUrl?: string;
  lastUpdated: string; // ISO date string
}
