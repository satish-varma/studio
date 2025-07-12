

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import admin, { initializeApp, getApps, getApp, App as AdminApp, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore, Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { google, Auth, sheets_v4 } from 'googleapis';
import type { UserGoogleOAuthTokens, StockItem, SaleTransaction, SoldItem, FoodItemExpense } from '@/types';
import { stockItemSchema } from '@/types/item'; 
import { z } from 'zod'; // Import Zod for detailed validation error messages

const LOG_PREFIX = "[API:GoogleSheetsProxy]";

// Firebase Admin SDK Initialization
let adminApp: AdminApp | undefined;
let adminDb: ReturnType<typeof getAdminFirestore> | undefined;

console.log(`${LOG_PREFIX} Checking Firebase Admin SDK initialization status...`);
if (!getApps().length) {
  try {
    console.log(`${LOG_PREFIX} No existing Firebase Admin app found. Attempting to initialize...`);
    // Attempt to initialize using Application Default Credentials (recommended for deployed environments)
    adminApp = initializeApp();
    console.log(`${LOG_PREFIX} Firebase Admin SDK initialized successfully using Application Default Credentials. Project ID: ${adminApp.options.projectId}`);
  } catch (e: any) {
    console.error(`${LOG_PREFIX} Firebase Admin SDK default initialization failed:`, e.message, e.stack);
    // Further error handling or alternative initialization methods could be placed here if needed.
    // For now, adminApp will remain undefined if this critical step fails.
  }
} else {
  adminApp = getApp();
  console.log(`${LOG_PREFIX} Firebase Admin SDK already initialized. Using existing app. Project ID: ${adminApp.options.projectId}`);
}

if (adminApp && adminApp.options.projectId) { // Ensure app is initialized and has a project ID
    adminDb = getAdminFirestore(adminApp);
    console.log(`${LOG_PREFIX} Firestore Admin DB obtained for project: ${adminApp.options.projectId}.`);
} else {
    console.error(`${LOG_PREFIX} CRITICAL - Firebase Admin App is not properly initialized or project ID is missing. Firestore Admin DB cannot be obtained. Further operations will likely fail.`);
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
const FOOD_EXPENSES_HEADERS = ["Expense ID (Sheet)", "Category", "Total Cost", "Payment Method", "Other Payment Method Details", "Purchase Date", "Vendor", "Other Vendor Details", "Notes", "Bill Image URL", "Site ID", "Stall ID"];


// Extended Zod schema for import, allowing more flexibility for optional/nullable fields from sheet
const importStockItemSchemaInternal = z.object({
  sheetProvidedId: z.string().optional().nullable(),
  name: z.string().min(1, "Name is required"),
  category: z.string().min(1, "Category is required"),
  quantity: z.preprocess(val => (val === "" || val === null || val === undefined) ? 0 : parseInt(String(val), 10), z.number().int().min(0, "Quantity must be non-negative")),
  unit: z.string().optional().nullable().default("pcs"),
  cost_price: z.preprocess(val => (val === "" || val === null || val === undefined) ? 0.0 : parseFloat(String(val)), z.number().min(0, "Cost price must be non-negative").optional().nullable()),
  selling_price: z.preprocess(val => (val === "" || val === null || val === undefined) ? 0.0 : parseFloat(String(val)), z.number().min(0, "Selling price must be non-negative")),
  low_stock_threshold: z.preprocess(val => (val === "" || val === null || val === undefined) ? 0 : parseInt(String(val), 10), z.number().int().min(0, "Threshold must be non-negative")),
  image_url: z.string().url({message: "Image URL must be a valid URL or empty."}).optional().nullable().or(z.literal("")),
  site_id: z.string().optional().nullable(),
  stall_id: z.string().optional().nullable(),
  original_master_item_id: z.string().optional().nullable(),
});


export async function POST(request: NextRequest) {
  let uid: string | undefined = undefined; // To store UID for logging even in early errors

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
    console.log(`${LOG_PREFIX} Received request. Action: ${action}, DataType: ${dataType}, SheetID: ${sheetId || '(New Sheet)'}, SheetName: ${sheetName}`);

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
        prompt: 'consent', // Force consent screen to ensure refresh token is granted
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
    console.log(`${LOG_PREFIX} Set stored Google OAuth credentials for user ${uid}. Expiry: ${storedTokens.expiry_date ? new Date(storedTokens.expiry_date).toISOString() : 'N/A'}`);

    // Check if token is about to expire (e.g., within next 5 minutes) and refresh if needed
    if (storedTokens.expiry_date && storedTokens.expiry_date < (Date.now() + 5 * 60 * 1000)) { 
      if (storedTokens.refresh_token) {
        try {
          console.log(`${LOG_PREFIX} Access token for user ${uid} is expiring soon or expired, attempting refresh.`);
          const { credentials } = await oauth2Client.refreshAccessToken();
          console.log(`${LOG_PREFIX} Access token refreshed for user ${uid}. New expiry: ${credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : 'N/A'}`);

          const updatedTokens: UserGoogleOAuthTokens = {
            access_token: credentials.access_token!,
            refresh_token: credentials.refresh_token || storedTokens.refresh_token, // Google might not always return refresh_token
            scope: credentials.scope,
            token_type: credentials.token_type!,
            expiry_date: credentials.expiry_date,
            id_token: credentials.id_token, // id_token might also be refreshed
          };
          await userGoogleTokensRef.set(updatedTokens, { merge: true }); // Update the stored tokens
          oauth2Client.setCredentials(credentials); // Update the client with new credentials
          storedTokens = updatedTokens; // Use the new tokens for this request
          console.log(`${LOG_PREFIX} Updated tokens stored in Firestore and set on OAuth client for user ${uid}.`);
        } catch (refreshError: any) {
          console.error(`${LOG_PREFIX} Failed to refresh access token for user ${uid}:`, refreshError.response?.data || refreshError.message);
          if (refreshError.response?.data?.error === 'invalid_grant') {
            // This means the refresh token is invalid (e.g., revoked). User needs to re-authorize.
            await userGoogleTokensRef.delete().catch(delErr => console.error(`${LOG_PREFIX} Failed to delete stale/invalid tokens for UID ${uid}:`, delErr));
            const authUrl = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: ['https://www.googleapis.com/auth/spreadsheets'], prompt: 'consent', state: uid });
            return NextResponse.json({ error: 'Google authorization is invalid (refresh token). Please re-authorize.', needsAuth: true, authUrl: authUrl }, { status: 403 });
          }
          return NextResponse.json({ error: 'Failed to refresh Google access token.', details: refreshError.message }, { status: 500 });
        }
      } else {
        // Token expired and no refresh token exists. This is a problem. Force re-auth.
        console.warn(`${LOG_PREFIX} Access token expired for user ${uid}, but no refresh token available. Forcing re-auth.`);
        await userGoogleTokensRef.delete().catch(delErr => console.error(`${LOG_PREFIX} Failed to delete stale tokens for re-auth (no refresh token), UID ${uid}:`, delErr));
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

            if (!rows || rows.length <= 1) { // Check for header row + data
                console.log(`${LOG_PREFIX} No data found in sheet ${sheetId} (or only header) for stock import.`);
                return NextResponse.json({ message: 'No data found in the sheet (or only header row).' });
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
                if (row.every(cell => cell === null || cell === undefined || String(cell).trim() === "")) continue; // Skip entirely empty rows

                try {
                    const itemDataFromSheet: Record<string, any> = {};
                    STOCK_ITEMS_HEADERS.forEach((header, index) => {
                        // Convert header to a consistent key (e.g., "Cost Price" -> "cost_price")
                        let key = header.replace(/\s\(.*\)/g, '').replace(/\s+/g, '_').toLowerCase();
                        itemDataFromSheet[key] = row[index] !== undefined && row[index] !== null ? String(row[index]).trim() : null;
                    });
                    
                    // Use Zod to parse and validate the structured data
                    const validationResult = importStockItemSchemaInternal.safeParse({
                        sheetProvidedId: itemDataFromSheet.id, // 'id' from sheet header
                        name: itemDataFromSheet.name,
                        category: itemDataFromSheet.category,
                        quantity: itemDataFromSheet.quantity,
                        unit: itemDataFromSheet.unit,
                        cost_price: itemDataFromSheet.cost_price,
                        selling_price: itemDataFromSheet.selling_price,
                        low_stock_threshold: itemDataFromSheet.low_stock_threshold,
                        image_url: itemDataFromSheet.image_url,
                        site_id: itemDataFromSheet.site_id,
                        stall_id: itemDataFromSheet.stall_id,
                        original_master_item_id: itemDataFromSheet.original_master_item_id
                    });

                    if (!validationResult.success) {
                        const formattedErrors = validationResult.error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join('; ');
                        throw new Error(`Validation failed: ${formattedErrors}`);
                    }
                    const parsedItem = validationResult.data;

                    const dataToSave = {
                        name: parsedItem.name,
                        category: parsedItem.category,
                        quantity: parsedItem.quantity,
                        unit: parsedItem.unit || "pcs", // Default unit if not provided
                        price: parsedItem.selling_price,
                        costPrice: parsedItem.cost_price,
                        lowStockThreshold: parsedItem.low_stock_threshold,
                        imageUrl: parsedItem.image_url || "",
                        siteId: parsedItem.site_id || null,
                        stallId: parsedItem.stall_id || null,
                        originalMasterItemId: parsedItem.original_master_item_id || null,
                        lastUpdated: AdminTimestamp.now().toDate().toISOString(),
                    };

                    const docId = parsedItem.sheetProvidedId ? String(parsedItem.sheetProvidedId).trim() : null;
                    let docRef;
                    if (docId && docId !== "") {
                        docRef = adminDb.collection('stockItems').doc(docId);
                        batch.set(docRef, dataToSave, { merge: true });
                    } else {
                        docRef = adminDb.collection('stockItems').doc(); // Auto-generate ID
                        batch.set(docRef, dataToSave);
                    }
                    importedCount++;
                } catch (e: any) {
                    const message = e.message || 'Validation/Parsing failed.';
                    errors.push({ row: i + 1, message, data: row }); // Store original row data for context
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

            const values = [STOCK_ITEMS_HEADERS]; // Header row
            stockItemsData.forEach(item => {
                values.push([
                    item.id,
                    item.name,
                    item.category,
                    item.quantity.toString(),
                    item.unit,
                    (item.costPrice ?? "").toString(), // Handle potential null/undefined costPrice
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
                await sheets.spreadsheets.values.clear({ spreadsheetId: spreadsheetIdToUse, range: sheetName }); // Clear entire sheet
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

            if (!rows || rows.length <= 1) { // Check for header row + data
                console.log(`${LOG_PREFIX} No data found in sheet ${sheetId} (or only header) for sales import.`);
                return NextResponse.json({ message: 'No data found in the sheet (or only header row).' });
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
                if (row.every(cell => cell === null || cell === undefined || String(cell).trim() === "")) continue; // Skip empty rows

                const saleDataFromSheet: Record<string, any> = {};
                SALES_HISTORY_HEADERS.forEach((header, index) => {
                     // Convert header to a consistent key (e.g., "Staff Name" -> "staffName")
                     const key = header.toLowerCase().replace(/\s\(.*\)/g, '').replace(/\s+/g, '_').replace(/_([a-z])/g, (g) => g[1].toUpperCase());
                     saleDataFromSheet[key] = row[index] !== undefined && row[index] !== null ? String(row[index]).trim() : null;
                });

                try {
                    // Basic validation for required fields
                    if (!saleDataFromSheet.date || !saleDataFromSheet.staffId || saleDataFromSheet.totalAmount === null || !saleDataFromSheet.itemsJson) {
                        throw new Error("Missing required fields (Date, Staff ID, Total Amount, Items JSON).");
                    }

                    let transactionDateTimestamp: AdminTimestamp;
                    try {
                        const parsedDate = new Date(String(saleDataFromSheet.date));
                        if (isNaN(parsedDate.getTime())) throw new Error("Invalid date format in sheet. Should be a standard date string like 'YYYY-MM-DD HH:MM:SS' or 'MM/DD/YYYY'.");
                        transactionDateTimestamp = AdminTimestamp.fromDate(parsedDate);
                    } catch (dateError: any) {
                        throw new Error(`Invalid Date: "${saleDataFromSheet.date}". Error: ${dateError.message}`);
                    }

                    const totalAmount = parseFloat(String(saleDataFromSheet.totalAmount));
                    if (isNaN(totalAmount)) throw new Error(`Invalid Total Amount: "${saleDataFromSheet.totalAmount}". Must be a number.`);

                    let items: SoldItem[];
                    try {
                        items = JSON.parse(String(saleDataFromSheet.itemsJson));
                        if (!Array.isArray(items)) throw new Error("Items JSON must be an array of sold item objects.");
                        items.forEach((item, idx) => {
                            if (typeof item.itemId !== 'string' || typeof item.name !== 'string' ||
                                typeof item.quantity !== 'number' || isNaN(item.quantity) || item.quantity <=0 ||
                                typeof item.pricePerUnit !== 'number' || isNaN(item.pricePerUnit) || item.pricePerUnit < 0 ||
                                typeof item.totalPrice !== 'number' || isNaN(item.totalPrice) || item.totalPrice < 0 ) {
                                throw new Error(`Invalid structure/type for sold item at index ${idx} in Items JSON. Check itemId (string), name (string), quantity (number > 0), pricePerUnit (number >= 0), totalPrice (number >= 0).`);
                            }
                        });
                    } catch (jsonError: any) {
                        throw new Error(`Error parsing Items JSON: ${jsonError.message}. Ensure it's valid JSON. Value: ${saleDataFromSheet.itemsJson}`);
                    }

                    const dataToSave: Omit<SaleTransaction, 'id' | 'transactionDate'> & { transactionDate: AdminTimestamp } = {
                        transactionDate: transactionDateTimestamp,
                        staffId: String(saleDataFromSheet.staffId),
                        staffName: saleDataFromSheet.staffName ? String(saleDataFromSheet.staffName) : undefined,
                        totalAmount: totalAmount,
                        items: items,
                        isDeleted: false, // New sales from sheet are not deleted
                        siteId: saleDataFromSheet.siteId ? String(saleDataFromSheet.siteId) : undefined,
                        stallId: saleDataFromSheet.stallId ? String(saleDataFromSheet.stallId) : undefined,
                    };
                    // Note: 'Transaction ID (Sheet)' is not directly saved to Firestore ID to avoid clashes if sheet IDs are not unique globally.
                    // A new Firestore ID will be generated.
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
                  id: doc.id, // Use Firestore ID for the "Transaction ID (Sheet)" column for clarity
                  ...data,
                  transactionDate: (data.transactionDate instanceof AdminTimestamp ? data.transactionDate.toDate() : new Date(data.transactionDate)).toISOString(),
                } as SaleTransaction;
            });

            const values = [SALES_HISTORY_HEADERS]; // Header row
            salesData.forEach(sale => {
                values.push([
                    sale.id, 
                    new Date(sale.transactionDate).toLocaleString('en-IN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(',', ''), // Standardized date string
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
                await sheets.spreadsheets.values.clear({ spreadsheetId: spreadsheetIdToUse, range: sheetName }); // Clear entire sheet
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
      
      case 'importFoodExpenses':
        if (!sheetId) return NextResponse.json({ error: 'Sheet ID is required for food expense import.' }, { status: 400 });
        try {
            console.log(`${LOG_PREFIX} Importing food expenses from sheet ${sheetId} for user ${uid}.`);
            const response = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${sheetName}!A:Z` });
            const rows = response.data.values;
            if (!rows || rows.length <= 1) return NextResponse.json({ message: 'No data found in the sheet.' });

            const headerRowFromSheet = rows[0].map(h => String(h || "").trim());
            if (JSON.stringify(headerRowFromSheet) !== JSON.stringify(FOOD_EXPENSES_HEADERS)) {
                return NextResponse.json({ error: 'Food expenses sheet header mismatch.' }, { status: 400 });
            }

            const batch = adminDb.batch();
            const errors: { row: number; message: string; data: any[] }[] = [];
            let importedCount = 0;

            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (row.every(cell => !cell || String(cell).trim() === "")) continue;

                try {
                    const expenseDataFromSheet: Record<string, any> = {};
                    FOOD_EXPENSES_HEADERS.forEach((header, index) => {
                        const key = header.toLowerCase().replace(/\s\(.*\)/g, '').replace(/\s+/g, '_').replace(/_([a-z])/g, (g) => g[1].toUpperCase());
                        expenseDataFromSheet[key] = row[index] !== undefined && row[index] !== null ? String(row[index]).trim() : null;
                    });
                    
                    if (!expenseDataFromSheet.siteId || !expenseDataFromSheet.stallId) {
                        throw new Error("Site ID and Stall ID are required for each expense row.");
                    }

                    const purchaseDate = new Date(String(expenseDataFromSheet.purchaseDate));
                    if (isNaN(purchaseDate.getTime())) throw new Error("Invalid purchase date format.");
                    
                    const dataToSave: Omit<FoodItemExpense, 'id' | 'purchaseDate'> & { purchaseDate: AdminTimestamp } = {
                        category: expenseDataFromSheet.category,
                        totalCost: parseFloat(expenseDataFromSheet.totalCost),
                        paymentMethod: expenseDataFromSheet.paymentMethod,
                        otherPaymentMethodDetails: expenseDataFromSheet.otherPaymentMethodDetails || null,
                        purchaseDate: AdminTimestamp.fromDate(purchaseDate),
                        vendor: expenseDataFromSheet.vendor || null,
                        otherVendorDetails: expenseDataFromSheet.otherVendorDetails || null,
                        notes: expenseDataFromSheet.notes || null,
                        billImageUrl: expenseDataFromSheet.billImageUrl || null,
                        siteId: expenseDataFromSheet.siteId,
                        stallId: expenseDataFromSheet.stallId,
                        recordedByUid: uid,
                        recordedByName: (await adminDb.collection('users').doc(uid).get()).data()?.displayName || 'Imported',
                        createdAt: AdminTimestamp.now().toDate().toISOString(),
                        updatedAt: AdminTimestamp.now().toDate().toISOString(),
                    };

                    const docRef = adminDb.collection('foodItemExpenses').doc();
                    batch.set(docRef, dataToSave);
                    importedCount++;
                } catch (e: any) {
                    errors.push({ row: i + 1, message: e.message, data: row });
                }
            }

            if (importedCount > 0) await batch.commit();
            return NextResponse.json({
                message: `Food expenses import processed. ${importedCount} items imported. ${errors.length} rows had issues.`,
                importedCount, errors
            });

        } catch (e: any) {
            console.error(`${LOG_PREFIX} Error importing food expenses for user ${uid}:`, e.message, e.stack);
            return NextResponse.json({ error: 'Failed to import food expenses from Google Sheet.', details: e.message }, { status: 500 });
        }

      case 'exportFoodExpenses':
        try {
            console.log(`${LOG_PREFIX} Exporting food expenses for user ${uid}.`);
            const expensesSnapshot = await adminDb.collection('foodItemExpenses').orderBy('purchaseDate', 'desc').get();
            const expensesData: FoodItemExpense[] = expensesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FoodItemExpense));

            const values = [FOOD_EXPENSES_HEADERS];
            expensesData.forEach(exp => {
                values.push([
                    exp.id, exp.category, String(exp.totalCost), exp.paymentMethod,
                    exp.otherPaymentMethodDetails || "",
                    (exp.purchaseDate instanceof AdminTimestamp ? exp.purchaseDate.toDate() : new Date(exp.purchaseDate as any)).toLocaleDateString('en-CA'),
                    exp.vendor || "", exp.otherVendorDetails || "", exp.notes || "", exp.billImageUrl || "",
                    exp.siteId, exp.stallId
                ]);
            });

            if (!spreadsheetIdToUse) {
                const newSheet = await sheets.spreadsheets.create({ requestBody: { properties: { title: `StallSync Food Expenses Export ${new Date().toISOString().split('T')[0]}` } } });
                spreadsheetIdToUse = newSheet.data.spreadsheetId;
                if (!spreadsheetIdToUse) throw new Error("Failed to create new Google Sheet.");
                await sheets.spreadsheets.values.update({ spreadsheetId: spreadsheetIdToUse, range: `${sheetName}!A1`, valueInputOption: 'USER_ENTERED', requestBody: { values } });
                return NextResponse.json({ message: `Food expenses exported successfully to new sheet.`, spreadsheetId: spreadsheetIdToUse, url: `https://docs.google.com/spreadsheets/d/${spreadsheetIdToUse}` });
            } else {
                await sheets.spreadsheets.values.clear({ spreadsheetId: spreadsheetIdToUse, range: sheetName });
                await sheets.spreadsheets.values.update({ spreadsheetId: spreadsheetIdToUse, range: `${sheetName}!A1`, valueInputOption: 'USER_ENTERED', requestBody: { values } });
                return NextResponse.json({ message: `Food expenses exported successfully to existing sheet.`, spreadsheetId: spreadsheetIdToUse, url: `https://docs.google.com/spreadsheets/d/${spreadsheetIdToUse}` });
            }
        } catch (e: any) {
            console.error(`${LOG_PREFIX} Error exporting food expenses for user ${uid}:`, e.message, e.stack);
            return NextResponse.json({ error: 'Failed to export food expenses to Google Sheet.', details: e.message }, { status: 500 });
        }


      default:
        console.warn(`${LOG_PREFIX} Invalid action specified: ${action}`);
        return NextResponse.json({ error: 'Invalid action specified.' }, { status: 400 });
    }

  } catch (error: any) {
    console.error(`${LOG_PREFIX} General error in API route for user ${uid || 'unknown_user'}:`, { message: error.message, code: error.code, stack: error.stack, responseData: error.response?.data });
    const currentUidForReauth = typeof uid === 'string' ? uid : "unknown_user_needs_reauth"; // Fallback if uid wasn't set before error

    // Handle OAuth specific errors that require re-authentication
    if (error.code === 401 || // Typically from our own token verification
        error.message?.toLowerCase().includes('unauthorized') ||
        error.message?.toLowerCase().includes('token') ||
        (error.response?.data?.error === 'invalid_grant') || // Google specific: refresh token invalid
        (error.response?.data?.error === 'unauthorized_client')) { // Google specific: client not authorized

        if (currentUidForReauth !== "unknown_user_needs_reauth" && adminDb && oauth2Client) {
            console.warn(`${LOG_PREFIX} OAuth error encountered for user ${currentUidForReauth}. Error details:`, error.response?.data || error.message);
            // Attempt to delete stored tokens to force re-auth flow
            await adminDb.collection('userGoogleOAuthTokens').doc(currentUidForReauth).delete().catch(delErr => console.error(`${LOG_PREFIX} Failed to delete stale/invalid tokens for UID ${currentUidForReauth}:`, delErr));
            const authUrl = oauth2Client.generateAuthUrl({
                access_type: 'offline', scope: ['https://www.googleapis.com/auth/spreadsheets'], prompt: 'consent', state: currentUidForReauth
            });
            return NextResponse.json({ error: 'Google authorization is invalid or expired. Please re-authorize.', needsAuth: true, authUrl: authUrl }, { status: 403 });
        } else if (oauth2Client) {
             // If uid is unknown or db not available, still try to send authUrl
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
    
    // Generic server error
    return NextResponse.json({ error: error.message || 'An unexpected error occurred on the server.', code: error.code, details: error.response?.data?.error_description }, { status: 500 });
  }
}
