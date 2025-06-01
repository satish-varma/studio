
# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.


You're on the right track! Your Next.js application is the "web app" that you'll register with your Firebase project. This registration process in the Firebase console is what gives you the specific configuration details (apiKey, authDomain, etc.) that your Next.js app needs to connect to your Firebase backend services.

The good news is that your project already has the necessary Firebase SDKs included (as seen in package.json) and the initialization logic is already present in src/contexts/AuthContext.tsx.

The main step for you is to:

Go to the Firebase Console (console.firebase.google.com).
Select your Firebase project (or create one if you haven't).
Go to Project settings (click the gear icon ⚙️ near "Project Overview").
In the "General" tab, scroll down to the "Your apps" section.
Click on "Add app" and select the Web icon (</>).
Give your app a nickname (e.g., "StallSync Web App") and click "Register app".
Firebase will then display an object called firebaseConfig containing your apiKey, authDomain, projectId, etc. These are the values you need.
Once you have these values:

Copy them into your .env.local file at the root of your project, making sure to prefix each key with NEXT_PUBLIC_ (for Firebase client SDK) or without (for backend/server-side use like Google OAuth credentials). For example:

```
# .env.local

# Firebase Client SDK Configuration (used by Next.js frontend)
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyC...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1234567890
NEXT_PUBLIC_FIREBASE_APP_ID=1:1234567890:web:abcd1234efgh
# NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-ABCDEF1234 (Optional, for Google Analytics)

# Google OAuth Credentials (used by backend API routes/Firebase Functions for Sheets API)
# These should NOT be prefixed with NEXT_PUBLIC_ as they are sensitive server-side credentials.
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
# This is the URL Google redirects to after user authorization.
# It must be registered in your Google Cloud Console OAuth Client settings.
# Example for local dev: http://localhost:9002/api/auth/google/callback
# Example for prod: https://your-app-domain.com/api/auth/google/callback
GOOGLE_REDIRECT_URI=your-configured-redirect-uri
```

The file `src/lib/firebaseConfig.ts` is already set up to read the `NEXT_PUBLIC_` environment variables for client-side Firebase.
Your backend API routes (like `/api/google-sheets-proxy`) will read `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` directly from `process.env`.

**Ensure `.env.local` is added to your `.gitignore` file to prevent committing sensitive credentials.**

To make this even clearer, I'll update the comments in src/lib/firebaseConfig.ts to emphasize exactly where these configuration values come from.

Here's the modification:

0b8f94cc
I've updated the comments in src/lib/firebaseConfig.ts to be more explicit. The key takeaway is that your Next.js app is the web app, and you just need to get its configuration details from your Firebase project settings.

Once you've put the correct configuration in your .env.local file (and restarted your dev server), the existing code should connect to your Firebase project successfully.
