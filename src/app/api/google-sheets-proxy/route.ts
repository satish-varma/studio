
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { initializeApp, getApps, getApp, App as AdminApp, ServiceAccount } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore, Timestamp as AdminTimestamp } from 'firebase-admin/firestore'; // Added AdminTimestamp
import { google, Auth, sheets_v4 } from 'googleapis';
import type { UserGoogleOAuthTokens, StockItem, SaleTransaction } from '@/types';

// Firebase Admin SDK Initialization
let adminApp: AdminApp;
let adminDb: ReturnType<typeof getAdminFirestore>;

if (!getApps().length) {
  try {
    // Option 1: Using GOOGLE_APPLICATION_CREDENTIALS (recommended for deployed environments)
    // Ensure this environment variable is set in your Firebase Functions or App Hosting environment.
    // adminApp = initializeApp();
    
    // Option 2: Explicitly providing credentials (useful for some local setups or specific environments)
    // Replace with your actual service account key details or path if using this method.
    // This is less common if GOOGLE_APPLICATION_CREDENTIALS is set.
    // const serviceAccount = require('../../../../path/to/your/serviceAccountKey.json'); // Adjust path
    // adminApp = initializeApp({ credential: cert(serviceAccount) });

    // For Cloud Workstations or environments where GOOGLE_APPLICATION_CREDENTIALS might not be auto-picked up
    // for Admin SDK by default, but are available for other Google Cloud services.
    adminApp = initializeApp(); // This should work if GOOGLE_APPLICATION_CREDENTIALS is set
    console.log("Firebase Admin SDK initialized successfully in API proxy route.");
  } catch (e: any) {
    console.error("Firebase Admin SDK initialization error in API proxy route:", e.message);
    // If using local credentials and it fails, you might log e.code, e.message
  }
} else {
  adminApp = getApp();
  console.log("Firebase Admin SDK already initialized, got existing instance in API proxy route.");
}

if (adminApp!) { // The ! asserts adminApp is not null/undefined here
    adminDb = getAdminFirestore(adminApp);
} else {
    console.error("CRITICAL: Firebase Admin App is not initialized in API proxy. Firestore Admin DB cannot be obtained.");
}

// Google OAuth2 Client Setup
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI; // e.g., http://localhost:9002/api/auth/google/callback

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

const STOCK_ITEMS_HEADERS = ["ID", "Name", "Category", "Quantity", "Unit", "Price", "Low Stock Threshold", "Image URL", "Last Updated", "Site ID", "Stall ID"];
const SALES_HISTORY_HEADERS = ["Transaction ID", "Date", "Staff Name", "Staff ID", "Total Amount", "Site ID", "Stall ID", "Items (JSON)"];


