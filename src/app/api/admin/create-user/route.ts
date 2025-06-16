
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import admin from 'firebase-admin';
import type { App as AdminApp } from 'firebase-admin/app';
import type { DecodedIdToken } from 'firebase-admin/auth';

const LOG_PREFIX = "[API:CreateUser]";

// Store app instances in a map to manage them by name
const adminAppInstances = new Map<string, AdminApp>();
let initializationErrorDetails: string | null = null; // Keep a global store for initialization errors

function initializeAdminSdk(): AdminApp | undefined {
  const UNIQUE_APP_NAME = `firebase-admin-app-create-user-route-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

  if (adminAppInstances.has(UNIQUE_APP_NAME)) {
    // This should ideally not happen with unique names per call, but as a safeguard.
    console.log(`${LOG_PREFIX} Re-using existing Admin SDK instance for this request: ${UNIQUE_APP_NAME}`);
    const existingApp = adminAppInstances.get(UNIQUE_APP_NAME);
    if (existingApp && existingApp.options.projectId) {
        return existingApp;
    }
    // If existing app is invalid, proceed to re-initialize.
     console.warn(`${LOG_PREFIX} Existing app instance ${UNIQUE_APP_NAME} was invalid. Attempting re-initialization.`);
  }
  
  // Reset global error details for this attempt
  initializationErrorDetails = null; 

  console.log(`${LOG_PREFIX} Attempting Firebase Admin SDK initialization with unique name: ${UNIQUE_APP_NAME}`);
  const serviceAccountJsonEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  const serviceAccountPathEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  let newAdminApp: AdminApp | undefined;

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
        initializationErrorDetails = `GOOGLE_APPLICATION_CREDENTIALS_JSON was parsed, but 'project_id' is missing in the JSON content. Parsed service account project_id was: '${serviceAccount.project_id}'.`;
        console.error(`${LOG_PREFIX} ${initializationErrorDetails}`);
        return undefined;
      }

      newAdminApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      }, UNIQUE_APP_NAME);
      
      if (!newAdminApp) {
        initializationErrorDetails = `Admin SDK initializeApp call with JSON_ENV returned undefined for app name ${UNIQUE_APP_NAME}. This is highly unusual.`;
        console.error(`${LOG_PREFIX} ${initializationErrorDetails}`);
        return undefined;
      }
      // Critical check immediately after initialization
      if (!newAdminApp.options.projectId) {
        initializationErrorDetails = `Admin SDK initialized via JSON_ENV, but the resulting app instance (name: ${newAdminApp.name}) is missing a projectId. Service account's parsed project_id was: '${serviceAccount.project_id}'. App options: ${JSON.stringify(newAdminApp.options)}`;
        console.error(`${LOG_PREFIX} ${initializationErrorDetails}`);
        // Do not return undefined here, let the main POST handler check and report more gracefully.
        // The app instance might still be created but invalid.
      } else {
        console.log(`${LOG_PREFIX} Admin SDK initialized via JSON_ENV. App name: ${newAdminApp.name}, Project ID: ${newAdminApp.options.projectId}`);
      }

    } else if (serviceAccountPathEnv) {
      console.log(`${LOG_PREFIX} Found GOOGLE_APPLICATION_CREDENTIALS (path): ${serviceAccountPathEnv}. Attempting initialization via file path.`);
      newAdminApp = admin.initializeApp({
        credential: admin.credential.applicationDefault(), 
      }, UNIQUE_APP_NAME);
      if (!newAdminApp) {
        initializationErrorDetails = `Admin SDK initializeApp call with PATH_ENV returned undefined for app name ${UNIQUE_APP_NAME}.`;
        console.error(`${LOG_PREFIX} ${initializationErrorDetails}`);
        return undefined;
      }
      if (!newAdminApp.options.projectId) {
        initializationErrorDetails = `Admin SDK initialized via PATH_ENV (path: ${serviceAccountPathEnv}), but the resulting app instance (name: ${newAdminApp.name}) is missing a projectId. App options: ${JSON.stringify(newAdminApp.options)}`;
        console.error(`${LOG_PREFIX} ${initializationErrorDetails}`);
      } else {
         console.log(`${LOG_PREFIX} Admin SDK initialized via PATH_ENV. App name: ${newAdminApp.name}, Project ID: ${newAdminApp.options.projectId}`);
      }

    } else {
      console.log(`${LOG_PREFIX} No specific service account JSON or path found in env. Attempting generic Application Default Credentials (ADC).`);
      newAdminApp = admin.initializeApp(undefined, UNIQUE_APP_NAME);
       if (!newAdminApp) {
        initializationErrorDetails = `Admin SDK initializeApp call with generic ADC returned undefined for app name ${UNIQUE_APP_NAME}.`;
        console.error(`${LOG_PREFIX} ${initializationErrorDetails}`);
        return undefined;
      }
      if (!newAdminApp.options.projectId) {
        initializationErrorDetails = `Admin SDK initialized via generic ADC, but the resulting app instance (name: ${newAdminApp.name}) is missing a projectId. App options: ${JSON.stringify(newAdminApp.options)}`;
        console.error(`${LOG_PREFIX} ${initializationErrorDetails}`);
      } else {
        console.log(`${LOG_PREFIX} Admin SDK initialized via generic ADC. App name: ${newAdminApp.name}, Project ID: ${newAdminApp.options.projectId}`);
      }
    }
    
    if (newAdminApp) { // Store even if potentially invalid, so POST can check it
        adminAppInstances.set(UNIQUE_APP_NAME, newAdminApp);
    }
    return newAdminApp;
  } catch (error: any) {
    initializationErrorDetails = `Initialization attempt failed with error: ${error.message}. Code: ${error.code || 'UNKNOWN'}. Method: ${serviceAccountJsonEnv ? 'JSON_ENV' : serviceAccountPathEnv ? 'PATH_ENV' : 'ADC Attempt'}`;
    console.error(`${LOG_PREFIX} Firebase Admin SDK initialization CRITICAL error:`, error.message, error.stack);
    return undefined;
  }
}

