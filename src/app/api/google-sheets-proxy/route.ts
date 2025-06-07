
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { initializeApp, getApps, getApp, App as AdminApp, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore, Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { google, Auth, sheets_v4 } from 'googleapis';
import type { UserGoogleOAuthTokens, StockItem, SaleTransaction, SoldItem } from '@/types';
import { stockItemSchema } from '@/types/item'; 
import { z } from 'zod'; // Import Zod for detailed validation error messages

const LOG_PREFIX = "[API:GoogleSheetsProxy]";

// Firebase Admin SDK Initialization
let adminApp: AdminApp;
let adminDb: ReturnType<typeof getAdminFirestore>;

console.log(`${LOG_PREFIX} Attempting Firebase Admin SDK initialization...`);
if (!getApps().length) {
  try {
    adminApp = initializeApp();
    console.log(`${LOG_PREFIX} Firebase Admin SDK initialized successfully (using GOOGLE_APPLICATION_CREDENTIALS or default discovery).`);
  } catch (e: any) {
    console.error(`${LOG_PREFIX} Firebase Admin SDK default initialization failed:`, e.message);
    if (!adminApp!) { 
         console.error(`${LOG_PREFIX} CRITICAL - Firebase Admin SDK could not be initialized. Verify GOOGLE_APPLICATION_CREDENTIALS environment variable or local service account key setup.`);
    }
  }
} else {
  adminApp = getApp();
  console.log(`${LOG_PREFIX} Firebase Admin SDK already initialized, got existing instance.`);
}

if (adminApp!) {
    adminDb = getAdminFirestore(adminApp);
    console.log(`${LOG_PREFIX} Firestore Admin DB obtained for project:`, adminApp.options.projectId || "Project ID not available in options");
} else {
    console.error(`${LOG_PREFIX} CRITICAL - Firebase Admin App is not initialized. Firestore Admin DB cannot be obtained. Further operations will likely fail.`);
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
    console.log(`${LOG_PREFIX} Google OAuth2 client configured.`);
} else {
    console.error(`${LOG_PREFIX} CRITICAL - Google OAuth2 client credentials (ID, Secret, Redirect URI) are not configured. Sheets API integration will not work. Check .env.local or environment variables.`);
}

const STOCK_ITEMS_HEADERS = ["ID", "Name", "Category", "Quantity", "Unit", "Cost Price", "Selling Price", "Low Stock Threshold", "Image URL", "Site ID", "Stall ID", "Original Master Item ID"];
const SALES_HISTORY_HEADERS = ["Transaction ID (Sheet)", "Date", "Staff Name", "Staff ID", "Total Amount", "Site ID", "Stall ID", "Items (JSON)"];


export async function POST(request: NextRequest) {
  let uid: string | undefined = undefined; 

  if (!adminApp || !adminDb) {
    console.error(`${LOG_PREFIX} Firebase Admin SDK not properly initialized on server when POST request received.`);
    return NextResponse.json({ error: 'Server Error: Firebase Admin SDK not properly initialized.' }, { status: 500 });
  }
  if (!oauth2Client) {
     console.error(`${LOG_PREFIX} Google OAuth2 client not configured on server when POST request received.`);
    return NextResponse.json({ error: 'Server Error: Google OAuth2 client not configured.' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { action, dataType, sheetId, sheetName = 'Sheet1' } = body;
    console.log(`${LOG_PREFIX} Received action: ${action}, dataType: ${dataType}, sheetId: ${sheetId || '(New Sheet)'}, sheetName: ${sheetName}`);

    const authorizationHeader = request.headers.get('Authorization');
    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
      console.warn(`${LOG_PREFIX} Authorization header missing or malformed.`);
      return NextResponse.json({ error: 'Unauthorized: Missing or invalid Firebase ID token.' }, { status: 401 });
    }
    const idToken = authorizationHeader.split('Bearer ')[1];
    
    let decodedToken;
    try {
      decodedToken = await getAdminAuth(adminApp).verifyIdToken(idToken);
      uid = decodedToken.uid; 
      console.log(`${LOG_PREFIX} ID Token verified successfully for UID: ${uid}`);
    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error verifying Firebase ID token: ${error.message}`, { code: error.code });
      return NextResponse.json({ error: 'Unauthorized: Invalid Firebase ID token. Please re-authenticate.', details: error.message, code: error.code }, { status: 401 });
    }

    const userGoogleTokensRef = adminDb.collection('userGoogleOAuthTokens').doc(uid); 
    const userTokensDoc = await userGoogleTokensRef.get();

    if (!userTokensDoc.exists || !userTokensDoc.data()?.access_token) {
      console.log(`${LOG_PREFIX} Google OAuth tokens not found for user ${uid}. Generating auth URL.`);
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/spreadsheets'],
        prompt: 'consent',
        state: uid, 
      });
      return NextResponse.json({ error: 'Google Sheets authorization required.', needsAuth: true, authUrl: authUrl }, { status: 403 });
    }

    let storedTokens = userTokensDoc.data() as UserGoogleOAuthTokens;
    oauth2Client.setCredentials({
      access_token: storedTokens.access_token,
      refresh_token: storedTokens.refresh_token,
      scope: storedTokens.scope,
      token_type: storedTokens.token_type,
      expiry_date: storedTokens.expiry_date,
    });
    console.log(`${LOG_PREFIX} Set stored Google OAuth credentials for user ${uid}.`);

    if (storedTokens.expiry_date && storedTokens.expiry_date < (Date.now() + 60000)) { 
      if (storedTokens.refresh_token) {
        try {
          console.log(`${LOG_PREFIX} Access token for user ${uid} potentially expired (expiry: ${storedTokens.expiry_date ? new Date(storedTokens.expiry_date).toISOString() : 'N/A'}), attempting refresh.`);
          const { credentials } = await oauth2Client.refreshAccessToken();
          console.log(`${LOG_PREFIX} Access token refreshed for user ${uid}. New expiry: ${credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : 'N/A'}`);

          const updatedTokens: UserGoogleOAuthTokens = {
            access_token: credentials.access_token!,
            refresh_token: credentials.refresh_token || storedTokens.refresh_token, 
            scope: credentials.scope,
            token_type: credentials.token_type!,
            expiry_date: credentials.expiry_date,
            id_token: credentials.id_token,
          };
          await userGoogleTokensRef.set(updatedTokens, { merge: true }); 
          oauth2Client.setCredentials(credentials);
          storedTokens = updatedTokens;
          console.log(`${LOG_PREFIX} Updated tokens stored in Firestore for user ${uid}.`);
        } catch (refreshError: any) {
          console.error(`${LOG_PREFIX} Failed to refresh access token for user ${uid}:`, refreshError.response?.data || refreshError.message);
          if (refreshError.response?.data?.error === 'invalid_grant') {
            await userGoogleTokensRef.delete().catch(delErr => console.error(`${LOG_PREFIX} Failed to delete stale tokens for UID ${uid}:`, delErr));
            const authUrl = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: ['https://www.googleapis.com/auth/spreadsheets'], prompt: 'consent', state: uid });
            return NextResponse.json({ error: 'Google authorization is invalid (refresh token). Please re-authorize.', needsAuth: true, authUrl: authUrl }, { status: 403 });
          }
          return NextResponse.json({ error: 'Failed to refresh Google access token.', details: refreshError.message }, { status: 500 });
        }
      } else {
        console.warn(`${LOG_PREFIX} Access token expired for user ${uid}, but no refresh token available. Forcing re-auth.`);
        await userGoogleTokensRef.delete().catch(delErr => console.error(`${LOG_PREFIX} Failed to delete stale tokens for re-auth, UID ${uid}:`, delErr));
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
            console.log(`${LOG_PREFIX} Importing stock items from sheet ${sheetId} for user ${uid}. Range: ${sheetName}!A:Z`);
            const response = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${sheetName}!A:Z` });
            const rows = response.data.values;

            if (!rows || rows.length === 0) {
                console.log(`${LOG_PREFIX} No data found in sheet ${sheetId} for stock import.`);
                return NextResponse.json({ message: 'No data found in the sheet.' });
            }
            const headerRowFromSheet = rows[0].map(h => String(h || "").trim());
            if (JSON.stringify(headerRowFromSheet) !== JSON.stringify(STOCK_ITEMS_HEADERS)) {
                 const errorMsg = `Sheet header mismatch. Expected: [${STOCK_ITEMS_HEADERS.join(", ")}]. Found: [${headerRowFromSheet.join(", ")}]`;
                 console.error(`${LOG_PREFIX} ${errorMsg}`);
                 return NextResponse.json({ error: 'Sheet header mismatch.', details: errorMsg }, { status: 400 });
            }

            const batch = adminDb.batch();
            const errors: { row: number; message: string; data: any[] }[] = [];
            let importedCount = 0;

            for (let i = 1; i < rows.length; i++) { 
                const row = rows[i];
                if (row.every(cell => cell === null || cell === undefined || String(cell).trim() === "")) continue; 

                try {
                    const itemDataFromSheet: Record<string, any> = {};
                    STOCK_ITEMS_HEADERS.forEach((header, index) => {
                        const key = header.replace(/\s\(.*\)/g, '').replace(/\s+/g, '_').toLowerCase();
                        let formattedKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
                        if (formattedKey === "id") formattedKey = "sheetProvidedId"; 
                        itemDataFromSheet[formattedKey] = row[index] !== undefined ? row[index] : null;
                    });

                    const parsedItem = {
                        name: String(itemDataFromSheet.name || ""),
                        category: String(itemDataFromSheet.category || ""),
                        quantity: itemDataFromSheet.quantity !== null ? parseInt(String(itemDataFromSheet.quantity), 10) : 0,
                        unit: String(itemDataFromSheet.unit || "pcs"),
                        costPrice: itemDataFromSheet.cost_price !== null ? parseFloat(String(itemDataFromSheet.cost_price)) : 0.0,
                        price: itemDataFromSheet.selling_price !== null ? parseFloat(String(itemDataFromSheet.selling_price)) : 0.0, 
                        lowStockThreshold: itemDataFromSheet.low_stock_threshold !== null ? parseInt(String(itemDataFromSheet.low_stock_threshold), 10) : 0,
                        imageUrl: String(itemDataFromSheet.image_url || ""),
                        siteId: itemDataFromSheet.site_id ? String(itemDataFromSheet.site_id) : null,
                        stallId: itemDataFromSheet.stall_id ? String(itemDataFromSheet.stall_id) : null,
                        originalMasterItemId: itemDataFromSheet.original_master_item_id ? String(itemDataFromSheet.original_master_item_id) : null,
                    };

                    const { sheetProvidedId, ...dataForZod } = itemDataFromSheet; // Exclude sheetProvidedId for Zod
                    
                    // Using a slightly more flexible Zod schema for import
                    const importStockItemSchema = stockItemSchema.omit({ siteId: true, stallId: true, originalMasterItemId: true }) 
                                   .merge(z.object({ costPrice: z.number().optional().nullable(), price: z.number().optional().nullable() }));
                    
                    importStockItemSchema.parse({
                      name: parsedItem.name,
                      category: parsedItem.category,
                      quantity: parsedItem.quantity,
                      unit: parsedItem.unit,
                      price: parsedItem.price,
                      costPrice: parsedItem.costPrice,
                      lowStockThreshold: parsedItem.lowStockThreshold,
                      imageUrl: parsedItem.imageUrl,
                    });

                    const dataToSave = {
                        ...parsedItem,
                        price: parsedItem.price ?? 0.0, // Ensure price has a default if null
                        costPrice: parsedItem.costPrice ?? 0.0, // Ensure costPrice has a default if null
                        lastUpdated: AdminTimestamp.now().toDate().toISOString(),
                    };

                    const docId = itemDataFromSheet.sheetProvidedId ? String(itemDataFromSheet.sheetProvidedId).trim() : null;
                    let docRef;
                    if (docId && docId !== "") {
                        docRef = adminDb.collection('stockItems').doc(docId);
                        batch.set(docRef, dataToSave, { merge: true });
                    } else {
                        docRef = adminDb.collection('stockItems').doc();
                        batch.set(docRef, dataToSave);
                    }
                    importedCount++;
                } catch (e: any) {
                    const message = e instanceof z.ZodError ? e.errors.map(err => `${err.path.join('.')}: ${err.message}`).join('; ') : (e.message || 'Validation/Parsing failed.');
                    errors.push({ row: i + 1, message, data: row });
                    console.warn(`${LOG_PREFIX} Import error on row ${i+1}: ${message}`, {rowData: row});
                }
            }

            if (importedCount > 0) {
                await batch.commit();
                console.log(`${LOG_PREFIX} Batch commit successful for ${importedCount} stock items.`);
            }
            console.log(`${LOG_PREFIX} Stock import complete for user ${uid}. Imported: ${importedCount}, Errors: ${errors.length}`);
            return NextResponse.json({
                message: `Stock items import processed. ${importedCount} items imported/updated. ${errors.length} rows had issues.`,
                importedCount,
                errors
            });

        } catch (e: any) {
            console.error(`${LOG_PREFIX} Error importing stock items for user ${uid}:`, e.message, e.stack);
            return NextResponse.json({ error: 'Failed to import stock items from Google Sheet.', details: e.message }, { status: 500 });
        }

      case 'exportStockItems':
        try {
            console.log(`${LOG_PREFIX} Exporting stock items for user ${uid}. Sheet ID provided: ${spreadsheetIdToUse}`);
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
                    (item.costPrice ?? 0).toString(),
                    item.price.toString(),
                    item.lowStockThreshold.toString(),
                    item.imageUrl || "",
                    item.siteId || "",
                    item.stallId || "",
                    item.originalMasterItemId || ""
                ]);
            });

            if (!spreadsheetIdToUse) {
                console.log(`${LOG_PREFIX} No sheet ID provided for export, creating new sheet.`);
                const newSheet = await sheets.spreadsheets.create({
                    requestBody: { properties: { title: `StallSync Stock Items Export ${new Date().toISOString().split('T')[0]}` } }
                });
                spreadsheetIdToUse = newSheet.data.spreadsheetId;
                if (!spreadsheetIdToUse) throw new Error("Failed to create new Google Sheet.");
                 await sheets.spreadsheets.values.update({
                    spreadsheetId: spreadsheetIdToUse, range: `${sheetName}!A1`, valueInputOption: 'USER_ENTERED', requestBody: { values },
                });
                console.log(`${LOG_PREFIX} Stock exported to new sheet ${spreadsheetIdToUse} for user ${uid}.`);
                return NextResponse.json({ message: `Stock items exported successfully to new sheet.`, spreadsheetId: spreadsheetIdToUse, url: `https://docs.google.com/spreadsheets/d/${spreadsheetIdToUse}` });
            } else {
                console.log(`${LOG_PREFIX} Clearing existing sheet ${spreadsheetIdToUse} for export.`);
                await sheets.spreadsheets.values.clear({ spreadsheetId: spreadsheetIdToUse, range: sheetName });
                await sheets.spreadsheets.values.update({
                    spreadsheetId: spreadsheetIdToUse, range: `${sheetName}!A1`, valueInputOption: 'USER_ENTERED', requestBody: { values },
                });
                 console.log(`${LOG_PREFIX} Stock exported to existing sheet ${spreadsheetIdToUse} for user ${uid}.`);
                return NextResponse.json({ message: `Stock items exported successfully to existing sheet.`, spreadsheetId: spreadsheetIdToUse, url: `https://docs.google.com/spreadsheets/d/${spreadsheetIdToUse}` });
            }
        } catch (e: any) {
            console.error(`${LOG_PREFIX} Error exporting stock items for user ${uid}:`, e.message, e.stack);
            return NextResponse.json({ error: 'Failed to export stock items to Google Sheet.', details: e.message }, { status: 500 });
        }

      case 'importSalesHistory':
        if (!sheetId) return NextResponse.json({ error: 'Sheet ID is required for sales import.' }, { status: 400 });
        try {
            console.log(`${LOG_PREFIX} Importing sales history from sheet ${sheetId} for user ${uid}. Range: ${sheetName}!A:Z`);
            const response = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${sheetName}!A:Z` });
            const rows = response.data.values;

            if (!rows || rows.length === 0) {
                console.log(`${LOG_PREFIX} No data found in sheet ${sheetId} for sales import.`);
                return NextResponse.json({ message: 'No data found in the sheet.' });
            }
            const headerRowFromSheet = rows[0].map(h => String(h || "").trim());
            if (JSON.stringify(headerRowFromSheet) !== JSON.stringify(SALES_HISTORY_HEADERS)) {
                 const errorMsg = `Sales sheet header mismatch. Expected: [${SALES_HISTORY_HEADERS.join(", ")}]. Found: [${headerRowFromSheet.join(", ")}]`;
                 console.error(`${LOG_PREFIX} ${errorMsg}`);
                 return NextResponse.json({ error: 'Sales sheet header mismatch.', details: errorMsg }, { status: 400 });
            }

            const batch = adminDb.batch();
            const errors: { row: number; message: string; data: any[] }[] = [];
            let importedCount = 0;

            for (let i = 1; i < rows.length; i++) { 
                const row = rows[i];
                if (row.every(cell => cell === null || cell === undefined || String(cell).trim() === "")) continue; 

                const saleDataFromSheet: Record<string, any> = {};
                SALES_HISTORY_HEADERS.forEach((header, index) => {
                     const key = header.toLowerCase().replace(/\s\(.*\)/g, '').replace(/\s+/g, '_').replace(/_([a-z])/g, (g) => g[1].toUpperCase());
                     saleDataFromSheet[key] = row[index] !== undefined ? row[index] : null;
                });

                try {
                    if (!saleDataFromSheet.date || !saleDataFromSheet.staffId || saleDataFromSheet.totalAmount === null || saleDataFromSheet.totalAmount === undefined || !saleDataFromSheet.itemsJson) {
                        throw new Error("Missing required fields (Date, Staff ID, Total Amount, Items JSON).");
                    }

                    let transactionDateTimestamp: AdminTimestamp;
                    try {
                        const parsedDate = new Date(String(saleDataFromSheet.date));
                        if (isNaN(parsedDate.getTime())) throw new Error("Invalid date format in sheet.");
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
                        staffName: saleDataFromSheet.staffName ? String(saleDataFromSheet.staffName) : undefined,
                        totalAmount: totalAmount,
                        items: items,
                        isDeleted: false,
                        siteId: saleDataFromSheet.siteId ? String(saleDataFromSheet.siteId) : undefined,
                        stallId: saleDataFromSheet.stallId ? String(saleDataFromSheet.stallId) : undefined,
                    };

                    const saleDocRef = adminDb.collection('salesTransactions').doc(); // Generate new ID
                    batch.set(saleDocRef, dataToSave);
                    importedCount++;
                } catch (e: any) {
                     errors.push({ row: i + 1, message: e.message || 'Validation/Parsing failed for sale.', data: row });
                     console.warn(`${LOG_PREFIX} Sales import error on row ${i+1}: ${e.message}`, {rowData: row});
                }
            }

            if (importedCount > 0) {
                await batch.commit();
                console.log(`${LOG_PREFIX} Batch commit successful for ${importedCount} sales transactions.`);
            }
            console.log(`${LOG_PREFIX} Sales import complete for user ${uid}. Imported: ${importedCount}, Errors: ${errors.length}`);
            return NextResponse.json({
                message: `Sales history import processed. ${importedCount} transactions imported. ${errors.length} rows had errors.`,
                importedCount,
                errors
            });

        } catch (e: any) {
            console.error(`${LOG_PREFIX} Error importing sales history for user ${uid}:`, e.message, e.stack);
            return NextResponse.json({ error: 'Failed to import sales history from Google Sheet.', details: e.message }, { status: 500 });
        }

      case 'exportSalesHistory':
        try {
            console.log(`${LOG_PREFIX} Exporting sales history for user ${uid}. Sheet ID provided: ${spreadsheetIdToUse}`);
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
                    sale.id, // Export Firestore ID as "Transaction ID (Sheet)" could be confusing if importing back
                    new Date(sale.transactionDate).toLocaleString('en-IN'), // Localized date string
                    sale.staffName || "N/A",
                    sale.staffId,
                    sale.totalAmount.toString(),
                    sale.siteId || "",
                    sale.stallId || "",
                    JSON.stringify(sale.items)
                ]);
            });

             if (!spreadsheetIdToUse) {
                console.log(`${LOG_PREFIX} No sheet ID for sales export, creating new sheet.`);
                const newSheet = await sheets.spreadsheets.create({
                    requestBody: { properties: { title: `StallSync Sales History Export ${new Date().toISOString().split('T')[0]}` } }
                });
                spreadsheetIdToUse = newSheet.data.spreadsheetId;
                if (!spreadsheetIdToUse) throw new Error("Failed to create new Google Sheet for sales export.");
                await sheets.spreadsheets.values.update({
                    spreadsheetId: spreadsheetIdToUse, range: `${sheetName}!A1`, valueInputOption: 'USER_ENTERED', requestBody: { values },
                });
                console.log(`${LOG_PREFIX} Sales history exported to new sheet ${spreadsheetIdToUse} for user ${uid}.`);
                return NextResponse.json({ message: `Sales history exported successfully to new sheet.`, spreadsheetId: spreadsheetIdToUse, url: `https://docs.google.com/spreadsheets/d/${spreadsheetIdToUse}` });
            } else {
                console.log(`${LOG_PREFIX} Clearing existing sheet ${spreadsheetIdToUse} for sales export.`);
                await sheets.spreadsheets.values.clear({ spreadsheetId: spreadsheetIdToUse, range: sheetName });
                await sheets.spreadsheets.values.update({
                    spreadsheetId: spreadsheetIdToUse, range: `${sheetName}!A1`, valueInputOption: 'USER_ENTERED', requestBody: { values },
                });
                console.log(`${LOG_PREFIX} Sales history exported to existing sheet ${spreadsheetIdToUse} for user ${uid}.`);
                return NextResponse.json({ message: `Sales history exported successfully to existing sheet.`, spreadsheetId: spreadsheetIdToUse, url: `https://docs.google.com/spreadsheets/d/${spreadsheetIdToUse}` });
            }
        } catch (e: any) {
            console.error(`${LOG_PREFIX} Error exporting sales history for user ${uid}:`, e.message, e.stack);
            return NextResponse.json({ error: 'Failed to export sales history to Google Sheet.', details: e.message }, { status: 500 });
        }

      default:
        console.warn(`${LOG_PREFIX} Invalid action specified: ${action}`);
        return NextResponse.json({ error: 'Invalid action specified.' }, { status: 400 });
    }

  } catch (error: any) {
    console.error(`${LOG_PREFIX} General error for user ${uid || 'unknown_user'} in API route:`, error.message, error.stack);
    const currentUidForReauth = typeof uid === 'string' ? uid : "unknown_user_needs_reauth";

    if (error.code === 401 ||
        error.message?.toLowerCase().includes('unauthorized') ||
        error.message?.toLowerCase().includes('token') ||
        (error.response?.data?.error === 'invalid_grant') ||
        (error.response?.data?.error === 'unauthorized_client')) {

        if (currentUidForReauth !== "unknown_user_needs_reauth" && adminDb && oauth2Client) {
            console.warn(`${LOG_PREFIX} OAuth error encountered for user ${currentUidForReauth}. Error details:`, error.response?.data || error.message);
            await adminDb.collection('userGoogleOAuthTokens').doc(currentUidForReauth).delete().catch(delErr => console.error(`${LOG_PREFIX} Failed to delete stale tokens for UID ${currentUidForReauth}:`, delErr));
            const authUrl = oauth2Client.generateAuthUrl({
                access_type: 'offline', scope: ['https://www.googleapis.com/auth/spreadsheets'], prompt: 'consent', state: currentUidForReauth
            });
            return NextResponse.json({ error: 'Google authorization is invalid or expired. Please re-authorize.', needsAuth: true, authUrl: authUrl }, { status: 403 });
        } else if (oauth2Client) {
             const authUrl = oauth2Client.generateAuthUrl({
                access_type: 'offline', scope: ['https://www.googleapis.com/auth/spreadsheets'], prompt: 'consent', state: currentUidForReauth
            });
             return NextResponse.json({ error: 'Google authorization is invalid or expired. Please re-authorize.', needsAuth: true, authUrl: authUrl }, { status: 403 });
        }
    }
     // Handle JSON parsing error from request.json()
    if (error instanceof SyntaxError && error.message.includes("JSON")) {
        console.error(`${LOG_PREFIX} Invalid JSON in request body for user ${uid || 'unknown_user'}:`, error.message);
        return NextResponse.json({ error: "Invalid JSON in request body.", details: error.message }, { status: 400 });
    }
    
    return NextResponse.json({ error: error.message || 'An unexpected error occurred on the server.' }, { status: 500 });
  }
}
