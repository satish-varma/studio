
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import admin, { initializeApp, getApps, getApp, App as AdminApp, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore, CollectionReference, Query, WriteBatch } from 'firebase-admin/firestore';

const LOG_PREFIX = "[API:ResetData]";

// Firebase Admin SDK Initialization
let adminAppInstance: AdminApp | undefined;
let adminDbInstance: ReturnType<typeof getAdminFirestore> | undefined;
let adminSdkInitializationError: string | null = null;

const adminAppInstances = new Map<string, AdminApp>();

function initializeAdminSdkForReset(): AdminApp | undefined {
  const instanceSuffix = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  const UNIQUE_APP_NAME = `firebase-admin-app-reset-data-route-${instanceSuffix}`;

  if (adminAppInstances.has(UNIQUE_APP_NAME)) {
    const existingApp = adminAppInstances.get(UNIQUE_APP_NAME)!;
    if (existingApp.options.projectId || existingApp.options.credential?.projectId) {
      console.log(`${LOG_PREFIX} Re-using existing valid Admin SDK instance for reset: ${UNIQUE_APP_NAME}`);
      return existingApp;
    }
  }
  
  adminSdkInitializationError = null; 
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
      } catch (parseError: any) {
        adminSdkInitializationError = `Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON. Error: ${parseError.message}. JSON (first 100 chars): ${serviceAccountJsonEnv.substring(0, 100)}`;
        throw new Error(adminSdkInitializationError);
      }
      if (!parsedServiceAccountProjectId) {
        adminSdkInitializationError = `GOOGLE_APPLICATION_CREDENTIALS_JSON was parsed, but 'project_id' is missing.`;
        throw new Error(adminSdkInitializationError);
      }
      newAdminApp = initializeApp({ credential: cert(serviceAccount) }, UNIQUE_APP_NAME);
    } else if (serviceAccountPathEnv) {
      methodUsed = "PATH_ENV";
      console.log(`${LOG_PREFIX} Found GOOGLE_APPLICATION_CREDENTIALS (path): ${serviceAccountPathEnv}. Initializing with file path.`);
      // For path, initializeApp might infer project ID if service account file is correctly pointed to.
      // If default initializeApp is used, it needs GOOGLE_APPLICATION_CREDENTIALS env var set globally for the process.
      newAdminApp = initializeApp(undefined, UNIQUE_APP_NAME);
    } else {
      methodUsed = "ADC";
      console.log(`${LOG_PREFIX} No specific service account JSON or path found. Attempting generic Application Default Credentials (ADC).`);
      newAdminApp = initializeApp(undefined, UNIQUE_APP_NAME);
    }
    
    if (!newAdminApp) {
      adminSdkInitializationError = `Admin SDK initializeApp call with ${methodUsed} returned undefined for app name ${UNIQUE_APP_NAME}. This is highly unusual.`;
      throw new Error(adminSdkInitializationError);
    }

    const finalProjectId = newAdminApp.options.projectId || newAdminApp.options.credential?.projectId;
    if (!finalProjectId) {
      adminSdkInitializationError = `Admin SDK initialized via ${methodUsed}, but the resulting app instance (name: ${newAdminApp.name}) is missing a projectId. Parsed SA project_id: '${parsedServiceAccountProjectId || 'N/A'}'. App options: ${JSON.stringify(newAdminApp.options)}.`;
      throw new Error(adminSdkInitializationError);
    }
    
    console.log(`${LOG_PREFIX} Admin SDK initialized successfully via ${methodUsed} for reset. App name: ${newAdminApp.name}, Project ID: ${finalProjectId}`);
    adminAppInstances.set(UNIQUE_APP_NAME, newAdminApp);
    return newAdminApp;

  } catch (error: any) {
    adminSdkInitializationError = `Initialization attempt (${methodUsed}) for reset failed. Error: ${error.message}.`;
    console.error(`${LOG_PREFIX} Firebase Admin SDK initialization CRITICAL error for reset: ${adminSdkInitializationError}`, error.stack);
    return undefined;
  }
}


const COLLECTIONS_TO_DELETE = [
  "stockItems",
  "salesTransactions",
  "stockMovementLogs",
  "sites",
  "stalls",
  "userGoogleOAuthTokens"
];
const BATCH_SIZE = 500;

async function deleteCollection(db: ReturnType<typeof getAdminFirestore>, collectionPath: string, batchSize: number) {
  console.log(`${LOG_PREFIX} Starting deletion of collection: ${collectionPath}`);
  const collectionRef = db.collection(collectionPath) as CollectionReference;
  let query: Query = collectionRef.orderBy('__name__').limit(batchSize);
  let documentsDeleted = 0;

  return new Promise<void>((resolve, reject) => {
    deleteQueryBatch(db, query, resolve, reject, collectionPath, batchSize, (numDeleted) => {
      documentsDeleted += numDeleted;
      console.log(`${LOG_PREFIX} Deleted ${documentsDeleted} documents from ${collectionPath} so far...`);
    });
  });
}

