
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { initializeApp, getApps, getApp, App as AdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { google, Auth, sheets_v4 } from 'googleapis';
import type { UserGoogleOAuthTokens } from '@/types'; // Ensure this type is defined

// Firebase Admin SDK Initialization
let adminApp: AdminApp;
let adminDb: ReturnType<typeof getAdminFirestore>;

if (!getApps().length) {
  try {
    // Option 1: Using GOOGLE_APPLICATION_CREDENTIALS (recommended for deployed environments)
    adminApp = initializeApp();
    console.log("Firebase Admin SDK initialized successfully in API proxy route.");
  } catch (e: any) {
    console.error("Firebase Admin SDK initialization error in API proxy route:", e.message);
  }
} else {
  adminApp = getApp();
  console.log("Firebase Admin SDK already initialized, got existing instance in API proxy route.");
}

if (adminApp!) {
    adminDb = getAdminFirestore(adminApp);
} else {
    console.error("CRITICAL: Firebase Admin App is not initialized in API proxy. Firestore Admin DB cannot be obtained.");
}

// Google OAuth2 Client Setup
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI; // This should point to your /api/auth/google/callback

let oauth2Client: Auth.OAuth2Client | null = null;
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI) {
    oauth2Client = new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI
    );
    console.log("Google OAuth2 client configured in API proxy route.");
} else {
    console.error("CRITICAL: Google OAuth2 client credentials (ID, Secret, Redirect URI) are not configured in API proxy. Sheets API integration will not work.");
}

