
import { initializeApp, getApps, type FirebaseApp, getApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const LOG_PREFIX_CONFIG = "[FirebaseConfig]";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let firebaseInitializationError: string | null = null;

export const isFirebaseConfigValid = () => {
    return !!(
        firebaseConfig.apiKey &&
        firebaseConfig.authDomain &&
        firebaseConfig.projectId &&
        firebaseConfig.apiKey !== "YOUR_API_KEY_HERE" && 
        firebaseConfig.projectId !== "YOUR_PROJECT_ID" 
    );
};

if (isFirebaseConfigValid()) {
    if (!getApps().length) {
      try {
        console.log(`${LOG_PREFIX_CONFIG} Initializing Firebase client app...`);
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        console.log(`${LOG_PREFIX_CONFIG} Firebase client app initialized successfully.`);
      } catch (error: any) {
        console.error(`${LOG_PREFIX_CONFIG} Firebase client app initialization error:`, error.message, error.stack);
        firebaseInitializationError = `Firebase client app initialization error: ${error.message}`;
      }
    } else {
      console.log(`${LOG_PREFIX_CONFIG} Getting existing Firebase client app...`);
      app = getApp();
      auth = getAuth(app);
      db = getFirestore(app);
    }
} else {
    console.error(`${LOG_PREFIX_CONFIG} Firebase config is not valid. Skipping Firebase initialization.`);
    const missingKeys = Object.entries(firebaseConfig)
        .filter(([key, value]) => !value || value.startsWith("YOUR_"))
        .map(([key]) => `NEXT_PUBLIC_FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`);

    firebaseInitializationError = `CRITICAL CONFIG FAILURE: The following required environment variables are missing or are placeholder values in your .env.local file: ${missingKeys.join(', ')}. Please update your .env.local file with the correct values from your Firebase project settings and restart the development server.`;
}

export { app, auth, db, firebaseConfig, firebaseInitializationError };
