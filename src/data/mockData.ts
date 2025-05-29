// =================================================================================
// !! IMPORTANT FOR PRODUCTION !!
// This file contains MOCK data. For a production application,
// this data MUST be fetched from a real backend database (e.g., Firestore,
// a SQL database, or any other persistent storage solution).
//
// Actions for production:
// 1. Set up a database and define schemas for items, sales, etc.
// 2. Create API endpoints or server actions to Create, Read, Update, and Delete (CRUD) data.
// 3. Replace all usages of `mockStockItems` and `mockSalesTransactions` with
//    calls to your backend services.
// =================================================================================

import type { StockItem, SaleTransaction, SoldItem } from '@/types';

export const mockStockItems: StockItem[] = [
  {
    id: 'item-1',
    name: 'Organic Apples',
    category: 'Fruits',
    quantity: 50,
    unit: 'kg',
    lowStockThreshold: 10,
    imageUrl: 'https://placehold.co/100x100.png?text=Apples',
    lastUpdated: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
  },
  {
    id: 'item-2',
    name: 'Whole Wheat Bread',
    category: 'Bakery',
    quantity: 5, // Low stock example
    unit: 'loaves',
    lowStockThreshold: 5,
    imageUrl: 'https://placehold.co/100x100.png?text=Bread',
    lastUpdated: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
  },
  {
    id: 'item-3',
    name: 'Fresh Milk',
    category: 'Dairy',
    quantity: 30,
    unit: 'liters',
    lowStockThreshold: 5,
    imageUrl: 'https://placehold.co/100x100.png?text=Milk',
    lastUpdated: new Date().toISOString(),
  },
  {
    id: 'item-4',
    name: 'Cheddar Cheese',
    category: 'Dairy',
    quantity: 15,
    unit: 'kg',
    lowStockThreshold: 3,
    imageUrl: 'https://placehold.co/100x100.png?text=Cheese',
    lastUpdated: new Date().toISOString(),
  },
  {
    id: 'item-5',
    name: 'Free-Range Eggs',
    category: 'Dairy',
    quantity: 100,
    unit: 'pcs',
    lowStockThreshold: 24,
    imageUrl: 'https://placehold.co/100x100.png?text=Eggs',
    lastUpdated: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
  },
];

const soldItems1: SoldItem[] = [
  { itemId: 'item-1', name: 'Organic Apples', quantity: 2, pricePerUnit: 3.50, totalPrice: 7.00 },
  { itemId: 'item-2', name: 'Whole Wheat Bread', quantity: 1, pricePerUnit: 4.00, totalPrice: 4.00 },
];

const soldItems2: SoldItem[] = [
  { itemId: 'item-3', name: 'Fresh Milk', quantity: 3, pricePerUnit: 1.50, totalPrice: 4.50 },
  { itemId: 'item-5', name: 'Free-Range Eggs', quantity: 12, pricePerUnit: 0.30, totalPrice: 3.60 },
];

export const mockSalesTransactions: SaleTransaction[] = [
  {
    id: 'sale-1',
    items: soldItems1,
    totalAmount: soldItems1.reduce((sum, item) => sum + item.totalPrice, 0),
    transactionDate: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
    staffId: 'staff-id',
    staffName: 'Staff User',
  },
  {
    id: 'sale-2',
    items: soldItems2,
    totalAmount: soldItems2.reduce((sum, item) => sum + item.totalPrice, 0),
    transactionDate: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
    staffId: 'manager-id',
    staffName: 'Manager User',
  },
  {
    id: 'sale-3',
    items: [{ itemId: 'item-4', name: 'Cheddar Cheese', quantity: 0.5, pricePerUnit: 12.00, totalPrice: 6.00 }],
    totalAmount: 6.00,
    transactionDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    staffId: 'staff-id',
    staffName: 'Staff User',
  },
];
