
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore, Timestamp as AdminTimestamp, WriteBatch } from 'firebase-admin/firestore';
import { google, Auth, sheets_v4 } from 'googleapis';
import type { UserGoogleOAuthTokens, StockItem, SaleTransaction, SoldItem, FoodItemExpense, FoodExpenseCategory, PaymentMethod } from '@/types';
import { stockItemSchema } from '@/types/item';
import { foodExpenseCategories, paymentMethods } from '@/types/food';
import { z } from 'zod';
import { initializeAdminSdk } from '@/lib/firebaseAdmin';

const LOG_PREFIX = "[API:GoogleSheetsProxy]";

// --- Header Constants ---
const STOCK_ITEMS_HEADERS = ["ID", "Name", "Category", "Quantity", "Unit", "Cost Price", "Selling Price", "Low Stock Threshold", "Image URL", "Site ID", "Stall ID", "Original Master Item ID"];
const SALES_HISTORY_HEADERS = ["Transaction ID (Sheet)", "Date", "Staff Name", "Staff ID", "Total Amount", "Site ID", "Stall ID", "Items (JSON)"];
const FOOD_EXPENSES_HEADERS = ["Expense ID (Sheet)", "Category", "Total Cost", "Payment Method", "Other Payment Method Details", "Purchase Date", "Vendor", "Other Vendor Details", "Notes", "Bill Image URL", "Site ID", "Stall ID"];

// --- Zod Schemas for Import Validation ---
const importStockItemSchemaInternal = z.object({
    id: z.string().optional().nullable(), name: z.string().min(1, "Name is required"),
    category: z.string().min(1, "Category is required"),
    quantity: z.preprocess(val => (val === "" || val === null || val === undefined) ? 0 : parseInt(String(val), 10), z.number().int().min(0)),
    unit: z.string().optional().nullable().default("pcs"),
    costPrice: z.preprocess(val => (val === "" || val === null || val === undefined) ? 0.0 : parseFloat(String(val)), z.number().min(0).optional().nullable()),
    price: z.preprocess(val => (val === "" || val === null || val === undefined) ? 0.0 : parseFloat(String(val)), z.number().min(0)),
    lowStockThreshold: z.preprocess(val => (val === "" || val === null || val === undefined) ? 0 : parseInt(String(val), 10), z.number().int().min(0)),
    imageUrl: z.string().url().or(z.literal("")).optional().nullable(),
    siteId: z.string().optional().nullable(), stallId: z.string().optional().nullable(),
    originalMasterItemId: z.string().optional().nullable(),
});

const importFoodExpenseSchemaInternal = z.object({
    id: z.string().optional().nullable(),
    category: z.enum(foodExpenseCategories, { errorMap: () => ({ message: "Invalid category value." }) }),
    totalCost: z.preprocess(val => parseFloat(String(val)), z.number().positive("Total Cost must be a positive number.")),
    paymentMethod: z.enum(paymentMethods, { errorMap: () => ({ message: "Invalid payment method." }) }),
    otherPaymentMethodDetails: z.string().optional().nullable(),
    purchaseDate: z.preprocess(val => new Date(String(val)), z.date({ errorMap: () => ({ message: "Invalid date format." }) })),
    vendor: z.string().optional().nullable(), otherVendorDetails: z.string().optional().nullable(),
    notes: z.string().optional().nullable(), billImageUrl: z.string().url().or(z.literal("")).optional().nullable(),
    siteId: z.string().min(1, "Site ID is required."), stallId: z.string().min(1, "Stall ID is required."),
});

