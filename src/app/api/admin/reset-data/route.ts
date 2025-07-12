

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore, CollectionReference, Query, WriteBatch } from 'firebase-admin/firestore';
import { initializeAdminSdk } from '@/lib/firebaseAdmin'; // Import the robust initializer

const LOG_PREFIX = "[API:ResetData]";

const COLLECTIONS_TO_DELETE = [
  "stockItems",
  "salesTransactions",
  "stockMovementLogs",
  "sites",
  "stalls",
  "userGoogleOAuthTokens",
  "foodItemExpenses",
  "foodSaleTransactions",
  "foodStallActivityLogs",
  "foodVendors",
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
  
  const { adminApp, error } = initializeAdminSdk();
  if (error || !adminApp) {
    console.error(`${LOG_PREFIX} Critical Failure: ${error}`);
    return NextResponse.json({ error: 'Server Configuration Error.', details: error }, { status: 500 });
  }
  const adminDbInstance = getAdminFirestore(adminApp);


  let callingUserUid: string | undefined;
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      console.warn(`${LOG_PREFIX} Authorization header missing or malformed.`);
      return NextResponse.json({ error: 'Unauthorized: Missing or invalid token format.' }, { status: 401 });
    }
    const idToken = authorization.split('Bearer ')[1];
    const decodedToken = await getAdminAuth(adminApp).verifyIdToken(idToken);
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
        }, { status: 207 }); // 207 Multi-Status
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
