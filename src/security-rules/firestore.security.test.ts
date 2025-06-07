
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
// This needs to be done with an admin-like context if rules for /users are restrictive.
async function setupUserRole(userId: string, role: string, data: Record<string, any> = {}) {
  const adminDb = testEnv.unauthenticatedContext().firestore(); // Or a pre-defined admin context if needed for setup
  // console.log(`${LOG_PREFIX_RULES_TEST} setupUserRole: Setting up user document /users/${userId} with role: ${role}`);
  try {
    await adminDb.collection('users').doc(userId).set({ role, email: `${userId}@example.com`, displayName: `User ${userId}`, ...data });
    // console.log(`${LOG_PREFIX_RULES_TEST} setupUserRole: User document /users/${userId} created/updated successfully.`);
  } catch (error) {
    console.error(`${LOG_PREFIX_RULES_TEST} setupUserRole: Error setting up user document /users/${userId}:`, error);
    throw error; // Re-throw to fail the test if setup fails
  }
}


describe('StallSync Firestore Security Rules', () => {
  beforeAll(async () => {
    console.log(`${LOG_PREFIX_RULES_TEST} beforeAll: Initializing test environment and loading rules...`);
    try {
      const rulesPath = path.join(__dirname, '../../..', 'firestore.rules'); // Adjust path if necessary
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
      process.exit(1); // Exit if setup fails catastrophically
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
      // Setup: Create the user document so the rule can read it
      await setupUserRole(testUserId, 'staff', { displayName: 'Test User' });
      const db = getFirestoreAs({ uid: testUserId });
      await assertSucceeds(db.collection('users').doc(testUserId).get());
    });

    it('authenticated user CANNOT read OTHER users documents (if not admin)', async () => {
      await setupUserRole(testUserId, 'staff'); // User making the request
      await setupUserRole(otherUserId, 'staff', { displayName: 'Other User Data' }); // Target document

      const db = getFirestoreAs({ uid: testUserId });
      await assertFails(db.collection('users').doc(otherUserId).get());
    });
    
    it('authenticated user CAN update their OWN displayName and preferences', async () => {
      await setupUserRole(testUserId, 'staff', { displayName: 'Old Name' });
      const db = getFirestoreAs({ uid: testUserId }); // Authenticated as testUser
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
      // Setup admin's own user document with 'admin' role
      await setupUserRole(adminUserId, 'admin');
      // Setup target user document
      await setupUserRole(testUserId, 'staff', { displayName: 'Target User Data' });

      const dbAsAdmin = getFirestoreAs({ uid: adminUserId });
      await assertSucceeds(db.collection('users').doc(testUserId).get());
    });

    it('admin user CAN update ANY user document (including role and assignments)', async () => {
      await setupUserRole(adminUserId, 'admin'); // The admin performing the action
      await setupUserRole(testUserId, 'staff', { displayName: 'Initial Name', role: 'staff' }); // The user being modified

      const dbAsAdmin = getFirestoreAs({ uid: adminUserId });
      await assertSucceeds(dbAsAdmin.collection('users').doc(testUserId).update({
        displayName: 'Updated by Admin',
        role: 'manager',
        managedSiteIds: ['siteAlpha'],
        defaultSiteId: null, // Admins can also clear these
        defaultStallId: null,
      }));
    });

    it('admin user CAN create a new user document', async () => {
        await setupUserRole(adminUserId, 'admin'); // Admin performing action
        const dbAsAdmin = getFirestoreAs({uid: adminUserId});
        const newUserId = "newUserByAdmin";
        await assertSucceeds(dbAsAdmin.collection("users").doc(newUserId).set({
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
      
      // Create a sample site for read/update/delete tests by admin context
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

    it('manager CAN read sites (even if not directly managing all, if rules allow general read)', async () => {
      // Your current rules: `allow read: if isAuthenticated();`
      const db = getFirestoreAs({ uid: managerUserId });
      await assertSucceeds(db.collection('sites').doc(siteId).get()); // manager reading a site potentially not in their managedSiteIds list
      await assertSucceeds(db.collection('sites').where('name', '==', 'Test Site Alpha').get());
    });
    
    it('staff CAN read sites', async () => {
      // Your current rules: `allow read: if isAuthenticated();`
      const db = getFirestoreAs({ uid: staffUserId });
      await assertSucceeds(db.collection('sites').doc(siteId).get());
    });

    it('manager and staff CANNOT create, update, or delete sites', async () => {
      const dbManager = getFirestoreAs({ uid: managerUserId });
      const dbStaff = getFirestoreAs({ uid: staffUserId });

      // Create
      await assertFails(dbManager.collection('sites').doc('managerSite').set({ name: 'Manager Site' }));
      await assertFails(dbStaff.collection('sites').doc('staffSite').set({ name: 'Staff Site' }));
      // Update
      await assertFails(dbManager.collection('sites').doc(siteId).update({ location: 'Manager Update' }));
      await assertFails(dbStaff.collection('sites').doc(siteId).update({ location: 'Staff Update' }));
      // Delete
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
       // Create a site first (as admin)
      const adminDb = getFirestoreAs({ uid: adminUserId });
      const siteRef = await adminDb.collection('sites').add({ name: 'Site For Stalls', location: 'Test Location', createdAt: '2023-01-01', updatedAt: '2023-01-01'});
      siteForStallsId = siteRef.id;
      
      await setupUserRole(managerUserId, 'manager', { managedSiteIds: [siteForStallsId] });
      await setupUserRole(staffUserId, 'staff', { defaultSiteId: siteForStallsId, defaultStallId: null });

      // Create a sample stall for read/update/delete tests by admin context
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
      // Your current rules: `allow read: if isAuthenticated();`
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
  // These will be more complex due to master/stall relationships and quantity updates
  describe('StockItems Collection (/stockItems/{itemId})', () => {
    const adminUserId = 'adminSI';
    const managerUserId = 'managerSI';
    const staffUserId = 'staffSI';
    let siteId: string;
    let stallId: string;
    let masterItemId: string;
    let stallItemId: string;

    beforeEach(async () => {
        await setupUserRole(adminUserId, 'admin');
        
        const adminDb = getFirestoreAs({ uid: adminUserId });
        const siteRef = await adminDb.collection('sites').add({ name: 'SiteForStock', location: 'StockLocation' });
        siteId = siteRef.id;
        const stallRef = await adminDb.collection('stalls').add({ name: 'StallForStock', siteId, stallType: 'Retail' });
        stallId = stallRef.id;

        await setupUserRole(managerUserId, 'manager', { managedSiteIds: [siteId] });
        await setupUserRole(staffUserId, 'staff', { defaultSiteId: siteId, defaultStallId: stallId });

        // Create a master item
        const masterItemDocRef = await adminDb.collection('stockItems').add({
            name: "Master Product", category: "Test", quantity: 100, unit: "pcs", price: 10,
            siteId, stallId: null, originalMasterItemId: null,
        });
        masterItemId = masterItemDocRef.id;

        // Create a stall item linked to master
        const stallItemDocRef = await adminDb.collection('stockItems').add({
            name: "Master Product (Stall)", category: "Test", quantity: 10, unit: "pcs", price: 10,
            siteId, stallId, originalMasterItemId: masterItemId,
        });
        stallItemId = stallItemDocRef.id;
    });

    it('any authenticated user CAN read stock items in their site context', async () => {
        // Your `stockItems` read rule: `allow read: if isAuthenticated() && isUserAllowedForSite(resource.data.siteId);`
        // This means staff needs to read from their defaultSiteId, manager from their managedSiteIds.
        // Admin can read any.
        
        const staffDb = getFirestoreAs({ uid: staffUserId });
        await assertSucceeds(staffDb.collection('stockItems').doc(stallItemId).get()); // Staff reading item in their default site/stall
        await assertSucceeds(staffDb.collection('stockItems').doc(masterItemId).get());// Staff reading master item in their default site

        const managerDb = getFirestoreAs({ uid: managerUserId });
        await assertSucceeds(managerDb.collection('stockItems').doc(stallItemId).get());
        await assertSucceeds(managerDb.collection('stockItems').doc(masterItemId).get());
        
        const adminDb = getFirestoreAs({ uid: adminUserId });
        await assertSucceeds(adminDb.collection('stockItems').doc(stallItemId).get());
    });

    it('staff CAN update quantity of an item in their assigned stall (within transaction context - simplified here)', async () => {
        // Rule: `isStaff() && resource.data.stallId == getUserData().defaultStallId && isUpdatingQuantityOnly()`
        // Simplified: Test direct update if the rule for update allows it without full transaction context.
        // The `isUpdatingQuantityOnly` and transaction aspects are harder to test directly here.
        // We'll assume for this unit test, a direct update for quantity by staff on their stall item.
        const staffDb = getFirestoreAs({ uid: staffUserId });
        // Ensure the 'users' doc for staffUserId is correctly set up with defaultStallId = stallId
        await setupUserRole(staffUserId, 'staff', { defaultSiteId: siteId, defaultStallId: stallId });
        await assertSucceeds(staffDb.collection('stockItems').doc(stallItemId).update({ quantity: 5 }));
    });

    it('staff CANNOT update quantity of an item NOT in their assigned stall', async () => {
        const otherStallItemRef = await getFirestoreAs({uid: adminUserId}).collection('stockItems').add({
            name: "Other Stall Item", quantity: 5, siteId, stallId: 'otherStallXYZ', originalMasterItemId: masterItemId
        });
        await setupUserRole(staffUserId, 'staff', { defaultSiteId: siteId, defaultStallId: stallId }); // Assigned to `stallId`
        const staffDb = getFirestoreAs({ uid: staffUserId });
        await assertFails(staffDb.collection('stockItems').doc(otherStallItemRef.id).update({ quantity: 3 }));
    });
    
    it('manager CAN create/update stock items in their managed sites', async () => {
        // Rule for create: `(isAdmin() || (isManager() && isUserAllowedForSite(request.resource.data.siteId)))`
        // Rule for update: `(isAdmin() || (isManager() && isUserAllowedForSite(resource.data.siteId)))`
        await setupUserRole(managerUserId, 'manager', { managedSiteIds: [siteId] });
        const managerDb = getFirestoreAs({ uid: managerUserId });
        
        // Create new master item in managed site
        const newMasterByManagerRef = managerDb.collection('stockItems').doc();
        await assertSucceeds(newMasterByManagerRef.set({
            name: "Manager Master", category: "CatM", quantity: 50, unit: "pcs", price: 20,
            siteId, stallId: null, originalMasterItemId: null,
        }));
        
        // Update existing master item in managed site
        await assertSucceeds(managerDb.collection('stockItems').doc(masterItemId).update({ price: 12, description: "Updated by Manager" }));
        // Update existing stall item in managed site
        await assertSucceeds(managerDb.collection('stockItems').doc(stallItemId).update({ quantity: 8 }));
    });

    it('manager CANNOT create/update stock items in NON-managed sites', async () => {
        await setupUserRole(managerUserId, 'manager', { managedSiteIds: ['someOtherSiteId'] }); // Does not manage `siteId`
        const managerDb = getFirestoreAs({ uid: managerUserId });

        const newItemInNonManagedSiteRef = managerDb.collection('stockItems').doc();
        await assertFails(newItemInNonManagedSiteRef.set({ name: "Illegal Item", siteId, stallId: null, quantity: 1 }));
        await assertFails(managerDb.collection('stockItems').doc(masterItemId).update({ price: 99 })); // masterItemId is in `siteId`
    });
    
    it('admin CAN create/update/delete any stock item', async () => {
        const adminDb = getFirestoreAs({uid: adminUserId});
        const newItemByAdminRef = adminDb.collection('stockItems').doc();
        await assertSucceeds(newItemByAdminRef.set({name: "Admin Item", siteId, quantity: 10}));
        await assertSucceeds(adminDb.collection('stockItems').doc(masterItemId).update({name: "Admin Updated Master"}));
        await assertSucceeds(adminDb.collection('stockItems').doc(stallItemId).update({name: "Admin Updated Stall Item"}));
        await assertSucceeds(adminDb.collection('stockItems').doc(stallItemId).delete());
        await assertSucceeds(adminDb.collection('stockItems').doc(masterItemId).delete());
    });
    
    // More detailed scenarios for isItemDeletionAllowed, isAllocation, isReturn, isTransfer would be complex
    // as they involve checking multiple documents in rules. These are good candidates for testing
    // application-level logic that calls these transactions, ensuring the transaction itself would pass rules.
  });

  // --- SalesTransactions Collection Tests (/salesTransactions/{saleId}) ---
  describe('SalesTransactions Collection (/salesTransactions/{saleId})', () => {
    const adminUserId = 'adminST';
    const managerUserId = 'managerST';
    const staffUserId = 'staffST';
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
      
      const stockItemRef = await adminDb.collection('stockItems').add({ name: 'Sold Item', quantity: 100, siteId, stallId });
      stockItemIdForSale = stockItemRef.id;

      // Create a sample sale for read/update/delete tests
      const saleRef = await adminDb.collection('salesTransactions').add({
          items: [{ itemId: stockItemIdForSale, name: 'Sold Item', quantity: 1, pricePerUnit: 10, totalPrice: 10 }],
          totalAmount: 10, transactionDate: new Date().toISOString(),
          staffId: staffUserId, siteId, stallId, isDeleted: false
      });
      saleId = saleRef.id;
    });

    it('authenticated user CAN read sales from their allowed site/stall context', async () => {
        // Rules: `allow read: if isAuthenticated() && isUserAllowedForSite(resource.data.siteId) && (resource.data.stallId == null || resource.data.stallId == getUserData().defaultStallId || isAdmin() || isManager());`
        // This means staff can read sales from their specific stall, or site-wide sales if their defaultStallId is null.
        // Managers and Admins can read any sale within an allowed site.
        
        // Staff reading sale from their specific stall
        const staffDb = getFirestoreAs({ uid: staffUserId }); // staffUserId is set up with defaultStallId = stallId
        await assertSucceeds(staffDb.collection('salesTransactions').doc(saleId).get());

        // Manager reading sale from a managed site
        const managerDb = getFirestoreAs({ uid: managerUserId });
        await assertSucceeds(managerDb.collection('salesTransactions').doc(saleId).get());
        
        // Admin reading any sale
        const adminDb = getFirestoreAs({uid: adminUserId});
        await assertSucceeds(adminDb.collection('salesTransactions').doc(saleId).get());
    });
    
    it('staff/manager/admin CAN create a sale for their current context', async () => {
        // Rule: `allow create: if isAuthenticated() && isUserAllowedForSite(request.resource.data.siteId) && request.resource.data.staffId == request.auth.uid ...;`
        const staffDb = getFirestoreAs({ uid: staffUserId });
        await assertSucceeds(staffDb.collection('salesTransactions').add({
            items: [{ itemId: 'itemX', name: 'New Sale Item', quantity: 1, pricePerUnit: 5, totalPrice: 5 }],
            totalAmount: 5, transactionDate: new Date().toISOString(),
            staffId: staffUserId, siteId, stallId, isDeleted: false // staffId matches request.auth.uid
        }));
        
        const managerDb = getFirestoreAs({ uid: managerUserId });
        await assertSucceeds(managerDb.collection('salesTransactions').add({
            items: [], totalAmount: 0, transactionDate: new Date().toISOString(),
            staffId: managerUserId, siteId, stallId, isDeleted: false // manager making sale for themselves
        }));
    });

    it('staff/manager CANNOT create a sale for another staffId', async () => {
        const staffDb = getFirestoreAs({ uid: staffUserId });
        await assertFails(staffDb.collection('salesTransactions').add({
            items: [], totalAmount: 0, transactionDate: new Date().toISOString(),
            staffId: managerUserId, siteId, stallId, isDeleted: false // staffId does NOT match request.auth.uid
        }));
    });
    
    it('admin CAN mark a sale as deleted (update)', async () => {
        // Rule: `allow update: if isAdmin() && isUpdatingDeletionFieldsOnly();`
        const adminDb = getFirestoreAs({ uid: adminUserId });
        await assertSucceeds(adminDb.collection('salesTransactions').doc(saleId).update({
            isDeleted: true,
            deletedAt: new Date().toISOString(),
            deletedBy: adminUserId,
            deletionJustification: "Test deletion by admin"
        }));
    });

    it('manager/staff CANNOT mark a sale as deleted', async () => {
        const managerDb = getFirestoreAs({uid: managerUserId});
        const staffDb = getFirestoreAs({uid: staffUserId});
        await assertFails(managerDb.collection('salesTransactions').doc(saleId).update({ isDeleted: true }));
        await assertFails(staffDb.collection('salesTransactions').doc(saleId).update({ isDeleted: true }));
    });
    
    it('NO ONE can fully delete a sales transaction document', async () => {
        // Rule: `allow delete: if false;`
        const adminDb = getFirestoreAs({ uid: adminUserId });
        const managerDb = getFirestoreAs({uid: managerUserId});
        const staffDb = getFirestoreAs({uid: staffUserId});
        
        await assertFails(adminDb.collection('salesTransactions').doc(saleId).delete());
        await assertFails(managerDb.collection('salesTransactions').doc(saleId).delete());
        await assertFails(staffDb.collection('salesTransactions').doc(saleId).delete());
    });
  });
  
  // StockMovementLogs tests can be added later, typically append-only for admins or system.
  // UserGoogleOAuthTokens tests can also be added, typically very restricted.

});

