
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import admin from 'firebase-admin';
import type { App as AdminApp } from 'firebase-admin/app';
import type { DecodedIdToken } from 'firebase-admin/auth';

const LOG_PREFIX = "[API:CreateUser]";

let adminApp: AdminApp | undefined;
let initializationAttempted = false;
let initializationErrorDetails: string | null = null;

if (!admin.apps.length) {
  initializationAttempted = true;
  console.log(`${LOG_PREFIX} Firebase Admin SDK not initialized. Attempting initialization...`);
  const serviceAccountJsonEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  const serviceAccountPathEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  try {
    if (serviceAccountJsonEnv) {
      console.log(`${LOG_PREFIX} Attempting initialization with GOOGLE_APPLICATION_CREDENTIALS_JSON env var.`);
      const serviceAccount = JSON.parse(serviceAccountJsonEnv);
      adminApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      }, 'create-user-api-json-init'); // Unique app name for this init attempt
      if (!adminApp.options.projectId) {
        initializationErrorDetails = "Admin SDK initialized via JSON_ENV, but the resulting app instance is missing a projectId.";
        console.error(`${LOG_PREFIX} ${initializationErrorDetails}`);
        adminApp = undefined; // Treat as failure
      } else {
        console.log(`${LOG_PREFIX} Firebase Admin SDK initialized successfully using JSON_ENV. Project: ${adminApp.options.projectId}`);
      }
    } else if (serviceAccountPathEnv) {
      console.log(`${LOG_PREFIX} Attempting initialization with GOOGLE_APPLICATION_CREDENTIALS path: ${serviceAccountPathEnv}. This typically uses Application Default Credentials (ADC) mechanism guided by the path.`);
      // When GOOGLE_APPLICATION_CREDENTIALS (path) is set, initializeApp() without args should pick it up.
      adminApp = admin.initializeApp(undefined, 'create-user-api-path-init'); // Unique app name
      if (!adminApp.options.projectId) {
        initializationErrorDetails = "Admin SDK initialized via PATH_ENV (ADC), but the resulting app instance is missing a projectId. Check the service account file content and path.";
        console.error(`${LOG_PREFIX} ${initializationErrorDetails}`);
        adminApp = undefined; // Treat as failure
      } else {
        console.log(`${LOG_PREFIX} Firebase Admin SDK initialized successfully using PATH_ENV (ADC). Project: ${adminApp.options.projectId}`);
      }
    } else {
      console.log(`${LOG_PREFIX} No specific service account JSON or path found in env. Attempting generic Application Default Credentials (ADC).`);
      adminApp = admin.initializeApp(undefined, 'create-user-api-adc-init'); // Unique app name
      if (!adminApp.options.projectId) {
        initializationErrorDetails = "Admin SDK initialized via generic ADC, but the resulting app instance is missing a projectId. Ensure ADC are correctly configured for your environment.";
        console.error(`${LOG_PREFIX} ${initializationErrorDetails}`);
        adminApp = undefined; // Treat as failure
      } else {
        console.log(`${LOG_PREFIX} Firebase Admin SDK initialized successfully using generic ADC. Project: ${adminApp.options.projectId}`);
      }
    }
  } catch (error: any) {
    initializationErrorDetails = `Initialization attempt failed with error: ${error.message}. Code: ${error.code || 'UNKNOWN'}`;
    console.error(`${LOG_PREFIX} Firebase Admin SDK initialization CRITICAL error during attempt:`, error.message, error.stack);
    adminApp = undefined;
  }
} else {
  adminApp = admin.app(); // Use the default app if already initialized
  console.log(`${LOG_PREFIX} Firebase Admin SDK already initialized. Using default app. Project ID from existing app: ${adminApp.options.projectId}`);
  if (!adminApp.options.projectId) {
      initializationErrorDetails = "Firebase Admin SDK was pre-initialized, but the default app instance is missing a projectId. This is highly unusual.";
      console.error(`${LOG_PREFIX} ${initializationErrorDetails}`);
      adminApp = undefined; // Treat as failure, even if pre-initialized but invalid
  }
}


export async function POST(request: NextRequest) {
  console.log(`${LOG_PREFIX} POST request received.`);
  if (!adminApp || !adminApp.options.projectId) { // Check both adminApp and its projectId
    let detailMessage = 'Firebase Admin SDK not properly initialized or is in an invalid state. ';
    if (initializationAttempted) {
        detailMessage += `An initialization attempt was made. Specific error during init: ${initializationErrorDetails || 'Unknown issue during initialization attempt, or initializeApp() did not throw but returned an invalid app object.'}.`;
    } else if (admin.apps.length > 0 && (!adminApp || !adminApp.options.projectId)) {
        detailMessage += `SDK was reported as pre-initialized (admin.apps.length > 0), but is not in a valid state (adminApp or projectId missing). ${initializationErrorDetails || 'This suggests an issue with the default app instance.'}`;
    } else {
        detailMessage += 'SDK was not initialized, and no attempt was made in this module instance. This might indicate an issue with module loading or prior initialization failures.';
    }
    detailMessage += " Please ensure GOOGLE_APPLICATION_CREDENTIALS_JSON (as a JSON string) or GOOGLE_APPLICATION_CREDENTIALS (as a file path) environment variable is correctly set with your service account key, or that Application Default Credentials (ADC) are configured for your server environment. The service account JSON must contain a valid 'project_id'.";
    console.error(`${LOG_PREFIX} Critical Faiure: ${detailMessage} Check server logs for more details.`);
    return NextResponse.json({ error: 'Server Configuration Error.', details: detailMessage }, { status: 500 });
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
