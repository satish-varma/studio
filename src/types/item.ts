export interface StockItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string; // e.g., 'pcs', 'kg', 'ltr'
  price: number; // Price per unit of the item
  lowStockThreshold: number;
  imageUrl?: string;
  lastUpdated: string; // ISO date string
}
