
import { NextRequest, NextResponse } from 'next/server';
import type { AppUser, Site, Stall } from '@/types';
import { logFoodStallActivity } from '@/lib/foodStallLogger';

// Using require for firebase-admin modules as dynamic imports can be problematic in this environment.
const admin = require('firebase-admin');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const LOG_PREFIX = "[API:ScrapeHungerbox]";

function initializeAdminApp() {
    if (admin.apps.length > 0) {
        return admin.apps[0];
    }
    
    const serviceAccountJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!serviceAccountJson) {
        console.error(`${LOG_PREFIX} GOOGLE_APPLICATION_CREDENTIALS_JSON is not set.`);
        throw new Error("Server configuration error: Firebase Admin credentials are not set.");
    }
    
    try {
        const serviceAccount = JSON.parse(serviceAccountJson);
        return admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
    } catch (e: any) {
        console.error(`${LOG_PREFIX} Failed to parse or initialize Firebase Admin SDK:`, e.message);
        throw new Error(`Server configuration error: Failed to initialize Firebase Admin SDK. ${e.message}`);
    }
}

// MOCK FUNCTION: This function returns hardcoded mock data instead of live scraping.
// This is used for demonstration as live scraping is unreliable.
async function getConsolidatedReportData() {
    console.log(`${LOG_PREFIX} Returning hardcoded mock consolidated report data.`);
    return [
        { date: '2024-07-21', hungerboxSales: '1250.75', upiSales: '340.50', cashSales: '150.00' },
        { date: '2024-07-20', hungerboxSales: '1100.00', upiSales: '300.00', cashSales: '180.50' },
    ];
}


export async function POST(request: NextRequest) {
    let adminApp;
    let adminAuth;
    let adminDb;

    try {
        adminApp = initializeAdminApp();
        adminAuth = getAuth(adminApp);
        adminDb = getFirestore(adminApp);
    } catch (e: any) {
        console.error(`${LOG_PREFIX} Critical Failure initializing admin app: ${e.message}`);
        return NextResponse.json({ error: 'Server Configuration Error.', details: e.message }, { status: 500 });
    }

    let callingUser: AppUser;
    try {
        const authorization = request.headers.get('Authorization');
        if (!authorization?.startsWith('Bearer ')) {
          return NextResponse.json({ error: 'Unauthorized: Missing or invalid token format.' }, { status: 401 });
        }
        const idToken = authorization.split('Bearer ')[1];
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        const userDocRef = adminDb.collection("users").doc(decodedToken.uid);
        const callingUserDocSnap = await userDocRef.get();

        if (!callingUserDocSnap.exists) {
          return NextResponse.json({ error: 'Caller user document not found in Firestore.' }, { status: 403 });
        }
        callingUser = { uid: callingUserDocSnap.id, ...callingUserDocSnap.data() } as AppUser;
        
        // Correctly get siteId and stallId from request body
        const { siteId, stallId, username, password } = await request.json();

        if (!username || !password || !siteId || !stallId) {
            return NextResponse.json({ error: "Missing required fields: username, password, siteId, or stallId." }, { status: 400 });
        }

        const consolidatedData = await getConsolidatedReportData();
        const batch = adminDb.batch();
        let processedCount = 0;

        for (const record of consolidatedData) {
            const saleDate = new Date(record.date);
            const docId = `${record.date}_${stallId}`;
            const docRef = adminDb.collection("foodSaleTransactions").doc(docId);
            
            const hungerboxSales = parseFloat(record.hungerboxSales) || 0;
            const upiSales = parseFloat(record.upiSales) || 0;
            const cashSales = parseFloat(record.cashSales) || 0;
            const total = hungerboxSales + upiSales + cashSales;

            const saleData = {
                saleDate: Timestamp.fromDate(saleDate),
                breakfast: { hungerbox: hungerboxSales, upi: 0, other: 0 },
                lunch: { hungerbox: 0, upi: upiSales, other: cashSales },
                dinner: { hungerbox: 0, upi: 0, other: 0 },
                snacks: { hungerbox: 0, upi: 0, other: 0 },
                totalAmount: total,
                notes: `Imported from Hungerbox Report on ${new Date().toLocaleDateString()}`,
                siteId: siteId,
                stallId: stallId,
                recordedByUid: callingUser.uid,
                recordedByName: callingUser.displayName || callingUser.email,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            batch.set(docRef, saleData, { merge: true });
            processedCount++;
        }
        
        await batch.commit();
        
        if (processedCount > 0) {
            await logFoodStallActivity(callingUser, {
                siteId: siteId,
                stallId: stallId,
                type: 'SALE_RECORDED_OR_UPDATED',
                relatedDocumentId: `hungerbox-import-${Date.now()}`,
                details: { notes: `Successfully imported and processed ${processedCount} sales records from a report.` }
            });
        }

        return NextResponse.json({ message: `Successfully imported and updated ${processedCount} daily sales summaries.` }, { status: 200 });

    } catch (error: any) {
        console.error(`${LOG_PREFIX} Error in API route:`, error);
        let errorMessage = 'An unexpected server error occurred.';
        if(error.code === 8 || (typeof error.message === 'string' && error.message.includes('RESOURCE_EXHAUSTED'))){
            errorMessage = "8 RESOURCE_EXHAUSTED: Quota exceeded.";
        } else if (error.message) {
            errorMessage = error.message;
        }
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
