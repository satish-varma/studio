
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
  TokenOptions,
} from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import * as path from 'path';

const LOG_PREFIX_RULES_TEST = "[SecurityRulesTest]";

// --- Configuration ---
const TEST_PROJECT_ID = 'stallsync-rules-test'; // Use a consistent mock project ID
const FIRESTORE_EMULATOR_HOST = 'localhost';
const FIRESTORE_EMULATOR_PORT = 8080; // Ensure this matches firebase.json

let testEnv: RulesTestEnvironment;

// Helper function to get a Firestore instance for a given auth state
function getFirestoreAs(auth?: { uid: string; token?: TokenOptions; [key: string]: any }) {
  if (!testEnv) {
    throw new Error("Test environment not initialized. Call initializeTestEnvironment first.");
  }
  if (auth) {
    // console.log(`${LOG_PREFIX_RULES_TEST} Creating authenticated Firestore context for UID: ${auth.uid}, Token claims:`, auth.token);
    return testEnv.authenticatedContext(auth.uid, auth.token).firestore();
  } else {
    // console.log(`${LOG_PREFIX_RULES_TEST} Creating unauthenticated Firestore context.`);
    return testEnv.unauthenticatedContext().firestore();
  }
}

// Helper function to set up a user document with a specific role (requires admin privileges or permissive rules for /users/{userId})
async function setupUserRole(userId: string, role: string, data: Record<string, any> = {}) {
  const adminDb = testEnv.unauthenticatedContext().firestore(); 
  // console.log(`${LOG_PREFIX_RULES_TEST} setupUserRole: Setting up user document /users/${userId} with role: ${role}`);
  try {
    await adminDb.collection('users').doc(userId).set({ 
      uid: userId, // ensure uid is part of the document as rules might use it
      role, 
      email: `${userId}@example.com`, 
      displayName: `User ${userId}`, 
      createdAt: new Date().toISOString(),
      ...data 
    });
    // console.log(`${LOG_PREFIX_RULES_TEST} setupUserRole: User document /users/${userId} created/updated successfully.`);
  } catch (error) {
    console.error(`${LOG_PREFIX_RULES_TEST} setupUserRole: Error setting up user document /users/${userId}:`, error);
    throw error; 
  }
}