async function deleteQueryBatch(
  db: ReturnType<typeof getAdminFirestore>,
  queryParam: Query,
  resolve: () => void,
  reject: (reason?: any) => void,
  collectionPath: string,
  batchSize: number,
  onProgress: (numDeleted: number) => void
) {
  try {
    const snapshot = await queryParam.get();

    if (snapshot.size === 0) {
      console.log(`${LOG_PREFIX} Finished deleting documents from ${collectionPath}.`);
      resolve();
      return;
    }

    const batch: WriteBatch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    onProgress(snapshot.size);

    process.nextTick(() => {
      deleteQueryBatch(db, queryParam, resolve, reject, collectionPath, batchSize, onProgress);
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error deleting batch from ${collectionPath}:`, error);
    reject(error);
  }
}


export async function POST(request: NextRequest) {
  console.log(`${LOG_PREFIX} POST request received.`);
  
  adminAppInstance = initializeAdminSdkForReset();
  if (!adminAppInstance || (!adminAppInstance.options.projectId && !adminAppInstance.options.credential?.projectId)) {
    const detailMessage = `Firebase Admin SDK not properly initialized or is in an invalid state for reset. ${adminSdkInitializationError || "An unknown initialization error occurred."}`;
    console.error(`${LOG_PREFIX} Critical Failure: ${detailMessage}`);
    return NextResponse.json({ error: 'Server Configuration Error.', details: detailMessage }, { status: 500 });
  }
  adminDbInstance = getAdminFirestore(adminAppInstance);


  let callingUserUid: string | undefined;
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      console.warn(`${LOG_PREFIX} Authorization header missing or malformed.`);
      return NextResponse.json({ error: 'Unauthorized: Missing or invalid token format.' }, { status: 401 });
    }
    const idToken = authorization.split('Bearer ')[1];
    const decodedToken = await getAdminAuth(adminAppInstance).verifyIdToken(idToken);
    callingUserUid = decodedToken.uid;

    const adminUserDocRef = adminDbInstance.collection('users').doc(callingUserUid);
    const adminUserDoc = await adminUserDocRef.get();

    if (!adminUserDoc.exists || adminUserDoc.data()?.role !== 'admin') {
      console.warn(`${LOG_PREFIX} Forbidden. Caller UID ${callingUserUid} is not an admin. Role: ${adminUserDoc.data()?.role ?? 'not found'}`);
      return NextResponse.json({ error: 'Forbidden: Caller is not an admin.' }, { status: 403 });
    }

    const { confirmation } = await request.json();
    if (confirmation !== "RESET DATA") {
        return NextResponse.json({ error: 'Reset confirmation phrase is incorrect.' }, { status: 400 });
    }

    let errorsEncountered = 0;
    let collectionsSuccessfullyReset = 0;

    for (const collectionPath of COLLECTIONS_TO_DELETE) {
      try {
        await deleteCollection(adminDbInstance, collectionPath, BATCH_SIZE);
        collectionsSuccessfullyReset++;
      } catch (error: any) {
        errorsEncountered++;
        console.error(`${LOG_PREFIX} Failed to delete collection ${collectionPath}:`, error.message, error.stack);
      }
    }

    if (errorsEncountered > 0) {
        return NextResponse.json({ 
            message: `Data reset process completed with ${errorsEncountered} error(s). Some collections might not be fully cleared. Check server logs.`,
            errors: errorsEncountered,
            successes: collectionsSuccessfullyReset 
        }, { status: 207 });
    }

    return NextResponse.json({ message: 'Application data (excluding users) has been reset successfully.' }, { status: 200 });

  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error during data reset process (Caller UID: ${callingUserUid || 'unknown'}):`, error.message, error.stack);
    let errorMessage = 'Internal Server Error';
    let statusCode = 500;

    if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
      errorMessage = 'Unauthorized: Invalid or expired token.';
      statusCode = 401;
    } else if (error instanceof SyntaxError && error.message.includes("JSON")) {
      errorMessage = "Invalid JSON in request body (expected confirmation).";
      statusCode = 400;
    } else if (error.message?.includes("UNAUTHENTICATED")) {
      errorMessage = `Firebase service reported an UNAUTHENTICATED error. This usually means the service account used by the Admin SDK lacks the necessary IAM permissions. Please check its roles in Google Cloud Console. Original error: ${error.message}`;
      statusCode = 403;
    }
    
    return NextResponse.json({ error: errorMessage, details: error.message || 'Unknown server error' }, { status: statusCode });
  }
}
