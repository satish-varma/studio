
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { initializeApp, getApps, getApp, App as AdminApp, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore, Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { google, Auth, sheets_v4 } from 'googleapis';
import type { UserGoogleOAuthTokens, StockItem, SaleTransaction, SoldItem } from '@/types';
import { stockItemSchema } from '@/types/item'; // Import Zod schema for stock items

// Firebase Admin SDK Initialization
let adminApp: AdminApp;
let adminDb: ReturnType<typeof getAdminFirestore>;

console.log("/api/google-sheets-proxy: Attempting Firebase Admin SDK initialization...");
if (!getApps().length) {
  try {
    // Default initialization relies on GOOGLE_APPLICATION_CREDENTIALS env var
    adminApp = initializeApp();
    console.log("/api/google-sheets-proxy: Firebase Admin SDK initialized successfully (using GOOGLE_APPLICATION_CREDENTIALS or default discovery).");
  } catch (e: any) {
    console.error("/api/google-sheets-proxy: Firebase Admin SDK default initialization failed:", e.message);
    // Fallback for local development if serviceAccountKey.json is available
    // Ensure 'serviceAccountKey.json' is in your .gitignore and NOT committed.
    // try {
    //   const serviceAccount = require('../../../../service_account.json'); // Adjust path as needed
    //   adminApp = initializeApp({ credential: cert(serviceAccount) });
    //   console.log("/api/google-sheets-proxy: Firebase Admin SDK initialized successfully (using local service_account.json).");
    // } catch (localInitError: any) {
    //    console.error("/api/google-sheets-proxy: CRITICAL - Firebase Admin SDK local initialization with service_account.json also failed:", localInitError.message);
    // }
    if (!adminApp!) { // Check if adminApp is still not initialized
         console.error("/api/google-sheets-proxy: CRITICAL - Firebase Admin SDK could not be initialized. Verify GOOGLE_APPLICATION_CREDENTIALS environment variable or local service account key setup.");
    }
  }
} else {
  adminApp = getApp();
  console.log("/api/google-sheets-proxy: Firebase Admin SDK already initialized, got existing instance.");
}

if (adminApp!) {
    adminDb = getAdminFirestore(adminApp);
    console.log("/api/google-sheets-proxy: Firestore Admin DB obtained for project:", adminApp.options.projectId || "Project ID not available in options");
} else {
    console.error("/api/google-sheets-proxy: CRITICAL - Firebase Admin App is not initialized. Firestore Admin DB cannot be obtained. Further operations will likely fail.");
}

// Google OAuth2 Client Setup - Ensure these are set in your environment variables
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
    console.log("/api/google-sheets-proxy: Google OAuth2 client configured.");
} else {
    console.error("/api/google-sheets-proxy: CRITICAL - Google OAuth2 client credentials (ID, Secret, Redirect URI) are not configured. Sheets API integration will not work. Check .env.local or environment variables.");
}

const STOCK_ITEMS_HEADERS = ["ID", "Name", "Category", "Quantity", "Unit", "Price", "Low Stock Threshold", "Image URL", "Site ID", "Stall ID"];
const SALES_HISTORY_HEADERS = ["Transaction ID (Sheet)", "Date", "Staff Name", "Staff ID", "Total Amount", "Site ID", "Stall ID", "Items (JSON)"];


