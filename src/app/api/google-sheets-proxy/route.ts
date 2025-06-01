
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
    adminApp = initializeApp();
    console.log("Firebase Admin SDK initialized successfully.");
  } catch (e: any) {
    console.error("Firebase Admin SDK initialization error:", e.message);
    // If admin SDK fails, we can't proceed securely.
    // Consider how to handle this critical failure in a production app.
  }
} else {
  adminApp = getApp();
}
// const adminDb = getAdminFirestore(adminApp); // If needed for admin operations

// ====================================================================================
// Google OAuth2 Client Setup
// ====================================================================================
// These should be set as environment variables in your backend environment.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
// This is the URL Google will redirect to after user authorization.
// It must be registered in your Google Cloud Console OAuth 2.0 Client settings.
// This endpoint (e.g., /api/auth/google/callback) would handle token exchange.
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

let oauth2Client: Auth.OAuth2Client | null = null;
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI) {
    oauth2Client = new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI
    );
} else {
    console.error("CRITICAL: Google OAuth2 client credentials (ID, Secret, Redirect URI) are not configured in environment variables. Sheets API integration will not work.");
}

export async function POST(request: NextRequest) {
  if (!oauth2Client) {
    return NextResponse.json({ error: 'Google OAuth2 client not configured on server.' }, { status: 500 });
  }
  if (!adminApp) {
    return NextResponse.json({ error: 'Firebase Admin SDK not initialized on server.' }, { status: 500 });
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
    console.log(`Authenticated user UID: ${uid} for action: ${action} on ${dataType}`);

    // ================================================================================
    // TODO: OAuth Token Management & Google Sheets API Interaction
    // ================================================================================
    //
    // 1. Retrieve Stored OAuth Tokens for the User:
    //    - You need to store the user's Google OAuth access_token and refresh_token
    //      securely (e.g., in Firestore, associated with their UID, potentially encrypted).
    //    - Example:
    //      // const userTokens = await adminDb.collection('userGoogleTokens').doc(uid).get();
    //      // if (!userTokens.exists || !userTokens.data()?.accessToken) {
    //      //   // If no tokens, generate auth URL and tell client to redirect
    //      //   const authUrl = oauth2Client.generateAuthUrl({
    //      //     access_type: 'offline', // 'offline' to get a refresh token
    //      //     scope: ['https://www.googleapis.com/auth/spreadsheets'],
    //      //     prompt: 'consent', // Optional: force consent screen
    //      //   });
    //      //   return NextResponse.json({ error: 'Authorization required', needsAuth: true, authUrl: authUrl }, { status: 403 });
    //      // }
    //      // oauth2Client.setCredentials(userTokens.data()); // Set tokens on oauth2Client
    //
    //      // Handle token refresh if access_token is expired using refresh_token
    //      // oauth2Client.on('tokens', (tokens) => {
    //      //   if (tokens.refresh_token) { /* store new refresh_token */ }
    //      //   /* store new access_token and expiry_date */
    //      //   adminDb.collection('userGoogleTokens').doc(uid).set(tokens, { merge: true });
    //      // });
    //      // await oauth2Client.getAccessToken(); // This might refresh if needed

    // For this placeholder, we'll assume tokens are somehow set or proceed to API call directly
    // In a real app, the authUrl redirect flow needs to be handled by the client and a separate callback API route.
    
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    console.log(`Placeholder API: Processing action '${action}' for data type '${dataType}' with sheetId '${sheetId}' for user ${uid}.`);
    console.log('REMINDER: Implement full OAuth 2.0 flow, token storage/retrieval, and actual Google Sheets API interaction.');

    switch (action) {
      case 'importStockItems':
        // TODO:
        // 1. Ensure user has provided a `sheetId`.
        // 2. Use `sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: 'Sheet1!A1:Z' })` to read data.
        // 3. Parse the `values` array from the response.
        // 4. Validate data against your StockItem schema.
        // 5. For each valid item, create or update a document in Firestore's `stockItems` collection.
        //    (Use batch writes for efficiency if importing many items).
        return NextResponse.json({ message: `Stock items import from sheet '${sheetId}' initiated (placeholder). User UID: ${uid}. Full backend implementation required.` });

      case 'exportStockItems':
        // TODO:
        // 1. Fetch all stock items from Firestore for the user/context.
        //    // const stockItemsSnapshot = await adminDb.collection('stockItems').get(); // Add user/site/stall filters
        //    // const stockItems = stockItemsSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
        // 2. Format `stockItems` into a 2D array (rows and columns) for Sheets. Include headers.
        //    // const values = [["ID", "Name", "Category", ...], ...stockItems.map(item => [item.id, item.name, ...])];
        // 3. If `sheetId` is provided, update that sheet. If not, create a new sheet:
        //    // const spreadsheet = await sheets.spreadsheets.create({ resource: { properties: { title: 'StallSync Stock Export' } } });
        //    // const newSheetId = spreadsheet.data.spreadsheetId;
        // 4. Use `sheets.spreadsheets.values.update({ spreadsheetId: (sheetId || newSheetId), range: 'Sheet1!A1', valueInputOption: 'USER_ENTERED', resource: { values } })`
        //    or `sheets.spreadsheets.values.append(...)`.
        return NextResponse.json({ message: `Stock items export to sheet (ID: ${sheetId || 'new sheet'}) initiated (placeholder). User UID: ${uid}. Full backend implementation required.` });

      case 'importSalesHistory':
        // TODO: Similar to importStockItems, but for `salesTransactions`.
        //    Consider how to handle nested item arrays in Sheets (e.g., JSON string in a cell, or separate sheets).
        return NextResponse.json({ message: `Sales history import from sheet '${sheetId}' initiated (placeholder). User UID: ${uid}. Full backend implementation required.` });

      case 'exportSalesHistory':
        // TODO: Similar to exportStockItems, but for `salesTransactions`.
        return NextResponse.json({ message: `Sales history export to sheet (ID: ${sheetId || 'new sheet'}) initiated (placeholder). User UID: ${uid}. Full backend implementation required.` });

      default:
        return NextResponse.json({ error: 'Invalid action specified.' }, { status: 400 });
    }

  } catch (error: any) {
    console.error('Error in Google Sheets proxy API:', error);
    return NextResponse.json({ error: error.message || 'An unexpected error occurred on the server.' }, { status: 500 });
  }
}