// --- Main Handler ---
export async function POST(request: NextRequest) {
    const { adminApp, error: adminAppError } = initializeAdminSdk();
    if (adminAppError || !adminApp) {
        console.error(`${LOG_PREFIX} Firebase Admin SDK not properly initialized.`);
        return NextResponse.json({ error: 'Server Error: Firebase Admin SDK not properly initialized.', details: adminAppError }, { status: 500 });
    }
    const adminDb = getAdminFirestore(adminApp);
    const adminAuth = getAdminAuth(adminApp);

    let body;
    try {
        body = await request.json();
    } catch (e) {
        return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
    }

    try {
        const { action, dataType, sheetId, sheetName = 'Sheet1' } = body;
        console.log(`${LOG_PREFIX} Request: Action=${action}, DataType=${dataType}, SheetID=${sheetId || '(New)'}`);

        const authorizationHeader = request.headers.get('Authorization');
        if (!authorizationHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized: Missing or invalid Firebase ID token.' }, { status: 401 });
        }
        const idToken = authorizationHeader.split('Bearer ')[1];
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        const uid = decodedToken.uid;
        console.log(`${LOG_PREFIX} Verified token for UID: ${uid}`);

        const oauth2Client = await getAuthenticatedClient(uid, adminDb);
        if ('error' in oauth2Client) {
            return NextResponse.json(oauth2Client, { status: 403 });
        }
        const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
        const spreadsheetId = sheetId;

        switch (action) {
            case 'importStockItems':
                return handleImportStockItems(sheets, adminDb, uid, spreadsheetId, sheetName);
            case 'exportStockItems':
                return handleExportStockItems(sheets, adminDb, uid, spreadsheetId, sheetName);
            case 'importSalesHistory':
                return handleUnsupportedAction(action);
            case 'exportSalesHistory':
                return handleExportSalesHistory(sheets, adminDb, uid, spreadsheetId, sheetName);
            case 'importFoodExpenses':
                return handleImportFoodExpenses(sheets, adminDb, uid, spreadsheetId, sheetName);
            case 'exportFoodExpenses':
                return handleExportFoodExpenses(sheets, adminDb, uid, spreadsheetId, sheetName);
            default:
                return NextResponse.json({ error: 'Invalid action specified.' }, { status: 400 });
        }
    } catch (error: any) {
        console.error(`${LOG_PREFIX} General error in API route:`, { message: error.message, code: error.code, stack: error.stack });
        return NextResponse.json({ error: error.message || 'An unexpected error occurred.', details: error.response?.data?.error_description }, { status: 500 });
    }
}

// --- Helper Functions ---

/** Gets a Google OAuth2 client, refreshing and saving tokens if necessary. */
async function getAuthenticatedClient(uid: string, adminDb: FirebaseFirestore.Firestore) {
    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
        throw new Error("Server configuration error: Google OAuth credentials are not set.");
    }
    const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);

    const userTokensRef = adminDb.collection('userGoogleOAuthTokens').doc(uid);
    const userTokensDoc = await userTokensRef.get();

    if (!userTokensDoc.exists || !userTokensDoc.data()?.access_token) {
        console.log(`${LOG_PREFIX} Google OAuth tokens not found for UID: ${uid}. Generating auth URL.`);
        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline', scope: ['https://www.googleapis.com/auth/spreadsheets'], prompt: 'consent', state: uid,
        });
        return { error: 'Google Sheets authorization required.', needsAuth: true, authUrl: authUrl };
    }

    const storedTokens = userTokensDoc.data() as UserGoogleOAuthTokens;
    oauth2Client.setCredentials(storedTokens);

    if (storedTokens.expiry_date && storedTokens.expiry_date < (Date.now() + 5 * 60 * 1000)) {
        if (!storedTokens.refresh_token) {
            const authUrl = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: ['https://www.googleapis.com/auth/spreadsheets'], prompt: 'consent', state: uid });
            return { error: 'Google authorization expired (no refresh token). Please re-authorize.', needsAuth: true, authUrl: authUrl };
        }
        console.log(`${LOG_PREFIX} Refreshing Google access token for UID: ${uid}`);
        const { credentials } = await oauth2Client.refreshAccessToken();
        await userTokensRef.set(credentials, { merge: true });
        oauth2Client.setCredentials(credentials);
        console.log(`${LOG_PREFIX} Token refreshed and saved for UID: ${uid}`);
    }
    return oauth2Client;
}

