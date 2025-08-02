
import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert, App as AdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore, Timestamp, WriteBatch } from 'firebase-admin/firestore';
import type { StockItem, FoodItemExpense } from '@/types';
import Papa from 'papaparse';
import { logFoodStallActivity } from '@/lib/foodStallLogger'; // Import logger

const LOG_PREFIX = "[API:CsvImport]";

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

async function parseCsv<T>(csvData: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<T>(csvData, {
      header: true,
      skipEmptyLines: true,
      transformHeader: header => header.trim(),
      complete: (results) => {
        if (results.errors.length) {
          console.error(`${LOG_PREFIX} CSV parsing errors:`, results.errors);
          reject(new Error(results.errors.map(e => e.message).join(', ')));
        } else {
          resolve(results.data);
        }
      },
      error: (error: Error) => {
        console.error(`${LOG_PREFIX} PapaParse critical error:`, error);
        reject(error);
      }
    });
  });
}

const BATCH_SIZE = 400; // Firestore batch limit is 500 operations

async function handleStockImport(adminDb: ReturnType<typeof getAdminFirestore>, csvData: string, uid: string) {
  const parsedData = await parseCsv<any>(csvData);
  const sitesMap = new Map<string, string>();
  const stallsMap = new Map<string, string>();

  // Pre-fetch all sites and stalls to create a name->ID map
  const sitesSnapshot = await adminDb.collection('sites').get();
  sitesSnapshot.forEach(doc => sitesMap.set(doc.data().name.toLowerCase(), doc.id));
  const stallsSnapshot = await adminDb.collection('stalls').get();
  stallsSnapshot.forEach(doc => stallsMap.set(doc.data().name.toLowerCase(), doc.id));

  let batch = adminDb.batch();
  let operationCount = 0;
  let totalProcessed = 0;

  for (const row of parsedData) {
    const siteId = sitesMap.get(row['Site Name']?.toLowerCase() || '');
    if (!siteId) {
        console.warn(`${LOG_PREFIX} Skipping stock item "${row.Name}" due to unknown site "${row['Site Name']}".`);
        continue;
    }
    const stallId = row['Stall Name'] ? (stallsMap.get(row['Stall Name']?.toLowerCase() || '') || null) : null;

    const itemData: Omit<StockItem, 'id'> = {
        name: row.Name,
        category: row.Category,
        quantity: parseInt(row.Quantity, 10) || 0,
        unit: row.Unit,
        price: parseFloat(row['Selling Price (₹)']) || 0,
        costPrice: parseFloat(row['Cost Price (₹)']) || 0,
        lowStockThreshold: parseInt(row['Low Stock Threshold'], 10) || 0,
        imageUrl: row['Image URL'] || "",
        description: row.Description || "",
        siteId,
        stallId,
        originalMasterItemId: row['Original Master Item ID'] || null,
        lastUpdated: new Date().toISOString(),
    };
    
    // Use the provided ID for updates, or create a new doc for new items.
    const itemRef = row.ID ? adminDb.collection('stockItems').doc(row.ID) : adminDb.collection('stockItems').doc();
    batch.set(itemRef, itemData, { merge: true });
    operationCount++;

    if (operationCount >= BATCH_SIZE) {
      await batch.commit();
      totalProcessed += operationCount;
      console.log(`${LOG_PREFIX} Committed a batch of ${operationCount} stock items.`);
      batch = adminDb.batch();
      operationCount = 0;
    }
  }

  if (operationCount > 0) {
    await batch.commit();
    totalProcessed += operationCount;
    console.log(`${LOG_PREFIX} Committed final batch of ${operationCount} stock items.`);
  }

  return { message: `Successfully processed ${totalProcessed} stock item records.` };
}