export async function POST(request: NextRequest) {
  if (!adminApp || !adminDb) {
    return NextResponse.json({ error: 'Firebase Admin SDK not properly initialized on server.' }, { status: 500 });
  }
  if (!oauth2Client) {
    return NextResponse.json({ error: 'Google OAuth2 client not configured on server.' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { action, dataType, sheetId, data: importData } = body;

    const authorizationHeader = request.headers.get('Authorization');
    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing or invalid Firebase ID token.' }, { status: 401 });
    }
    const idToken = authorizationHeader.split('Bearer ')[1];

    let decodedToken;
    try {
      decodedToken = await getAdminAuth(adminApp).verifyIdToken(idToken);
    } catch (error) {
      console.error('Error verifying Firebase ID token:', error);
      return NextResponse.json({ error: 'Unauthorized: Invalid Firebase ID token.' }, { status: 401 });
    }
    const uid = decodedToken.uid;
    console.log(`Authenticated user UID: ${uid} attempting action: ${action} for dataType: ${dataType}`);

    // Retrieve Stored Google OAuth Tokens for the User
    const userGoogleTokensRef = adminDb.collection('userGoogleOAuthTokens').doc(uid);
    const userTokensDoc = await userGoogleTokensRef.get();

    if (!userTokensDoc.exists || !userTokensDoc.data()?.access_token) {
      console.log(`User ${uid} needs Google Sheets authorization. No tokens found or access_token missing.`);
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/spreadsheets'],
        prompt: 'consent', // Force consent for new refresh_token, or 'select_account consent'
        state: uid, // Pass Firebase UID in state to identify user in callback
      });
      return NextResponse.json({ error: 'Google Sheets authorization required.', needsAuth: true, authUrl: authUrl }, { status: 403 });
    }

    const storedTokens = userTokensDoc.data() as UserGoogleOAuthTokens;
    oauth2Client.setCredentials(storedTokens);

    // Handle Token Refresh (Simplified)
    // googleapis library attempts to refresh automatically if refresh_token is present and access_token is expired.
    // For more explicit control, you can check expiry_date and call oauth2Client.refreshAccessToken()
    if (storedTokens.expiry_date && storedTokens.expiry_date < (Date.now() + 60000) && storedTokens.refresh_token) { // If expires in next minute
        try {
            console.log(`Access token for user ${uid} expired or will expire soon, attempting refresh.`);
            const { credentials } = await oauth2Client.refreshAccessToken();
            // Update stored tokens with new access_token and potentially new expiry_date
            const updatedTokens: Partial<UserGoogleOAuthTokens> = {
                access_token: credentials.access_token,
                expiry_date: credentials.expiry_date,
            };
            // If a new refresh token is issued (rare, but possible), store it too.
            if (credentials.refresh_token) {
                updatedTokens.refresh_token = credentials.refresh_token;
            }
            await userGoogleTokensRef.update(updatedTokens);
            oauth2Client.setCredentials(credentials); // Use the newly refreshed credentials
            console.log(`Tokens refreshed and updated for user ${uid}.`);
        } catch (refreshError: any) {
            console.error(`Failed to refresh access token for user ${uid}:`, refreshError.message);
            // If refresh fails (e.g., refresh token revoked), user needs to re-authorize.
            const authUrl = oauth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: ['https://www.googleapis.com/auth/spreadsheets'],
                prompt: 'consent',
                state: uid,
            });
            return NextResponse.json({ error: 'Failed to refresh Google authorization. Please re-authorize.', needsAuth: true, authUrl: authUrl }, { status: 403 });
        }
    }
    
    console.log(`User ${uid} has Google OAuth tokens. Proceeding with action: ${action}`);
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    switch (action) {
      case 'importStockItems':
        // TODO: Implement actual import logic
        // 1. Validate `sheetId`.
        // 2. Use `sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: 'Sheet1!A:Z' })`.
        // 3. Parse `response.data.values`.
        // 4. Validate and transform data to match StockItem schema.
        // 5. Batch write to Firestore `stockItems` collection.
        console.log(`TODO: Implement importStockItems from sheet '${sheetId}' for user ${uid}.`);
        return NextResponse.json({ message: `Stock items import from sheet '${sheetId}' initiated (placeholder). Full backend implementation required.` });

      case 'exportStockItems':
        // TODO: Implement actual export logic
        // 1. Fetch stock items from Firestore (e.g., `adminDb.collection('stockItems').where('siteId', '==', activeSiteId)` if site context is needed).
        // 2. Format data into a 2D array (`values`) for Sheets.
        // 3. If `sheetId` is provided: `sheets.spreadsheets.values.update()` or `clear()` then `append()`.
        // 4. If `sheetId` is NOT provided: Create a new sheet using `sheets.spreadsheets.create()` then `append()`.
        console.log(`TODO: Implement exportStockItems to sheet (ID: ${sheetId || 'new sheet'}) for user ${uid}.`);
        return NextResponse.json({ message: `Stock items export to sheet (ID: ${sheetId || 'new sheet'}) initiated (placeholder). Full backend implementation required.` });
      
      case 'importSalesHistory':
        console.log(`TODO: Implement importSalesHistory from sheet '${sheetId}' for user ${uid}.`);
        return NextResponse.json({ message: `Sales history import from sheet '${sheetId}' initiated (placeholder). User UID: ${uid}. Full backend implementation required.` });

      case 'exportSalesHistory':
        console.log(`TODO: Implement exportSalesHistory to sheet (ID: ${sheetId || 'new sheet'}) for user ${uid}.`);
        return NextResponse.json({ message: `Sales history export to sheet (ID: ${sheetId || 'new sheet'}) initiated (placeholder). User UID: ${uid}. Full backend implementation required.` });

      default:
        return NextResponse.json({ error: 'Invalid action specified.' }, { status: 400 });
    }

  } catch (error: any) {
    console.error('Error in Google Sheets proxy API:', error);
     if (error.code === 401 || error.message.toLowerCase().includes('unauthorized') || error.message.toLowerCase().includes('token') || (error.response?.data?.error === 'invalid_grant' || error.response?.data?.error === 'unauthorized_client')) {
        // This can happen if refresh token is invalid/revoked, or access token is malformed/expired and refresh fails.
        // Clear stored tokens for the user and re-trigger the auth flow.
        if (decodedToken?.uid) { // Check if uid was successfully decoded before this error occurred
            await adminDb.collection('userGoogleOAuthTokens').doc(decodedToken.uid).delete().catch(delErr => console.error("Failed to delete stale tokens:", delErr));
        }
        const authUrl = oauth2Client.generateAuthUrl({ 
            access_type: 'offline', 
            scope: ['https://www.googleapis.com/auth/spreadsheets'], 
            prompt: 'consent',
            state: decodedToken?.uid || "unknown_user_retrying_auth" // Pass UID if available
        });
        return NextResponse.json({ error: 'Google authorization is invalid or expired. Please re-authorize.', needsAuth: true, authUrl: authUrl }, { status: 403 });
    }
    return NextResponse.json({ error: error.message || 'An unexpected error occurred on the server.' }, { status: 500 });
  }
}