/** Creates a new spreadsheet if no ID is provided, and returns its ID and URL. */
async function createSpreadsheetIfNeeded(sheets: sheets_v4.Sheets, spreadsheetId: string | undefined, title: string) {
    if (spreadsheetId) {
        return { spreadsheetId, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`, createdNew: false };
    }
    const newSheet = await sheets.spreadsheets.create({ requestBody: { properties: { title } } });
    const newId = newSheet.data.spreadsheetId;
    if (!newId) throw new Error("Failed to create new Google Sheet.");
    return { spreadsheetId: newId, url: newSheet.data.spreadsheetUrl, createdNew: true };
}

/** Prepares a sheet for writing by clearing it and adding headers. */
async function prepareSheetForExport(sheets: sheets_v4.Sheets, spreadsheetId: string, sheetName: string, headers: string[]) {
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: sheetName });
    await sheets.spreadsheets.values.update({
        spreadsheetId, range: `${sheetName}!A1`, valueInputOption: 'USER_ENTERED', requestBody: { values: [headers] },
    });
}

function handleUnsupportedAction(action: string) {
    console.warn(`${LOG_PREFIX} Unsupported action: ${action}`);
    return NextResponse.json({ error: `Action '${action}' is not supported at this time.` }, { status: 400 });
}

// --- Action-Specific Handlers ---

async function handleExportStockItems(sheets: sheets_v4.Sheets, adminDb: FirebaseFirestore.Firestore, uid: string, spreadsheetId: string | undefined, sheetName: string) {
    try {
        const { spreadsheetId: finalSpreadsheetId, url } = await createSpreadsheetIfNeeded(sheets, spreadsheetId, `StallSync Stock Items Export ${new Date().toISOString().split('T')[0]}`);
        
        const stockItemsSnapshot = await adminDb.collection('stockItems').orderBy('name').get();
        const values = stockItemsSnapshot.docs.map(doc => {
            const item = { id: doc.id, ...doc.data() } as StockItem;
            return [
                item.id, item.name, item.category, item.quantity, item.unit, item.costPrice ?? "", item.price,
                item.lowStockThreshold, item.imageUrl || "", item.siteId || "", item.stallId || "", item.originalMasterItemId || ""
            ];
        });

        await prepareSheetForExport(sheets, finalSpreadsheetId!, sheetName, STOCK_ITEMS_HEADERS);
        await sheets.spreadsheets.values.append({
            spreadsheetId: finalSpreadsheetId, range: sheetName, valueInputOption: 'USER_ENTERED', requestBody: { values },
        });

        return NextResponse.json({ message: "Stock items exported successfully.", spreadsheetId: finalSpreadsheetId, url });
    } catch (e: any) {
        console.error(`${LOG_PREFIX} Error exporting stock items for UID ${uid}:`, e.message);
        return NextResponse.json({ error: 'Failed to export stock items.', details: e.message }, { status: 500 });
    }
}

async function handleExportSalesHistory(sheets: sheets_v4.Sheets, adminDb: FirebaseFirestore.Firestore, uid: string, spreadsheetId: string | undefined, sheetName: string) {
    try {
        const { spreadsheetId: finalSpreadsheetId, url } = await createSpreadsheetIfNeeded(sheets, spreadsheetId, `StallSync Sales History Export ${new Date().toISOString().split('T')[0]}`);

        const salesSnapshot = await adminDb.collection('salesTransactions').where('isDeleted', '==', false).orderBy('transactionDate', 'desc').get();
        const values = salesSnapshot.docs.map(doc => {
            const sale = { id: doc.id, ...doc.data() } as SaleTransaction;
            return [
                sale.id, (sale.transactionDate as any)?.toDate ? (sale.transactionDate as any).toDate().toLocaleString('en-CA') : new Date(sale.transactionDate).toLocaleString('en-CA'),
                sale.staffName || "N/A", sale.staffId, sale.totalAmount, sale.siteId || "", sale.stallId || "", JSON.stringify(sale.items)
            ];
        });

        await prepareSheetForExport(sheets, finalSpreadsheetId!, sheetName, SALES_HISTORY_HEADERS);
        await sheets.spreadsheets.values.append({
            spreadsheetId: finalSpreadsheetId, range: sheetName, valueInputOption: 'USER_ENTERED', requestBody: { values },
        });

        return NextResponse.json({ message: "Sales history exported successfully.", spreadsheetId: finalSpreadsheetId, url });
    } catch (e: any) {
        console.error(`${LOG_PREFIX} Error exporting sales history for UID ${uid}:`, e.message);
        return NextResponse.json({ error: 'Failed to export sales history.', details: e.message }, { status: 500 });
    }
}

async function handleExportFoodExpenses(sheets: sheets_v4.Sheets, adminDb: FirebaseFirestore.Firestore, uid: string, spreadsheetId: string | undefined, sheetName: string) {
    try {
        const { spreadsheetId: finalSpreadsheetId, url } = await createSpreadsheetIfNeeded(sheets, spreadsheetId, `StallSync Food Expenses Export ${new Date().toISOString().split('T')[0]}`);

        const expensesSnapshot = await adminDb.collection('foodItemExpenses').orderBy('purchaseDate', 'desc').get();
        const values = expensesSnapshot.docs.map(doc => {
            const exp = { id: doc.id, ...doc.data() } as FoodItemExpense;
            return [
                exp.id, exp.category, exp.totalCost, exp.paymentMethod, exp.otherPaymentMethodDetails || "",
                (exp.purchaseDate as any)?.toDate ? (exp.purchaseDate as any).toDate().toLocaleDateString('en-CA') : new Date(exp.purchaseDate as any).toLocaleDateString('en-CA'),
                exp.vendor || "", exp.otherVendorDetails || "", exp.notes || "", exp.billImageUrl || "", exp.siteId, exp.stallId
            ];
        });

        await prepareSheetForExport(sheets, finalSpreadsheetId!, sheetName, FOOD_EXPENSES_HEADERS);
        await sheets.spreadsheets.values.append({
            spreadsheetId: finalSpreadsheetId, range: sheetName, valueInputOption: 'USER_ENTERED', requestBody: { values },
        });

        return NextResponse.json({ message: "Food expenses exported successfully.", spreadsheetId: finalSpreadsheetId, url });
    } catch (e: any) {
        console.error(`${LOG_PREFIX} Error exporting food expenses for UID ${uid}:`, e.message);
        return NextResponse.json({ error: 'Failed to export food expenses.', details: e.message }, { status: 500 });
    }
}

async function handleImportStockItems(sheets: sheets_v4.Sheets, adminDb: FirebaseFirestore.Firestore, uid: string, spreadsheetId: string | undefined, sheetName: string) {
    if (!spreadsheetId) return NextResponse.json({ error: 'Sheet ID is required for import.' }, { status: 400 });
    try {
        const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A:L` }); // Limit columns
        const rows = response.data.values;
        if (!rows || rows.length <= 1) return NextResponse.json({ message: 'No data found in the sheet.' });

        const batch = adminDb.batch();
        const errors: { row: number; message: string; }[] = [];
        let importedCount = 0;

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const rowData = Object.fromEntries(STOCK_ITEMS_HEADERS.map((header, index) => [header.toLowerCase().replace(/\s/g, ''), row[index]]));
            
            const validationResult = importStockItemSchemaInternal.safeParse(rowData);
            if (!validationResult.success) {
                errors.push({ row: i + 1, message: validationResult.error.flatten().fieldErrors.toString() });
                continue;
            }
            
            const parsedItem = validationResult.data;
            const dataToSave = { ...parsedItem, lastUpdated: new Date().toISOString() };
            delete (dataToSave as any).id;
            
            const docRef = parsedItem.id ? adminDb.collection('stockItems').doc(parsedItem.id) : adminDb.collection('stockItems').doc();
            batch.set(docRef, dataToSave, { merge: true });
            importedCount++;
        }

        if (importedCount > 0) await batch.commit();
        return NextResponse.json({ message: `Import processed. ${importedCount} items imported/updated. ${errors.length} rows had issues.`, importedCount, errors });
    } catch (e: any) {
        console.error(`${LOG_PREFIX} Error importing stock items for UID ${uid}:`, e.message);
        return NextResponse.json({ error: 'Failed to import stock items.', details: e.message }, { status: 500 });
    }
}

