
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import admin from 'firebase-admin';
import type { App as AdminApp } from 'firebase-admin/app';
import type { DecodedIdToken } from 'firebase-admin/auth';

// --- Firebase Admin SDK Initialization ---
let adminApp: AdminApp | undefined;

if (!admin.apps.length) {
  console.log("API Route /api/admin/create-user: Attempting Firebase Admin SDK initialization...");
  try {
    const serviceAccountJsonEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    const serviceAccountPathEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    if (serviceAccountJsonEnv) {
      console.log("API Route: Initializing Firebase Admin SDK with GOOGLE_APPLICATION_CREDENTIALS_JSON env var...");
      const serviceAccount = JSON.parse(serviceAccountJsonEnv);
      adminApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("API Route: Firebase Admin SDK initialized successfully using JSON env var for project:", adminApp.options.projectId);
    } else if (serviceAccountPathEnv) {
      console.log("API Route: Initializing Firebase Admin SDK with GOOGLE_APPLICATION_CREDENTIALS env var (path):", serviceAccountPathEnv);
      adminApp = admin.initializeApp({
         credential: admin.credential.applicationDefault(), // Uses GOOGLE_APPLICATION_CREDENTIALS path
      });
      console.log("API Route: Firebase Admin SDK initialized successfully using path env var for project:", adminApp.options.projectId);
    } else {
      console.log("API Route: GOOGLE_APPLICATION_CREDENTIALS_JSON and GOOGLE_APPLICATION_CREDENTIALS env vars not set. Attempting fallback to local serviceAccountKey.json (DEV ONLY)...");
      // Fallback for local development if you have a serviceAccountKey.json at project root
      // MAKE SURE THIS FILE IS IN .gitignore AND THE PATH IS CORRECT
      try {
        // Path from src/app/api/admin/create-user/route.ts to project root
        const serviceAccount = require('../../../../../serviceAccountKey.json');
        console.log("API Route: Found local serviceAccountKey.json. Initializing...");
        adminApp = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        console.log("API Route: Firebase Admin SDK initialized successfully using local serviceAccountKey.json for project:", adminApp.options.projectId);
      } catch (e: any) {
         console.error("API Route: Firebase Admin SDK - local serviceAccountKey.json not found or invalid at expected path. Error:", e.message);
         adminApp = undefined; // Ensure adminApp is undefined if this fails
      }
    }
  } catch (error: any) {
    console.error('API Route: Firebase Admin SDK initialization CRITICAL error:', error.stack);
    adminApp = undefined; // Ensure adminApp is undefined on critical error
  }
} else {
  adminApp = admin.app();
  console.log("API Route /api/admin/create-user: Firebase Admin SDK already initialized. Project ID:", adminApp.options.projectId);
}


export async function POST(request: NextRequest) {
  if (!adminApp) {
    console.error("API Route - create-user: Firebase Admin SDK is not initialized. Ensure service account credentials are correctly set up via environment variables or a local key file (for dev only, and gitignored).");
    return NextResponse.json({ error: 'Server configuration error: Firebase Admin SDK not initialized. Check server logs.' }, { status: 500 });
  }

  let callingUser: DecodedIdToken | null = null;
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      console.warn("API Route - create-user: Authorization header missing or malformed.");
      return NextResponse.json({ error: 'Unauthorized: Missing or invalid token format.' }, { status: 401 });
    }
    const idToken = authorization.split('Bearer ')[1];
    console.log("API Route - create-user: Received token (first 10 chars):", idToken.substring(0, 10) + "...");

    try {
      callingUser = await admin.auth().verifyIdToken(idToken);
      console.log("API Route - create-user: ID Token verified successfully for UID:", callingUser.uid);
    } catch (tokenError: any) {
      console.error("API Route - create-user: ID Token verification failed.", tokenError);
      return NextResponse.json({ error: 'Unauthorized: Invalid or expired token.', details: tokenError.message, code: tokenError.code }, { status: 401 });
    }

    if (!callingUser) { // Should be caught by try/catch above, but as a safeguard
      return NextResponse.json({ error: 'Unauthorized: Invalid token after verification attempt.' }, { status: 401 });
    }

    // Authorization: Check if the calling user is an admin in Firestore
    const adminUserDoc = await admin.firestore().collection('users').doc(callingUser.uid).get();
    if (!adminUserDoc.exists || adminUserDoc.data()?.role !== 'admin') {
      console.warn(`API Route - create-user: Forbidden. Caller UID ${callingUser.uid} is not an admin. Role: ${adminUserDoc.data()?.role}`);
      return NextResponse.json({ error: 'Forbidden: Caller is not an admin.' }, { status: 403 });
    }
    console.log("API Route - create-user: Caller authorized as admin.");

    const { email, password, displayName } = await request.json();

    if (!email || !password || !displayName) {
      return NextResponse.json({ error: 'Missing required fields: email, password, or displayName.' }, { status: 400 });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'Password must be a string and at least 6 characters long.' }, { status: 400 });
    }
     if (typeof displayName !== 'string' || displayName.trim().length < 2) {
      return NextResponse.json({ error: "Display name must be a string and at least 2 characters long." }, { status: 400 });
    }
    console.log("API Route - create-user: Input validated. Attempting to create user:", email);

    const newUserRecord = await admin.auth().createUser({
      email,
      password,
      displayName,
      emailVerified: false,
    });
    console.log("API Route - create-user: User created successfully in Firebase Auth:", newUserRecord.uid);

    return NextResponse.json({
      uid: newUserRecord.uid,
      email: newUserRecord.email,
      displayName: newUserRecord.displayName,
    }, { status: 201 });

  } catch (error: any) {
    console.error('API Route - create-user: General error creating user:', error);
    // Check for specific Firebase Auth error codes from createUser
    if (error.code === 'auth/email-already-exists') {
      return NextResponse.json({ error: 'Email already in use by another account.', code: error.code }, { status: 409 });
    }
    if (error.code === 'auth/invalid-password') {
      return NextResponse.json({ error: 'Password must be at least 6 characters long (Firebase requirement).', code: error.code }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || 'Internal Server Error', details: error.code || 'UNKNOWN_SERVER_ERROR' }, { status: 500 });
  }
}
