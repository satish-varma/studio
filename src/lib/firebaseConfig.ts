// TODO: Replace with your actual Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "YOUR_API_KEY",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "YOUR_AUTH_DOMAIN",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "YOUR_STORAGE_BUCKET",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "YOUR_MESSAGING_SENDER_ID",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "YOUR_APP_ID",
};

// IMPORTANT: Make sure to set up these environment variables in your .env.local file for development
// and in your hosting environment for production.
// For example, in .env.local:
// NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
// NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain_here
// ...and so on for all firebaseConfig properties.

export { firebaseConfig };
