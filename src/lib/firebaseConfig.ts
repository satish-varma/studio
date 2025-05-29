
// =================================================================================
// !! VERY IMPORTANT FOR PRODUCTION !!
//
// 1. GO TO THE FIREBASE CONSOLE (https://console.firebase.google.com/)
// 2. Select your Firebase project.
// 3. Go to Project Settings (gear icon ⚙️).
// 4. In the "General" tab, under "Your apps":
//    - If you haven't registered this web app yet:
//      - Click "Add app", select the Web icon (</>).
//      - Give it a nickname (e.g., "StallSync Web App") and click "Register app".
//    - Firebase will display a `firebaseConfig` object. These are the values you need.
//
// 5. REPLACE ALL PLACEHOLDER VALUES BELOW (if not using environment variables)
//    OR (PREFERRED):
//    CREATE A `.env.local` FILE in the root of your project.
//    ADD your Firebase configuration values to `.env.local`, prefixed with `NEXT_PUBLIC_`.
//
//    Example `.env.local` file:
//    NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyC...
//    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
//    NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
//    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
//    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1234567890
//    NEXT_PUBLIC_FIREBASE_APP_ID=1:1234567890:web:abcd1234efgh5678
//    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-ABCDEF1234 (Optional, for Google Analytics)
//
// 6. Ensure these environment variables are also set in your hosting environment (e.g., Firebase Hosting, Vercel) for production.
// =================================================================================
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "YOUR_API_KEY_HERE",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "YOUR_PROJECT.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "YOUR_PROJECT.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "YOUR_MESSAGING_SENDER_ID",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "YOUR_APP_ID",
  // measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "YOUR_MEASUREMENT_ID" // Optional, for Google Analytics
};


// IMPORTANT: 
// This file (`src/lib/firebaseConfig.ts`) reads your Firebase project configuration.
// The recommended way to provide these values is through environment variables (see steps above).
// The `AuthContext.tsx` file (or a similar Firebase initialization file in your project)
// uses this `firebaseConfig` object to initialize the Firebase SDK, connecting your
// Next.js application to your specific Firebase project services (Auth, Firestore, etc.).
//
// If Firebase is not initializing correctly, double-check:
// 1. You have correctly registered this web application in your Firebase project settings.
// 2. The values in your `.env.local` file (or directly in this file if not using .env.local)
//    exactly match the configuration provided by Firebase.
// 3. You have restarted your Next.js development server after creating or modifying `.env.local`.

export { firebaseConfig };