async function handleFoodExpenseImport(adminDb: ReturnType<typeof getAdminFirestore>, csvData: string, uid: string) {
    const parsedData = await parseCsv<any>(csvData);
    const sitesMap = new Map<string, string>();
    const stallsMap = new Map<string, string>();
    const usersMap = new Map<string, {displayName: string, email: string}>();

    const sitesSnapshot = await adminDb.collection('sites').get();
    sitesSnapshot.forEach(doc => sitesMap.set(doc.data().name.toLowerCase(), doc.id));
    const stallsSnapshot = await adminDb.collection('stalls').get();
    stallsSnapshot.forEach(doc => stallsMap.set(doc.data().name.toLowerCase(), doc.id));
    const usersSnapshot = await adminDb.collection('users').get();
    usersSnapshot.forEach(doc => usersMap.set(doc.id, {displayName: doc.data().displayName, email: doc.data().email}));
    
    let batch = adminDb.batch();
    let operationCount = 0;
    let totalProcessed = 0;
    
    // Aggregate by site/stall to log one activity per stall
    const logAggregation = new Map<string, { siteId: string; stallId: string; count: number }>();

    for (const row of parsedData) {
        const siteId = sitesMap.get(row['Site Name']?.toLowerCase() || '');
        const stallId = stallsMap.get(row['Stall Name']?.toLowerCase() || '');
        if (!siteId || !stallId) {
            console.warn(`${LOG_PREFIX} Skipping expense for category "${row.Category}" due to unknown site/stall.`);
            continue;
        }

        const recordedByUser = usersMap.get(row['Recorded By (UID)']);

        const expenseData: Omit<FoodItemExpense, 'id'|'purchaseDate'> & {purchaseDate: Timestamp} = {
            category: row.Category,
            totalCost: parseFloat(row['Total Cost']) || 0,
            paymentMethod: row['Payment Method'],
            otherPaymentMethodDetails: row['Other Payment Details'] || "",
            purchaseDate: Timestamp.fromDate(new Date(row['Purchase Date'])),
            vendor: row.Vendor || "",
            otherVendorDetails: row['Other Vendor Details'] || "",
            notes: row.Notes || "",
            billImageUrl: row['Bill Image URL'] || "",
            siteId,
            stallId,
            recordedByUid: row['Recorded By (UID)'] || uid,
            recordedByName: recordedByUser?.displayName || recordedByUser?.email || row['Recorded By (Name)'] || "",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        const expenseRef = row['Expense ID'] ? adminDb.collection('foodItemExpenses').doc(row['Expense ID']) : adminDb.collection('foodItemExpenses').doc();
        batch.set(expenseRef, expenseData, { merge: true });
        operationCount++;

        // Aggregate for logging
        const aggKey = `${siteId}_${stallId}`;
        const currentAgg = logAggregation.get(aggKey) || { siteId, stallId, count: 0 };
        currentAgg.count++;
        logAggregation.set(aggKey, currentAgg);

        if (operationCount >= BATCH_SIZE) {
            await batch.commit();
            totalProcessed += operationCount;
            batch = adminDb.batch();
            operationCount = 0;
        }
    }
    
    if (operationCount > 0) {
        await batch.commit();
        totalProcessed += operationCount;
    }

    // After all batches are committed, create the activity logs
    const callingUser = await getAdminAuth().getUser(uid);
    for (const [, agg] of logAggregation) {
        await logFoodStallActivity({ uid: callingUser.uid, displayName: callingUser.displayName, email: callingUser.email, role: 'admin'}, {
            siteId: agg.siteId,
            stallId: agg.stallId,
            type: 'EXPENSE_BULK_IMPORTED',
            relatedDocumentId: `csv-import-${Date.now()}`,
            details: {
                processedCount: agg.count,
                notes: `Processed a bulk import of ${agg.count} expense records from a CSV file.`
            }
        });
    }
    
    return { message: `Successfully processed ${totalProcessed} food expense records.` };
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
  const adminAuth = getAdminAuth(adminApp);

  let callingUserUid: string;
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing or invalid token format.' }, { status: 401 });
    }
    const idToken = authorization.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    callingUserUid = decodedToken.uid;
    const adminUserDoc = await adminDb.collection('users').doc(callingUserUid).get();
    if (!adminUserDoc.exists || adminUserDoc.data()?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Caller is not an admin.' }, { status: 403 });
    }
    
    const { dataType, csvData } = await request.json();

    if (!dataType || !csvData) {
        return NextResponse.json({ error: "Missing 'dataType' or 'csvData' in request body." }, { status: 400 });
    }

    let result;
    switch (dataType) {
      case 'stock':
        result = await handleStockImport(adminDb, csvData, callingUserUid);
        break;
      case 'foodExpenses':
        result = await handleFoodExpenseImport(adminDb, csvData, callingUserUid);
        break;
      // case 'sales':
        // Note: Sales import is omitted due to complexity of stock adjustments.
        // return NextResponse.json({ error: "Sales import is not supported at this time." }, { status: 501 });
      default:
        return NextResponse.json({ error: `Invalid dataType: ${dataType}` }, { status: 400 });
    }

    return NextResponse.json(result, { status: 200 });

  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error during CSV import process:`, error.message, error.stack);
    if(error instanceof SyntaxError) {
        return NextResponse.json({ error: "Invalid JSON in request body.", details: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: `An unexpected error occurred: ${error.message}` }, { status: 500 });
  }
}