export async function POST(request: NextRequest) {
  console.log(`${LOG_PREFIX} POST request received.`);
  const currentAdminApp = initializeAdminSdk();

  // Check currentAdminApp and its projectId directly.
  // initializationErrorDetails will contain specific issues from the initializeAdminSdk function.
  if (!currentAdminApp || !currentAdminApp.options || !currentAdminApp.options.projectId) {
    let detailMessage = `Firebase Admin SDK not properly initialized or is in an invalid state. `;
    if (initializationErrorDetails) {
      // Use the specific error captured during initialization attempt
      detailMessage += `Initialization attempt failed. ${initializationErrorDetails}.`;
    } else if (!currentAdminApp) {
      detailMessage += `initializeAdminSdk() returned undefined, and no specific error was captured. This indicates a failure during the SDK initialization process.`;
    } else { // currentAdminApp exists but options or projectId is missing
      detailMessage += `Admin SDK instance (name: ${currentAdminApp.name}) was created, but its options.projectId is missing or invalid. This is highly unusual. App options: ${JSON.stringify(currentAdminApp.options || {})}.`;
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
    console.log(`${LOG_PREFIX} Verifying ID Token using app: ${currentAdminApp.name}`);

    try {
      callingUser = await admin.auth(currentAdminApp).verifyIdToken(idToken);
      console.log(`${LOG_PREFIX} ID Token verified successfully for UID: ${callingUser.uid}`);
    } catch (tokenError: any) {
      console.error(`${LOG_PREFIX} ID Token verification failed. Code: ${tokenError.code}, Message: ${tokenError.message}`);
      return NextResponse.json({ error: 'Unauthorized: Invalid or expired token.', details: tokenError.message, code: tokenError.code }, { status: 401 });
    }

    console.log(`${LOG_PREFIX} Checking admin privileges for UID: ${callingUser.uid} using app: ${currentAdminApp.name}`);
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

    console.log(`${LOG_PREFIX} Attempting to create Firebase Auth user for email: ${email} using app: ${currentAdminApp.name}`);
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

    