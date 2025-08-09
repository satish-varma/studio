
import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, Timestamp, writeBatch } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert, App as AdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { logFoodStallActivity } from '@/lib/foodStallLogger';
import { AppUser } from '@/types';
import { format } from 'date-fns';

const LOG_PREFIX = "[API:ScrapeHungerbox]";

function initializeAdminApp(): AdminApp {
    const existingApps = getApps();
    if (existingApps.length > 0) {
        return existingApps[0];
    }
    
    const serviceAccountJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!serviceAccountJson) {
        console.error(`${LOG_PREFIX} GOOGLE_APPLICATION_CREDENTIALS_JSON is not set.`);
        throw new Error("Server configuration error: Firebase Admin credentials are not set.");
    }
    
    try {
        const serviceAccount = JSON.parse(serviceAccountJson);
        return initializeApp({
            credential: cert(serviceAccount),
        });
    } catch (e: any) {
        console.error(`${LOG_PREFIX} Failed to parse or initialize Firebase Admin SDK:`, e.message);
        throw new Error(`Server configuration error: Failed to initialize Firebase Admin SDK. ${e.message}`);
    }
}


// MOCK FUNCTION: This function now returns hardcoded mock data instead of live scraping.
async function getConsolidatedReportData() {
    console.log(`${LOG_PREFIX} Returning hardcoded mock consolidated report data.`);
    // This simulates a consolidated report with sales figures for different stalls.
    // In a real scenario, this data would be parsed from the downloaded report file.
    return [
        { date: '2024-07-21', hungerboxSales: '1250.75', upiSales: '340.50', cashSales: '150.00', stallId: 'HsrLayoutStall', siteId: 'BangaloreSite' },
        { date: '2024-07-21', hungerboxSales: '980.25', upiSales: '410.00', cashSales: '200.00', stallId: 'KoramangalaStall', siteId: 'BangaloreSite' },
        { date: '2024-07-20', hungerboxSales: '1100.00', upiSales: '300.00', cashSales: '180.50', stallId: 'HsrLayoutStall', siteId: 'BangaloreSite' },
        { date: '2024-07-20', hungerboxSales: '950.50', upiSales: '380.75', cashSales: '210.00', stallId: 'KoramangalaStall', siteId: 'BangaloreSite' },
    ];
}

export async function POST(request: NextRequest) {
    let adminApp: AdminApp;
    let adminAuth: ReturnType<typeof getAdminAuth>;
    let adminDb: ReturnType<typeof getFirestore>;

    try {
        adminApp = initializeAdminApp();
        adminAuth = getAdminAuth(adminApp);
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
        
        const consolidatedData = await getConsolidatedReportData();

        let processedCount = 0;
        const batch = writeBatch(adminDb);

        for (const record of consolidatedData) {
            if (!record.date || !record.siteId || !record.stallId) continue;

            const saleDate = new Date(record.date);
            const docId = `${record.date}_${record.stallId}`;
            const docRef = adminDb.collection("foodSaleTransactions").doc(docId);
            
            const hungerboxSales = parseFloat(record.hungerboxSales) || 0;
            const upiSales = parseFloat(record.upiSales) || 0;
            const cashSales = parseFloat(record.cashSales) || 0;
            const total = hungerboxSales + upiSales + cashSales;

            const saleData = {
                saleDate: Timestamp.fromDate(saleDate),
                // Assuming consolidated report maps to Breakfast/Lunch for demo
                breakfast: { hungerbox: hungerboxSales, upi: 0, other: 0 },
                lunch: { hungerbox: 0, upi: upiSales, other: cashSales },
                dinner: { hungerbox: 0, upi: 0, other: 0 },
                snacks: { hungerbox: 0, upi: 0, other: 0 },
                totalAmount: total,
                notes: `Imported from Hungerbox Consolidated Report on ${new Date().toLocaleDateString()}`,
                siteId: record.siteId,
                stallId: record.stallId,
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
                siteId: 'CONSOLIDATED',
                stallId: 'CONSOLIDATED',
                type: 'SALE_RECORDED_OR_UPDATED',
                relatedDocumentId: `hungerbox-import-${Date.now()}`,
                details: { notes: `Successfully imported and processed ${processedCount} sales records from a consolidated report.` }
            });
        }

        return NextResponse.json({ message: `Successfully imported and updated ${processedCount} daily sales summaries from the consolidated report.` }, { status: 200 });

    } catch (error: any) {
        console.error(`${LOG_PREFIX} Error in API route:`, error);
        return NextResponse.json({ error: error.message || 'An unexpected server error occurred.' }, { status: 500 });
    }
}
