
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

if (!getApps().length) {
  try {
    // Attempt to use GOOGLE_APPLICATION_CREDENTIALS first if set in the environment
    adminApp = initializeApp();
    console.log("Firebase Admin SDK initialized successfully in API proxy route (using GOOGLE_APPLICATION_CREDENTIALS or default discovery). Project ID:", adminApp.options.projectId);
  } catch (e: any) {
    console.warn("Firebase Admin SDK default initialization failed in API proxy route:", e.message, "Attempting with local credentials if available (ensure serviceAccountKey.json exists and path is correct if uncommented).");
    // Fallback for local development if serviceAccountKey.json is available
    // IMPORTANT: Ensure 'serviceAccountKey.json' is in your .gitignore and NOT committed.
    // try {
    //   const serviceAccount = require('../../../../serviceAccountKey.json'); // Adjust path as needed
    //   adminApp = initializeApp({ credential: cert(serviceAccount) });
    //   console.log("Firebase Admin SDK initialized successfully in API proxy route (using local serviceAccountKey.json). Project ID:", adminApp.options.projectId);
    // } catch (localInitError: any) {
    //    console.error("CRITICAL: Firebase Admin SDK local initialization with serviceAccountKey.json also failed:", localInitError.message);
    // }
    if (!adminApp!) { // Check if adminApp is still not initialized
         console.error("CRITICAL: Firebase Admin SDK could not be initialized. Verify GOOGLE_APPLICATION_CREDENTIALS environment variable or local service account key setup.");
    }
  }
} else {
  adminApp = getApp();
  console.log("Firebase Admin SDK already initialized, got existing instance in API proxy route. Project ID:", adminApp.options.projectId);
}

if (adminApp!) {
    adminDb = getAdminFirestore(adminApp);
} else {
    console.error("CRITICAL: Firebase Admin App is not initialized in API proxy. Firestore Admin DB cannot be obtained. Further operations will likely fail.");
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
    console.log("Google OAuth2 client configured in API proxy route.");
} else {
    console.error("CRITICAL: Google OAuth2 client credentials (ID, Secret, Redirect URI) are not configured in API proxy. Sheets API integration will not work. Check .env.local or environment variables.");
}

const STOCK_ITEMS_HEADERS = ["ID", "Name", "Category", "Quantity", "Unit", "Price", "Low Stock Threshold", "Image URL", "Site ID", "Stall ID"];
const SALES_HISTORY_HEADERS = ["Transaction ID (Sheet)", "Date", "Staff Name", "Staff ID", "Total Amount", "Site ID", "Stall ID", "Items (JSON)"];


