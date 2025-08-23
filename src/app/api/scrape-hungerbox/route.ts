
import { NextRequest, NextResponse } from 'next/server';
import type { AppUser, Site, Stall } from '@/types';
import { logFoodStallActivity } from '@/lib/foodStallLogger';
import { processHungerboxEmail } from '@/ai/flows/process-hungerbox-email-flow';

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

// MOCK FUNCTION: This function provides a sample email body instead of live scraping.
// This allows us to test the AI processing flow.
async function getSampleEmailBody() {
    console.log(`${LOG_PREFIX} Returning hardcoded sample email body.`);
    return `
      Subject: Your Hungerbox Daily Sales Summary

      Dear Partner,

      Here is your sales summary for July 21, 2024.

      Total Sales Amount: INR 1250.75

      Breakdown:
      - Hungerbox QR: 800.25
      - Other UPI: 350.50
      - Cash: 100.00

      Thank you for your partnership.

      The Hungerbox Team
    `;
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
        const { siteId, stallId } = await request.json();

        if (!siteId || !stallId) {
            return NextResponse.json({ error: "Missing required fields: siteId, or stallId." }, { status: 400 });
        }

        const emailBody = await getSampleEmailBody();
        const processedData = await processHungerboxEmail({ emailBody });

        if (!processedData.isRelevantEmail || !processedData.saleDate || !processedData.totalAmount) {
            return NextResponse.json({ message: "The provided email content was not identified as a relevant sales summary." }, { status: 200 });
        }
        
        const saleDate = new Date(processedData.saleDate);
        const docId = `${processedData.saleDate}_${stallId}`;
        const docRef = adminDb.collection("foodSaleTransactions").doc(docId);
            
        const totalAmount = processedData.totalAmount || 0;

        const saleData = {
            saleDate: Timestamp.fromDate(saleDate),
            // Assuming the AI provides a single total amount. We will place it under 'other' for simplicity.
            breakfast: { hungerbox: 0, upi: 0, other: 0 },
            lunch: { hungerbox: 0, upi: 0, other: totalAmount },
            dinner: { hungerbox: 0, upi: 0, other: 0 },
            snacks: { hungerbox: 0, upi: 0, other: 0 },
            totalAmount: totalAmount,
            notes: processedData.notes || `Imported from email on ${new Date().toLocaleDateString()}`,
            siteId: siteId,
            stallId: stallId,
            recordedByUid: callingUser.uid,
            recordedByName: callingUser.displayName || callingUser.email,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        
        const batch = adminDb.batch();
        batch.set(docRef, saleData, { merge: true });
        await batch.commit();
        
        await logFoodStallActivity(callingUser, {
            siteId: siteId,
            stallId: stallId,
            type: 'SALE_RECORDED_OR_UPDATED',
            relatedDocumentId: docId,
            details: { notes: `Successfully imported and processed a sales record of INR ${totalAmount.toFixed(2)} for ${processedData.saleDate} from email.` }
        });

        return NextResponse.json({ message: `Successfully imported sales of INR ${totalAmount.toFixed(2)} for ${processedData.saleDate}.` }, { status: 200 });

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
