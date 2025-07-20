
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { initializeApp, getApps, cert, App as AdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore, CollectionReference, Query, WriteBatch } from 'firebase-admin/firestore';

const LOG_PREFIX = "[API:ResetStaffData]";

function initializeAdminApp(): AdminApp {
    if (getApps().length > 0) {
        return getApps()[0];
    }
    const serviceAccountJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!serviceAccountJson) {
        throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON is not set. Cannot initialize admin app.");
    }
    return initializeApp({
        credential: cert(JSON.parse(serviceAccountJson)),
    });
}

const COLLECTIONS_TO_DELETE = [
  "staffAttendance",
  "advances",
  "salaryPayments",
  "staffActivityLogs",
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
  
  let adminApp: AdminApp;
  try {
      adminApp = initializeAdminApp();
  } catch (e: any) {
      console.error(`${LOG_PREFIX} Critical Failure initializing admin app: ${e.message}`);
      return NextResponse.json({ error: 'Server Configuration Error.', details: e.message }, { status: 500 });
  }

  const adminDb = getAdminFirestore(adminApp);

  let callingUserUid: string | undefined;
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing or invalid token format.' }, { status: 401 });
    }
    const idToken = authorization.split('Bearer ')[1];
    const decodedToken = await getAdminAuth(adminApp).verifyIdToken(idToken);
    callingUserUid = decodedToken.uid;

    const adminUserDocRef = adminDb.collection('users').doc(callingUserUid);
    const adminUserDoc = await adminUserDocRef.get();

    if (!adminUserDoc.exists || adminUserDoc.data()?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Caller is not an admin.' }, { status: 403 });
    }

    const { confirmation } = await request.json();
    if (confirmation !== "RESET STAFF DATA") {
        return NextResponse.json({ error: 'Reset confirmation phrase is incorrect.' }, { status: 400 });
    }

    let errorsEncountered = 0;
    let collectionsSuccessfullyReset = 0;

    for (const collectionPath of COLLECTIONS_TO_DELETE) {
      try {
        await deleteCollection(adminDb, collectionPath, BATCH_SIZE);
        collectionsSuccessfullyReset++;
      } catch (error: any) {
        errorsEncountered++;
        console.error(`${LOG_PREFIX} Failed to delete collection ${collectionPath}:`, error.message, error.stack);
      }
    }

    if (errorsEncountered > 0) {
        return NextResponse.json({ 
            message: `Staff data reset process completed with ${errorsEncountered} error(s).`,
            errors: errorsEncountered,
            successes: collectionsSuccessfullyReset 
        }, { status: 207 });
    }

    return NextResponse.json({ message: 'All staff management data has been reset successfully.' }, { status: 200 });

  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error during staff data reset process:`, error.message, error.stack);
    return NextResponse.json({ error: `An unexpected error occurred: ${error.message}` }, { status: 500 });
  }
}
