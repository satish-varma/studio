
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, Firestore } from 'firebase/firestore';
import { firebaseConfig } from './firebaseConfig'; // Your actual Firebase config

const LOG_PREFIX_TEST_UTILS = "[FirebaseTestUtils]";

// Ensure this matches your firebase.json emulator ports
const EMULATOR_HOST = "localhost"; // Or "127.0.0.1"
const AUTH_EMULATOR_PORT = 9099;
const FIRESTORE_EMULATOR_PORT = 8080;

let app: FirebaseApp;
let auth: Auth;
let firestore: Firestore;

function initializeTestApp() {
  if (!getApps().find(app => app.name === 'test-app')) {
    console.log(`${LOG_PREFIX_TEST_UTILS} Initializing Firebase app for tests (name: test-app)...`);
    app = initializeApp(firebaseConfig, 'test-app');
  } else {
    console.log(`${LOG_PREFIX_TEST_UTILS} Using existing Firebase app for tests (name: test-app).`);
    app = getApp('test-app');
  }
  auth = getAuth(app);
  firestore = getFirestore(app);
}

// Call this once before your test suite or in a global setup
export function connectToEmulators() {
  if (!app) initializeTestApp(); // Ensure app is initialized before connecting

  console.log(`${LOG_PREFIX_TEST_UTILS} Connecting to Firebase emulators...`);
  try {
    connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${AUTH_EMULATOR_PORT}`, { disableWarnings: false });
    console.log(`${LOG_PREFIX_TEST_UTILS} Auth connected to emulator at ${EMULATOR_HOST}:${AUTH_EMULATOR_PORT}`);
  } catch (e: any) {
    if (e.message.includes("already connected")) {
        console.warn(`${LOG_PREFIX_TEST_UTILS} Auth emulator already connected. This is usually fine.`);
    } else {
        console.error(`${LOG_PREFIX_TEST_UTILS} Error connecting Auth to emulator:`, e);
        throw e;
    }
  }

  try {
    connectFirestoreEmulator(firestore, EMULATOR_HOST, FIRESTORE_EMULATOR_PORT);
    console.log(`${LOG_PREFIX_TEST_UTILS} Firestore connected to emulator at ${EMULATOR_HOST}:${FIRESTORE_EMULATOR_PORT}`);
  } catch (e: any) {
     if (e.message.includes("already connected")) {
        console.warn(`${LOG_PREFIX_TEST_UTILS} Firestore emulator already connected. This is usually fine.`);
    } else {
        console.error(`${LOG_PREFIX_TEST_UTILS} Error connecting Firestore to emulator:`, e);
        throw e;
    }
  }
}

// Helper to get initialized services for tests
export function getTestFirebaseServices() {
  if (!app) initializeTestApp();
  return { app, auth, firestore };
}

// Function to clear Firestore data (using REST API)
export async function clearFirestoreData() {
  if (!firebaseConfig.projectId) {
    console.error(`${LOG_PREFIX_TEST_UTILS} Project ID is not defined in firebaseConfig. Cannot clear Firestore data via REST.`);
    throw new Error("Project ID missing in firebaseConfig for emulator cleanup.");
  }
  const firestoreClearUrl = `http://${EMULATOR_HOST}:${FIRESTORE_EMULATOR_PORT}/emulator/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;
  console.log(`${LOG_PREFIX_TEST_UTILS} Clearing Firestore data via REST API: ${firestoreClearUrl}`);
  try {
    const response = await fetch(firestoreClearUrl, { method: 'DELETE' });
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${LOG_PREFIX_TEST_UTILS} Failed to clear Firestore data. Status: ${response.status}, Response: ${errorText}`);
      throw new Error(`Failed to clear Firestore data: ${response.status} - ${errorText}`);
    }
    console.log(`${LOG_PREFIX_TEST_UTILS} Firestore data cleared successfully.`);
  } catch (error) {
    console.error(`${LOG_PREFIX_TEST_UTILS} Error clearing Firestore data:`, error);
    // Don't re-throw if fetch itself fails (e.g. emulator not running), let tests handle it
    // This might happen if emulators are not running, which should ideally be caught by tests failing to connect.
  }
}

// Function to clear Auth users (using REST API)
export async function clearAuthUsers() {
  if (!firebaseConfig.projectId) {
    console.error(`${LOG_PREFIX_TEST_UTILS} Project ID is not defined in firebaseConfig. Cannot clear Auth users via REST.`);
    throw new Error("Project ID missing in firebaseConfig for emulator cleanup.");
  }
  const authClearUrl = `http://${EMULATOR_HOST}:${AUTH_EMULATOR_PORT}/emulator/v1/projects/${firebaseConfig.projectId}/accounts`;
  console.log(`${LOG_PREFIX_TEST_UTILS} Clearing Auth users via REST API: ${authClearUrl}`);
  try {
    const response = await fetch(authClearUrl, { method: 'DELETE' });
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${LOG_PREFIX_TEST_UTILS} Failed to clear Auth users. Status: ${response.status}, Response: ${errorText}`);
      throw new Error(`Failed to clear Auth users: ${response.status} - ${errorText}`);
    }
    console.log(`${LOG_PREFIX_TEST_UTILS} Auth users cleared successfully.`);
  } catch (error) {
    console.error(`${LOG_PREFIX_TEST_UTILS} Error clearing Auth users:`, error);
  }
}

// Initialize on import to make services available
initializeTestApp();
