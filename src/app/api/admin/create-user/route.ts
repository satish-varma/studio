
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import admin from 'firebase-admin';
import type { App as AdminApp } from 'firebase-admin/app';
import type { DecodedIdToken } from 'firebase-admin/auth';

const LOG_PREFIX = "[API:CreateUser]";
const UNIQUE_APP_NAME = `firebase-admin-app-create-user-route-${Date.now()}`; // Unique name for each instance of this route logic

let adminApp: AdminApp | undefined;
let initializationErrorDetails: string | null = null;
let adminAppInitializedInThisScope = false;

function initializeAdminSdk(): AdminApp | undefined {
  if (admin.apps.some(app => app?.name === UNIQUE_APP_NAME)) {
    console.log(`${LOG_PREFIX} Re-using existing Admin SDK instance for this request: ${UNIQUE_APP_NAME}`);
    return admin.app(UNIQUE_APP_NAME);
  }

  console.log(`${LOG_PREFIX} Attempting Firebase Admin SDK initialization with unique name: ${UNIQUE_APP_NAME}`);
  const serviceAccountJsonEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  const serviceAccountPathEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  try {
    if (serviceAccountJsonEnv) {
      console.log(`${LOG_PREFIX} Found GOOGLE_APPLICATION_CREDENTIALS_JSON. Length: ${serviceAccountJsonEnv.length}. Attempting to parse...`);
      let serviceAccount;
      try {
        serviceAccount = JSON.parse(serviceAccountJsonEnv);
        console.log(`${LOG_PREFIX} GOOGLE_APPLICATION_CREDENTIALS_JSON parsed successfully. project_id from parsed JSON: ${serviceAccount.project_id}`);
      } catch (parseError: any) {
        initializationErrorDetails = `Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON. Error: ${parseError.message}. JSON (first 100 chars): ${serviceAccountJsonEnv.substring(0, 100)}`;
        console.error(`${LOG_PREFIX} ${initializationErrorDetails}`);
        return undefined;
      }
      
      if (!serviceAccount.project_id) {
        initializationErrorDetails = `GOOGLE_APPLICATION_CREDENTIALS_JSON was parsed, but 'project_id' is missing in the JSON content.`;
        console.error(`${LOG_PREFIX} ${initializationErrorDetails}`);
        return undefined;
      }

      adminApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      }, UNIQUE_APP_NAME);
      console.log(`${LOG_PREFIX} Admin SDK initialized via JSON_ENV. App name: ${adminApp.name}`);
      if (!adminApp.options.projectId) {
        initializationErrorDetails = `Admin SDK initialized via JSON_ENV, but the resulting app instance is missing a projectId. Service account project_id: ${serviceAccount.project_id}.`;
        console.error(`${LOG_PREFIX} ${initializationErrorDetails}`);
        return undefined;
      }
    } else if (serviceAccountPathEnv) {
      console.log(`${LOG_PREFIX} Found GOOGLE_APPLICATION_CREDENTIALS (path): ${serviceAccountPathEnv}. Attempting initialization via file path.`);
      adminApp = admin.initializeApp({
        credential: admin.credential.applicationDefault(), // Uses path from GOOGLE_APPLICATION_CREDENTIALS
      }, UNIQUE_APP_NAME);
      console.log(`${LOG_PREFIX} Admin SDK initialized via PATH_ENV. App name: ${adminApp.name}`);
      if (!adminApp.options.projectId) {
        initializationErrorDetails = `Admin SDK initialized via PATH_ENV (path: ${serviceAccountPathEnv}), but the resulting app instance is missing a projectId. Check the service account file content and path.`;
        console.error(`${LOG_PREFIX} ${initializationErrorDetails}`);
        return undefined;
      }
    } else {
      console.log(`${LOG_PREFIX} No specific service account JSON or path found in env. Attempting generic Application Default Credentials (ADC).`);
      adminApp = admin.initializeApp(undefined, UNIQUE_APP_NAME);
      console.log(`${LOG_PREFIX} Admin SDK initialized via generic ADC. App name: ${adminApp.name}`);
      if (!adminApp.options.projectId) {
        initializationErrorDetails = `Admin SDK initialized via generic ADC, but the resulting app instance is missing a projectId. Ensure ADC are correctly configured for your server environment.`;
        console.error(`${LOG_PREFIX} ${initializationErrorDetails}`);
        return undefined;
      }
    }
    adminAppInitializedInThisScope = true;
    console.log(`${LOG_PREFIX} Firebase Admin SDK initialized successfully. Method used: ${serviceAccountJsonEnv ? 'JSON_ENV' : serviceAccountPathEnv ? 'PATH_ENV' : 'ADC'}. Project: ${adminApp.options.projectId}`);
    return adminApp;
  } catch (error: any) {
    initializationErrorDetails = `Initialization attempt failed with error: ${error.message}. Code: ${error.code || 'UNKNOWN'}. Method: ${serviceAccountJsonEnv ? 'JSON_ENV' : serviceAccountPathEnv ? 'PATH_ENV' : 'ADC Attempt'}`;
    console.error(`${LOG_PREFIX} Firebase Admin SDK initialization CRITICAL error:`, error.message, error.stack);
    return undefined;
  }
}

export async function POST(request: NextRequest) {
  console.log(`${LOG_PREFIX} POST request received.`);
  const currentAdminApp = initializeAdminSdk();

  if (!currentAdminApp || !currentAdminApp.options.projectId) {
    let detailMessage = `Firebase Admin SDK not properly initialized or is in an invalid state. `;
    if (adminAppInitializedInThisScope && (!currentAdminApp || !currentAdminApp.options.projectId)) {
      detailMessage += `An initialization attempt was made within this route's scope. Specific error during init: ${initializationErrorDetails || 'An app instance was created but is invalid (e.g., missing projectId).'}.`;
    } else if (!adminAppInitializedInThisScope && initializationErrorDetails) {
      detailMessage += `Initialization attempt failed. ${initializationErrorDetails}.`;
    } else {
      detailMessage += `No successful initialization attempt details available, or relying on a global instance that might be misconfigured. ${initializationErrorDetails || ''}`;
    }
    detailMessage += " Please ensure GOOGLE_APPLICATION_CREDENTIALS_JSON (as a JSON string) or GOOGLE_APPLICATION_CREDENTIALS (as a file path) environment variable is correctly set with your service account key, or that Application Default Credentials (ADC) are configured for your server environment. The service account JSON must contain a valid 'project_id'.";
    console.error(`${LOG_PREFIX} Critical Failure: ${detailMessage} Check server logs for more details.`);
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
    console.log(`${LOG_PREFIX} Verifying ID Token...`);

    try {
      callingUser = await admin.auth(currentAdminApp).verifyIdToken(idToken);
      console.log(`${LOG_PREFIX} ID Token verified successfully for UID: ${callingUser.uid}`);
    } catch (tokenError: any) {
      console.error(`${LOG_PREFIX} ID Token verification failed. Code: ${tokenError.code}, Message: ${tokenError.message}`);
      return NextResponse.json({ error: 'Unauthorized: Invalid or expired token.', details: tokenError.message, code: tokenError.code }, { status: 401 });
    }

    console.log(`${LOG_PREFIX} Checking admin privileges for UID: ${callingUser.uid}`);
    const adminUserDoc = await admin.firestore(currentAdminApp).collection('users').doc(callingUser.uid).get();
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
    const newUserRecord = await admin.auth(currentAdminApp).createUser({
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
