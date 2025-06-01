
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { initializeApp, cert, getApps, getApp, App } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { google, Auth, sheets_v4 } from 'googleapis';

// ====================================================================================
// Firebase Admin SDK Initialization
// ====================================================================================
// IMPORTANT: Ensure your service account key JSON file is available and
// GOOGLE_APPLICATION_CREDENTIALS environment variable is set in your deployment environment.
// For local development, you can point this to the path of your service account key.
// Example: initializeApp({ credential: cert(require('@/path/to/your/serviceAccountKey.json')) });
// If GOOGLE_APPLICATION_CREDENTIALS is set, initializeApp() without arguments works.

let adminApp: App;
if (!getApps().length) {
  try {
    // If GOOGLE_APPLICATION_CREDENTIALS is set in the environment (e.g., Cloud Functions, App Engine),
    // initializeApp() will automatically use it.
    // For local dev, you might need to explicitly pass credentials:
    // const serviceAccount = require('/path/to/your/serviceAccountKey.json');
    // adminApp = initializeApp({ credential: cert(serviceAccount) });
    adminApp = initializeApp();
    console.log("Firebase Admin SDK initialized successfully in API route.");
  } catch (e: any) {
    console.error("Firebase Admin SDK initialization error in API route:", e.message);
    // If admin SDK fails, we can't proceed securely.
  }
} else {
  adminApp = getApp();
  console.log("Firebase Admin SDK already initialized, got existing instance in API route.");
}
// const adminDb = getAdminFirestore(adminApp); // Uncomment if you need to access Firestore from admin SDK

// ====================================================================================
// Google OAuth2 Client Setup
// ====================================================================================
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI; // This is where Google sends the user back after auth

let oauth2Client: Auth.OAuth2Client | null = null;
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI) {
    oauth2Client = new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI
    );
    console.log("Google OAuth2 client configured in API route.");
} else {
    console.error("CRITICAL: Google OAuth2 client credentials (ID, Secret, Redirect URI) are not configured in environment variables. Sheets API integration will not work.");
}

