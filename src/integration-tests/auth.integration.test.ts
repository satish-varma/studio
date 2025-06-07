
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, collection } from 'firebase/firestore';
import { 
  getTestFirebaseServices, 
  connectToEmulators, 
  clearFirestoreData, 
  clearAuthUsers 
} from '../lib/firebaseTestUtils'; // Adjust path as necessary
import type { AppUser } from '../types'; // Adjust path as necessary

const LOG_PREFIX_INTEGRATION_AUTH = "[IntegrationTest:Auth]";

// Get emulated services
const { auth, firestore } = getTestFirebaseServices();

describe('Firebase Auth and Firestore User Integration Tests', () => {
  
  beforeAll(() => {
    console.log(`${LOG_PREFIX_INTEGRATION_AUTH} beforeAll: Connecting to emulators...`);
    // Note: connectToEmulators might have already been called by firebaseTestUtils.ts import.
    // Calling it here ensures it runs before any tests in this suite if module-level call was missed or if order matters.
    // It includes checks to prevent reconnecting if already connected.
    connectToEmulators(); 
  });

  beforeEach(async () => {
    console.log(`${LOG_PREFIX_INTEGRATION_AUTH} beforeEach: Clearing emulator data...`);
    // Clear data before each test for isolation
    // Order matters: clear Firestore, then Auth if Firestore rules depend on Auth state (less common for user docs directly)
    // Or clear Auth then Firestore if Auth triggers create user docs (more common)
    await clearAuthUsers(); // Clear auth users first
    await clearFirestoreData(); // Then clear Firestore
    console.log(`${LOG_PREFIX_INTEGRATION_AUTH} beforeEach: Emulator data cleared.`);
  });

  test('should sign up a new user, create a user document in Firestore, and allow sign in', async () => {
    const testEmail = 'testuser@example.com';
    const testPassword = 'password123';
    const testDisplayName = 'Test User One';

    console.log(`${LOG_PREFIX_INTEGRATION_AUTH} Test: Attempting user sign-up with email: ${testEmail}`);
    // 1. Sign up new user via Auth Emulator
    let userCredential;
    try {
      userCredential = await createUserWithEmailAndPassword(auth, testEmail, testPassword);
    } catch (e: any) {
      console.error(`${LOG_PREFIX_INTEGRATION_AUTH} Error during createUserWithEmailAndPassword:`, e.message, e.stack, e.code);
      throw e; // Fail test if auth creation fails
    }
    
    const firebaseUser = userCredential.user;
    expect(firebaseUser).toBeTruthy();
    expect(firebaseUser.email).toBe(testEmail);
    console.log(`${LOG_PREFIX_INTEGRATION_AUTH} Test: Firebase Auth user created. UID: ${firebaseUser.uid}`);

    // 2. Manually create the corresponding user document in Firestore (mimicking what AuthContext or a Cloud Function might do)
    //    In a real app, this might be triggered by an onUserCreate Cloud Function or by client-side logic post-signup.
    //    For this test, we'll do it directly to test the Firestore integration part.
    const userDocRef = doc(firestore, 'users', firebaseUser.uid);
    const appUserData: Omit<AppUser, 'uid'> = { // Omit UID as it's the doc ID
      email: testEmail,
      displayName: testDisplayName,
      role: 'staff', // Default role
      createdAt: new Date().toISOString(),
      defaultSiteId: null,
      defaultStallId: null,
      managedSiteIds: [],
      defaultItemSearchTerm: null,
      defaultItemCategoryFilter: null,
      defaultItemStockStatusFilter: null,
      defaultItemStallFilterOption: null,
      defaultSalesDateRangeFrom: null,
      defaultSalesDateRangeTo: null,
      defaultSalesStaffFilter: null,
    };
    
    console.log(`${LOG_PREFIX_INTEGRATION_AUTH} Test: Creating Firestore document for user ${firebaseUser.uid}...`);
    await setDoc(userDocRef, appUserData);
    console.log(`${LOG_PREFIX_INTEGRATION_AUTH} Test: Firestore document supposedly created.`);

    // 3. Verify the user document exists in Firestore Emulator
    console.log(`${LOG_PREFIX_INTEGRATION_AUTH} Test: Fetching Firestore document for user ${firebaseUser.uid} to verify...`);
    const userDocSnap = await getDoc(userDocRef);
    expect(userDocSnap.exists()).toBe(true);
    const fetchedAppUser = userDocSnap.data() as AppUser;
    expect(fetchedAppUser.email).toBe(testEmail);
    expect(fetchedAppUser.displayName).toBe(testDisplayName);
    expect(fetchedAppUser.role).toBe('staff');
    console.log(`${LOG_PREFIX_INTEGRATION_AUTH} Test: Firestore document verified for user ${firebaseUser.uid}.`);

    // 4. Sign out (if a user is signed in from createUserWithEmailAndPassword)
    console.log(`${LOG_PREFIX_INTEGRATION_AUTH} Test: Signing out current user...`);
    await signOut(auth);
    expect(auth.currentUser).toBeNull();
    console.log(`${LOG_PREFIX_INTEGRATION_AUTH} Test: Current user signed out.`);

    // 5. Sign in with the new credentials via Auth Emulator
    console.log(`${LOG_PREFIX_INTEGRATION_AUTH} Test: Attempting to sign in as ${testEmail}...`);
    const signInCredential = await signInWithEmailAndPassword(auth, testEmail, testPassword);
    expect(signInCredential.user).toBeTruthy();
    expect(signInCredential.user.uid).toBe(firebaseUser.uid);
    console.log(`${LOG_PREFIX_INTEGRATION_AUTH} Test: Successfully signed in as ${testEmail}.`);

    // Clean up: delete the user (optional, as beforeEach should handle it)
    // await deleteDoc(userDocRef);
    // const adminAuth = getAdminAuth(); // Needs Admin SDK setup for emulators
    // await adminAuth.deleteUser(firebaseUser.uid);
  });

  // Add more tests:
  // - Test sign-in failure (wrong password)
  // - Test Firestore security rules if applicable (e.g., only authenticated users can read their own doc)
  //   This would require using `getAuth` to sign in as a specific user and then attempting Firestore operations.
});
