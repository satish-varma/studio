
import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert, App as AdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore, Timestamp, WriteBatch } from 'firebase-admin/firestore';
import type { AppUser, FoodSaleTransaction, Site, Stall } from '@/types';
import Papa from 'papaparse';
import { format } from 'date-fns';

const LOG_PREFIX = "[API:FoodSalesImport]";

function initializeAdminApp(): AdminApp {
    if (getApps().length > 0) return getApps()[0];
    const serviceAccountJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!serviceAccountJson) throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON is not set.");
    return initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
}

async function parseCsv<T>(csvData: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<T>(csvData, {
      header: true, skipEmptyLines: true, transformHeader: header => header.trim(),
      complete: (results) => {
        if (results.errors.length) reject(new Error(results.errors.map(e => e.message).join(', ')));
        else resolve(results.data);
      },
      error: (error: Error) => reject(error),
    });
  });
}

export async function POST(request: NextRequest) {
  console.log(`${LOG_PREFIX} POST request received.`);
  
  let adminApp: AdminApp;
  try {
      adminApp = initializeAdminApp();
  } catch (e: any) {
      return NextResponse.json({ error: 'Server Configuration Error.', details: e.message }, { status: 500 });
  }

  const adminDb = getAdminFirestore(adminApp);
  const adminAuth = getAdminAuth(adminApp);

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing token.' }, { status: 401 });
    }
    const idToken = authorization.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const callingUser = await adminAuth.getUser(decodedToken.uid);

    const { csvData } = await request.json();
    if (!csvData) return NextResponse.json({ error: "Missing 'csvData' in request body." }, { status: 400 });

    const parsedData = await parseCsv<any>(csvData);
    if (parsedData.length === 0) return NextResponse.json({ message: "CSV file is empty or contains no data." }, { status: 200 });

    const sitesSnapshot = await adminDb.collection('sites').get();
    const sitesMap = new Map(sitesSnapshot.docs.map(doc => [doc.data().name.toLowerCase(), doc.id]));

    const stallsSnapshot = await adminDb.collection('stalls').get();
    const allStalls: Stall[] = stallsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...(doc.data() as Omit<Stall, 'id'>)
    }));

    const batch = adminDb.batch();
    let validRecordsCount = 0;
    let errors: string[] = [];

    for (const [index, row] of parsedData.entries()) {
        const siteName = row['Site Name']?.trim().toLowerCase();
        const stallName = row['Stall Name']?.trim().toLowerCase();
        const saleDateStr = row['Sale Date']?.trim();
        const saleType = row['Sale Type']?.trim();
        const hungerboxSales = parseFloat(row['Hungerbox Sales']) || 0;
        const upiSales = parseFloat(row['UPI Sales']) || 0;
        const totalAmount = parseFloat(row['Total Amount']) || (hungerboxSales + upiSales);
        
        if (!siteName || !stallName || !saleDateStr || !saleType) {
            errors.push(`Row ${index + 2}: Missing required fields (Site Name, Stall Name, Sale Date, or Sale Type).`);
            continue;
        }

        const siteId = sitesMap.get(siteName);
        if (!siteId) {
            errors.push(`Row ${index + 2}: Site "${row['Site Name']}" not found.`);
            continue;
        }

        const stall = allStalls.find(s => s.siteId === siteId && s.name.toLowerCase() === stallName);
        if (!stall) {
            errors.push(`Row ${index + 2}: Stall "${row['Stall Name']}" not found in site "${row['Site Name']}".`);
            continue;
        }

        const saleDate = new Date(saleDateStr);
        if (isNaN(saleDate.getTime())) {
            errors.push(`Row ${index + 2}: Invalid Sale Date format "${saleDateStr}". Use YYYY-MM-DD.`);
            continue;
        }

        const docId = row.ID || `${format(saleDate, 'yyyy-MM-dd')}_${stall.id}_${saleType}`;
        const saleDocRef = adminDb.collection('foodSaleTransactions').doc(docId);

        const saleData: Omit<FoodSaleTransaction, 'id' | 'saleDate'> & { saleDate: Date } = {
            saleDate: saleDate,
            siteId: siteId,
            stallId: stall.id,
            saleType: saleType,
            hungerboxSales,
            upiSales,
            totalAmount,
            notes: row.Notes || "",
            recordedByUid: row['Recorded By (UID)'] || callingUser.uid,
            recordedByName: row['Recorded By (Name)'] || callingUser.displayName || callingUser.email!,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        batch.set(saleDocRef, saleData, { merge: true });
        validRecordsCount++;
    }

    if (validRecordsCount > 0) await batch.commit();

    if (errors.length > 0) {
      return NextResponse.json({
        message: `Import partially completed. Processed ${validRecordsCount} valid records.`,
        errors,
      }, { status: 207 });
    }

    return NextResponse.json({ message: `Successfully processed ${validRecordsCount} sales records.` }, { status: 200 });

  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error during CSV import process:`, error.message, error.stack);
    if(error instanceof SyntaxError) {
        return NextResponse.json({ error: "Invalid JSON in request body.", details: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: `An unexpected error occurred: ${error.message}` }, { status: 500 });
  }
}