export async function POST(request: NextRequest) {
  // Initial checks for critical services
  if (!adminApp || !adminDb) {
    console.error("/api/google-sheets-proxy: Firebase Admin SDK not properly initialized on server when POST request received.");
    return NextResponse.json({ error: 'Server Error: Firebase Admin SDK not properly initialized.' }, { status: 500 });
  }
  if (!oauth2Client) {
     console.error("/api/google-sheets-proxy: Google OAuth2 client not configured on server when POST request received.");
    return NextResponse.json({ error: 'Server Error: Google OAuth2 client not configured.' }, { status: 500 });
  }

  let uid: string;
  try {
    const body = await request.json();
    const { action, dataType, sheetId, sheetName = 'Sheet1' } = body;
    console.log(`/api/google-sheets-proxy: Received action: ${action}, dataType: ${dataType}, sheetId: ${sheetId}`);

    const authorizationHeader = request.headers.get('Authorization');
    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
      console.warn("/api/google-sheets-proxy: Authorization header missing or malformed.");
      return NextResponse.json({ error: 'Unauthorized: Missing or invalid Firebase ID token.' }, { status: 401 });
    }
    const idToken = authorizationHeader.split('Bearer ')[1];
    console.log("/api/google-sheets-proxy: Received ID token from client (first 20 chars):", idToken.substring(0, 20) + "...");

    let decodedToken;
    try {
      console.log("/api/google-sheets-proxy: Verifying ID token with Admin SDK for project:", adminApp.options.projectId);
      decodedToken = await getAdminAuth(adminApp).verifyIdToken(idToken);
      uid = decodedToken.uid;
      console.log("/api/google-sheets-proxy: ID Token verified successfully for UID:", uid);
    } catch (error: any) {
      console.error('/api/google-sheets-proxy: Error verifying Firebase ID token:', error.message);
      console.error('/api/google-sheets-proxy: Token verification error details:', error.code, error);
      return NextResponse.json({ error: 'Unauthorized: Invalid Firebase ID token. Please re-authenticate.', details: error.message }, { status: 401 });
    }

    // Retrieve user's Google OAuth tokens from Firestore
    const userGoogleTokensRef = adminDb.collection('userGoogleOAuthTokens').doc(uid);
    const userTokensDoc = await userGoogleTokensRef.get();

    if (!userTokensDoc.exists || !userTokensDoc.data()?.access_token) {
      console.log(`/api/google-sheets-proxy: Google OAuth tokens not found for user ${uid}. Generating auth URL.`);
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/spreadsheets'],
        prompt: 'consent', 
        state: uid, // Pass Firebase UID to identify user in callback
      });
      return NextResponse.json({ error: 'Google Sheets authorization required.', needsAuth: true, authUrl: authUrl }, { status: 403 });
    }

    let storedTokens = userTokensDoc.data() as UserGoogleOAuthTokens;
    oauth2Client.setCredentials(storedTokens);
    console.log(`/api/google-sheets-proxy: Set stored Google OAuth credentials for user ${uid}.`);

    // Check if access token is expired and refresh if necessary
    if (storedTokens.expiry_date && storedTokens.expiry_date < (Date.now() + 60000)) { // 60-second buffer
      if (storedTokens.refresh_token) {
        try {
          console.log(`/api/google-sheets-proxy: Access token for user ${uid} potentially expired (expiry: ${new Date(storedTokens.expiry_date).toISOString()}), attempting refresh.`);
          const { credentials } = await oauth2Client.refreshAccessToken();
          console.log(`/api/google-sheets-proxy: Access token refreshed for user ${uid}. New expiry: ${credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : 'N/A'}`);
          
          const updatedTokens: Partial<UserGoogleOAuthTokens> = {
            access_token: credentials.access_token,
            expiry_date: credentials.expiry_date,
            ...(credentials.refresh_token && { refresh_token: credentials.refresh_token }),
            ...(credentials.id_token && { id_token: credentials.id_token }),
            ...(credentials.scope && { scope: credentials.scope }),
          };
          await userGoogleTokensRef.update(updatedTokens);
          oauth2Client.setCredentials(credentials); 
          storedTokens = { ...storedTokens, ...updatedTokens } as UserGoogleOAuthTokens; 
          console.log(`/api/google-sheets-proxy: Updated tokens stored in Firestore for user ${uid}.`);
        } catch (refreshError: any) {
          console.error(`/api/google-sheets-proxy: Failed to refresh access token for user ${uid}:`, refreshError.response?.data || refreshError.message);
          if (refreshError.response?.data?.error === 'invalid_grant') {
            await userGoogleTokensRef.delete().catch(delErr => console.error("Failed to delete stale tokens:", delErr));
            const authUrl = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: ['https://www.googleapis.com/auth/spreadsheets'], prompt: 'consent', state: uid });
            return NextResponse.json({ error: 'Google authorization is invalid (refresh token). Please re-authorize.', needsAuth: true, authUrl: authUrl }, { status: 403 });
          }
          return NextResponse.json({ error: 'Failed to refresh Google access token.', details: refreshError.message }, { status: 500 });
        }
      } else {
        console.warn(`/api/google-sheets-proxy: Access token expired for user ${uid}, but no refresh token available. Forcing re-auth.`);
        await userGoogleTokensRef.delete().catch(delErr => console.error("Failed to delete stale tokens for re-auth:", delErr));
        const authUrl = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: ['https://www.googleapis.com/auth/spreadsheets'], prompt: 'consent', state: uid });
        return NextResponse.json({ error: 'Google authorization expired (no refresh token). Please re-authorize.', needsAuth: true, authUrl: authUrl }, { status: 403 });
      }
    }
    
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    let spreadsheetIdToUse = sheetId;

    // --- ACTION SWITCH ---
    switch (action) {
      case 'importStockItems':
        if (!sheetId) return NextResponse.json({ error: 'Sheet ID is required for import.' }, { status: 400 });
        try {
            console.log(`/api/google-sheets-proxy: Importing stock items from sheet ${sheetId} for user ${uid}.`);
            const range = `${sheetName}!A:Z`; 
            const response = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
            const rows = response.data.values;

            if (!rows || rows.length === 0) {
                return NextResponse.json({ message: 'No data found in the sheet.' });
            }
            const headerRowFromSheet = rows[0].map(h => String(h || "").trim());
            if (JSON.stringify(headerRowFromSheet) !== JSON.stringify(STOCK_ITEMS_HEADERS)) {
                 const errorMsg = `Sheet header mismatch. Expected: [${STOCK_ITEMS_HEADERS.join(", ")}]. Found: [${headerRowFromSheet.join(", ")}]`;
                 console.error("/api/google-sheets-proxy: " + errorMsg);
                 return NextResponse.json({ error: 'Sheet header mismatch.', details: errorMsg }, { status: 400 });
            }

            const batch = adminDb.batch();
            const errors: { row: number; message: string; data: any[] }[] = [];
            let importedCount = 0;

            for (let i = 1; i < rows.length; i++) { // Start from 1 to skip header
                const row = rows[i];
                if (row.every(cell => cell === null || cell === undefined || String(cell).trim() === "")) continue; // Skip empty rows

                try {
                    const itemDataFromSheet: Record<string, any> = {};
                    STOCK_ITEMS_HEADERS.forEach((header, index) => {
                        const key = header.toLowerCase().replace(/\s\(.*\)/g, '').replace(/\s+/g, '_').replace(/_([a-z])/g, (g) => g[1].toUpperCase());
                        itemDataFromSheet[key] = row[index] !== undefined ? row[index] : null;
                    });

                    const parsedItem = {
                        name: String(itemDataFromSheet.name || ""),
                        category: String(itemDataFromSheet.category || ""),
                        quantity: itemDataFromSheet.quantity !== null ? parseInt(String(itemDataFromSheet.quantity), 10) : 0,
                        unit: String(itemDataFromSheet.unit || "pcs"),
                        price: itemDataFromSheet.price !== null ? parseFloat(String(itemDataFromSheet.price)) : 0.0,
                        lowStockThreshold: itemDataFromSheet.lowStockThreshold !== null ? parseInt(String(itemDataFromSheet.lowStockThreshold), 10) : 0,
                        imageUrl: String(itemDataFromSheet.imageUrl || ""),
                        siteId: itemDataFromSheet.siteId ? String(itemDataFromSheet.siteId) : null, 
                        stallId: itemDataFromSheet.stallId ? String(itemDataFromSheet.stallId) : null,
                    };
                    
                    stockItemSchema.parse(parsedItem); // Zod will throw if invalid

                    const dataToSave = {
                        ...parsedItem,
                        lastUpdated: AdminTimestamp.now().toDate().toISOString(), 
                    };
                    
                    const sheetProvidedId = itemDataFromSheet.id ? String(itemDataFromSheet.id).trim() : null;
                    let docRef;
                    if (sheetProvidedId && sheetProvidedId !== "") {
                        docRef = adminDb.collection('stockItems').doc(sheetProvidedId);
                        batch.set(docRef, dataToSave, { merge: true }); 
                    } else {
                        docRef = adminDb.collection('stockItems').doc(); 
                        batch.set(docRef, dataToSave);
                    }
                    importedCount++;
                } catch (e: any) {
                    errors.push({ row: i + 1, message: e.message || 'Validation/Parsing failed.', data: row });
                }
            }
            
            if (importedCount > 0) {
                await batch.commit();
            }
            console.log(`/api/google-sheets-proxy: Stock import complete for user ${uid}. Imported: ${importedCount}, Errors: ${errors.length}`);
            return NextResponse.json({ 
                message: `Stock items import processed. ${importedCount} items imported/updated. ${errors.length} rows had issues.`,
                importedCount, 
                errors 
            });

        } catch (e: any) {
            console.error(`Error importing stock items for user ${uid}:`, e.message, e.stack);
            return NextResponse.json({ error: 'Failed to import stock items from Google Sheet.', details: e.message }, { status: 500 });
        }

      case 'exportStockItems':
        try {
            console.log(`/api/google-sheets-proxy: Exporting stock items for user ${uid}. Sheet ID provided: ${spreadsheetIdToUse}`);
            const stockItemsSnapshot = await adminDb.collection('stockItems').orderBy('name').get();
            const stockItemsData: StockItem[] = stockItemsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockItem));
            
            const values = [STOCK_ITEMS_HEADERS];
            stockItemsData.forEach(item => {
                values.push([
                    item.id,
                    item.name,
                    item.category,
                    item.quantity.toString(),
                    item.unit,
                    item.price.toString(),
                    item.lowStockThreshold.toString(),
                    item.imageUrl || "",
                    item.siteId || "",
                    item.stallId || ""
                ]);
            });

            if (!spreadsheetIdToUse) {
                const newSheet = await sheets.spreadsheets.create({
                    requestBody: { properties: { title: `StallSync Stock Items Export ${new Date().toISOString().split('T')[0]}` } }
                });
                spreadsheetIdToUse = newSheet.data.spreadsheetId;
                if (!spreadsheetIdToUse) throw new Error("Failed to create new Google Sheet.");
                 await sheets.spreadsheets.values.update({
                    spreadsheetId: spreadsheetIdToUse, range: `${sheetName}!A1`, valueInputOption: 'USER_ENTERED', requestBody: { values },
                });
                console.log(`/api/google-sheets-proxy: Stock exported to new sheet ${spreadsheetIdToUse} for user ${uid}.`);
                return NextResponse.json({ message: `Stock items exported successfully to new sheet.`, spreadsheetId: spreadsheetIdToUse, url: `https://docs.google.com/spreadsheets/d/${spreadsheetIdToUse}` });
            } else {
                await sheets.spreadsheets.values.clear({ spreadsheetId: spreadsheetIdToUse, range: sheetName });
                await sheets.spreadsheets.values.update({
                    spreadsheetId: spreadsheetIdToUse, range: `${sheetName}!A1`, valueInputOption: 'USER_ENTERED', requestBody: { values },
                });
                 console.log(`/api/google-sheets-proxy: Stock exported to existing sheet ${spreadsheetIdToUse} for user ${uid}.`);
                return NextResponse.json({ message: `Stock items exported successfully to existing sheet.`, spreadsheetId: spreadsheetIdToUse, url: `https://docs.google.com/spreadsheets/d/${spreadsheetIdToUse}` });
            }
        } catch (e: any) {
            console.error(`Error exporting stock items for user ${uid}:`, e.message, e.stack);
            return NextResponse.json({ error: 'Failed to export stock items to Google Sheet.', details: e.message }, { status: 500 });
        }
      
      case 'importSalesHistory':
        if (!sheetId) return NextResponse.json({ error: 'Sheet ID is required for sales import.' }, { status: 400 });
        try {
            console.log(`/api/google-sheets-proxy: Importing sales history from sheet ${sheetId} for user ${uid}.`);
            const range = `${sheetName}!A:Z`;
            const response = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
            const rows = response.data.values;

            if (!rows || rows.length === 0) {
                return NextResponse.json({ message: 'No data found in the sheet.' });
            }
            const headerRowFromSheet = rows[0].map(h => String(h || "").trim());
            if (JSON.stringify(headerRowFromSheet) !== JSON.stringify(SALES_HISTORY_HEADERS)) {
                 const errorMsg = `Sales sheet header mismatch. Expected: [${SALES_HISTORY_HEADERS.join(", ")}]. Found: [${headerRowFromSheet.join(", ")}]`;
                 console.error("/api/google-sheets-proxy: " + errorMsg);
                 return NextResponse.json({ error: 'Sales sheet header mismatch.', details: errorMsg }, { status: 400 });
            }
            
            const batch = adminDb.batch();
            const errors: { row: number; message: string; data: any[] }[] = [];
            let importedCount = 0;

            for (let i = 1; i < rows.length; i++) { // Start from 1 to skip header
                const row = rows[i];
                if (row.every(cell => cell === null || cell === undefined || String(cell).trim() === "")) continue; // Skip empty rows

                const saleDataFromSheet: Record<string, any> = {};
                SALES_HISTORY_HEADERS.forEach((header, index) => {
                     const key = header.toLowerCase().replace(/\s\(.*\)/g, '').replace(/\s+/g, '_').replace(/_([a-z])/g, (g) => g[1].toUpperCase());
                     saleDataFromSheet[key] = row[index] !== undefined ? row[index] : null;
                });

                try {
                    if (!saleDataFromSheet.date || !saleDataFromSheet.staffId || !saleDataFromSheet.totalAmount || !saleDataFromSheet.itemsJson) {
                        throw new Error("Missing required fields (Date, Staff ID, Total Amount, Items JSON).");
                    }
                    
                    let transactionDateTimestamp: AdminTimestamp;
                    try {
                        const parsedDate = new Date(String(saleDataFromSheet.date));
                        if (isNaN(parsedDate.getTime())) throw new Error("Invalid date format.");
                        transactionDateTimestamp = AdminTimestamp.fromDate(parsedDate);
                    } catch (dateError: any) {
                        throw new Error(`Invalid Date: ${saleDataFromSheet.date}. ${dateError.message}`);
                    }
                    
                    const totalAmount = parseFloat(String(saleDataFromSheet.totalAmount));
                    if (isNaN(totalAmount)) throw new Error(`Invalid Total Amount: ${saleDataFromSheet.totalAmount}.`);

                    let items: SoldItem[];
                    try {
                        items = JSON.parse(String(saleDataFromSheet.itemsJson));
                        if (!Array.isArray(items)) throw new Error("Items JSON must be an array.");
                        items.forEach((item, idx) => { 
                            if (typeof item.itemId !== 'string' || typeof item.name !== 'string' || 
                                typeof item.quantity !== 'number' || isNaN(item.quantity) ||
                                typeof item.pricePerUnit !== 'number' || isNaN(item.pricePerUnit) ||
                                typeof item.totalPrice !== 'number' || isNaN(item.totalPrice) ) {
                                throw new Error(`Invalid structure/type for sold item at index ${idx} in Items JSON.`);
                            }
                        });
                    } catch (jsonError: any) {
                        throw new Error(`Error parsing Items JSON: ${jsonError.message}. Value: ${saleDataFromSheet.itemsJson}`);
                    }

                    const dataToSave: Omit<SaleTransaction, 'id' | 'transactionDate'> & { transactionDate: AdminTimestamp } = {
                        transactionDate: transactionDateTimestamp,
                        staffId: String(saleDataFromSheet.staffId),
                        staffName: saleDataFromSheet.staffName ? String(saleDataFromSheet.staffName) : null,
                        totalAmount: totalAmount,
                        items: items,
                        isDeleted: false,
                        siteId: saleDataFromSheet.siteId ? String(saleDataFromSheet.siteId) : null,
                        stallId: saleDataFromSheet.stallId ? String(saleDataFromSheet.stallId) : null,
                    };
                    
                    const saleDocRef = adminDb.collection('salesTransactions').doc(); 
                    batch.set(saleDocRef, dataToSave);
                    importedCount++;
                } catch (e: any) {
                     errors.push({ row: i + 1, message: e.message || 'Validation/Parsing failed for sale.', data: row });
                }
            }
            
            if (importedCount > 0) {
                await batch.commit();
            }
            console.log(`/api/google-sheets-proxy: Sales import complete for user ${uid}. Imported: ${importedCount}, Errors: ${errors.length}`);
            return NextResponse.json({
                message: `Sales history import processed. ${importedCount} transactions imported. ${errors.length} rows had errors.`,
                importedCount,
                errors
            });

        } catch (e: any) {
            console.error(`Error importing sales history for user ${uid}:`, e.message, e.stack);
            return NextResponse.json({ error: 'Failed to import sales history from Google Sheet.', details: e.message }, { status: 500 });
        }

      case 'exportSalesHistory':
        try {
            console.log(`/api/google-sheets-proxy: Exporting sales history for user ${uid}. Sheet ID provided: ${spreadsheetIdToUse}`);
            const salesSnapshot = await adminDb.collection('salesTransactions').where('isDeleted', '==', false).orderBy('transactionDate', 'desc').get();
            const salesData: SaleTransaction[] = salesSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                  id: doc.id,
                  ...data,
                  transactionDate: (data.transactionDate instanceof AdminTimestamp ? data.transactionDate.toDate() : new Date(data.transactionDate)).toISOString(),
                } as SaleTransaction;
            });

            const values = [SALES_HISTORY_HEADERS];
            salesData.forEach(sale => {
                values.push([
                    sale.id, 
                    new Date(sale.transactionDate).toLocaleString('en-IN'), 
                    sale.staffName || "N/A",
                    sale.staffId,
                    sale.totalAmount.toString(),
                    sale.siteId || "",
                    sale.stallId || "",
                    JSON.stringify(sale.items) 
                ]);
            });

             if (!spreadsheetIdToUse) {
                const newSheet = await sheets.spreadsheets.create({
                    requestBody: { properties: { title: `StallSync Sales History Export ${new Date().toISOString().split('T')[0]}` } }
                });
                spreadsheetIdToUse = newSheet.data.spreadsheetId;
                if (!spreadsheetIdToUse) throw new Error("Failed to create new Google Sheet.");
                await sheets.spreadsheets.values.update({
                    spreadsheetId: spreadsheetIdToUse, range: `${sheetName}!A1`, valueInputOption: 'USER_ENTERED', requestBody: { values },
                });
                console.log(`/api/google-sheets-proxy: Sales history exported to new sheet ${spreadsheetIdToUse} for user ${uid}.`);
                return NextResponse.json({ message: `Sales history exported successfully to new sheet.`, spreadsheetId: spreadsheetIdToUse, url: `https://docs.google.com/spreadsheets/d/${spreadsheetIdToUse}` });
            } else {
                await sheets.spreadsheets.values.clear({ spreadsheetId: spreadsheetIdToUse, range: sheetName });
                await sheets.spreadsheets.values.update({
                    spreadsheetId: spreadsheetIdToUse, range: `${sheetName}!A1`, valueInputOption: 'USER_ENTERED', requestBody: { values },
                });
                console.log(`/api/google-sheets-proxy: Sales history exported to existing sheet ${spreadsheetIdToUse} for user ${uid}.`);
                return NextResponse.json({ message: `Sales history exported successfully to existing sheet.`, spreadsheetId: spreadsheetIdToUse, url: `https://docs.google.com/spreadsheets/d/${spreadsheetIdToUse}` });
            }
        } catch (e: any) {
            console.error(`Error exporting sales history for user ${uid}:`, e.message, e.stack);
            return NextResponse.json({ error: 'Failed to export sales history to Google Sheet.', details: e.message }, { status: 500 });
        }

      default:
        console.warn(`/api/google-sheets-proxy: Invalid action specified: ${action}`);
        return NextResponse.json({ error: 'Invalid action specified.' }, { status: 400 });
    }

  } catch (error: any) {
    console.error(`/api/google-sheets-proxy: General error for user ${uid || 'unknown_user'}:`, error.message, error.stack);
    const currentUid = typeof uid === 'string' ? uid : "unknown_user_needs_reauth"; 

    if (error.code === 401 || 
        error.message?.toLowerCase().includes('unauthorized') ||
        error.message?.toLowerCase().includes('token') ||
        (error.response?.data?.error === 'invalid_grant') || 
        (error.response?.data?.error === 'unauthorized_client')) {
        
        if (currentUid !== "unknown_user_needs_reauth" && adminDb && oauth2Client) {
            console.warn(`/api/google-sheets-proxy: OAuth error encountered for user ${currentUid}. Error details:`, error.response?.data || error.message);
            await adminDb.collection('userGoogleOAuthTokens').doc(currentUid).delete().catch(delErr => console.error("Failed to delete stale tokens:", delErr));
            const authUrl = oauth2Client.generateAuthUrl({ 
                access_type: 'offline', scope: ['https://www.googleapis.com/auth/spreadsheets'], prompt: 'consent', state: currentUid 
            });
            return NextResponse.json({ error: 'Google authorization is invalid or expired. Please re-authorize.', needsAuth: true, authUrl: authUrl }, { status: 403 });
        } else if (oauth2Client) {
             const authUrl = oauth2Client.generateAuthUrl({ 
                access_type: 'offline', scope: ['https://www.googleapis.com/auth/spreadsheets'], prompt: 'consent', state: currentUid 
            });
             return NextResponse.json({ error: 'Google authorization is invalid or expired. Please re-authorize.', needsAuth: true, authUrl: authUrl }, { status: 403 });
        }
    }
    return NextResponse.json({ error: error.message || 'An unexpected error occurred on the server.' }, { status: 500 });
  }
}

    