
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { initializeApp, getApps, cert, App as AdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore, Timestamp } from 'firebase-admin/firestore';
import type { AppUser, FoodSaleTransaction } from '@/types';
import { processHungerboxEmail } from '@/ai/flows/process-hungerbox-email-flow';
import { logFoodStallActivity } from '@/lib/foodStallLogger';

const LOG_PREFIX = "[API:GmailHandler]";

// Ensure these are in your .env.local file
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

const oAuth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

function initializeAdminApp(): AdminApp {
    if (getApps().length > 0) return getApps()[0];
    const serviceAccountJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!serviceAccountJson) throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON is not set.");
    return initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
}

// Helper to decode base64url email body
function decodeBase64Url(base64Url: string) {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  let pad = base64.length % 4;
  if(pad) {
    if(pad === 1) throw new Error('InvalidLengthError: Input base64url string is the wrong length to determine padding');
    base64 += new Array(5-pad).join('=');
  }
  return Buffer.from(base64, 'base64').toString();
}

export async function POST(request: NextRequest) {
  let adminApp;
  try {
    adminApp = initializeAdminApp();
  } catch (e: any) {
    return NextResponse.json({ error: 'Server Configuration Error.', details: e.message }, { status: 500 });
  }

  const adminAuth = getAdminAuth(adminApp);
  const adminDb = getAdminFirestore(adminApp);
  
  let callingUser: AppUser;
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing token.' }, { status: 401 });
    }
    const idToken = authorization.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    
    const userDocRef = adminDb.collection('users').doc(decodedToken.uid);
    const userDocSnap = await userDocRef.get();
    if (!userDocSnap.exists) {
        return NextResponse.json({ error: 'User not found in database.' }, { status: 404 });
    }
    callingUser = { uid: userDocSnap.id, ...userDocSnap.data() } as AppUser;

    const { siteId, stallId } = await request.json();
    if (!siteId || !stallId) {
        return NextResponse.json({ error: "Missing siteId or stallId in request body." }, { status: 400 });
    }

    const tokensDocRef = adminDb.collection('user_tokens').doc(callingUser.uid);
    const tokensDocSnap = await tokensDocRef.get();
    if (!tokensDocSnap.exists) {
        return NextResponse.json({ error: 'Gmail account not connected. Please connect your account first.' }, { status: 401 });
    }
    const tokens = tokensDocSnap.data();
    oAuth2Client.setCredentials(tokens as any);

    const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
    
    console.log(`${LOG_PREFIX} Searching for emails from Hungerbox...`);
    const searchResponse = await gmail.users.messages.list({
        userId: 'me',
        q: 'from:noreply@hungerbox.com "Order Confirmation" is:unread',
        maxResults: 1 // Process one email at a time to start
    });

    const messages = searchResponse.data.messages;
    if (!messages || messages.length === 0) {
        return NextResponse.json({ message: "No new Hungerbox sales emails found." }, { status: 200 });
    }

    const messageId = messages[0].id!;
    console.log(`${LOG_PREFIX} Found email. Fetching content for message ID: ${messageId}`);
    const messageResponse = await gmail.users.messages.get({ userId: 'me', id: messageId });

    const emailBodyPart = messageResponse.data.payload?.parts?.find(
        (part) => part.mimeType === 'text/plain'
    );

    if (!emailBodyPart?.body?.data) {
        return NextResponse.json({ error: `Could not find plain text body in email ID: ${messageId}` }, { status: 400 });
    }
    const emailBody = decodeBase64Url(emailBodyPart.body.data);
    
    console.log(`${LOG_PREFIX} Processing email body with AI flow...`);
    const processedData = await processHungerboxEmail({ emailBody });

    if (!processedData.isRelevantEmail || !processedData.saleDate || !processedData.totalAmount) {
        await gmail.users.messages.modify({ userId: 'me', id: messageId, requestBody: { removeLabelIds: ['UNREAD'] } });
        return NextResponse.json({ message: "Email was not a relevant sales summary. Marked as read." }, { status: 200 });
    }

    const saleDate = new Date(processedData.saleDate);
    const docId = `${processedData.saleDate}_${stallId}`;
    const docRef = adminDb.collection("foodSaleTransactions").doc(docId);
    
    const totalAmount = processedData.totalAmount || 0;
    const saleData = {
        saleDate: Timestamp.fromDate(saleDate),
        lunch: { hungerbox: totalAmount, upi: 0, other: 0 },
        breakfast: { hungerbox: 0, upi: 0, other: 0 },
        dinner: { hungerbox: 0, upi: 0, other: 0 },
        snacks: { hungerbox: 0, upi: 0, other: 0 },
        totalAmount: totalAmount,
        notes: processedData.notes || `Imported from Gmail on ${new Date().toLocaleDateString()}`,
        siteId: siteId, stallId: stallId,
        recordedByUid: callingUser.uid, recordedByName: callingUser.displayName || callingUser.email,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    
    await setDoc(docRef, saleData, { merge: true });

    await gmail.users.messages.modify({ userId: 'me', id: messageId, requestBody: { removeLabelIds: ['UNREAD'] } });
    console.log(`${LOG_PREFIX} Email ${messageId} processed and marked as read.`);
    
    await logFoodStallActivity(callingUser, {
        siteId: siteId, stallId: stallId, type: 'SALE_RECORDED_OR_UPDATED',
        relatedDocumentId: docId,
        details: { notes: `Successfully imported sales of INR ${totalAmount.toFixed(2)} for ${processedData.saleDate} from Gmail.` }
    });

    return NextResponse.json({ message: `Successfully imported sales of INR ${totalAmount.toFixed(2)} for ${processedData.saleDate}.` }, { status: 200 });

  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error:`, error);
    if (error.code === 'auth/id-token-expired') {
        return NextResponse.json({ error: 'Authentication token expired.' }, { status: 401 });
    }
    return NextResponse.json({ error: 'An unexpected server error occurred.', details: error.message }, { status: 500 });
  }
}
