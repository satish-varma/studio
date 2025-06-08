
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  Timestamp,
  writeBatch,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import {
  getTestFirebaseServices,
  connectToEmulators,
  clearFirestoreData,
} from '../lib/firebaseTestUtils'; // Adjust path as necessary
import type { Site } from '../types/site';
import type { Stall } from '../types/stall';
import type { StockItem } from '../types/item';
import type { SaleTransaction, SoldItem } from '../types/sale';
import type { StockMovementLog, StockMovementType } from '../types/log';

const LOG_PREFIX_INTEGRATION_SALES = "[IntegrationTest:Sales]";

const { firestore } = getTestFirebaseServices();

describe('Sales Process Integration Tests', () => {
  let testSite: Site;
  let testStall: Stall;
  let masterItem: StockItem;
  let stallItem: StockItem;

  const mockStaff = {
    uid: 'staff-sale-tester-001',
    displayName: 'Sale Staff',
    email: 'staff.sale@example.com',
  };

  beforeAll(async () => {
    console.log(`${LOG_PREFIX_INTEGRATION_SALES} beforeAll: Connecting to emulators...`);
    connectToEmulators();
  });

  beforeEach(async () => {
    console.log(`${LOG_PREFIX_INTEGRATION_SALES} beforeEach: Clearing Firestore data...`);
    await clearFirestoreData();
    console.log(`${LOG_PREFIX_INTEGRATION_SALES} beforeEach: Firestore data cleared.`);

    // 1. Create Site
    const siteRef = doc(collection(firestore, 'sites'));
    testSite = {
      id: siteRef.id,
      name: 'Sales Test Site',
      location: 'Retail Park',
      createdAt: Timestamp.now().toDate().toISOString(),
      updatedAt: Timestamp.now().toDate().toISOString(),
    };
    await setDoc(siteRef, testSite);

    // 2. Create Stall
    const stallRef = doc(collection(firestore, 'stalls'));
    testStall = {
      id: stallRef.id,
      name: 'Main Sales Stall',
      siteId: testSite.id,
      stallType: 'Retail Counter',
      createdAt: Timestamp.now().toDate().toISOString(),
      updatedAt: Timestamp.now().toDate().toISOString(),
    };
    await setDoc(stallRef, testStall);

    // 3. Create Master Stock Item
    const masterItemRef = doc(collection(firestore, 'stockItems'));
    masterItem = {
      id: masterItemRef.id,
      name: 'Super Widget (Master)',
      category: 'Electronics',
      quantity: 100,
      unit: 'pcs',
      price: 49.99,
      costPrice: 20.00,
      lowStockThreshold: 10,
      siteId: testSite.id,
      stallId: null,
      originalMasterItemId: null,
      lastUpdated: Timestamp.now().toDate().toISOString(),
    };
    await setDoc(masterItemRef, masterItem);

    // 4. Allocate to Stall (creating Stall Item)
    const quantityAllocated = 30;
    const stallItemRef = doc(collection(firestore, 'stockItems'));
    stallItem = {
      id: stallItemRef.id,
      name: 'Super Widget (Stall)', // Typically inherits master name
      category: masterItem.category,
      quantity: quantityAllocated,
      unit: masterItem.unit,
      price: masterItem.price,
      costPrice: masterItem.costPrice,
      lowStockThreshold: 5,
      siteId: testSite.id,
      stallId: testStall.id,
      originalMasterItemId: masterItem.id,
      lastUpdated: Timestamp.now().toDate().toISOString(),
    };
    // Simulate allocation: create stall item and update master
    const allocationBatch = writeBatch(firestore);
    allocationBatch.set(stallItemRef, stallItem);
    allocationBatch.update(masterItemRef, { 
      quantity: masterItem.quantity - quantityAllocated,
      lastUpdated: Timestamp.now().toDate().toISOString(),
    });
    await allocationBatch.commit();
    // Update masterItem in memory for subsequent tests
    masterItem.quantity -= quantityAllocated;

    console.log(`${LOG_PREFIX_INTEGRATION_SALES} beforeEach: Setup complete. Site: ${testSite.id}, Stall: ${testStall.id}, MasterItem: ${masterItem.id} (Qty: ${masterItem.quantity}), StallItem: ${stallItem.id} (Qty: ${stallItem.quantity})`);
  });

  test('should record a sale, update stall and master stock, and create movement logs', async () => {
    const quantitySold = 5;
    const expectedStallItemQtyAfterSale = stallItem.quantity - quantitySold;
    const expectedMasterItemQtyAfterSale = masterItem.quantity - quantitySold;

    console.log(`${LOG_PREFIX_INTEGRATION_SALES} Test: Recording sale of ${quantitySold} units of ${stallItem.name} from stall ${testStall.id}`);

    const soldItems: SoldItem[] = [{
      itemId: stallItem.id,
      name: stallItem.name,
      quantity: quantitySold,
      pricePerUnit: stallItem.price,
      totalPrice: quantitySold * stallItem.price,
    }];
    const totalAmount = soldItems.reduce((sum, item) => sum + item.totalPrice, 0);

    // --- Perform Sale Action (using a batch) ---
    const saleBatch = writeBatch(firestore);
    const saleTxRef = doc(collection(firestore, 'salesTransactions'));
    const saleTxData: Omit<SaleTransaction, 'id'> = {
      items: soldItems,
      totalAmount: totalAmount,
      transactionDate: Timestamp.now().toDate().toISOString(),
      staffId: mockStaff.uid,
      staffName: mockStaff.displayName,
      siteId: testSite.id,
      stallId: testStall.id,
      isDeleted: false,
    };
    saleBatch.set(saleTxRef, saleTxData);

    // Update stall item quantity
    const stallItemRef = doc(firestore, 'stockItems', stallItem.id);
    saleBatch.update(stallItemRef, {
      quantity: expectedStallItemQtyAfterSale,
      lastUpdated: Timestamp.now().toDate().toISOString(),
    });

    // Update master item quantity
    const masterItemRef = doc(firestore, 'stockItems', masterItem.id);
    saleBatch.update(masterItemRef, {
      quantity: expectedMasterItemQtyAfterSale,
      lastUpdated: Timestamp.now().toDate().toISOString(),
    });

    // Manually create StockMovementLog entries for this test
    const stallLogRef = doc(collection(firestore, 'stockMovementLogs'));
    const stallLogData: Omit<StockMovementLog, 'id'> = {
      stockItemId: stallItem.id,
      masterStockItemIdForContext: stallItem.originalMasterItemId,
      siteId: testSite.id,
      stallId: testStall.id,
      type: 'SALE_FROM_STALL',
      quantityChange: -quantitySold,
      quantityBefore: stallItem.quantity,
      quantityAfter: expectedStallItemQtyAfterSale,
      userId: mockStaff.uid,
      userName: mockStaff.displayName,
      timestamp: Timestamp.now().toDate().toISOString(),
      notes: `Sale ID: ${saleTxRef.id}`,
      relatedTransactionId: saleTxRef.id,
    };
    saleBatch.set(stallLogRef, stallLogData);

    const masterLogRef = doc(collection(firestore, 'stockMovementLogs'));
    const masterLogData: Omit<StockMovementLog, 'id'> = {
      stockItemId: masterItem.id,
      siteId: testSite.id,
      stallId: null,
      type: 'SALE_AFFECTS_MASTER',
      quantityChange: -quantitySold,
      quantityBefore: masterItem.quantity, // Master quantity *before this specific sale*
      quantityAfter: expectedMasterItemQtyAfterSale,
      userId: mockStaff.uid,
      userName: mockStaff.displayName,
      timestamp: Timestamp.now().toDate().toISOString(),
      notes: `Linked to sale of stall item ${stallItem.name} (ID: ${stallItem.id}), Sale ID: ${saleTxRef.id}`,
      relatedTransactionId: saleTxRef.id,
      linkedStockItemId: stallItem.id,
    };
    saleBatch.set(masterLogRef, masterLogData);

    await saleBatch.commit();
    console.log(`${LOG_PREFIX_INTEGRATION_SALES} Test: Sale batch committed. Sale ID: ${saleTxRef.id}`);

    // --- Verification ---
    // Verify SaleTransaction
    const saleTxSnap = await getDoc(saleTxRef);
    expect(saleTxSnap.exists()).toBe(true);
    const fetchedSaleTx = saleTxSnap.data() as SaleTransaction;
    expect(fetchedSaleTx.totalAmount).toBe(totalAmount);
    expect(fetchedSaleTx.items.length).toBe(1);
    expect(fetchedSaleTx.items[0].itemId).toBe(stallItem.id);
    expect(fetchedSaleTx.items[0].quantity).toBe(quantitySold);
    expect(fetchedSaleTx.staffId).toBe(mockStaff.uid);

    // Verify Stall Item quantity
    const updatedStallItemSnap = await getDoc(stallItemRef);
    expect(updatedStallItemSnap.exists()).toBe(true);
    expect(updatedStallItemSnap.data()?.quantity).toBe(expectedStallItemQtyAfterSale);

    // Verify Master Item quantity
    const updatedMasterItemSnap = await getDoc(masterItemRef);
    expect(updatedMasterItemSnap.exists()).toBe(true);
    expect(updatedMasterItemSnap.data()?.quantity).toBe(expectedMasterItemQtyAfterSale);

    // Verify StockMovementLogs
    const logsQuery = query(
      collection(firestore, 'stockMovementLogs'),
      where('relatedTransactionId', '==', saleTxRef.id)
    );
    const logsSnap = await getDocs(logsQuery);
    expect(logsSnap.docs.length).toBe(2);

    const fetchedLogs = logsSnap.docs.map(d => d.data() as StockMovementLog);
    const stallSaleLog = fetchedLogs.find(log => log.type === 'SALE_FROM_STALL' && log.stockItemId === stallItem.id);
    const masterUpdateLog = fetchedLogs.find(log => log.type === 'SALE_AFFECTS_MASTER' && log.stockItemId === masterItem.id);

    expect(stallSaleLog).toBeDefined();
    expect(stallSaleLog?.quantityChange).toBe(-quantitySold);
    expect(stallSaleLog?.quantityBefore).toBe(stallItem.quantity); // Original quantity before sale
    expect(stallSaleLog?.quantityAfter).toBe(expectedStallItemQtyAfterSale);

    expect(masterUpdateLog).toBeDefined();
    expect(masterUpdateLog?.quantityChange).toBe(-quantitySold);
    expect(masterUpdateLog?.quantityBefore).toBe(masterItem.quantity); // Original master quantity before sale
    expect(masterUpdateLog?.quantityAfter).toBe(expectedMasterItemQtyAfterSale);
    console.log(`${LOG_PREFIX_INTEGRATION_SALES} Test: Sale verification complete.`);
  });
});

