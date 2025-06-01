
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { initializeApp, cert, getApps, getApp, App } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { google, Auth, sheets_v4 } from 'googleapis';

// ====================================================================================
// Firebase Admin SDK Initialization
// ====================================================================================
let adminApp: App;
let adminDb: ReturnType<typeof getAdminFirestore>;

if (!getApps().length) {
  try {
    // Option 1: Using GOOGLE_APPLICATION_CREDENTIALS environment variable (recommended for deployed environments)
    // Ensure this environment variable points to the path of your service account key JSON file.
    // adminApp = initializeApp();

    // Option 2: Explicitly using a service account key (useful for local development if GOOGLE_APPLICATION_CREDENTIALS is not set)
    // IMPORTANT: Replace with the actual path to your service account key JSON file.
    // DO NOT COMMIT THE ACTUAL KEY FILE TO YOUR REPOSITORY.
    // const serviceAccount = require('@/../../path/to/your-serviceAccountKey.json'); // Adjust path as needed
    // adminApp = initializeApp({ credential: cert(serviceAccount) });
    
    // Fallback/Default: Attempt to initialize without explicit credentials (relies on GOOGLE_APPLICATION_CREDENTIALS)
    adminApp = initializeApp();
    console.log("Firebase Admin SDK initialized successfully in API route.");
  } catch (e: any) {
    console.error("Firebase Admin SDK initialization error in API route:", e.message);
    // If admin SDK fails, we can't proceed securely.
    // Consider if you want to throw here or let requests fail later.
  }
} else {
  adminApp = getApp();
  console.log("Firebase Admin SDK already initialized, got existing instance in API route.");
}

