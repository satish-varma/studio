
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import admin, { initializeApp, getApps, getApp, App as AdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore, CollectionReference, Query, WriteBatch } from 'firebase-admin/firestore';

const LOG_PREFIX = "[API:ResetData]";

// Firebase Admin SDK Initialization
let adminApp: AdminApp | undefined;
let adminDb: ReturnType<typeof getAdminFirestore> | undefined;

if (!getApps().length) {
  try {
    adminApp = initializeApp();
    console.log(`${LOG_PREFIX} Firebase Admin SDK initialized successfully using Application Default Credentials.`);
  } catch (e: any) {
    console.error(`${LOG_PREFIX} Firebase Admin SDK default initialization failed:`, e.message);
  }
} else {
  adminApp = getApp();
  console.log(`${LOG_PREFIX} Firebase Admin SDK already initialized. Using existing app.`);
}

if (adminApp) {
  adminDb = getAdminFirestore(adminApp);
  console.log(`${LOG_PREFIX} Firestore Admin DB obtained.`);
} else {
  console.error(`${LOG_PREFIX} CRITICAL - Firebase Admin App is not properly initialized. Firestore Admin DB cannot be obtained.`);
}

const COLLECTIONS_TO_DELETE = [
  "stockItems",
  "salesTransactions",
  "stockMovementLogs",
  "sites",
  "stalls",
  "userGoogleOAuthTokens"
  // IMPORTANT: "users" collection is intentionally EXCLUDED.
];
const BATCH_SIZE = 500; // Firestore batch limit

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
  query: Query,
  resolve: () => void,
  reject: (reason?: any) => void,
  collectionPath: string,
  batchSize: number,
  onProgress: (numDeleted: number) => void
) {
  try {
    const snapshot = await query.get();

    if (snapshot.size === 0) {
      // No documents left, we are done.
      console.log(`${LOG_PREFIX} Finished deleting documents from ${collectionPath}. Total processed: ${snapshot.size} in this batch (meaning 0 left).`);
      resolve();
      return;
    }

    const batch: WriteBatch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    onProgress(snapshot.size);

    // Recurse on the next process tick, to avoid exploding the stack.
    process.nextTick(() => {
      deleteQueryBatch(db, query, resolve, reject, collectionPath, batchSize, onProgress);
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error deleting batch from ${collectionPath}:`, error);
    reject(error);
  }
}


export async function POST(request: NextRequest) {
  console.log(`${LOG_PREFIX} POST request received.`);
  if (!adminApp || !adminDb) {
    console.error(`${LOG_PREFIX} Firebase Admin SDK not properly initialized.`);
    return NextResponse.json({ error: 'Server Error: Firebase Admin SDK not properly initialized.' }, { status: 500 });
  }

  let callingUserUid: string | undefined;
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      console.warn(`${LOG_PREFIX} Authorization header missing or malformed.`);
      return NextResponse.json({ error: 'Unauthorized: Missing or invalid token format.' }, { status: 401 });
    }
    const idToken = authorization.split('Bearer ')[1];
    console.log(`${LOG_PREFIX} Verifying ID Token...`);
    const decodedToken = await getAdminAuth(adminApp).verifyIdToken(idToken);
    callingUserUid = decodedToken.uid;
    console.log(`${LOG_PREFIX} ID Token verified for UID: ${callingUserUid}`);

    console.log(`${LOG_PREFIX} Checking admin privileges for UID: ${callingUserUid}`);
    const adminUserDocRef = adminDb.collection('users').doc(callingUserUid);
    const adminUserDoc = await adminUserDocRef.get();

    if (!adminUserDoc.exists || adminUserDoc.data()?.role !== 'admin') {
      console.warn(`${LOG_PREFIX} Forbidden. Caller UID ${callingUserUid} is not an admin. Role: ${adminUserDoc.data()?.role ?? 'not found'}`);
      return NextResponse.json({ error: 'Forbidden: Caller is not an admin.' }, { status: 403 });
    }
    console.log(`${LOG_PREFIX} Caller ${callingUserUid} authorized as admin.`);

    // Confirmation from body
    const { confirmation } = await request.json();
    if (confirmation !== "RESET DATA") {
        console.warn(`${LOG_PREFIX} Reset confirmation phrase mismatch. Received: '${confirmation}'`);
        return NextResponse.json({ error: 'Reset confirmation phrase is incorrect.' }, { status: 400 });
    }
    console.log(`${LOG_PREFIX} Reset confirmation phrase matched. Proceeding with data reset.`);

    let errorsEncountered = 0;
    let collectionsSuccessfullyReset = 0;

    for (const collectionPath of COLLECTIONS_TO_DELETE) {
      try {
        await deleteCollection(adminDb, collectionPath, BATCH_SIZE);
        collectionsSuccessfullyReset++;
        console.log(`${LOG_PREFIX} Successfully deleted all documents from collection: ${collectionPath}`);
      } catch (error: any) {
        errorsEncountered++;
        console.error(`${LOG_PREFIX} Failed to delete collection ${collectionPath}:`, error.message, error.stack);
        // Decide if one failure should stop the whole process or continue.
        // For now, we'll log and continue to try to reset other collections.
      }
    }

    if (errorsEncountered > 0) {
        console.warn(`${LOG_PREFIX} Data reset process completed with ${errorsEncountered} error(s). ${collectionsSuccessfullyReset} collections were processed for reset.`);
        return NextResponse.json({ 
            message: `Data reset process completed with ${errorsEncountered} error(s). Some collections might not be fully cleared. Check server logs.`,
            errors: errorsEncountered,
            successes: collectionsSuccessfullyReset 
        }, { status: 207 }); // Multi-Status
    }

    console.log(`${LOG_PREFIX} All specified collections (excluding users) have been successfully reset.`);
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
    }
    
    return NextResponse.json({ error: errorMessage, details: error.message || 'Unknown server error' }, { status: statusCode });
  }
}