export async function POST(request: NextRequest) {
  if (!adminApp) {
    return NextResponse.json({ error: 'Firebase Admin SDK not initialized on server.' }, { status: 500 });
  }
  if (!oauth2Client) {
    return NextResponse.json({ error: 'Google OAuth2 client not configured on server.' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { action, dataType, sheetId, data } = body; // `data` would be for import

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

    // ================================================================================
    // TODO: OAuth Token Management (Crucial Step for You to Implement)
    // ================================================================================
    // 1. Retrieve Stored Google OAuth Tokens for the User (from Firestore, associated with `uid`)
    //    Example:
    //    const userGoogleTokensRef = adminDb.collection('userGoogleTokens').doc(uid);
    //    const userTokensDoc = await userGoogleTokensRef.get();
    //    if (!userTokensDoc.exists || !userTokensDoc.data()?.access_token) {
    //      // If no tokens, or access_token is missing/expired (need to check expiry too)
    //      // Generate auth URL and tell client to redirect for authorization
    //      const authUrl = oauth2Client.generateAuthUrl({
    //        access_type: 'offline', // 'offline' to get a refresh_token
    //        scope: ['https://www.googleapis.com/auth/spreadsheets'], // Scope for Google Sheets
    //        prompt: 'consent', // Optional: force consent screen for testing, remove for production if refresh token is stored
    //      });
    //      console.log(`User ${uid} needs Google Sheets authorization. Auth URL: ${authUrl}`);
    //      return NextResponse.json({ error: 'Google Sheets authorization required.', needsAuth: true, authUrl: authUrl }, { status: 403 });
    //    }
    //    oauth2Client.setCredentials(userTokensDoc.data() as Auth.Credentials);

    // 2. Handle Token Refresh (if access_token is expired, use refresh_token)
    //    The googleapis library can sometimes handle this automatically if refresh_token is set.
    //    Or, you might need to explicitly check expiry and refresh:
    //    oauth2Client.on('tokens', (tokens) => {
    //      if (tokens.refresh_token) { /* store new refresh_token */ }
    //      /* store new access_token and expiry_date */
    //      userGoogleTokensRef.set(tokens, { merge: true });
    //    });
    //    // Before making an API call, ensure tokens are fresh:
    //    // if (oauth2Client.isTokenExpiring()) { await oauth2Client.refreshAccessToken(); }
    //    // OR simply try the call and catch auth errors to trigger refresh.

    // For this placeholder, we'll simulate the need for auth if not 'exporting' as a simple example
    // In a real app, you'd check for valid, non-expired tokens.
    const MOCK_USER_HAS_TOKENS = action === 'exportStockItems' || action === 'exportSalesHistory'; // Simulate user has tokens only for export

    if (!MOCK_USER_HAS_TOKENS) {
        const authUrl = oauth2Client.generateAuthUrl({
           access_type: 'offline',
           scope: ['https://www.googleapis.com/auth/spreadsheets'],
           prompt: 'consent',
         });
        console.log(`User ${uid} needs Google Sheets authorization for action '${action}'. Auth URL: ${authUrl}`);
        return NextResponse.json({ error: 'Google Sheets authorization required.', needsAuth: true, authUrl: authUrl }, { status: 403 });
    }
    console.log(`User ${uid} (simulated) has Google OAuth tokens for action '${action}'.`);


    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    // --- Actual Google Sheets API Interaction Logic (Placeholders) ---
    console.log(`Placeholder API: Processing action '${action}' for data type '${dataType}' with sheetId '${sheetId}' for user ${uid}.`);
    console.log('REMINDER: Implement full OAuth 2.0 flow (callback, token storage/retrieval) and actual Google Sheets API interaction.');

    switch (action) {
      case 'importStockItems':
        // TODO:
        // 1. Validate `sheetId`.
        // 2. Use `sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: 'Sheet1!A:Z' })` (adjust range as needed).
        // 3. Parse `response.data.values`.
        // 4. Validate and transform data.
        // 5. Batch write to Firestore `stockItems` collection, linking to `siteId` and `stallId` (which you might need to pass from client or derive).
        return NextResponse.json({ message: `Stock items import from sheet '${sheetId}' initiated (placeholder). User UID: ${uid}. Full backend implementation required.` });

      case 'exportStockItems':
        // TODO:
        // 1. Fetch stock items from Firestore (filter by `siteId`, `stallId` if provided by client).
        //    Example: // const stockItemsSnapshot = await adminDb.collection('stockItems').where('uid', '==', uid).get();
        //    // const stockItems = stockItemsSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
        // 2. Format `stockItems` into a 2D array (`values`). Include headers.
        // 3. If `sheetId` is provided, use `sheets.spreadsheets.values.update()`.
        //    If `sheetId` is NOT provided, create a new sheet:
        //    // const spreadsheet = await sheets.spreadsheets.create({ resource: { properties: { title: 'StallSync Stock Export' } } });
        //    // const newSheetId = spreadsheet.data.spreadsheetId;
        //    // Then use `sheets.spreadsheets.values.update({ spreadsheetId: newSheetId, ... })`
        //    // Return the newSheetId or a link to it in the message.
        return NextResponse.json({ message: `Stock items export to sheet (ID: ${sheetId || 'new sheet'}) initiated (placeholder). User UID: ${uid}. Full backend implementation required.` });

      case 'importSalesHistory':
        // TODO: Similar to importStockItems, but for `salesTransactions`.
        return NextResponse.json({ message: `Sales history import from sheet '${sheetId}' initiated (placeholder). User UID: ${uid}. Full backend implementation required.` });

      case 'exportSalesHistory':
        // TODO: Similar to exportStockItems, but for `salesTransactions`.
        return NextResponse.json({ message: `Sales history export to sheet (ID: ${sheetId || 'new sheet'}) initiated (placeholder). User UID: ${uid}. Full backend implementation required.` });

      default:
        return NextResponse.json({ error: 'Invalid action specified.' }, { status: 400 });
    }

  } catch (error: any) {
    console.error('Error in Google Sheets proxy API:', error);
    if (error.response?.data?.error === 'invalid_grant') {
        // This can happen if refresh token is invalid or revoked
        // TODO: You might want to clear the stored tokens for the user and re-trigger the auth flow
        return NextResponse.json({ error: 'Google authorization is invalid. Please re-authorize.', needsAuth: true, authUrl: oauth2Client.generateAuthUrl({ access_type: 'offline', scope: ['https://www.googleapis.com/auth/spreadsheets'], prompt: 'consent' }) }, { status: 403 });
    }
    return NextResponse.json({ error: error.message || 'An unexpected error occurred on the server.' }, { status: 500 });
  }
}

    