describe('StallSync Firestore Security Rules', () => {
  beforeAll(async () => {
    console.log(`${LOG_PREFIX_RULES_TEST} beforeAll: Initializing test environment and loading rules...`);
    try {
      const rulesPath = path.join(__dirname, '../../..', 'firestore.rules'); 
      const rules = fs.readFileSync(rulesPath, 'utf8');
      testEnv = await initializeTestEnvironment({
        projectId: TEST_PROJECT_ID,
        firestore: {
          host: FIRESTORE_EMULATOR_HOST,
          port: FIRESTORE_EMULATOR_PORT,
          rules: rules,
        },
      });
      console.log(`${LOG_PREFIX_RULES_TEST} beforeAll: Test environment initialized and rules loaded.`);
    } catch (error) {
      console.error(`${LOG_PREFIX_RULES_TEST} beforeAll: CRITICAL ERROR initializing test environment or loading rules:`, error);
      process.exit(1); 
    }
  });

  afterAll(async () => {
    console.log(`${LOG_PREFIX_RULES_TEST} afterAll: Cleaning up test environment...`);
    if (testEnv) {
      await testEnv.cleanup();
      console.log(`${LOG_PREFIX_RULES_TEST} afterAll: Test environment cleaned up.`);
    }
  });

  beforeEach(async () => {
    // console.log(`${LOG_PREFIX_RULES_TEST} beforeEach: Clearing Firestore data...`);
    if (testEnv) {
      await testEnv.clearFirestore();
      // console.log(`${LOG_PREFIX_RULES_TEST} beforeEach: Firestore data cleared.`);
    }
  });

  // --- Users Collection Tests ---
  describe('Users Collection (/users/{userId})', () => {
    const testUserId = 'testUser123';
    const otherUserId = 'otherUser456';
    const adminUserId = 'adminUser789';

    it('unauthenticated user CANNOT read or write any user document', async () => {
      const db = getFirestoreAs(null); // Unauthenticated
      await assertFails(db.collection('users').doc(testUserId).get());
      await assertFails(db.collection('users').doc(testUserId).set({ name: 'Test' }));
    });

    it('authenticated user CAN read their OWN user document', async () => {
      await setupUserRole(testUserId, 'staff', { displayName: 'Test User' });
      const db = getFirestoreAs({ uid: testUserId });
      await assertSucceeds(db.collection('users').doc(testUserId).get());
    });

    it('authenticated user CANNOT read OTHER users documents (if not admin)', async () => {
      await setupUserRole(testUserId, 'staff'); 
      await setupUserRole(otherUserId, 'staff', { displayName: 'Other User Data' }); 

      const db = getFirestoreAs({ uid: testUserId });
      await assertFails(db.collection('users').doc(otherUserId).get());
    });
    
    it('authenticated user CAN update their OWN displayName and preferences', async () => {
      await setupUserRole(testUserId, 'staff', { displayName: 'Old Name' });
      const db = getFirestoreAs({ uid: testUserId }); 
      await assertSucceeds(db.collection('users').doc(testUserId).update({ displayName: 'New Name', defaultSiteId: 'siteX' }));
    });

    it('authenticated user CANNOT update their OWN role', async () => {
      await setupUserRole(testUserId, 'staff');
      const db = getFirestoreAs({ uid: testUserId });
      await assertFails(db.collection('users').doc(testUserId).update({ role: 'admin' }));
    });
    
    it('authenticated user CANNOT update OTHER users documents (if not admin)', async () => {
      await setupUserRole(testUserId, 'staff');
      await setupUserRole(otherUserId, 'staff');
      const db = getFirestoreAs({ uid: testUserId });
      await assertFails(db.collection('users').doc(otherUserId).update({ displayName: 'Malicious Update' }));
    });

    it('admin user CAN read ANY user document', async () => {
      await setupUserRole(adminUserId, 'admin');
      await setupUserRole(testUserId, 'staff', { displayName: 'Target User Data' });

      const dbAsAdmin = getFirestoreAs({ uid: adminUserId });
      await assertSucceeds(dbAsAdmin.collection('users').doc(testUserId).get());
    });

    it('admin user CAN update ANY user document (including role and assignments)', async () => {
      await setupUserRole(adminUserId, 'admin'); 
      await setupUserRole(testUserId, 'staff', { displayName: 'Initial Name', role: 'staff' }); 

      const dbAsAdmin = getFirestoreAs({ uid: adminUserId });
      await assertSucceeds(dbAsAdmin.collection('users').doc(testUserId).update({
        displayName: 'Updated by Admin',
        role: 'manager',
        managedSiteIds: ['siteAlpha'],
        defaultSiteId: null, 
        defaultStallId: null,
      }));
    });

    it('admin user CAN create a new user document', async () => {
        await setupUserRole(adminUserId, 'admin'); 
        const dbAsAdmin = getFirestoreAs({uid: adminUserId});
        const newUserId = "newUserByAdmin";
        await assertSucceeds(dbAsAdmin.collection("users").doc(newUserId).set({
            uid: newUserId, // Ensure uid is part of the document as rules might use it
            email: "new@example.com",
            displayName: "New User",
            role: "staff",
            createdAt: new Date().toISOString(),
            defaultSiteId: null,
            defaultStallId: null,
            managedSiteIds: [],
        }));
    });
  });

  // --- Sites Collection Tests (/sites/{siteId}) ---
  describe('Sites Collection (/sites/{siteId})', () => {
    const adminUserId = 'adminUserForSites';
    const managerUserId = 'managerUserForSites';
    const staffUserId = 'staffUserForSites';
    let siteId: string;

    beforeEach(async () => {
      await setupUserRole(adminUserId, 'admin');
      await setupUserRole(managerUserId, 'manager', { managedSiteIds: ['existingSiteId'] });
      await setupUserRole(staffUserId, 'staff', { defaultSiteId: 'existingSiteId' });
      
      const adminDb = getFirestoreAs({ uid: adminUserId });
      const siteRef = await adminDb.collection('sites').add({ name: 'Test Site Alpha', location: 'HQ', createdAt: '2023-01-01', updatedAt: '2023-01-01'});
      siteId = siteRef.id;
    });

    it('admin CAN create, read, update, and delete sites', async () => {
      const db = getFirestoreAs({ uid: adminUserId });
      const newSiteRef = db.collection('sites').doc('newSiteByAdmin');
      await assertSucceeds(newSiteRef.set({ name: 'New Site Gamma', location: 'Branch', createdAt: '2023-01-02', updatedAt: '2023-01-02' }));
      await assertSucceeds(db.collection('sites').doc(siteId).get());
      await assertSucceeds(db.collection('sites').doc(siteId).update({ location: 'New Location' }));
      await assertSucceeds(db.collection('sites').doc(siteId).delete());
    });

    it('manager CAN read sites', async () => {
      const db = getFirestoreAs({ uid: managerUserId });
      await assertSucceeds(db.collection('sites').doc(siteId).get()); 
      await assertSucceeds(db.collection('sites').where('name', '==', 'Test Site Alpha').get());
    });
    
    it('staff CAN read sites', async () => {
      const db = getFirestoreAs({ uid: staffUserId });
      await assertSucceeds(db.collection('sites').doc(siteId).get());
    });

    it('manager and staff CANNOT create, update, or delete sites', async () => {
      const dbManager = getFirestoreAs({ uid: managerUserId });
      const dbStaff = getFirestoreAs({ uid: staffUserId });

      await assertFails(dbManager.collection('sites').doc('managerSite').set({ name: 'Manager Site' }));
      await assertFails(dbStaff.collection('sites').doc('staffSite').set({ name: 'Staff Site' }));
      await assertFails(dbManager.collection('sites').doc(siteId).update({ location: 'Manager Update' }));
      await assertFails(dbStaff.collection('sites').doc(siteId).update({ location: 'Staff Update' }));
      await assertFails(dbManager.collection('sites').doc(siteId).delete());
      await assertFails(dbStaff.collection('sites').doc(siteId).delete());
    });
  });
  
  // --- Stalls Collection Tests (/stalls/{stallId}) ---
  describe('Stalls Collection (/stalls/{stallId})', () => {
    const adminUserId = 'adminUserForStalls';
    const managerUserId = 'managerUserForStalls';
    const staffUserId = 'staffUserForStalls';
    let siteForStallsId: string;
    let stallId: string;

    beforeEach(async () => {
      await setupUserRole(adminUserId, 'admin');
      const adminDb = getFirestoreAs({ uid: adminUserId });
      const siteRef = await adminDb.collection('sites').add({ name: 'Site For Stalls', location: 'Test Location', createdAt: '2023-01-01', updatedAt: '2023-01-01'});
      siteForStallsId = siteRef.id;
      
      await setupUserRole(managerUserId, 'manager', { managedSiteIds: [siteForStallsId] });
      await setupUserRole(staffUserId, 'staff', { defaultSiteId: siteForStallsId, defaultStallId: null });

      const stallRef = await adminDb.collection('stalls').add({ name: 'Test Stall X', siteId: siteForStallsId, stallType: 'Retail Counter', createdAt: '2023-01-01', updatedAt: '2023-01-01'});
      stallId = stallRef.id;
    });

    it('admin CAN create, read, update, and delete stalls', async () => {
      const db = getFirestoreAs({ uid: adminUserId });
      const newStallRef = db.collection('stalls').doc('newStallByAdmin');
      await assertSucceeds(newStallRef.set({ name: 'New Stall Y', siteId: siteForStallsId, stallType: 'Storage Room', createdAt: '2023-01-02', updatedAt: '2023-01-02' }));
      await assertSucceeds(db.collection('stalls').doc(stallId).get());
      await assertSucceeds(db.collection('stalls').doc(stallId).update({ stallType: 'Service Desk' }));
      await assertSucceeds(db.collection('stalls').doc(stallId).delete());
    });

    it('manager and staff CAN read stalls', async () => {
      const dbManager = getFirestoreAs({ uid: managerUserId });
      const dbStaff = getFirestoreAs({ uid: staffUserId });
      await assertSucceeds(dbManager.collection('stalls').doc(stallId).get());
      await assertSucceeds(dbStaff.collection('stalls').doc(stallId).get());
      await assertSucceeds(dbManager.collection('stalls').where('siteId', '==', siteForStallsId).get());
    });

    it('manager and staff CANNOT create, update, or delete stalls', async () => {
      const dbManager = getFirestoreAs({ uid: managerUserId });
      const dbStaff = getFirestoreAs({ uid: staffUserId });

      await assertFails(dbManager.collection('stalls').doc('managerStall').set({ name: 'Manager Stall', siteId: siteForStallsId, stallType: 'Pop-up Booth' }));
      await assertFails(dbStaff.collection('stalls').doc('staffStall').set({ name: 'Staff Stall', siteId: siteForStallsId, stallType: 'Information Kiosk'}));
      await assertFails(dbManager.collection('stalls').doc(stallId).update({ name: 'Manager Update' }));
      await assertFails(dbStaff.collection('stalls').doc(stallId).update({ name: 'Staff Update' }));
      await assertFails(dbManager.collection('stalls').doc(stallId).delete());
      await assertFails(dbStaff.collection('stalls').doc(stallId).delete());
    });
  });

  // --- StockItems Collection Tests (/stockItems/{itemId}) ---
  describe('StockItems Collection (/stockItems/{itemId})', () => {
    const adminUserId = 'adminSI';
    const managerUserId = 'managerSI';
    const staffUserId = 'staffSI';
    let siteId: string;
    let otherSiteId: string;
    let stallId: string;
    let otherStallId: string;
    let masterItemId: string;
    let stallItemId: string; // Item in staffUserId's default stall
    let otherStallItemId: string; // Item in a different stall but same site
    let masterItemForAllocationId: string;


    beforeEach(async () => {
        await setupUserRole(adminUserId, 'admin');
        
        const adminDb = getFirestoreAs({ uid: adminUserId });
        const siteRef = await adminDb.collection('sites').add({ name: 'SiteForStock', location: 'StockLocation' });
        siteId = siteRef.id;
        const otherSiteRef = await adminDb.collection('sites').add({ name: 'OtherSite', location: 'RemoteLocation' });
        otherSiteId = otherSiteRef.id;

        const stallRef = await adminDb.collection('stalls').add({ name: 'StallForStock', siteId, stallType: 'Retail' });
        stallId = stallRef.id;
        const otherStallRef = await adminDb.collection('stalls').add({ name: 'OtherStallInSite', siteId, stallType: 'Storage' });
        otherStallId = otherStallRef.id;


        await setupUserRole(managerUserId, 'manager', { managedSiteIds: [siteId] }); // Manages siteId, not otherSiteId
        await setupUserRole(staffUserId, 'staff', { defaultSiteId: siteId, defaultStallId: stallId });

        const masterItemDocRef = await adminDb.collection('stockItems').doc('masterItem001').set({
            name: "Master Product", category: "Test", quantity: 100, unit: "pcs", price: 10,
            siteId, stallId: null, originalMasterItemId: null, lastUpdated: '2023-01-01T00:00:00Z', id: 'masterItem001'
        });
        masterItemId = 'masterItem001';

        const stallItemDocRef = await adminDb.collection('stockItems').doc('stallItem001').set({
            name: "Master Product (Stall)", category: "Test", quantity: 10, unit: "pcs", price: 10,
            siteId, stallId, originalMasterItemId: masterItemId, lastUpdated: '2023-01-01T00:00:00Z', id: 'stallItem001'
        });
        stallItemId = 'stallItem001';
        
        const otherStallItemDocRef = await adminDb.collection('stockItems').doc('otherStallItem001').set({
            name: "Other Stall Item", category: "Test", quantity: 5, unit: "pcs", price: 10,
            siteId, stallId: otherStallId, originalMasterItemId: masterItemId, lastUpdated: '2023-01-01T00:00:00Z', id: 'otherStallItem001'
        });
        otherStallItemId = 'otherStallItem001';
        
        const masterItemAllocRef = await adminDb.collection('stockItems').doc('masterItemForAlloc').set({
            name: "Master For Allocation", category: "Alloc", quantity: 200, unit: "pcs", price: 50,
            siteId, stallId: null, originalMasterItemId: null, lastUpdated: '2023-01-01T00:00:00Z', id: 'masterItemForAlloc'
        });
        masterItemForAllocationId = 'masterItemForAlloc';

    });

    it('authenticated user CAN read stock items in their allowed site context', async () => {
        const staffDb = getFirestoreAs({ uid: staffUserId });
        await assertSucceeds(staffDb.collection('stockItems').doc(stallItemId).get()); 
        await assertSucceeds(staffDb.collection('stockItems').doc(masterItemId).get());

        const managerDb = getFirestoreAs({ uid: managerUserId });
        await assertSucceeds(managerDb.collection('stockItems').doc(stallItemId).get());
        await assertSucceeds(managerDb.collection('stockItems').doc(masterItemId).get());
        
        const adminDb = getFirestoreAs({ uid: adminUserId });
        await assertSucceeds(adminDb.collection('stockItems').doc(stallItemId).get());
    });

    it('staff CAN update ONLY quantity and lastUpdated of an item in their assigned stall', async () => {
        const staffDb = getFirestoreAs({ uid: staffUserId });
        await assertSucceeds(staffDb.collection('stockItems').doc(stallItemId).update({ 
            quantity: 5, 
            lastUpdated: new Date().toISOString() 
        }));
    });

    it('staff CANNOT update fields other than quantity/lastUpdated in their assigned stall', async () => {
        const staffDb = getFirestoreAs({ uid: staffUserId });
        await assertFails(staffDb.collection('stockItems').doc(stallItemId).update({ name: 'Staff New Name' }));
        await assertFails(staffDb.collection('stockItems').doc(stallItemId).update({ price: 99.99 }));
        await assertFails(staffDb.collection('stockItems').doc(stallItemId).update({ quantity: 7, category: 'Changed Cat' }));
    });

    it('staff CANNOT update items (even quantity) in a stall NOT assigned to them', async () => {
        const staffDb = getFirestoreAs({ uid: staffUserId }); // Assigned to stallId
        await assertFails(staffDb.collection('stockItems').doc(otherStallItemId).update({ quantity: 3 }));
    });
    
    it('staff CANNOT update master stock items (even quantity)', async () => {
        const staffDb = getFirestoreAs({ uid: staffUserId });
        await assertFails(staffDb.collection('stockItems').doc(masterItemId).update({ quantity: 90 }));
    });


    it('manager CAN create/update any field of stock items in their managed sites', async () => {
        const managerDb = getFirestoreAs({ uid: managerUserId }); // Manages siteId
        
        const newMasterByManagerRef = managerDb.collection('stockItems').doc();
        await assertSucceeds(newMasterByManagerRef.set({
            name: "Manager Master", category: "CatM", quantity: 50, unit: "pcs", price: 20,
            siteId, stallId: null, originalMasterItemId: null, lastUpdated: new Date().toISOString()
        }));
        
        await assertSucceeds(managerDb.collection('stockItems').doc(masterItemId).update({ price: 12, description: "Updated by Manager", quantity: 95, lastUpdated: new Date().toISOString() }));
        await assertSucceeds(managerDb.collection('stockItems').doc(stallItemId).update({ quantity: 8, name: "Stall Item Updated by Mgr", lastUpdated: new Date().toISOString() }));
    });

    it('manager CANNOT create/update stock items in NON-managed sites', async () => {
        await setupUserRole(managerUserId, 'manager', { managedSiteIds: [otherSiteId] }); // Re-setup to manage ONLY otherSiteId
        const managerDb = getFirestoreAs({ uid: managerUserId });

        const newItemInNonManagedSiteRef = managerDb.collection('stockItems').doc();
        // Attempt to create item in siteId, which manager no longer manages
        await assertFails(newItemInNonManagedSiteRef.set({ name: "Illegal Item", siteId, stallId: null, quantity: 1, lastUpdated: new Date().toISOString() }));
        // Attempt to update masterItemId which is in siteId
        await assertFails(managerDb.collection('stockItems').doc(masterItemId).update({ price: 99, lastUpdated: new Date().toISOString() })); 
    });

    it('manager CANNOT delete a master item if it has linked stall items with quantity > 0', async () => {
        const managerDb = getFirestoreAs({ uid: managerUserId });
        await assertFails(managerDb.collection('stockItems').doc(masterItemId).delete());
    });
    
    it('manager CAN delete a master item if linked stall items have 0 quantity', async () => {
        const managerDb = getFirestoreAs({ uid: managerUserId });
        await assertSucceeds(managerDb.collection('stockItems').doc(stallItemId).update({ quantity: 0, lastUpdated: new Date().toISOString() }));
        await assertSucceeds(managerDb.collection('stockItems').doc(masterItemId).delete());
    });

    it('manager CAN delete a stall item', async () => {
        const managerDb = getFirestoreAs({ uid: managerUserId });
        await assertSucceeds(managerDb.collection('stockItems').doc(stallItemId).delete());
    });
    
    it('admin CAN create/update/delete any stock item, ignoring most restrictions', async () => {
        const adminDb = getFirestoreAs({uid: adminUserId});
        const newItemByAdminRef = adminDb.collection('stockItems').doc();
        await assertSucceeds(newItemByAdminRef.set({name: "Admin Item", siteId, quantity: 10, lastUpdated: new Date().toISOString()}));
        await assertSucceeds(adminDb.collection('stockItems').doc(masterItemId).update({name: "Admin Updated Master", quantity: 1, lastUpdated: new Date().toISOString()}));
        await assertSucceeds(adminDb.collection('stockItems').doc(stallItemId).update({name: "Admin Updated Stall Item", price: 100, lastUpdated: new Date().toISOString()}));
        
        await assertSucceeds(adminDb.collection('stockItems').doc(masterItemId).delete());
        await assertSucceeds(adminDb.collection('stockItems').doc(stallItemId).delete());
    });

    describe('Stock Allocation (isAllocationAllowed)', () => {
        let managerDb: any; // Firestore
        let masterItemRef: any; // DocumentReference
        let newStallItemRef: any; // DocumentReference
        const quantityToAllocate = 30;
        const initialMasterQuantity = 200;

        beforeEach(async () => {
            managerDb = getFirestoreAs({ uid: managerUserId }); // User who is manager of siteId
            masterItemRef = managerDb.collection('stockItems').doc(masterItemForAllocationId);
            // Ensure masterItemForAllocationId exists with initial quantity
            await getFirestoreAs({ uid: adminUserId }).collection('stockItems').doc(masterItemForAllocationId).set({
                name: "Master For Allocation", category: "Alloc", quantity: initialMasterQuantity, unit: "pcs", price: 50,
                siteId, stallId: null, originalMasterItemId: null, lastUpdated: '2023-01-01T00:00:00Z', id: masterItemForAllocationId
            });
            newStallItemRef = managerDb.collection('stockItems').doc(); // For new stall item
        });

        it('manager CAN allocate master stock to a NEW stall item (batch write)', async () => {
            const batch = managerDb.batch();
            batch.update(masterItemRef, { quantity: initialMasterQuantity - quantityToAllocate, lastUpdated: new Date().toISOString() });
            batch.set(newStallItemRef, {
                name: "Master For Allocation (Stall)", category: "Alloc", quantity: quantityToAllocate, unit: "pcs", price: 50,
                siteId, stallId, originalMasterItemId: masterItemForAllocationId, lastUpdated: new Date().toISOString(),
            });
            await assertSucceeds(batch.commit());
        });
        
        it('manager CAN allocate master stock to an EXISTING stall item (batch write)', async () => {
            const adminDb = getFirestoreAs({uid: adminUserId});
            const initialStallQuantity = 5;
            const existingStallItemRef = adminDb.collection('stockItems').doc('existingStallItemForAlloc');
            await existingStallItemRef.set({
                name: "Master For Allocation (Existing Stall)", category: "Alloc", quantity: initialStallQuantity, unit: "pcs", price: 50,
                siteId, stallId, originalMasterItemId: masterItemForAllocationId, lastUpdated: new Date().toISOString(),
            });

            const batch = managerDb.batch();
            batch.update(masterItemRef, { quantity: initialMasterQuantity - quantityToAllocate, lastUpdated: new Date().toISOString() });
            batch.update(existingStallItemRef, { quantity: initialStallQuantity + quantityToAllocate, lastUpdated: new Date().toISOString() });
            await assertSucceeds(batch.commit());
        });

        it('manager CANNOT allocate if master quantity reduction does not match new stall item quantity', async () => {
            const batch = managerDb.batch();
            const incorrectMasterReduction = 20; // Should be 30
            batch.update(masterItemRef, { quantity: initialMasterQuantity - incorrectMasterReduction, lastUpdated: new Date().toISOString() });
            batch.set(newStallItemRef, {
                name: "Mismatch Alloc", category: "Alloc", quantity: quantityToAllocate, unit: "pcs", price: 50,
                siteId, stallId, originalMasterItemId: masterItemForAllocationId, lastUpdated: new Date().toISOString(),
            });
            await assertFails(batch.commit());
        });
        
        it('manager CANNOT allocate if new stall item originalMasterItemId is incorrect', async () => {
            const batch = managerDb.batch();
            batch.update(masterItemRef, { quantity: initialMasterQuantity - quantityToAllocate, lastUpdated: new Date().toISOString() });
            batch.set(newStallItemRef, {
                name: "Wrong Master Alloc", category: "Alloc", quantity: quantityToAllocate, unit: "pcs", price: 50,
                siteId, stallId, originalMasterItemId: 'wrong-master-id', lastUpdated: new Date().toISOString(),
            });
            await assertFails(batch.commit());
        });
    });

    describe('Stock Return to Master (isReturnToMasterAllowed)', () => {
        let managerDb: any;
        let masterItemRef: any;
        let stallItemForReturnRef: any;
        const initialMasterQty = 50;
        const initialStallQty = 20;
        const quantityToReturn = 10;

        beforeEach(async () => {
            managerDb = getFirestoreAs({ uid: managerUserId });
            const adminDb = getFirestoreAs({uid: adminUserId});

            masterItemRef = adminDb.collection('stockItems').doc('masterForReturn');
            await masterItemRef.set({
                name: "Master For Return", category: "Return", quantity: initialMasterQty, unit: "pcs", price: 30,
                siteId, stallId: null, originalMasterItemId: null, lastUpdated: '2023-01-01T00:00:00Z', id: 'masterForReturn'
            });

            stallItemForReturnRef = adminDb.collection('stockItems').doc('stallItemForReturn');
            await stallItemForReturnRef.set({
                name: "Stall Item For Return", category: "Return", quantity: initialStallQty, unit: "pcs", price: 30,
                siteId, stallId, originalMasterItemId: 'masterForReturn', lastUpdated: '2023-01-01T00:00:00Z', id: 'stallItemForReturn'
            });
        });

        it('manager CAN return stall stock to master (batch write)', async () => {
            const batch = managerDb.batch();
            batch.update(stallItemForReturnRef, { quantity: initialStallQty - quantityToReturn, lastUpdated: new Date().toISOString() });
            batch.update(masterItemRef, { quantity: initialMasterQty + quantityToReturn, lastUpdated: new Date().toISOString() });
            await assertSucceeds(batch.commit());
        });

        it('manager CANNOT return if quantity updates do not match', async () => {
            const batch = managerDb.batch();
            batch.update(stallItemForReturnRef, { quantity: initialStallQty - quantityToReturn, lastUpdated: new Date().toISOString() });
            batch.update(masterItemRef, { quantity: initialMasterQty + (quantityToReturn - 5), lastUpdated: new Date().toISOString() }); // Mismatch
            await assertFails(batch.commit());
        });

        it('manager CANNOT return if stall item is not linked to the specified master item', async () => {
            const batch = managerDb.batch();
            const otherMasterRef = managerDb.collection('stockItems').doc('otherMaster');
            await getFirestoreAs({uid:adminUserId}).collection('stockItems').doc('otherMaster').set({name: 'Other Master', siteId, quantity: 100});

            batch.update(stallItemForReturnRef, { quantity: initialStallQty - quantityToReturn, lastUpdated: new Date().toISOString() });
            batch.update(otherMasterRef, { quantity: 100 + quantityToReturn, lastUpdated: new Date().toISOString() }); // Returning to wrong master
            await assertFails(batch.commit());
        });
    });

    describe('Stock Transfer Between Stalls (isTransferAllowed)', () => {
        let managerDb: any;
        let masterItemForTransferRef: any;
        let sourceStallItemRef: any;
        let destStallItemRef: any; // For existing dest item test
        let newDestStallItemRef: any; // For new dest item test
        const otherStallIdForTransfer = 'stallTransferDest'; // Different from 'stallId' used in beforeEach
        const initialMasterQtyForTransfer = 100;
        const initialSourceStallQty = 30;
        const quantityToTransfer = 10;

        beforeEach(async () => {
            managerDb = getFirestoreAs({ uid: managerUserId });
            const adminDb = getFirestoreAs({ uid: adminUserId });

            await adminDb.collection('stalls').doc(otherStallIdForTransfer).set({ name: 'Destination Transfer Stall', siteId, stallType: 'Retail' });


            masterItemForTransferRef = adminDb.collection('stockItems').doc('masterForTransfer');
            await masterItemForTransferRef.set({
                name: "Master For Transfer", category: "Transfer", quantity: initialMasterQtyForTransfer, unit: "pcs", price: 40,
                siteId, stallId: null, originalMasterItemId: null, lastUpdated: '2023-01-01T00:00:00Z', id: 'masterForTransfer'
            });

            sourceStallItemRef = adminDb.collection('stockItems').doc('sourceStallItem');
            await sourceStallItemRef.set({
                name: "Source Stall Item", category: "Transfer", quantity: initialSourceStallQty, unit: "pcs", price: 40,
                siteId, stallId, originalMasterItemId: 'masterForTransfer', lastUpdated: '2023-01-01T00:00:00Z', id: 'sourceStallItem'
            });
            
            destStallItemRef = adminDb.collection('stockItems').doc('destStallItemExisting');
            // For existing dest item test, create it:
             await destStallItemRef.set({
                name: "Dest Stall Item Existing", category: "Transfer", quantity: 5, unit: "pcs", price: 40,
                siteId, stallId: otherStallIdForTransfer, originalMasterItemId: 'masterForTransfer', lastUpdated: '2023-01-01T00:00:00Z', id: 'destStallItemExisting'
            });

            newDestStallItemRef = managerDb.collection('stockItems').doc(); // For new dest item test
        });

        it('manager CAN transfer to a new stall item (batch write)', async () => {
            const batch = managerDb.batch();
            batch.update(sourceStallItemRef, { quantity: initialSourceStallQty - quantityToTransfer, lastUpdated: new Date().toISOString() });
            batch.set(newDestStallItemRef, {
                name: "Source Stall Item", category: "Transfer", quantity: quantityToTransfer, unit: "pcs", price: 40,
                siteId, stallId: otherStallIdForTransfer, originalMasterItemId: 'masterForTransfer', lastUpdated: new Date().toISOString(),
            });
            // Master quantity should not change
            await assertSucceeds(batch.commit());
        });

        it('manager CAN transfer to an existing stall item (batch write)', async () => {
            const batch = managerDb.batch();
            const initialDestQty = (await destStallItemRef.get()).data().quantity;
            batch.update(sourceStallItemRef, { quantity: initialSourceStallQty - quantityToTransfer, lastUpdated: new Date().toISOString() });
            batch.update(destStallItemRef, { quantity: initialDestQty + quantityToTransfer, lastUpdated: new Date().toISOString() });
            await assertSucceeds(batch.commit());
        });

        it('manager CANNOT transfer if master item quantity changes', async () => {
            const batch = managerDb.batch();
            batch.update(sourceStallItemRef, { quantity: initialSourceStallQty - quantityToTransfer, lastUpdated: new Date().toISOString() });
            batch.set(newDestStallItemRef, {
                name: "Transfer New", category: "Transfer", quantity: quantityToTransfer, unit: "pcs", price: 40,
                siteId, stallId: otherStallIdForTransfer, originalMasterItemId: 'masterForTransfer', lastUpdated: new Date().toISOString(),
            });
            batch.update(masterItemForTransferRef, { quantity: initialMasterQtyForTransfer - 5, lastUpdated: new Date().toISOString() }); // Incorrectly changing master
            await assertFails(batch.commit());
        });
        
        it('manager CANNOT transfer if items are not linked to the same master', async () => {
            const batch = managerDb.batch();
            batch.update(sourceStallItemRef, { quantity: initialSourceStallQty - quantityToTransfer, lastUpdated: new Date().toISOString() });
            batch.set(newDestStallItemRef, { // Setting up a new dest item
                name: "Transfer Wrong Master Link", category: "Transfer", quantity: quantityToTransfer, unit: "pcs", price: 40,
                siteId, stallId: otherStallIdForTransfer, originalMasterItemId: 'differentMasterId123', lastUpdated: new Date().toISOString(),
            });
            await assertFails(batch.commit());
        });
    });
  });

  // --- SalesTransactions Collection Tests (/salesTransactions/{saleId}) ---
  describe('SalesTransactions Collection (/salesTransactions/{saleId})', () => {
    const adminUserId = 'adminST';
    const managerUserId = 'managerST';
    const staffUserId = 'staffST';
    const otherStaffId = 'otherStaff';
    let siteId: string;
    let stallId: string;
    let stockItemIdForSale: string;
    let saleId: string;

    beforeEach(async () => {
      await setupUserRole(adminUserId, 'admin');
      const adminDb = getFirestoreAs({ uid: adminUserId });

      const siteRef = await adminDb.collection('sites').add({ name: 'SiteForSales' });
      siteId = siteRef.id;
      const stallRef = await adminDb.collection('stalls').add({ name: 'StallForSales', siteId });
      stallId = stallRef.id;

      await setupUserRole(managerUserId, 'manager', { managedSiteIds: [siteId] });
      await setupUserRole(staffUserId, 'staff', { defaultSiteId: siteId, defaultStallId: stallId });
      await setupUserRole(otherStaffId, 'staff', { defaultSiteId: siteId, defaultStallId: 'otherStall' });
      
      const stockItemRef = await adminDb.collection('stockItems').add({ name: 'Sold Item', quantity: 100, siteId, stallId });
      stockItemIdForSale = stockItemRef.id;

      const saleRef = await adminDb.collection('salesTransactions').add({
          items: [{ itemId: stockItemIdForSale, name: 'Sold Item', quantity: 1, pricePerUnit: 10, totalPrice: 10 }],
          totalAmount: 10, transactionDate: new Date().toISOString(),
          staffId: staffUserId, siteId, stallId, isDeleted: false
      });
      saleId = saleRef.id;
    });

    it('authenticated user CAN read sales from their allowed site/stall context', async () => {
        const staffDb = getFirestoreAs({ uid: staffUserId }); 
        await assertSucceeds(staffDb.collection('salesTransactions').doc(saleId).get());

        const managerDb = getFirestoreAs({ uid: managerUserId });
        await assertSucceeds(managerDb.collection('salesTransactions').doc(saleId).get());
        
        const adminDb = getFirestoreAs({uid: adminUserId});
        await assertSucceeds(adminDb.collection('salesTransactions').doc(saleId).get());
    });
    
    it('staff/manager/admin CAN create a sale for their current context AND matching staffId', async () => {
        const staffDb = getFirestoreAs({ uid: staffUserId });
        await assertSucceeds(staffDb.collection('salesTransactions').add({
            items: [{ itemId: 'itemX', name: 'New Sale Item', quantity: 1, pricePerUnit: 5, totalPrice: 5 }],
            totalAmount: 5, transactionDate: new Date().toISOString(),
            staffId: staffUserId, siteId, stallId, isDeleted: false 
        }));
        
        const managerDb = getFirestoreAs({ uid: managerUserId });
        await assertSucceeds(managerDb.collection('salesTransactions').add({
            items: [], totalAmount: 0, transactionDate: new Date().toISOString(),
            staffId: managerUserId, siteId, stallId, isDeleted: false 
        }));
    });

    it('staff/manager CANNOT create a sale with a staffId different from their own auth uid', async () => {
        const staffDb = getFirestoreAs({ uid: staffUserId });
        await assertFails(staffDb.collection('salesTransactions').add({
            items: [], totalAmount: 0, transactionDate: new Date().toISOString(),
            staffId: managerUserId, siteId, stallId, isDeleted: false 
        }));
        
        const managerDb = getFirestoreAs({ uid: managerUserId });
        await assertFails(managerDb.collection('salesTransactions').add({
            items: [], totalAmount: 0, transactionDate: new Date().toISOString(),
            staffId: staffUserId, siteId, stallId, isDeleted: false
        }));
    });
    
    it('admin CAN mark a sale as deleted (update specific fields only)', async () => {
        const adminDb = getFirestoreAs({ uid: adminUserId });
        await assertSucceeds(adminDb.collection('salesTransactions').doc(saleId).update({
            isDeleted: true,
            deletedAt: new Date().toISOString(),
            deletedBy: adminUserId,
            deletionJustification: "Test deletion by admin"
        }));
    });
    
    it('admin CANNOT update other fields of a sale when marking as deleted', async () => {
        const adminDb = getFirestoreAs({ uid: adminUserId });
        await assertFails(adminDb.collection('salesTransactions').doc(saleId).update({
            isDeleted: true,
            totalAmount: 999 // Attempting to change a non-deletion field
        }));
    });

    it('manager/staff CANNOT mark a sale as deleted (or update any field)', async () => {
        const managerDb = getFirestoreAs({uid: managerUserId});
        const staffDb = getFirestoreAs({uid: staffUserId});
        await assertFails(managerDb.collection('salesTransactions').doc(saleId).update({ isDeleted: true }));
        await assertFails(staffDb.collection('salesTransactions').doc(saleId).update({ totalAmount: 100 }));
    });
    
    it('NO ONE can fully delete a sales transaction document', async () => {
        const adminDb = getFirestoreAs({ uid: adminUserId });
        const managerDb = getFirestoreAs({uid: managerUserId});
        const staffDb = getFirestoreAs({uid: staffUserId});
        
        await assertFails(adminDb.collection('salesTransactions').doc(saleId).delete());
        await assertFails(managerDb.collection('salesTransactions').doc(saleId).delete());
        await assertFails(staffDb.collection('salesTransactions').doc(saleId).delete());
    });
  });
});
    
