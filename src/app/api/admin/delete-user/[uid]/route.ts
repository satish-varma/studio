
import { NextResponse } from 'next/server';
// Removed 'type { NextRequest } from 'next/server';' as we'll use standard Request
import admin from 'firebase-admin';
import type { App as AdminApp } from 'firebase-admin/app';
// DecodedIdToken is not explicitly used here as verifyIdToken returns it.

const LOG_PREFIX = "[API:DeleteUser]";

const adminAppInstances = new Map<string, AdminApp>();
let initializationErrorDetails: string | null = null;

// Robust Admin SDK Initialization - prioritize JSON string, then path, then ADC
function initializeAdminSdk(): AdminApp | undefined {
  const instanceSuffix = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  const UNIQUE_APP_NAME = `firebase-admin-app-delete-user-route-${instanceSuffix}`;

  if (adminAppInstances.has(UNIQUE_APP_NAME)) {
    const existingApp = adminAppInstances.get(UNIQUE_APP_NAME)!;
    if (existingApp.options.projectId || existingApp.options.credential?.projectId) {
      console.log(`${LOG_PREFIX} Re-using existing valid Admin SDK instance: ${UNIQUE_APP_NAME}`);
      return existingApp;
    }
    console.warn(`${LOG_PREFIX} Existing Admin SDK instance ${UNIQUE_APP_NAME} was invalid (no projectId). Attempting re-initialization.`);
  }
  
  initializationErrorDetails = null;
  let newAdminApp: AdminApp | undefined;
  let methodUsed = "";
  let parsedServiceAccountProjectId: string | undefined = undefined;

  try {
    const serviceAccountJsonEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    const serviceAccountPathEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    if (serviceAccountJsonEnv) {
      methodUsed = "JSON_ENV";
      console.log(`${LOG_PREFIX} Found GOOGLE_APPLICATION_CREDENTIALS_JSON. Length: ${serviceAccountJsonEnv.length}. Attempting to parse...`);
      let serviceAccount;
      try {
        serviceAccount = JSON.parse(serviceAccountJsonEnv);
        parsedServiceAccountProjectId = serviceAccount.project_id;
        console.log(`${LOG_PREFIX} GOOGLE_APPLICATION_CREDENTIALS_JSON parsed successfully. project_id from parsed JSON: ${parsedServiceAccountProjectId}`);
      } catch (parseError: any) {
        initializationErrorDetails = `Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON. Error: ${parseError.message}. JSON (first 100 chars): ${serviceAccountJsonEnv.substring(0, 100)}`;
        throw new Error(initializationErrorDetails);
      }
      
      if (!parsedServiceAccountProjectId) {
        initializationErrorDetails = `GOOGLE_APPLICATION_CREDENTIALS_JSON was parsed, but 'project_id' is missing.`;
        throw new Error(initializationErrorDetails);
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
      throw new Error(initializationErrorDetails);
    }

    const finalProjectId = newAdminApp.options.projectId || newAdminApp.options.credential?.projectId;
    if (!finalProjectId) {
      initializationErrorDetails = `Admin SDK initialized via ${methodUsed}, but the resulting app instance (name: ${newAdminApp.name}) is missing a projectId (both options.projectId and options.credential.projectId). Service account's parsed project_id was: '${parsedServiceAccountProjectId || 'N/A for PATH/ADC'}'. App options: ${JSON.stringify(newAdminApp.options)}.`;
      throw new Error(initializationErrorDetails);
    } else {
      console.log(`${LOG_PREFIX} Admin SDK initialized successfully via ${methodUsed}. App name: ${newAdminApp.name}, Project ID: ${finalProjectId}`);
    }
    
    adminAppInstances.set(UNIQUE_APP_NAME, newAdminApp);
    return newAdminApp;

  } catch (error: any) {
    if (!initializationErrorDetails) {
      initializationErrorDetails = `Initialization attempt (${methodUsed}) failed with error: ${error.message}. Code: ${error.code || 'UNKNOWN'}.`;
    }
    console.error(`${LOG_PREFIX} Firebase Admin SDK initialization CRITICAL error: ${initializationErrorDetails}`, error.stack);
    return undefined;
  }
}

export async function DELETE(
  request: Request, // Using standard Web API Request
  { params }: { params: { uid: string } }
) {
  const uidToDelete = params.uid; 
  console.log(`${LOG_PREFIX} DELETE request received for UID: ${uidToDelete}`);
  
  const currentAdminApp = initializeAdminSdk();
  if (!currentAdminApp || (!currentAdminApp.options.projectId && !currentAdminApp.options.credential?.projectId)) {
    let detailMessage = `Firebase Admin SDK not properly initialized or is in an invalid state for delete-user route. `;
    if (initializationErrorDetails) {
      detailMessage += `Specific error during init: ${initializationErrorDetails}.`;
    } else if (!currentAdminApp) {
      detailMessage += `initializeAdminSdk() returned undefined, and no specific error was captured during the last attempt.`;
    } else if (currentAdminApp.options && !currentAdminApp.options.projectId && !currentAdminApp.options.credential?.projectId) {
      detailMessage += `Admin SDK instance (name: ${currentAdminApp.name}) was created, but its projectId is missing. App options: ${JSON.stringify(currentAdminApp.options || {})}.`;
    } else {
      detailMessage += `An unknown initialization error occurred. App options: ${JSON.stringify(currentAdminApp?.options || {})}.`;
    }
    console.error(`${LOG_PREFIX} Critical Failure: ${detailMessage}`);
    return NextResponse.json({ error: 'Server Configuration Error.', details: detailMessage }, { status: 500 });
  }

  if (!uidToDelete) {
    return NextResponse.json({ error: 'Missing UID parameter in request path.' }, { status: 400 });
  }

  let callingAdminUid: string | undefined;
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing or invalid token format.' }, { status: 401 });
    }
    const idToken = authorization.split('Bearer ')[1];
    const decodedToken = await admin.auth(currentAdminApp).verifyIdToken(idToken);
    callingAdminUid = decodedToken.uid;

    const adminUserDoc = await admin.firestore(currentAdminApp).collection('users').doc(callingAdminUid).get();
    if (!adminUserDoc.exists || adminUserDoc.data()?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Caller is not an admin.' }, { status: 403 });
    }

    if (callingAdminUid === uidToDelete) {
      return NextResponse.json({ error: 'Forbidden: Admins cannot delete their own account via this API.' }, { status: 403 });
    }

    console.log(`${LOG_PREFIX} Attempting to delete Firebase Auth user: ${uidToDelete} by admin: ${callingAdminUid} using app: ${currentAdminApp.name}`);
    await admin.auth(currentAdminApp).deleteUser(uidToDelete);
    console.log(`${LOG_PREFIX} Firebase Auth user ${uidToDelete} deleted successfully.`);
    
    return NextResponse.json({ message: `Firebase Auth user ${uidToDelete} deleted successfully.` }, { status: 200 });

  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error during Auth user deletion for UID ${uidToDelete} by admin ${callingAdminUid || 'unknown'}:`, error.message, error.code, error.stack);
    let errorMessage = 'Failed to delete Firebase Authentication user.';
    let statusCode = 500;

    if (error.code === 'auth/user-not-found') {
      errorMessage = `Firebase Auth user with UID ${uidToDelete} not found. They may have already been deleted.`;
      statusCode = 404; 
    } else if (error.message?.includes("UNAUTHENTICATED") || error.code === 'auth/insufficient-permission' || error.code === 16 || String(error.code) === '16') { 
        errorMessage = `Firebase service reported an UNAUTHENTICATED or INSUFFICIENT_PERMISSION error (Code: ${error.code}). This usually means the service account used by the Admin SDK (via GOOGLE_APPLICATION_CREDENTIALS_JSON or ADC) lacks the necessary IAM permissions (e.g., 'Firebase Authentication Admin') to perform this action. Please check the service account's roles in the Google Cloud Console. Original error: ${error.message}`;
        statusCode = 403;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    return NextResponse.json({ error: errorMessage, details: error.code || error.message }, { status: statusCode });
  }
}
    
