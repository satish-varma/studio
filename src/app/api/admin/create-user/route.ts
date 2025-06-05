
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import admin from 'firebase-admin';
import type { App as AdminApp } from 'firebase-admin/app';
import type { DecodedIdToken } from 'firebase-admin/auth';

// --- Firebase Admin SDK Initialization ---
// IMPORTANT: Service Account Key Management
// 1. Download your service account JSON key from Firebase Project Settings.
// 2. DO NOT commit this file to Git. Add its name to .gitignore.
// 3. Option A (Recommended for Production):
//    Set the GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable to the
//    JSON *contents* of your service account key file.
//    Example (.env.local):
//    GOOGLE_APPLICATION_CREDENTIALS_JSON='{"type": "service_account", ...}'
// 4. Option B (For local dev, if Option A is difficult):
//    Set GOOGLE_APPLICATION_CREDENTIALS environment variable to the *path* of the key file.
//    Example (.env.local):
//    GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/serviceAccountKey.json"
// 5. Option C (Directly in code - LEAST SECURE, ensure file is gitignored):
//    const serviceAccount = require('../../../../../serviceAccountKey.json'); // Adjust path

let adminApp: AdminApp;

if (!admin.apps.length) {
  try {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
      console.log("API Route: Initializing Firebase Admin SDK with GOOGLE_APPLICATION_CREDENTIALS_JSON env var...");
      const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
      adminApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.log("API Route: Initializing Firebase Admin SDK with GOOGLE_APPLICATION_CREDENTIALS env var (path)...");
      // Relies on the environment variable pointing to the JSON file path
      adminApp = admin.initializeApp({
         credential: admin.credential.applicationDefault(), // Uses GOOGLE_APPLICATION_CREDENTIALS path
      });
    } else {
      // Fallback for local development if you have a serviceAccountKey.json at project root
      // MAKE SURE THIS FILE IS IN .gitignore
      try {
        const serviceAccount = require('../../../../../../serviceAccountKey.json'); // Adjust path from /src/app/api/admin/create-user
        console.log("API Route: Initializing Firebase Admin SDK with local serviceAccountKey.json (DEV ONLY)...");
        adminApp = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      } catch (e) {
         console.error("API Route: Firebase Admin SDK - serviceAccountKey.json not found or invalid. Also, GOOGLE_APPLICATION_CREDENTIALS_JSON or GOOGLE_APPLICATION_CREDENTIALS env vars not set.", e);
         // Throw an error or handle as appropriate if initialization fails
         // For now, adminApp will remain undefined if this fails.
      }
    }
    if (adminApp!) console.log("API Route: Firebase Admin SDK initialized successfully.");
  } catch (error: any) {
    console.error('API Route: Firebase Admin SDK initialization error', error.stack);
  }
} else {
  adminApp = admin.app();
  console.log("API Route: Firebase Admin SDK already initialized.");
}


export async function POST(request: NextRequest) {
  if (!adminApp) {
    console.error("API Route - create-user: Firebase Admin SDK is not initialized. Ensure service account credentials are set up.");
    return NextResponse.json({ error: 'Server configuration error: Admin SDK not initialized.' }, { status: 500 });
  }

  let callingUser: DecodedIdToken | null = null;
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing or invalid token.' }, { status: 401 });
    }
    const idToken = authorization.split('Bearer ')[1];
    callingUser = await admin.auth().verifyIdToken(idToken);

    if (!callingUser) {
      return NextResponse.json({ error: 'Unauthorized: Invalid token.' }, { status: 401 });
    }

    // Authorization: Check if the calling user is an admin in Firestore
    const adminUserDoc = await admin.firestore().collection('users').doc(callingUser.uid).get();
    if (!adminUserDoc.exists || adminUserDoc.data()?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Caller is not an admin.' }, { status: 403 });
    }

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


    const newUserRecord = await admin.auth().createUser({
      email,
      password,
      displayName,
      emailVerified: false,
    });

    return NextResponse.json({
      uid: newUserRecord.uid,
      email: newUserRecord.email,
      displayName: newUserRecord.displayName,
    }, { status: 201 });

  } catch (error: any) {
    console.error('API Route - create-user: Error creating user:', error);
    if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
      return NextResponse.json({ error: 'Unauthorized: Invalid or expired token.' }, { status: 401 });
    }
    if (error.code === 'auth/email-already-exists') {
      return NextResponse.json({ error: 'Email already in use by another account.' }, { status: 409 });
    }
    if (error.code === 'auth/invalid-password') {
      return NextResponse.json({ error: 'Password must be at least 6 characters long (Firebase requirement).' }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || 'Internal Server Error', details: error.code }, { status: 500 });
  }
}
