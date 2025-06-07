
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  Timestamp,
  WriteBatch,
  writeBatch,
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

const LOG_PREFIX_INTEGRATION_STOCK = "[IntegrationTest:Stock]";

const { firestore } = getTestFirebaseServices(); // Auth not directly used in these DB tests

describe('Stock Item Lifecycle Integration Tests', () => {
  let testSite: Site;
  let testStall: Stall;

  beforeAll(async () => {
    console.log(`${LOG_PREFIX_INTEGRATION_STOCK} beforeAll: Connecting to emulators...`);
    connectToEmulators();
  });

  beforeEach(async () => {
    console.log(`${LOG_PREFIX_INTEGRATION_STOCK} beforeEach: Clearing Firestore data...`);
    await clearFirestoreData();
    console.log(`${LOG_PREFIX_INTEGRATION_STOCK} beforeEach: Firestore data cleared.`);

    // Setup a common site for tests
    const siteRef = doc(collection(firestore, 'sites'));
    testSite = {
      id: siteRef.id,
      name: 'Main Test Site',
      location: 'Testville',
      createdAt: Timestamp.now().toDate().toISOString(),
      updatedAt: Timestamp.now().toDate().toISOString(),
    };
    await setDoc(siteRef, testSite);
    console.log(`${LOG_PREFIX_INTEGRATION_STOCK} beforeEach: Created test site ${testSite.id}`);

    // Setup a common stall for tests
    const stallRef = doc(collection(firestore, 'stalls'));
    testStall = {
        id: stallRef.id,
        name: 'Primary Test Stall',
        siteId: testSite.id,
        stallType: 'Retail Counter',
        createdAt: Timestamp.now().toDate().toISOString(),
        updatedAt: Timestamp.now().toDate().toISOString(),
    };
    await setDoc(stallRef, testStall);
    console.log(`${LOG_PREFIX_INTEGRATION_STOCK} beforeEach: Created test stall ${testStall.id} for site ${testSite.id}`);
  });

  test('should create a master stock item', async () => {
    console.log(`${LOG_PREFIX_INTEGRATION_STOCK} Test: Creating master stock item...`);
    const masterItemRef = doc(collection(firestore, 'stockItems'));
    const masterItemData: Omit<StockItem, 'id'> = {
      name: 'Master Laptop X',
      category: 'Electronics',
      quantity: 50,
      unit: 'pcs',
      price: 1200.00,
      costPrice: 800.00,
      lowStockThreshold: 5,
      siteId: testSite.id,
      stallId: null,
      originalMasterItemId: null,
      lastUpdated: Timestamp.now().toDate().toISOString(),
    };
    await setDoc(masterItemRef, masterItemData);
    console.log(`${LOG_PREFIX_INTEGRATION_STOCK} Test: Master stock item ${masterItemRef.id} created.`);

    const itemSnap = await getDoc(masterItemRef);
    expect(itemSnap.exists()).toBe(true);
    const fetchedItem = itemSnap.data() as StockItem;
    expect(fetchedItem.name).toBe('Master Laptop X');
    expect(fetchedItem.quantity).toBe(50);
    expect(fetchedItem.siteId).toBe(testSite.id);
    expect(fetchedItem.stallId).toBeNull();
    console.log(`${LOG_PREFIX_INTEGRATION_STOCK} Test: Master stock item ${masterItemRef.id} verified.`);
  });

  test('should allocate master stock to a stall, creating a new stall item', async () => {
    // 1. Create Master Stock Item
    const masterItemRef = doc(collection(firestore, 'stockItems'));
    const initialMasterQuantity = 100;
    const masterItemData: Omit<StockItem, 'id'> = {
      name: 'Master T-Shirt', category: 'Apparel', quantity: initialMasterQuantity, unit: 'pcs',
      price: 25.00, costPrice: 10.00, lowStockThreshold: 10, siteId: testSite.id,
      stallId: null, originalMasterItemId: null, lastUpdated: Timestamp.now().toDate().toISOString(),
    };
    await setDoc(masterItemRef, masterItemData);
    const masterItemId = masterItemRef.id;
    console.log(`${LOG_PREFIX_INTEGRATION_STOCK} Test: Master item ${masterItemId} created for allocation.`);

    // 2. Define allocation details
    const quantityToAllocate = 20;

    // 3. Perform Allocation (Simulated Transaction)
    const batch = writeBatch(firestore);

    //  3a. Create new Stall Item
    const stallItemRef = doc(collection(firestore, 'stockItems'));
    const newStallItemData: Omit<StockItem, 'id'> = {
      ...masterItemData, // Copy details from master
      quantity: quantityToAllocate,
      stallId: testStall.id,
      originalMasterItemId: masterItemId,
      lastUpdated: Timestamp.now().toDate().toISOString(),
    };
    batch.set(stallItemRef, newStallItemData);
    console.log(`${LOG_PREFIX_INTEGRATION_STOCK} Test: New stall item ${stallItemRef.id} prepared for batch (allocated from ${masterItemId}).`);

    //  3b. Update Master Item Quantity
    batch.update(masterItemRef, {
      quantity: initialMasterQuantity - quantityToAllocate,
      lastUpdated: Timestamp.now().toDate().toISOString(),
    });
    console.log(`${LOG_PREFIX_INTEGRATION_STOCK} Test: Master item ${masterItemId} quantity update prepared for batch.`);

    await batch.commit();
    console.log(`${LOG_PREFIX_INTEGRATION_STOCK} Test: Allocation batch committed.`);

    // 4. Verify
    const updatedMasterSnap = await getDoc(masterItemRef);
    expect(updatedMasterSnap.exists()).toBe(true);
    expect(updatedMasterSnap.data()?.quantity).toBe(initialMasterQuantity - quantityToAllocate);

    const newStallItemSnap = await getDoc(stallItemRef);
    expect(newStallItemSnap.exists()).toBe(true);
    const fetchedStallItem = newStallItemSnap.data() as StockItem;
    expect(fetchedStallItem.name).toBe('Master T-Shirt');
    expect(fetchedStallItem.quantity).toBe(quantityToAllocate);
    expect(fetchedStallItem.stallId).toBe(testStall.id);
    expect(fetchedStallItem.originalMasterItemId).toBe(masterItemId);
    console.log(`${LOG_PREFIX_INTEGRATION_STOCK} Test: Allocation verified. Master: ${updatedMasterSnap.data()?.quantity}, Stall: ${fetchedStallItem.quantity}.`);
  });

  test('should process sale of a stall item linked to master stock', async () => {
    // 1. Setup: Master Item, Stall, and Allocated Stall Item
    const masterItemRef = doc(collection(firestore, 'stockItems'));
    const initialMasterQty = 50;
    await setDoc(masterItemRef, {
      name: 'Master Widget', category: 'Gadgets', quantity: initialMasterQty, unit: 'pcs',
      price: 15.00, costPrice: 7.00, lowStockThreshold: 5, siteId: testSite.id,
      stallId: null, originalMasterItemId: null, lastUpdated: Timestamp.now().toDate().toISOString(),
    });
    const masterItemId = masterItemRef.id;

    const stallItemRef = doc(collection(firestore, 'stockItems'));
    const initialStallQty = 10; // Allocated from master
    await setDoc(stallItemRef, {
      name: 'Master Widget', category: 'Gadgets', quantity: initialStallQty, unit: 'pcs',
      price: 15.00, costPrice: 7.00, lowStockThreshold: 2, siteId: testSite.id,
      stallId: testStall.id, originalMasterItemId: masterItemId, lastUpdated: Timestamp.now().toDate().toISOString(),
    });
    const stallItemId = stallItemRef.id;
    // Manually adjust master quantity as if allocation happened prior to this test focus
    await updateDoc(masterItemRef, { quantity: initialMasterQty - initialStallQty });
    console.log(`${LOG_PREFIX_INTEGRATION_STOCK} Test: Setup complete. Master ${masterItemId} (Qty: ${initialMasterQty - initialStallQty}), Stall ${stallItemId} (Qty: ${initialStallQty})`);

    // 2. Define Sale Details
    const quantitySold = 3;
    const soldItemEntry: SoldItem = {
      itemId: stallItemId,
      name: 'Master Widget',
      quantity: quantitySold,
      pricePerUnit: 15.00,
      totalPrice: quantitySold * 15.00,
    };

    // 3. Perform Sale (Simulated Transaction)
    const batch = writeBatch(firestore);

    //  3a. Create SaleTransaction document
    const saleTxRef = doc(collection(firestore, 'salesTransactions'));
    const saleTxData: Omit<SaleTransaction, 'id'> = {
      items: [soldItemEntry],
      totalAmount: soldItemEntry.totalPrice,
      transactionDate: Timestamp.now().toDate().toISOString(),
      staffId: 'test-staff-id',
      staffName: 'Test Staff Member',
      siteId: testSite.id,
      stallId: testStall.id,
      isDeleted: false,
    };
    batch.set(saleTxRef, saleTxData);
    console.log(`${LOG_PREFIX_INTEGRATION_STOCK} Test: Sale transaction ${saleTxRef.id} prepared for batch.`);

    //  3b. Update Stall Item Quantity
    batch.update(stallItemRef, {
      quantity: initialStallQty - quantitySold,
      lastUpdated: Timestamp.now().toDate().toISOString(),
    });
    console.log(`${LOG_PREFIX_INTEGRATION_STOCK} Test: Stall item ${stallItemId} quantity update prepared.`);

    //  3c. Update Master Item Quantity (since stall item is linked)
    const currentMasterSnap = await getDoc(masterItemRef); // Get current master quantity before batch update
    const currentMasterQty = currentMasterSnap.data()?.quantity || 0;
    batch.update(masterItemRef, {
      quantity: currentMasterQty - quantitySold,
      lastUpdated: Timestamp.now().toDate().toISOString(),
    });
    console.log(`${LOG_PREFIX_INTEGRATION_STOCK} Test: Master item ${masterItemId} quantity update prepared.`);

    await batch.commit();
    console.log(`${LOG_PREFIX_INTEGRATION_STOCK} Test: Sale batch committed.`);

    // 4. Verify
    const saleTxSnap = await getDoc(saleTxRef);
    expect(saleTxSnap.exists()).toBe(true);
    expect(saleTxSnap.data()?.totalAmount).toBe(soldItemEntry.totalPrice);

    const updatedStallItemSnap = await getDoc(stallItemRef);
    expect(updatedStallItemSnap.exists()).toBe(true);
    expect(updatedStallItemSnap.data()?.quantity).toBe(initialStallQty - quantitySold);

    const updatedMasterItemSnap = await getDoc(masterItemRef);
    expect(updatedMasterItemSnap.exists()).toBe(true);
    // Expected master qty = (initialMasterQty - initialStallQty from setup) - quantitySold
    expect(updatedMasterItemSnap.data()?.quantity).toBe((initialMasterQty - initialStallQty) - quantitySold);
    console.log(`${LOG_PREFIX_INTEGRATION_STOCK} Test: Sale verified. Stall item qty: ${updatedStallItemSnap.data()?.quantity}, Master item qty: ${updatedMasterItemSnap.data()?.quantity}.`);
  });
});

