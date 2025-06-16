
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import admin from 'firebase-admin';
import type { App as AdminApp } from 'firebase-admin/app';
import type { DecodedIdToken } from 'firebase-admin/auth';

const LOG_PREFIX = "[API:CreateUser]";

const adminAppInstances = new Map<string, AdminApp>();
let initializationErrorDetails: string | null = null;

function initializeAdminSdk(): AdminApp | undefined {
  const instanceSuffix = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  const UNIQUE_APP_NAME = `firebase-admin-app-create-user-route-${instanceSuffix}`;

  if (adminAppInstances.has(UNIQUE_APP_NAME) && adminAppInstances.get(UNIQUE_APP_NAME)?.options) {
    const existingApp = adminAppInstances.get(UNIQUE_APP_NAME)!;
    if (existingApp.options.projectId || existingApp.options.credential?.projectId) {
        console.log(`${LOG_PREFIX} Re-using existing valid Admin SDK instance: ${UNIQUE_APP_NAME}`);
        return existingApp;
    }
    console.warn(`${LOG_PREFIX} Existing Admin SDK instance ${UNIQUE_APP_NAME} was invalid. Attempting re-initialization.`);
  }
  
  initializationErrorDetails = null; 
  console.log(`${LOG_PREFIX} Attempting Firebase Admin SDK initialization with unique name: ${UNIQUE_APP_NAME}`);
  
  const serviceAccountJsonEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  const serviceAccountPathEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  let newAdminApp: AdminApp | undefined;
  let methodUsed = "";
  let parsedServiceAccountProjectId: string | undefined = undefined;

  try {
    let serviceAccount;
    if (serviceAccountJsonEnv) {
      methodUsed = "JSON_ENV";
      console.log(`${LOG_PREFIX} Found GOOGLE_APPLICATION_CREDENTIALS_JSON. Length: ${serviceAccountJsonEnv.length}. Attempting to parse...`);
      try {
        serviceAccount = JSON.parse(serviceAccountJsonEnv);
        parsedServiceAccountProjectId = serviceAccount.project_id;
        console.log(`${LOG_PREFIX} GOOGLE_APPLICATION_CREDENTIALS_JSON parsed successfully. project_id from parsed JSON: ${parsedServiceAccountProjectId}`);
      } catch (parseError: any) {
        initializationErrorDetails = `Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON. Error: ${parseError.message}. JSON (first 100 chars): ${serviceAccountJsonEnv.substring(0, 100)}`;
        console.error(`${LOG_PREFIX} ${initializationErrorDetails}`);
        return undefined;
      }
      
      if (!parsedServiceAccountProjectId) {
        initializationErrorDetails = `GOOGLE_APPLICATION_CREDENTIALS_JSON was parsed, but 'project_id' is missing.`;
        console.error(`${LOG_PREFIX} ${initializationErrorDetails}`);
        return undefined;
      }
      newAdminApp = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }, UNIQUE_APP_NAME);

    } else if (serviceAccountPathEnv) {
      methodUsed = "PATH_ENV";
      console.log(`${LOG_PREFIX} Found GOOGLE_APPLICATION_CREDENTIALS (path): ${serviceAccountPathEnv}. Attempting initialization via file path.`);
      newAdminApp = admin.initializeApp({ credential: admin.credential.applicationDefault() }, UNIQUE_APP_NAME);
    
    } else {
      methodUsed = "ADC";
      console.log(`${LOG_PREFIX} No specific service account JSON or path found. Attempting generic Application Default Credentials (ADC).`);
      newAdminApp = admin.initializeApp(undefined, UNIQUE_APP_NAME);
    }
    
    if (!newAdminApp) {
      initializationErrorDetails = `Admin SDK initializeApp call with ${methodUsed} returned undefined for app name ${UNIQUE_APP_NAME}. This is highly unusual.`;
      console.error(`${LOG_PREFIX} ${initializationErrorDetails}`);
      return undefined;
    }

    // Critical check after initialization
    if (!newAdminApp.options.projectId && !newAdminApp.options.credential?.projectId) {
        initializationErrorDetails = `Admin SDK initialized via ${methodUsed}, but the resulting app instance (name: ${newAdminApp.name}) is missing a projectId (both options.projectId and options.credential.projectId). Service account's parsed project_id was: '${parsedServiceAccountProjectId || 'N/A for PATH/ADC'}'. App options: ${JSON.stringify(newAdminApp.options)}.`;
        console.error(`${LOG_PREFIX} ${initializationErrorDetails}`);
        return undefined; 
    } else if (!newAdminApp.options.projectId && newAdminApp.options.credential?.projectId) {
        const credProjectId = newAdminApp.options.credential.projectId;
        console.warn(`${LOG_PREFIX} Admin SDK initialized via ${methodUsed}. App name: ${newAdminApp.name}. Top-level options.projectId is MISSING, but options.credential.projectId ('${credProjectId}') IS present. Using credential.projectId. Service account's parsed project_id was: '${parsedServiceAccountProjectId || 'N/A for PATH/ADC'}'. App options: ${JSON.stringify(newAdminApp.options)}.`);
        // This is acceptable; the SDK should still work.
    } else {
      console.log(`${LOG_PREFIX} Admin SDK initialized successfully via ${methodUsed}. App name: ${newAdminApp.name}, Project ID: ${newAdminApp.options.projectId}`);
    }
    
    adminAppInstances.set(UNIQUE_APP_NAME, newAdminApp);
    return newAdminApp;

  } catch (error: any) {
    initializationErrorDetails = `Initialization attempt (${methodUsed}) failed with error: ${error.message}. Code: ${error.code || 'UNKNOWN'}.`;
    console.error(`${LOG_PREFIX} Firebase Admin SDK initialization CRITICAL error:`, error.message, error.stack);
    return undefined;
  }
}

