
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { initializeApp, getApps, getApp, App as AdminApp, ServiceAccount, cert } from 'firebase-admin/app';
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
    // Attempt to use GOOGLE_APPLICATION_CREDENTIALS first
    adminApp = initializeApp();
    console.log("Firebase Admin SDK initialized successfully in API proxy route (using GOOGLE_APPLICATION_CREDENTIALS or default discovery).");
  } catch (e: any) {
    console.warn("Firebase Admin SDK default initialization failed in API proxy route:", e.message, "Attempting with local credentials if available...");
    try {
        // Fallback for local development if serviceAccountKey.json is available
        // IMPORTANT: Ensure 'serviceAccountKey.json' is in your .gitignore and not committed to your repository.
        // const serviceAccount = require('../../../../serviceAccountKey.json'); // Adjust path as needed
        // adminApp = initializeApp({ credential: cert(serviceAccount) });
        // console.log("Firebase Admin SDK initialized successfully in API proxy route (using local serviceAccountKey.json).");
        // If the above is commented out and GOOGLE_APPLICATION_CREDENTIALS is not set, this will fail.
        // This is a placeholder and you might need to explicitly set GOOGLE_APPLICATION_CREDENTIALS env var.
        if (!adminApp!) { // Check if adminApp is still not initialized
             console.error("CRITICAL: Firebase Admin SDK could not be initialized. GOOGLE_APPLICATION_CREDENTIALS might be missing or local fallback not configured/found.");
        }
    } catch (localInitError: any) {
        console.error("CRITICAL: Firebase Admin SDK local initialization failed:", localInitError.message);
    }
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
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

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

const STOCK_ITEMS_HEADERS = ["ID", "Name", "Category", "Quantity", "Unit", "Price", "Low Stock Threshold", "Image URL", "Site ID", "Stall ID"]; // Last Updated is server-set
const SALES_HISTORY_HEADERS = ["Transaction ID (Sheet)", "Date", "Staff Name", "Staff ID", "Total Amount", "Site ID", "Stall ID", "Items (JSON)"];


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
    const { action, dataType, sheetId, sheetName = 'Sheet1' } = body;

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

    const userGoogleTokensRef = adminDb.collection('userGoogleOAuthTokens').doc(uid);
    const userTokensDoc = await userGoogleTokensRef.get();

    if (!userTokensDoc.exists || !userTokensDoc.data()?.access_token) {
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

    if (storedTokens.expiry_date && storedTokens.expiry_date < (Date.now() + 60000) && storedTokens.refresh_token) {
        try {
            console.log(`Access token for user ${uid} refreshing...`);
            const { credentials } = await oauth2Client.refreshAccessToken();
            const updatedTokens: Partial<UserGoogleOAuthTokens> = {
                access_token: credentials.access_token,
                expiry_date: credentials.expiry_date,
            };
            if (credentials.refresh_token) updatedTokens.refresh_token = credentials.refresh_token;
            await userGoogleTokensRef.update(updatedTokens);
            oauth2Client.setCredentials(credentials);
            console.log(`Tokens refreshed and updated for user ${uid}.`);
        } catch (refreshError: any) {
            console.error(`Failed to refresh access token for user ${uid}:`, refreshError.message);
            if (refreshError.response?.data?.error === 'invalid_grant') {
                await userGoogleTokensRef.delete().catch(delErr => console.error("Failed to delete stale tokens:", delErr));
                const authUrl = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: ['https://www.googleapis.com/auth/spreadsheets'], prompt: 'consent', state: uid });
                return NextResponse.json({ error: 'Google authorization is invalid. Please re-authorize.', needsAuth: true, authUrl: authUrl }, { status: 403 });
            }
            return NextResponse.json({ error: 'Failed to refresh Google access token.', details: refreshError.message }, { status: 500 });
        }
    }
    
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    let spreadsheetIdToUse = sheetId;

    switch (action) {
      case 'importStockItems':
        if (!sheetId) return NextResponse.json({ error: 'Sheet ID is required for import.' }, { status: 400 });
        try {
            const range = `${sheetName}!A:Z`; 
            const response = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
            const rows = response.data.values;
            if (!rows || rows.length <= 1) { // <=1 to account for header row
                return NextResponse.json({ message: 'No data found in the sheet or sheet only contains a header.' });
            }

            const batch = adminDb.batch();
            const importedCount = 0;
            const errors: string[] = [];
            const headerRow = rows[0].map(h => h.trim());
            
            // Validate headers
            if (JSON.stringify(headerRow) !== JSON.stringify(STOCK_ITEMS_HEADERS)) {
                 errors.push(`Sheet header mismatch. Expected: [${STOCK_ITEMS_HEADERS.join(", ")}]. Found: [${headerRow.join(", ")}]`);
                 return NextResponse.json({ 
                    error: 'Sheet header mismatch.', 
                    details: `Expected: [${STOCK_ITEMS_HEADERS.join(", ")}]. Found: [${headerRow.join(", ")}]`,
                    importedCount, 
                    errors 
                }, { status: 400 });
            }

            for (let i = 1; i < rows.length; i++) { // Start from 1 to skip header
                const row = rows[i];
                const itemData: any = {};
                STOCK_ITEMS_HEADERS.forEach((header, index) => {
                    itemData[header.toLowerCase().replace(/\s+/g, '_').replace(/[^\w]/gi, '')] = row[index] !== undefined ? row[index] : null;
                });
                
                const parsedItem = {
                    id: itemData.id || null, // Handle potential empty ID
                    name: itemData.name,
                    category: itemData.category,
                    quantity: itemData.quantity !== null ? parseInt(itemData.quantity, 10) : 0,
                    unit: itemData.unit,
                    price: itemData.price !== null ? parseFloat(itemData.price) : 0.0,
                    lowStockThreshold: itemData.low_stock_threshold !== null ? parseInt(itemData.low_stock_threshold, 10) : 0,
                    imageUrl: itemData.image_url || "",
                    siteId: itemData.site_id || null,
                    stallId: itemData.stall_id || null,
                };

                try {
                    // Validate using Zod schema (excluding 'id' and 'lastUpdated' as they are handled differently)
                    const { id, ...dataToValidate } = parsedItem;
                    stockItemSchema.parse(dataToValidate); // Zod will throw if invalid

                    const dataToSave = {
                        ...dataToValidate,
                        lastUpdated: AdminTimestamp.now().toDate().toISOString(), // Server-set timestamp
                    };
                    
                    let docRef;
                    if (parsedItem.id && parsedItem.id.trim() !== "") {
                        docRef = adminDb.collection('stockItems').doc(parsedItem.id.trim());
                        batch.set(docRef, dataToSave, { merge: true }); // Update or create if ID provided
                    } else {
                        docRef = adminDb.collection('stockItems').doc(); // Let Firestore auto-generate ID
                        batch.set(docRef, dataToSave);
                    }
                } catch (e: any) {
                    console.error(`Validation/Save error for row ${i + 1}:`, e.message, parsedItem);
                    errors.push(`Row ${i + 1}: ${e.message || 'Validation failed.'} Data: ${JSON.stringify(row)}`);
                    continue; // Skip this row
                }
            }

            if (errors.length === rows.length -1 && rows.length > 1) { // All data rows had errors
                 return NextResponse.json({ message: 'Import failed. All data rows had errors.', importedCount: 0, errors }, { status: 400 });
            }
            
            await batch.commit();
            const successCount = (rows.length - 1) - errors.length;

            return NextResponse.json({ 
                message: `Stock items import processed. ${successCount} items imported/updated. ${errors.length} rows had errors.`,
                importedCount: successCount,
                errors 
            });

        } catch (e: any) {
            console.error(`Error importing stock items for user ${uid}:`, e.message);
            return NextResponse.json({ error: 'Failed to import stock items from Google Sheet.', details: e.message }, { status: 500 });
        }

      case 'exportStockItems':
        try {
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
                return NextResponse.json({ message: `Stock items exported successfully to new sheet.`, spreadsheetId: spreadsheetIdToUse, url: `https://docs.google.com/spreadsheets/d/${spreadsheetIdToUse}` });
            } else {
                await sheets.spreadsheets.values.clear({ spreadsheetId: spreadsheetIdToUse, range: sheetName });
                await sheets.spreadsheets.values.update({
                    spreadsheetId: spreadsheetIdToUse, range: `${sheetName}!A1`, valueInputOption: 'USER_ENTERED', requestBody: { values },
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
            if (!rows || rows.length <= 1) {
                return NextResponse.json({ message: 'No data found in the sheet or sheet only contains a header.' });
            }

            const batch = adminDb.batch();
            const errors: string[] = [];
            const headerRow = rows[0].map(h => h.trim());

            if (JSON.stringify(headerRow) !== JSON.stringify(SALES_HISTORY_HEADERS)) {
                 errors.push(`Sheet header mismatch. Expected: [${SALES_HISTORY_HEADERS.join(", ")}]. Found: [${headerRow.join(", ")}]`);
                 return NextResponse.json({ 
                    error: 'Sheet header mismatch for sales.', 
                    details: `Expected: [${SALES_HISTORY_HEADERS.join(", ")}]. Found: [${headerRow.join(", ")}]`,
                    errors 
                }, { status: 400 });
            }

            for (let i = 1; i < rows.length; i++) { // Start from 1 to skip header
                const row = rows[i];
                const saleData: any = {};
                SALES_HISTORY_HEADERS.forEach((header, index) => {
                     const key = header.toLowerCase().replace(/\s+/g, '_').replace(/[^\w\(\)]/gi, '');
                     saleData[key] = row[index] !== undefined ? row[index] : null;
                });

                try {
                    // Basic validation and transformation
                    if (!saleData.date || !saleData.staff_id || !saleData.total_amount || !saleData.items_json) {
                        throw new Error("Missing required fields (Date, Staff ID, Total Amount, Items JSON).");
                    }

                    let transactionDate: AdminTimestamp;
                    try {
                        // Attempt to parse date - assumes a common format, might need more robust parsing
                        transactionDate = AdminTimestamp.fromDate(new Date(saleData.date));
                    } catch (dateError) {
                        throw new Error("Invalid date format for Transaction Date.");
                    }
                    
                    const totalAmount = parseFloat(saleData.total_amount);
                    if (isNaN(totalAmount)) throw new Error("Invalid Total Amount.");

                    let items: SoldItem[];
                    try {
                        items = JSON.parse(saleData.items_json);
                        if (!Array.isArray(items)) throw new Error("Items JSON must be an array.");
                        // TODO: Further validate each SoldItem structure within the array
                        items.forEach(item => {
                            if (typeof item.itemId !== 'string' || typeof item.name !== 'string' || 
                                typeof item.quantity !== 'number' || typeof item.pricePerUnit !== 'number' || 
                                typeof item.totalPrice !== 'number') {
                                throw new Error("Invalid structure for one or more sold items in JSON.");
                            }
                        });
                    } catch (jsonError: any) {
                        throw new Error(`Error parsing Items JSON: ${jsonError.message}`);
                    }

                    const dataToSave: Omit<SaleTransaction, 'id'> = {
                        transactionDate: transactionDate.toDate().toISOString(), // Store as ISO string to match existing type
                        staffId: saleData.staff_id,
                        staffName: saleData.staff_name || null,
                        totalAmount: totalAmount,
                        items: items,
                        isDeleted: false,
                        siteId: saleData.site_id || null,
                        stallId: saleData.stall_id || null,
                        // originalTransactionId: saleData.transaction_id_sheet || null, // Optional: if you want to store the sheet's ID
                    };
                    
                    const saleDocRef = adminDb.collection('salesTransactions').doc(); // Always create new sale
                    batch.set(saleDocRef, dataToSave);

                } catch (e: any) {
                    console.error(`Validation/Save error for sales row ${i + 1}:`, e.message, saleData);
                    errors.push(`Row ${i + 1}: ${e.message} Data: ${JSON.stringify(row)}`);
                    continue;
                }
            }
            
            if (errors.length === rows.length -1 && rows.length > 1) {
                 return NextResponse.json({ message: 'Import failed. All data rows had errors.', importedCount: 0, errors }, { status: 400 });
            }

            await batch.commit();
            const successCount = (rows.length - 1) - errors.length;

            return NextResponse.json({
                message: `Sales history import processed. ${successCount} transactions imported. ${errors.length} rows had errors.`,
                importedCount: successCount,
                errors
            });

        } catch (e: any) {
            console.error(`Error importing sales history for user ${uid}:`, e.message);
            return NextResponse.json({ error: 'Failed to import sales history from Google Sheet.', details: e.message }, { status: 500 });
        }

      case 'exportSalesHistory':
        try {
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
                    sale.id, // Firestore ID as Transaction ID for export reference
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
                return NextResponse.json({ message: `Sales history exported successfully to new sheet.`, spreadsheetId: spreadsheetIdToUse, url: `https://docs.google.com/spreadsheets/d/${spreadsheetIdToUse}` });
            } else {
                await sheets.spreadsheets.values.clear({ spreadsheetId: spreadsheetIdToUse, range: sheetName });
                await sheets.spreadsheets.values.update({
                    spreadsheetId: spreadsheetIdToUse, range: `${sheetName}!A1`, valueInputOption: 'USER_ENTERED', requestBody: { values },
                });
                return NextResponse.json({ message: `Sales history exported successfully to existing sheet.`, spreadsheetId: spreadsheetIdToUse, url: `https://docs.google.com/spreadsheets/d/${spreadsheetIdToUse}` });
            }
        } catch (e: any) {
            console.error(`Error exporting sales history for user ${uid}:`, e.message);
            return NextResponse.json({ error: 'Failed to export sales history to Google Sheet.', details: e.message }, { status: 500 });
        }

      default:
        return NextResponse.json({ error: 'Invalid action specified.' }, { status: 400 });
    }

  } catch (error: any) {
    console.error('Error in Google Sheets proxy API:', error);
    const currentUid = typeof uid === 'string' ? uid : "unknown_user_retrying_auth";

    if (error.code === 401 || error.message?.toLowerCase().includes('unauthorized') || error.message?.toLowerCase().includes('token') || (error.response?.data?.error === 'invalid_grant' || error.response?.data?.error === 'unauthorized_client')) {
        if (currentUid !== "unknown_user_retrying_auth" && adminDb) {
            await adminDb.collection('userGoogleOAuthTokens').doc(currentUid).delete().catch(delErr => console.error("Failed to delete stale tokens:", delErr));
        }
        const authUrl = oauth2Client!.generateAuthUrl({ 
            access_type: 'offline', scope: ['https://www.googleapis.com/auth/spreadsheets'], prompt: 'consent', state: currentUid 
        });
        return NextResponse.json({ error: 'Google authorization is invalid or expired. Please re-authorize.', needsAuth: true, authUrl: authUrl }, { status: 403 });
    }
    return NextResponse.json({ error: error.message || 'An unexpected error occurred on the server.' }, { status: 500 });
  }
}