export async function POST(request: NextRequest) {
  // Initial checks for critical services
  if (!adminApp || !adminDb) {
    console.error("/api/google-sheets-proxy: Firebase Admin SDK not properly initialized on server.");
    return NextResponse.json({ error: 'Server Error: Firebase Admin SDK not properly initialized.' }, { status: 500 });
  }
  if (!oauth2Client) {
     console.error("/api/google-sheets-proxy: Google OAuth2 client not configured on server.");
    return NextResponse.json({ error: 'Server Error: Google OAuth2 client not configured.' }, { status: 500 });
  }

  let uid: string;
  try {
    const body = await request.json();
    const { action, dataType, sheetId, sheetName = 'Sheet1' } = body;

    const authorizationHeader = request.headers.get('Authorization');
    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
      console.warn("/api/google-sheets-proxy: Authorization header missing or malformed.");
      return NextResponse.json({ error: 'Unauthorized: Missing or invalid Firebase ID token.' }, { status: 401 });
    }
    const idToken = authorizationHeader.split('Bearer ')[1];

    let decodedToken;
    try {
      // Verify the ID token using the initialized adminApp
      // CRITICAL: adminApp must be for the *same* Firebase project as the client app that generated the token.
      console.log("/api/google-sheets-proxy: Verifying ID token with Admin SDK for project:", adminApp.options.projectId);
      decodedToken = await getAdminAuth(adminApp).verifyIdToken(idToken);
      console.log("/api/google-sheets-proxy: ID Token verified successfully for UID:", decodedToken.uid);
    } catch (error: any) {
      console.error('Error verifying Firebase ID token in /api/google-sheets-proxy:', error.message);
      console.error('Details:', error.code, error);
      return NextResponse.json({ error: 'Unauthorized: Invalid Firebase ID token. Possible project mismatch or token issue.', details: error.message }, { status: 401 });
    }
    uid = decodedToken.uid;

    // Retrieve user's Google OAuth tokens from Firestore
    const userGoogleTokensRef = adminDb.collection('userGoogleOAuthTokens').doc(uid);
    const userTokensDoc = await userGoogleTokensRef.get();

    if (!userTokensDoc.exists || !userTokensDoc.data()?.access_token) {
      console.log(`/api/google-sheets-proxy: Google OAuth tokens not found for user ${uid}. Generating auth URL.`);
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/spreadsheets'],
        prompt: 'consent', // Force consent screen to ensure refresh_token is granted
        state: uid, // Pass Firebase UID to identify user in callback
      });
      return NextResponse.json({ error: 'Google Sheets authorization required.', needsAuth: true, authUrl: authUrl }, { status: 403 });
    }

    let storedTokens = userTokensDoc.data() as UserGoogleOAuthTokens;
    oauth2Client.setCredentials(storedTokens);

    // Check if access token is expired and refresh if necessary
    if (storedTokens.expiry_date && storedTokens.expiry_date < (Date.now() + 60000)) { // 60-second buffer
      if (storedTokens.refresh_token) {
        try {
          console.log(`/api/google-sheets-proxy: Access token for user ${uid} potentially expired, attempting refresh.`);
          const { credentials } = await oauth2Client.refreshAccessToken();
          console.log(`/api/google-sheets-proxy: Access token refreshed for user ${uid}.`);
          const updatedTokens: Partial<UserGoogleOAuthTokens> = {
            access_token: credentials.access_token,
            expiry_date: credentials.expiry_date,
            // Google might provide a new refresh_token (rarely)
            ...(credentials.refresh_token && { refresh_token: credentials.refresh_token }),
            ...(credentials.id_token && { id_token: credentials.id_token }),
            ...(credentials.scope && { scope: credentials.scope }),
          };
          await userGoogleTokensRef.update(updatedTokens);
          oauth2Client.setCredentials(credentials); // Update client with new credentials
          storedTokens = { ...storedTokens, ...updatedTokens } as UserGoogleOAuthTokens; // Update local copy
        } catch (refreshError: any) {
          console.error(`/api/google-sheets-proxy: Failed to refresh access token for user ${uid}:`, refreshError.response?.data || refreshError.message);
          if (refreshError.response?.data?.error === 'invalid_grant') {
            // The refresh token is invalid (e.g., revoked by user). Delete stored tokens and force re-auth.
            await userGoogleTokensRef.delete().catch(delErr => console.error("Failed to delete stale tokens:", delErr));
            const authUrl = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: ['https://www.googleapis.com/auth/spreadsheets'], prompt: 'consent', state: uid });
            return NextResponse.json({ error: 'Google authorization is invalid. Please re-authorize.', needsAuth: true, authUrl: authUrl }, { status: 403 });
          }
          // For other refresh errors, treat as a temporary issue
          return NextResponse.json({ error: 'Failed to refresh Google access token.', details: refreshError.message }, { status: 500 });
        }
      } else {
        // No refresh token, and access token expired. Force re-auth.
        console.warn(`/api/google-sheets-proxy: Access token expired for user ${uid}, but no refresh token available. Forcing re-auth.`);
        await userGoogleTokensRef.delete().catch(delErr => console.error("Failed to delete stale tokens for re-auth:", delErr));
        const authUrl = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: ['https://www.googleapis.com/auth/spreadsheets'], prompt: 'consent', state: uid });
        return NextResponse.json({ error: 'Google authorization expired. Please re-authorize.', needsAuth: true, authUrl: authUrl }, { status: 403 });
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
            const range = `${sheetName}!A:Z`; // Assuming data is in the first sheet, columns A-Z
            const response = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
            const rows = response.data.values;

            if (!rows || rows.length === 0) {
                return NextResponse.json({ message: 'No data found in the sheet.' });
            }
            const headerRowFromSheet = rows[0].map(h => h.trim());
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
                try {
                    const itemData: any = {};
                    STOCK_ITEMS_HEADERS.forEach((header, index) => {
                        // Normalize header to a key (e.g., "Low Stock Threshold" -> "lowStockThreshold")
                        const key = header.toLowerCase().replace(/\s\(.*\)/g, '').replace(/\s+/g, '_').replace(/_([a-z])/g, (g) => g[1].toUpperCase());
                        itemData[key] = row[index] !== undefined ? row[index] : null;
                    });

                    const parsedItem = {
                        name: itemData.name || "",
                        category: itemData.category || "",
                        quantity: itemData.quantity !== null ? parseInt(itemData.quantity, 10) : 0,
                        unit: itemData.unit || "pcs",
                        price: itemData.price !== null ? parseFloat(itemData.price) : 0.0,
                        lowStockThreshold: itemData.low_stock_threshold !== null ? parseInt(itemData.low_stock_threshold, 10) : 0,
                        imageUrl: itemData.image_url || "",
                        siteId: itemData.site_id || null, // Ensure these are handled if not present
                        stallId: itemData.stall_id || null,
                    };

                    // Validate using Zod (excluding 'id' and 'lastUpdated' from schema for create)
                    stockItemSchema.parse(parsedItem); // Zod will throw if invalid

                    const dataToSave = {
                        ...parsedItem,
                        lastUpdated: AdminTimestamp.now().toDate().toISOString(), // Server-set timestamp
                    };
                    
                    let docRef;
                    const sheetProvidedId = itemData.id ? String(itemData.id).trim() : null;
                    if (sheetProvidedId && sheetProvidedId !== "") {
                        docRef = adminDb.collection('stockItems').doc(sheetProvidedId);
                        batch.set(docRef, dataToSave, { merge: true }); // Update or create if ID provided
                    } else {
                        docRef = adminDb.collection('stockItems').doc(); // Let Firestore auto-generate ID
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
            const headerRowFromSheet = rows[0].map(h => h.trim());
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
                const saleData: any = {};
                SALES_HISTORY_HEADERS.forEach((header, index) => {
                     const key = header.toLowerCase().replace(/\s\(.*\)/g, '').replace(/\s+/g, '_').replace(/_([a-z])/g, (g) => g[1].toUpperCase());
                     saleData[key] = row[index] !== undefined ? row[index] : null;
                });

                try {
                    if (!saleData.date || !saleData.staffId || !saleData.totalAmount || !saleData.itemsJson) {
                        throw new Error("Missing required fields (Date, Staff ID, Total Amount, Items JSON).");
                    }
                    
                    let transactionDateTimestamp: AdminTimestamp;
                    try {
                        const parsedDate = new Date(saleData.date);
                        if (isNaN(parsedDate.getTime())) throw new Error("Invalid date format.");
                        transactionDateTimestamp = AdminTimestamp.fromDate(parsedDate);
                    } catch (dateError: any) {
                        throw new Error(`Invalid Date: ${saleData.date}. ${dateError.message}`);
                    }
                    
                    const totalAmount = parseFloat(saleData.totalAmount);
                    if (isNaN(totalAmount)) throw new Error(`Invalid Total Amount: ${saleData.totalAmount}.`);

                    let items: SoldItem[];
                    try {
                        items = JSON.parse(saleData.itemsJson);
                        if (!Array.isArray(items)) throw new Error("Items JSON must be an array.");
                        items.forEach((item, idx) => { // Basic validation for each sold item
                            if (typeof item.itemId !== 'string' || typeof item.name !== 'string' || 
                                typeof item.quantity !== 'number' || isNaN(item.quantity) ||
                                typeof item.pricePerUnit !== 'number' || isNaN(item.pricePerUnit) ||
                                typeof item.totalPrice !== 'number' || isNaN(item.totalPrice) ) {
                                throw new Error(`Invalid structure/type for sold item at index ${idx} in Items JSON.`);
                            }
                        });
                    } catch (jsonError: any) {
                        throw new Error(`Error parsing Items JSON: ${jsonError.message}. Value: ${saleData.itemsJson}`);
                    }

                    const dataToSave: Omit<SaleTransaction, 'id' | 'transactionDate'> & { transactionDate: AdminTimestamp } = {
                        transactionDate: transactionDateTimestamp,
                        staffId: String(saleData.staffId),
                        staffName: saleData.staffName ? String(saleData.staffName) : null,
                        totalAmount: totalAmount,
                        items: items,
                        isDeleted: false,
                        siteId: saleData.siteId ? String(saleData.siteId) : null,
                        stallId: saleData.stallId ? String(saleData.stallId) : null,
                    };
                    
                    const saleDocRef = adminDb.collection('salesTransactions').doc(); // Always create new sale
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
                  // Ensure transactionDate is converted to ISO string if it's a Firestore Timestamp
                  transactionDate: (data.transactionDate instanceof AdminTimestamp ? data.transactionDate.toDate() : new Date(data.transactionDate)).toISOString(),
                } as SaleTransaction;
            });

            const values = [SALES_HISTORY_HEADERS];
            salesData.forEach(sale => {
                values.push([
                    sale.id, // Firestore ID as Transaction ID for export reference
                    new Date(sale.transactionDate).toLocaleString('en-IN'), // Format date nicely
                    sale.staffName || "N/A",
                    sale.staffId,
                    sale.totalAmount.toString(),
                    sale.siteId || "",
                    sale.stallId || "",
                    JSON.stringify(sale.items) // Items as JSON string
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
    // General error handling for the entire request processing
    console.error(`Error in Google Sheets proxy API for user ${uid || 'unknown_user'}:`, error.message, error.stack);
    const currentUid = typeof uid === 'string' ? uid : "unknown_user_needs_reauth"; // Provide a default for state if uid is not yet set

    // Check for specific Google Auth errors that might require re-authentication
    if (error.code === 401 || // Typically from our own checks
        error.message?.toLowerCase().includes('unauthorized') ||
        error.message?.toLowerCase().includes('token') ||
        (error.response?.data?.error === 'invalid_grant') || // From Google
        (error.response?.data?.error === 'unauthorized_client')) { // From Google
        
        if (currentUid !== "unknown_user_needs_reauth" && adminDb && oauth2Client) {
            // Attempt to delete potentially stale tokens to force re-auth on next attempt
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