export async function POST(request: NextRequest) {
  if (!adminApp || !adminDb) {
    return NextResponse.json({ error: 'Firebase Admin SDK not properly initialized on server.' }, { status: 500 });
  }
  if (!oauth2Client) {
    return NextResponse.json({ error: 'Google OAuth2 client not configured on server.' }, { status: 500 });
  }

  let uid: string;
  try {
    const body = await request.json();
    const { action, dataType, sheetId, sheetName = 'Sheet1', data: importData } = body; // sheetName for import/export range

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
    uid = decodedToken.uid;
    console.log(`Authenticated user UID: ${uid} attempting action: ${action} for dataType: ${dataType}`);

    // Retrieve Stored Google OAuth Tokens for the User
    const userGoogleTokensRef = adminDb.collection('userGoogleOAuthTokens').doc(uid);
    const userTokensDoc = await userGoogleTokensRef.get();

    if (!userTokensDoc.exists || !userTokensDoc.data()?.access_token) {
      console.log(`User ${uid} needs Google Sheets authorization. No tokens found or access_token missing.`);
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/spreadsheets'],
        prompt: 'consent', 
        state: uid, 
      });
      return NextResponse.json({ error: 'Google Sheets authorization required.', needsAuth: true, authUrl: authUrl }, { status: 403 });
    }

    const storedTokens = userTokensDoc.data() as UserGoogleOAuthTokens;
    oauth2Client.setCredentials(storedTokens);

    // Handle Token Refresh
    if (storedTokens.expiry_date && storedTokens.expiry_date < (Date.now() + 60000) && storedTokens.refresh_token) {
        try {
            console.log(`Access token for user ${uid} expired or will expire soon, attempting refresh.`);
            const { credentials } = await oauth2Client.refreshAccessToken();
            const updatedTokens: Partial<UserGoogleOAuthTokens> = {
                access_token: credentials.access_token,
                expiry_date: credentials.expiry_date,
            };
            if (credentials.refresh_token) { // A new refresh token might be issued
                updatedTokens.refresh_token = credentials.refresh_token;
            }
            await userGoogleTokensRef.update(updatedTokens);
            oauth2Client.setCredentials(credentials); 
            console.log(`Tokens refreshed and updated for user ${uid}.`);
        } catch (refreshError: any) {
            console.error(`Failed to refresh access token for user ${uid}:`, refreshError.message);
            if (refreshError.response?.data?.error === 'invalid_grant') {
                // Refresh token is invalid or revoked. User needs to re-authorize.
                await userGoogleTokensRef.delete().catch(delErr => console.error("Failed to delete stale tokens after invalid_grant:", delErr));
                 const authUrl = oauth2Client.generateAuthUrl({
                    access_type: 'offline', scope: ['https://www.googleapis.com/auth/spreadsheets'], prompt: 'consent', state: uid,
                });
                return NextResponse.json({ error: 'Google authorization is invalid (refresh failed). Please re-authorize.', needsAuth: true, authUrl: authUrl }, { status: 403 });
            }
            return NextResponse.json({ error: 'Failed to refresh Google access token.', details: refreshError.message }, { status: 500 });
        }
    }
    
    console.log(`User ${uid} has Google OAuth tokens. Proceeding with action: ${action}`);
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    let spreadsheetIdToUse = sheetId;

    switch (action) {
      case 'importStockItems':
        if (!sheetId) return NextResponse.json({ error: 'Sheet ID is required for import.' }, { status: 400 });
        try {
            const range = `${sheetName}!A:Z`; // Adjust range as needed
            const response = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
            const rows = response.data.values;
            if (!rows || rows.length === 0) {
                return NextResponse.json({ message: 'No data found in the sheet or sheet is empty.' });
            }
            // TODO: Implement parsing of `rows` (skip header row).
            // TODO: Validate each row against StockItem schema.
            // TODO: Transform data to match Firestore StockItem structure.
            // TODO: Perform batch write to Firestore `stockItems` collection.
            //       Be careful with overwriting existing items or creating new ones. Consider using item IDs as keys.
            console.log(`TODO: Implement importStockItems from sheet '${sheetId}', range '${range}' for user ${uid}. ${rows.length} rows found.`);
            return NextResponse.json({ message: `Stock items import from sheet '${sheetId}' initiated. ${rows.length -1} data rows found (assuming header). Full backend logic for parsing and saving needed.` });
        } catch (e: any) {
            console.error(`Error importing stock items for user ${uid}:`, e.message);
            return NextResponse.json({ error: 'Failed to import stock items from Google Sheet.', details: e.message }, { status: 500 });
        }

      case 'exportStockItems':
        try {
            const stockItemsSnapshot = await adminDb.collection('stockItems').orderBy('name').get();
            const stockItems: StockItem[] = stockItemsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockItem));
            
            const values = [STOCK_ITEMS_HEADERS];
            stockItems.forEach(item => {
                values.push([
                    item.id,
                    item.name,
                    item.category,
                    item.quantity.toString(),
                    item.unit,
                    item.price.toString(),
                    item.lowStockThreshold.toString(),
                    item.imageUrl || "",
                    item.lastUpdated ? new Date(item.lastUpdated).toLocaleString('en-IN') : "",
                    item.siteId || "",
                    item.stallId || ""
                ]);
            });

            if (!spreadsheetIdToUse) {
                const newSheet = await sheets.spreadsheets.create({
                    requestBody: { properties: { title: `StallSync Stock Items Export ${new Date().toISOString()}` } }
                });
                spreadsheetIdToUse = newSheet.data.spreadsheetId;
                if (!spreadsheetIdToUse) throw new Error("Failed to create new Google Sheet.");
                 await sheets.spreadsheets.values.update({
                    spreadsheetId: spreadsheetIdToUse,
                    range: `${sheetName}!A1`, // Start from A1
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values },
                });
                return NextResponse.json({ message: `Stock items exported successfully to new sheet.`, spreadsheetId: spreadsheetIdToUse, url: `https://docs.google.com/spreadsheets/d/${spreadsheetIdToUse}` });
            } else {
                await sheets.spreadsheets.values.clear({ spreadsheetId: spreadsheetIdToUse, range: sheetName }); // Clear existing sheet
                await sheets.spreadsheets.values.update({
                    spreadsheetId: spreadsheetIdToUse,
                    range: `${sheetName}!A1`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values },
                });
                return NextResponse.json({ message: `Stock items exported successfully to existing sheet.`, spreadsheetId: spreadsheetIdToUse, url: `https://docs.google.com/spreadsheets/d/${spreadsheetIdToUse}` });
            }
        } catch (e: any) {
            console.error(`Error exporting stock items for user ${uid}:`, e.message);
            return NextResponse.json({ error: 'Failed to export stock items to Google Sheet.', details: e.message }, { status: 500 });
        }
      
      case 'importSalesHistory':
        if (!sheetId) return NextResponse.json({ error: 'Sheet ID is required for import.' }, { status: 400 });
        try {
            const range = `${sheetName}!A:Z`;
            const response = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
            const rows = response.data.values;
            if (!rows || rows.length === 0) {
                return NextResponse.json({ message: 'No data found in the sheet or sheet is empty.' });
            }
            // TODO: Implement parsing of `rows` (skip header).
            // TODO: Validate each row against SaleTransaction schema (especially date formats, numbers, JSON for items).
            // TODO: Transform data to match Firestore SaleTransaction structure (convert dates to Timestamps).
            // TODO: Perform batch write to Firestore `salesTransactions` collection.
            console.log(`TODO: Implement importSalesHistory from sheet '${sheetId}', range '${range}' for user ${uid}. ${rows.length} rows found.`);
            return NextResponse.json({ message: `Sales history import from sheet '${sheetId}' initiated. ${rows.length -1} data rows found (assuming header). Full backend logic needed.` });
        } catch (e: any) {
            console.error(`Error importing sales history for user ${uid}:`, e.message);
            return NextResponse.json({ error: 'Failed to import sales history from Google Sheet.', details: e.message }, { status: 500 });
        }

      case 'exportSalesHistory':
        try {
            const salesSnapshot = await adminDb.collection('salesTransactions').where('isDeleted', '==', false).orderBy('transactionDate', 'desc').get();
            const sales: SaleTransaction[] = salesSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                  id: doc.id,
                  ...data,
                  transactionDate: (data.transactionDate as AdminTimestamp).toDate().toISOString(),
                } as SaleTransaction;
            });

            const values = [SALES_HISTORY_HEADERS];
            sales.forEach(sale => {
                values.push([
                    sale.id,
                    new Date(sale.transactionDate).toLocaleString('en-IN'),
                    sale.staffName || "N/A",
                    sale.staffId,
                    sale.totalAmount.toString(),
                    sale.siteId || "",
                    sale.stallId || "",
                    JSON.stringify(sale.items) // Items array as JSON string
                ]);
            });

             if (!spreadsheetIdToUse) {
                const newSheet = await sheets.spreadsheets.create({
                    requestBody: { properties: { title: `StallSync Sales History Export ${new Date().toISOString()}` } }
                });
                spreadsheetIdToUse = newSheet.data.spreadsheetId;
                if (!spreadsheetIdToUse) throw new Error("Failed to create new Google Sheet.");
                await sheets.spreadsheets.values.update({
                    spreadsheetId: spreadsheetIdToUse,
                    range: `${sheetName}!A1`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values },
                });
                return NextResponse.json({ message: `Sales history exported successfully to new sheet.`, spreadsheetId: spreadsheetIdToUse, url: `https://docs.google.com/spreadsheets/d/${spreadsheetIdToUse}` });
            } else {
                await sheets.spreadsheets.values.clear({ spreadsheetId: spreadsheetIdToUse, range: sheetName });
                await sheets.spreadsheets.values.update({
                    spreadsheetId: spreadsheetIdToUse,
                    range: `${sheetName}!A1`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values },
                });
                return NextResponse.json({ message: `Sales history exported successfully to existing sheet.`, spreadsheetId: spreadsheetIdToUse, url: `https://docs.google.com/spreadsheets/d/${spreadsheetIdToUse}` });
            }
        } catch (e: any)            {
            console.error(`Error exporting sales history for user ${uid}:`, e.message);
            return NextResponse.json({ error: 'Failed to export sales history to Google Sheet.', details: e.message }, { status: 500 });
        }

      default:
        return NextResponse.json({ error: 'Invalid action specified.' }, { status: 400 });
    }

  } catch (error: any) {
    console.error('Error in Google Sheets proxy API:', error);
    // Check if uid was decoded before this error, needed for re-auth flow
    // Note: `uid` might not be defined if the error occurred before token verification
    const currentUid = typeof uid === 'string' ? uid : "unknown_user_retrying_auth";

    if (error.code === 401 || error.message?.toLowerCase().includes('unauthorized') || error.message?.toLowerCase().includes('token') || (error.response?.data?.error === 'invalid_grant' || error.response?.data?.error === 'unauthorized_client')) {
        if (currentUid !== "unknown_user_retrying_auth" && adminDb) { // Only attempt delete if uid is known
            await adminDb.collection('userGoogleOAuthTokens').doc(currentUid).delete().catch(delErr => console.error("Failed to delete stale tokens:", delErr));
        }
        const authUrl = oauth2Client.generateAuthUrl({ 
            access_type: 'offline', 
            scope: ['https://www.googleapis.com/auth/spreadsheets'], 
            prompt: 'consent',
            state: currentUid 
        });
        return NextResponse.json({ error: 'Google authorization is invalid or expired. Please re-authorize.', needsAuth: true, authUrl: authUrl }, { status: 403 });
    }
    return NextResponse.json({ error: error.message || 'An unexpected error occurred on the server.' }, { status: 500 });
  }
}
