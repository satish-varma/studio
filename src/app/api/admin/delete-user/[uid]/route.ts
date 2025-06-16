
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import admin from 'firebase-admin';
import type { App as AdminApp } from 'firebase-admin/app';
import type { DecodedIdToken } from 'firebase-admin/auth';

const LOG_PREFIX = "[API:DeleteUser]";

const adminAppInstances = new Map<string, AdminApp>();
let initializationErrorDetails: string | null = null;

// Simplified Admin SDK Initialization - prioritize JSON string, then path, then ADC
function initializeAdminSdk(): AdminApp | undefined {
  const instanceSuffix = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  const UNIQUE_APP_NAME = `firebase-admin-app-delete-user-route-${instanceSuffix}`;

  if (adminAppInstances.has(UNIQUE_APP_NAME)) {
    const existingApp = adminAppInstances.get(UNIQUE_APP_NAME)!;
    if (existingApp.options.projectId || existingApp.options.credential?.projectId) {
      console.log(`${LOG_PREFIX} Re-using existing valid Admin SDK instance: ${UNIQUE_APP_NAME}`);
      return existingApp;
    }
  }
  
  initializationErrorDetails = null; 
  let newAdminApp: AdminApp | undefined;
  let methodUsed = "";

  try {
    const serviceAccountJsonEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (serviceAccountJsonEnv) {
      methodUsed = "JSON_ENV";
      const serviceAccount = JSON.parse(serviceAccountJsonEnv);
      if (!serviceAccount.project_id) {
        initializationErrorDetails = `GOOGLE_APPLICATION_CREDENTIALS_JSON was parsed, but 'project_id' is missing.`;
        throw new Error(initializationErrorDetails);
      }
      newAdminApp = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }, UNIQUE_APP_NAME);
    } else {
      methodUsed = "PATH_ENV_OR_ADC"; // Grouping for simplicity as both initialize without explicit params if GOOGLE_APPLICATION_CREDENTIALS is set
      newAdminApp = admin.initializeApp(undefined, UNIQUE_APP_NAME);
    }
    
    if (!newAdminApp) {
      initializationErrorDetails = `Admin SDK initializeApp call with ${methodUsed} returned undefined for app name ${UNIQUE_APP_NAME}.`;
      throw new Error(initializationErrorDetails);
    }

    const finalProjectId = newAdminApp.options.projectId || newAdminApp.options.credential?.projectId;
    if (!finalProjectId) {
      initializationErrorDetails = `Admin SDK initialized via ${methodUsed}, but the resulting app instance (name: ${newAdminApp.name}) is missing a projectId. App options: ${JSON.stringify(newAdminApp.options)}.`;
      throw new Error(initializationErrorDetails);
    }
    
    console.log(`${LOG_PREFIX} Admin SDK initialized successfully via ${methodUsed}. App name: ${newAdminApp.name}, Project ID: ${finalProjectId}`);
    adminAppInstances.set(UNIQUE_APP_NAME, newAdminApp);
    return newAdminApp;

  } catch (error: any) {
    initializationErrorDetails = `Initialization attempt (${methodUsed}) failed. Error: ${error.message}.`;
    console.error(`${LOG_PREFIX} Firebase Admin SDK initialization CRITICAL error: ${initializationErrorDetails}`, error.stack);
    return undefined;
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { uid: string } }) {
  console.log(`${LOG_PREFIX} DELETE request received for UID: ${params.uid}`);
  
  const currentAdminApp = initializeAdminSdk();
  if (!currentAdminApp || (!currentAdminApp.options.projectId && !currentAdminApp.options.credential?.projectId)) {
    const detailMessage = `Firebase Admin SDK not properly initialized or is in an invalid state. ${initializationErrorDetails || "An unknown initialization error occurred."}`;
    console.error(`${LOG_PREFIX} Critical Failure: ${detailMessage}`);
    return NextResponse.json({ error: 'Server Configuration Error.', details: detailMessage }, { status: 500 });
  }

  const uidToDelete = params.uid;
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

    console.log(`${LOG_PREFIX} Attempting to delete Firebase Auth user: ${uidToDelete} by admin: ${callingAdminUid}`);
    await admin.auth(currentAdminApp).deleteUser(uidToDelete);
    console.log(`${LOG_PREFIX} Firebase Auth user ${uidToDelete} deleted successfully.`);
    
    return NextResponse.json({ message: `Firebase Auth user ${uidToDelete} deleted successfully.` }, { status: 200 });

  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error during Auth user deletion for UID ${uidToDelete} by admin ${callingAdminUid || 'unknown'}:`, error);
    let errorMessage = 'Failed to delete Firebase Authentication user.';
    let statusCode = 500;

    if (error.code === 'auth/user-not-found') {
      errorMessage = `Firebase Auth user with UID ${uidToDelete} not found. They may have already been deleted.`;
      statusCode = 404; 
    } else if (error.message?.includes("UNAUTHENTICATED") || error.code === 'auth/insufficient-permission') {
        errorMessage = `Firebase service reported an UNAUTHENTICATED or INSUFFICIENT_PERMISSION error. This usually means the service account used by the Admin SDK lacks the necessary IAM permissions (e.g., 'Firebase Authentication Admin') to perform this action. Please check the service account's roles in the Google Cloud Console. Original error: ${error.message}`;
        statusCode = 403;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    return NextResponse.json({ error: errorMessage, details: error.code || error.message }, { status: statusCode });
  }
}
    