async function handleImportFoodExpenses(sheets: sheets_v4.Sheets, adminDb: FirebaseFirestore.Firestore, uid: string, spreadsheetId: string | undefined, sheetName: string) {
    if (!spreadsheetId) return NextResponse.json({ error: 'Sheet ID is required for import.' }, { status: 400 });
    try {
        const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A:L` });
        const rows = response.data.values;
        if (!rows || rows.length <= 1) return NextResponse.json({ message: 'No data found in the sheet.' });

        const userDocSnap = await adminDb.collection('users').doc(uid).get();
        const recordedByName = userDocSnap.data()?.displayName || 'Imported';
        
        const batch = adminDb.batch();
        const errors: { row: number; message: string; }[] = [];
        let importedCount = 0;

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const rowData = Object.fromEntries(FOOD_EXPENSES_HEADERS.map((header, index) => {
                const key = header.replace(/\s\(.*\)/g, '').replace(/\s+/g, '_').toLowerCase();
                return [key, row[index]];
            }));
            
            const validationResult = importFoodExpenseSchemaInternal.safeParse(rowData);
            if (!validationResult.success) {
                errors.push({ row: i + 1, message: JSON.stringify(validationResult.error.flatten().fieldErrors) });
                continue;
            }
            
            const parsedExpense = validationResult.data;
            const dataToSave = {
                ...parsedExpense,
                purchaseDate: AdminTimestamp.fromDate(parsedExpense.purchaseDate),
                recordedByUid: uid, recordedByName,
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            };
            delete (dataToSave as any).id;
            
            const docRef = parsedExpense.id ? adminDb.collection('foodItemExpenses').doc(parsedExpense.id) : adminDb.collection('foodItemExpenses').doc();
            batch.set(docRef, dataToSave, { merge: true });
            importedCount++;
        }

        if (importedCount > 0) await batch.commit();
        return NextResponse.json({ message: `Import processed. ${importedCount} expenses imported/updated. ${errors.length} rows had issues.`, importedCount, errors });
    } catch (e: any) {
        console.error(`${LOG_PREFIX} Error importing food expenses for UID ${uid}:`, e.message);
        return NextResponse.json({ error: 'Failed to import food expenses.', details: e.message }, { status: 500 });
    }
}