if (adminApp!) { // The '!' asserts adminApp is defined after the try-catch block or getApp()
    adminDb = getAdminFirestore(adminApp);
} else {
    console.error("CRITICAL: Firebase Admin App is not initialized. Firestore Admin DB cannot be obtained.");
}


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
  if (!adminApp || !adminDb) {
    return NextResponse.json({ error: 'Firebase Admin SDK not properly initialized on server.' }, { status: 500 });
  }
  if (!oauth2Client) {
    return NextResponse.json({ error: 'Google OAuth2 client not configured on server.' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { action, dataType, sheetId, data: importData } = body; // `data` would be for import

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
    // OAuth Token Management - CRUCIAL IMPLEMENTATION NEEDED
    // ================================================================================
    // TODO:
    // 1. Retrieve Stored Google OAuth Tokens for the User (from Firestore, associated with `uid`)
    //    These tokens (access_token, refresh_token, expiry_date) should have been stored
    //    after the user successfully completed the OAuth flow via your /api/auth/google/callback route.
    
    // Example placeholder for token retrieval:
    // const userGoogleTokensRef = adminDb.collection('userGoogleOAuthTokens').doc(uid);
    // const userTokensDoc = await userGoogleTokensRef.get();
    //
    // if (!userTokensDoc.exists || !userTokensDoc.data()?.access_token) {
    //   // If no tokens, or access_token is missing
    //   // Generate auth URL and tell client to redirect for authorization
    //   const authUrl = oauth2Client.generateAuthUrl({
    //     access_type: 'offline', // 'offline' to get a refresh_token
    //     scope: ['https://www.googleapis.com/auth/spreadsheets'], // Scope for Google Sheets
    //     prompt: 'consent', // Optional: force consent screen for testing, remove for production if refresh token is stored
    //   });
    //   console.log(`User ${uid} needs Google Sheets authorization. Auth URL: ${authUrl}`);
    //   return NextResponse.json({ error: 'Google Sheets authorization required.', needsAuth: true, authUrl: authUrl }, { status: 403 });
    // }
    //
    // const storedTokens = userTokensDoc.data() as Auth.Credentials;
    // oauth2Client.setCredentials(storedTokens);

    // 2. Handle Token Refresh (if access_token is expired, use refresh_token)
    //    The googleapis library can sometimes handle this automatically if refresh_token is set.
    //    Or, you might need to explicitly check expiry and refresh.
    //
    //    oauth2Client.on('tokens', (newTokens) => {
    //      if (newTokens.refresh_token) {
    //        // If a new refresh token is issued, update it in Firestore
    //        storedTokens.refresh_token = newTokens.refresh_token;
    //      }
    //      storedTokens.access_token = newTokens.access_token;
    //      storedTokens.expiry_date = newTokens.expiry_date;
    //      // Update the tokens in Firestore for the user
    //      // await userGoogleTokensRef.set(storedTokens, { merge: true });
    //      console.log('Tokens refreshed and updated in store for user:', uid);
    //    });
    //
    //    // Before making an API call, ensure tokens are fresh (simplified check):
    //    // if (storedTokens.expiry_date && storedTokens.expiry_date < Date.now() + 60000) { // If expires in next minute
    //    //   console.log('Access token expired or will expire soon, attempting refresh for user:', uid);
    //    //   await oauth2Client.refreshAccessToken(); // This will trigger the 'tokens' event if successful
    //    // }
    //    // More robust: try the call, and if it fails with an auth error, then refresh and retry.

    // For this placeholder, we'll simulate the need for auth if not 'exporting' as a simple example
    // In a real app, you'd check for valid, non-expired tokens from your token store.
    const MOCK_USER_HAS_TOKENS = action === 'exportStockItems' || action === 'exportSalesHistory'; 

    if (!MOCK_USER_HAS_TOKENS) { // Replace this with actual token check
        const authUrl = oauth2Client.generateAuthUrl({
           access_type: 'offline',
           scope: ['https://www.googleapis.com/auth/spreadsheets'],
           prompt: 'consent',
         });
        console.log(`User ${uid} (simulated) needs Google Sheets authorization for action '${action}'. Auth URL: ${authUrl}`);
        return NextResponse.json({ error: 'Google Sheets authorization required.', needsAuth: true, authUrl: authUrl }, { status: 403 });
    }
    console.log(`User ${uid} (simulated to have) has Google OAuth tokens for action '${action}'.`);


    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    // --- Actual Google Sheets API Interaction Logic (Placeholders) ---
    console.log(`Placeholder API: Processing action '${action}' for data type '${dataType}' with sheetId '${sheetId}' for user ${uid}.`);
    console.log('REMINDER: Implement full OAuth 2.0 flow (callback, token storage/retrieval) and actual Google Sheets API interaction.');

    switch (action) {
      case 'importStockItems':
        // TODO:
        // 1. Validate `sheetId`.
        // 2. Use `sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: 'Sheet1!A:Z' })` (adjust range and sheet name).
        // 3. Parse `response.data.values`.
        // 4. Validate and transform data to match your StockItem schema.
        // 5. Batch write to Firestore `stockItems` collection.
        //    Ensure items are associated with the correct user, siteId, stallId if applicable.
        //    Consider transactional writes if updating existing items or creating new ones based on Sheet data.
        return NextResponse.json({ message: `Stock items import from sheet '${sheetId}' initiated (placeholder). User UID: ${uid}. Full backend implementation required.` });

      case 'exportStockItems':
        // TODO:
        // 1. Fetch stock items from Firestore. Filter by user, `siteId`, `stallId` as appropriate.
        //    Example: const stockItemsSnapshot = await adminDb.collection('stockItems').where('uid', '==', uid).get(); // Adjust query
        //    const stockItemsData = stockItemsSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
        // 2. Format `stockItemsData` into a 2D array (`values`) for Sheets. Include headers as the first row.
        // 3. Handle `sheetId`:
        //    - If `sheetId` is provided: Use `sheets.spreadsheets.values.update()` or `clear()` then `append()`.
        //    - If `sheetId` is NOT provided: Create a new sheet:
        //      // const spreadsheet = await sheets.spreadsheets.create({ resource: { properties: { title: 'StallSync Stock Export' } } });
        //      // const newSheetId = spreadsheet.data.spreadsheetId;
        //      // Use `sheets.spreadsheets.values.append({ spreadsheetId: newSheetId, range: 'Sheet1', valueInputOption: 'USER_ENTERED', resource: { values } })`
        //      // Return the newSheetId or a link to it.
        return NextResponse.json({ message: `Stock items export to sheet (ID: ${sheetId || 'new sheet'}) initiated (placeholder). User UID: ${uid}. Full backend implementation required.` });

      case 'importSalesHistory':
        // TODO: Similar to importStockItems, but for `salesTransactions`.
        // 1. Validate `sheetId`.
        // 2. Get data from sheet.
        // 3. Parse and validate.
        // 4. Batch write to Firestore `salesTransactions` collection.
        return NextResponse.json({ message: `Sales history import from sheet '${sheetId}' initiated (placeholder). User UID: ${uid}. Full backend implementation required.` });

      case 'exportSalesHistory':
        // TODO: Similar to exportStockItems, but for `salesTransactions`.
        // 1. Fetch sales transactions from Firestore.
        // 2. Format data.
        // 3. Create new sheet or update existing one.
        return NextResponse.json({ message: `Sales history export to sheet (ID: ${sheetId || 'new sheet'}) initiated (placeholder). User UID: ${uid}. Full backend implementation required.` });

      default:
        return NextResponse.json({ error: 'Invalid action specified.' }, { status: 400 });
    }

  } catch (error: any) {
    console.error('Error in Google Sheets proxy API:', error);
    if (error.code === 401 || (error.response?.data?.error === 'invalid_grant' || error.response?.data?.error === 'unauthorized_client')) {
        // This can happen if refresh token is invalid, revoked, or access token is malformed/expired and refresh fails.
        // TODO: You must clear the stored tokens for the user and re-trigger the auth flow.
        // Example: await adminDb.collection('userGoogleOAuthTokens').doc(uid).delete();
        const authUrl = oauth2Client.generateAuthUrl({ 
            access_type: 'offline', 
            scope: ['https://www.googleapis.com/auth/spreadsheets'], 
            prompt: 'consent' // Force re-consent
        });
        return NextResponse.json({ error: 'Google authorization is invalid or expired. Please re-authorize.', needsAuth: true, authUrl: authUrl }, { status: 403 });
    }
    return NextResponse.json({ error: error.message || 'An unexpected error occurred on the server.' }, { status: 500 });
  }
}
    