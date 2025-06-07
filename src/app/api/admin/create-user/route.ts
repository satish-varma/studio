
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import admin from 'firebase-admin';
import type { App as AdminApp } from 'firebase-admin/app';
import type { DecodedIdToken } from 'firebase-admin/auth';

const LOG_PREFIX = "[API:CreateUser]";

let adminApp: AdminApp | undefined;

if (!admin.apps.length) {
  console.log(`${LOG_PREFIX} Firebase Admin SDK not initialized. Attempting initialization...`);
  const serviceAccountJsonEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  const serviceAccountPathEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  try {
    if (serviceAccountJsonEnv) {
      console.log(`${LOG_PREFIX} Initializing with GOOGLE_APPLICATION_CREDENTIALS_JSON env var.`);
      const serviceAccount = JSON.parse(serviceAccountJsonEnv);
      adminApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log(`${LOG_PREFIX} Firebase Admin SDK initialized successfully using JSON env var. Project: ${adminApp.options.projectId}`);
    } else if (serviceAccountPathEnv) {
      console.log(`${LOG_PREFIX} Initializing with GOOGLE_APPLICATION_CREDENTIALS path: ${serviceAccountPathEnv}.`);
      // Note: For path, Firebase Admin SDK might expect the env var to be set globally for applicationDefault to pick it up.
      // Explicitly using admin.credential.applicationDefault() is often for ADC in managed environments.
      // If GOOGLE_APPLICATION_CREDENTIALS points to a file, initializeApp() without args or with ADC might be preferred.
      // For now, keeping structure but noting that just having path in env might not be enough for admin.initializeApp({})
      // unless the environment itself makes the SDK use it. Let's try with initializeApp() which uses ADC.
      adminApp = admin.initializeApp(); // This will use ADC, which should pick up GOOGLE_APPLICATION_CREDENTIALS if set in env.
      console.log(`${LOG_PREFIX} Firebase Admin SDK initialized via initializeApp() (likely ADC). Project: ${adminApp.options.projectId}`);
    } else {
      console.log(`${LOG_PREFIX} No service account JSON or path found in env. Attempting Application Default Credentials.`);
      adminApp = admin.initializeApp(); // Relies on Application Default Credentials
      console.log(`${LOG_PREFIX} Firebase Admin SDK initialized successfully using Application Default Credentials. Project: ${adminApp.options.projectId}`);
    }
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Firebase Admin SDK initialization CRITICAL error:`, error.message, error.stack);
    adminApp = undefined; // Explicitly set to undefined on failure
  }
} else {
  adminApp = admin.app(); // Get existing app
  console.log(`${LOG_PREFIX} Firebase Admin SDK already initialized. Project ID: ${adminApp.options.projectId}`);
}


export async function POST(request: NextRequest) {
  console.log(`${LOG_PREFIX} POST request received.`);
  if (!adminApp || !adminApp.options.projectId) { // Check for projectId as a sign of successful init
    console.error(`${LOG_PREFIX} Firebase Admin SDK is not properly initialized. Service account credentials might be missing, incorrect, or ADC failed.`);
    return NextResponse.json({ error: 'Server configuration error: Firebase Admin SDK not initialized. Check server logs for details.' }, { status: 500 });
  }

  let callingUser: DecodedIdToken | null = null;
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      console.warn(`${LOG_PREFIX} Authorization header missing or malformed.`);
      return NextResponse.json({ error: 'Unauthorized: Missing or invalid token format.' }, { status: 401 });
    }
    const idToken = authorization.split('Bearer ')[1];
    console.log(`${LOG_PREFIX} Verifying ID Token (first 10 chars): ${idToken.substring(0, 10)}...`);

    try {
      callingUser = await admin.auth(adminApp).verifyIdToken(idToken);
      console.log(`${LOG_PREFIX} ID Token verified successfully for UID: ${callingUser.uid}`);
    } catch (tokenError: any) {
      console.error(`${LOG_PREFIX} ID Token verification failed. Code: ${tokenError.code}, Message: ${tokenError.message}`);
      return NextResponse.json({ error: 'Unauthorized: Invalid or expired token.', details: tokenError.message, code: tokenError.code }, { status: 401 });
    }

    console.log(`${LOG_PREFIX} Checking admin privileges for UID: ${callingUser.uid}`);
    const adminUserDoc = await admin.firestore(adminApp).collection('users').doc(callingUser.uid).get();
    if (!adminUserDoc.exists || adminUserDoc.data()?.role !== 'admin') {
      console.warn(`${LOG_PREFIX} Forbidden. Caller UID ${callingUser.uid} is not an admin. Role: ${adminUserDoc.data()?.role ?? 'not found'}`);
      return NextResponse.json({ error: 'Forbidden: Caller is not an admin.' }, { status: 403 });
    }
    console.log(`${LOG_PREFIX} Caller ${callingUser.uid} authorized as admin.`);

    const { email, password, displayName } = await request.json();
    console.log(`${LOG_PREFIX} Request body parsed. Email: ${email}, DisplayName: ${displayName}, Password provided: ${!!password}`);

    if (!email || !password || !displayName) {
      console.warn(`${LOG_PREFIX} Missing required fields in request body.`);
      return NextResponse.json({ error: 'Missing required fields: email, password, or displayName.' }, { status: 400 });
    }
    if (typeof password !== 'string' || password.length < 6) {
      console.warn(`${LOG_PREFIX} Invalid password format or length.`);
      return NextResponse.json({ error: 'Password must be a string and at least 6 characters long.' }, { status: 400 });
    }
    if (typeof displayName !== 'string' || displayName.trim().length < 2) {
      console.warn(`${LOG_PREFIX} Invalid displayName format or length.`);
      return NextResponse.json({ error: "Display name must be a string and at least 2 characters long." }, { status: 400 });
    }

    console.log(`${LOG_PREFIX} Attempting to create Firebase Auth user for email: ${email}`);
    const newUserRecord = await admin.auth(adminApp).createUser({
      email,
      password,
      displayName,
      emailVerified: false,
    });
    console.log(`${LOG_PREFIX} Firebase Auth user created successfully. UID: ${newUserRecord.uid}, Email: ${newUserRecord.email}`);

    return NextResponse.json({
      uid: newUserRecord.uid,
      email: newUserRecord.email,
      displayName: newUserRecord.displayName,
    }, { status: 201 });

  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error during user creation process: Code: ${error.code}, Message: ${error.message}`, error.stack);
    if (error.code === 'auth/email-already-exists') {
      return NextResponse.json({ error: `The email address ${error.customData?.email || 'provided'} is already in use by another account.`, code: error.code }, { status: 409 });
    }
    if (error.code === 'auth/invalid-password') {
      return NextResponse.json({ error: 'Password must be at least 6 characters long (Firebase requirement).', code: error.code }, { status: 400 });
    }
    // For other errors, including JSON parsing errors if request.json() fails
    let errorMessage = 'Internal Server Error';
    if (error instanceof SyntaxError && error.message.includes("JSON")) {
        errorMessage = "Invalid JSON in request body.";
        return NextResponse.json({ error: errorMessage, details: error.message }, { status: 400 });
    } else if (error.message) {
        errorMessage = error.message;
    }
    return NextResponse.json({ error: errorMessage, details: error.code || 'UNKNOWN_SERVER_ERROR' }, { status: 500 });
  }
}