export async function POST(request: NextRequest) {
  console.log(`${LOG_PREFIX} POST request received.`);
  let values;
  try {
    values = await request.json();
  } catch (jsonError: any) {
    console.error(`${LOG_PREFIX} Invalid JSON in request body:`, jsonError.message);
    return NextResponse.json({ error: "Invalid JSON in request body.", details: jsonError.message }, { status: 400 });
  }

  const currentAdminApp = initializeAdminSdk();

  if (!currentAdminApp || !currentAdminApp.options || (!currentAdminApp.options.projectId && !currentAdminApp.options.credential?.projectId)) {
    let detailMessage = `Firebase Admin SDK not properly initialized or is in an invalid state. `;
    if (initializationErrorDetails) {
      detailMessage += `Specific error during init: ${initializationErrorDetails}.`;
    } else if (!currentAdminApp) {
      detailMessage += `initializeAdminSdk() returned undefined, and no specific error was captured during the last attempt.`;
    } else if (currentAdminApp.options && !currentAdminApp.options.projectId && !currentAdminApp.options.credential?.projectId) {
      detailMessage += `Admin SDK instance (name: ${currentAdminApp.name}) was created, but its projectId is missing from both options.projectId and options.credential.projectId. This is highly unusual. App options: ${JSON.stringify(currentAdminApp.options || {})}.`;
    } else {
      detailMessage += `An unknown initialization error occurred. App options: ${JSON.stringify(currentAdminApp?.options || {})}.`;
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

    const { email, password, displayName } = values;
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
    let errorMessage = 'Internal Server Error';
    let statusCode = 500;

    if (error.code === 'auth/email-already-exists') {
      errorMessage = `The email address ${values?.email || 'provided'} is already in use by another account.`;
      statusCode = 409;
    } else if (error.code === 'auth/invalid-password') {
      errorMessage = 'Password must be at least 6 characters long (Firebase requirement).';
      statusCode = 400;
    } else if (error.message?.includes('UNAUTHENTICATED') && (error.code === 'auth/internal-error' || error.code === 16 || error.code === '16')) {
        // GRPC status code 16 is UNAUTHENTICATED
        errorMessage = `Firebase service (e.g., Auth) reported an UNAUTHENTICATED error. This usually means the service account used by the Admin SDK (via GOOGLE_APPLICATION_CREDENTIALS_JSON or ADC) lacks the necessary IAM permissions (e.g., 'Firebase Authentication Admin') to perform this action. Please check the service account's roles in the Google Cloud Console. Original error: ${error.message}`;
        statusCode = 403; // Forbidden or Insufficient Permissions
    } else if (error.code === 'auth/insufficient-permission') {
        errorMessage = `Firebase service reported an INSUFFICIENT_PERMISSION error. The service account used by the Admin SDK likely lacks the necessary IAM permissions (e.g., 'Firebase Authentication Admin'). Please check its roles in Google Cloud Console. Details: ${error.message}`;
        statusCode = 403;
    } else if (error.message) {
        errorMessage = error.message;
    }
    return NextResponse.json({ error: errorMessage, details: error.code || error.message || 'UNKNOWN_SERVER_ERROR' }, { status: statusCode });
  }
}
    

    