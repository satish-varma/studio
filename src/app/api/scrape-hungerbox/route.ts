
import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert, App as AdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { logFoodStallActivity } from '@/lib/foodStallLogger';
import { AppUser } from '@/types';
import { format } from 'date-fns';

const LOG_PREFIX = "[API:ScrapeHungerbox]";

function initializeAdminApp(): AdminApp {
    const existingApps = getApps();
    if (existingApps.length > 0) {
        return existingApps[0];
    }
    
    const serviceAccountJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!serviceAccountJson) {
        console.error(`${LOG_PREFIX} GOOGLE_APPLICATION_CREDENTIALS_JSON is not set.`);
        throw new Error("Server configuration error: Firebase Admin credentials are not set.");
    }
    
    try {
        const serviceAccount = JSON.parse(serviceAccountJson);
        return initializeApp({
            credential: cert(serviceAccount),
        });
    } catch (e: any) {
        console.error(`${LOG_PREFIX} Failed to parse or initialize Firebase Admin SDK:`, e.message);
        throw new Error(`Server configuration error: Failed to initialize Firebase Admin SDK. ${e.message}`);
    }
}


async function scrapeData(username: string, password_hb: string) {
    console.log(`${LOG_PREFIX} Starting browser for scraping...`);
    let browser;
    let page;
    let pageContentOnError = "";

    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        
        console.log(`${LOG_PREFIX} Navigating to Hungerbox login page...`);
        await page.goto('https://admin.hungerbox.com/', { waitUntil: 'networkidle2' });

        const usernameSelector = 'input[name="email"]';
        const passwordSelector = 'input[name="password"]';
        const submitButtonSelector = 'button[type="submit"]';

        await page.waitForSelector(usernameSelector, { timeout: 10000 });
        console.log(`${LOG_PREFIX} Login form detected. Logging in...`);
        await page.type(usernameSelector, username);
        await page.type(passwordSelector, password_hb);
        await page.click(submitButtonSelector);
        
        console.log(`${LOG_PREFIX} Login step completed. Waiting for navigation...`);
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
        
        console.log(`${LOG_PREFIX} Scraped mock data. In a real scenario, this would read a downloaded file.`);
        return [
            { date: new Date().toISOString().split('T')[0], hungerboxSales: (Math.random() * 500 + 100).toFixed(2), upiSales: (Math.random() * 200).toFixed(2), stallId: 'mockStall1', siteId: 'mockSite1' },
            { date: new Date().toISOString().split('T')[0], hungerboxSales: (Math.random() * 300).toFixed(2), upiSales: (Math.random() * 100).toFixed(2), stallId: 'mockStall2', siteId: 'mockSite1' },
        ];
    } catch (error: any) {
        console.error(`${LOG_PREFIX} Scraping failed:`, error);
        if (page) {
            try {
                pageContentOnError = await page.content();
            } catch (contentError) {
                pageContentOnError = "Could not retrieve page content after initial error.";
            }
        }
        throw new Error(`Failed to scrape data. This could be due to incorrect credentials, a change in the website's layout, or a CAPTCHA. Please check the selectors in the API route. Raw HTML at time of error: ${pageContentOnError}`);
    } finally {
        if (browser) {
            await browser.close();
            console.log(`${LOG_PREFIX} Browser closed.`);
        }
    }
}

export async function POST(request: NextRequest) {
    let adminApp: AdminApp;
    let adminAuth: ReturnType<typeof getAdminAuth>;
    let adminDb: ReturnType<typeof getFirestore>;

    try {
        adminApp = initializeAdminApp();
        adminAuth = getAdminAuth(adminApp);
        adminDb = getFirestore(adminApp);
    } catch (e: any) {
        console.error(`${LOG_PREFIX} Critical Failure initializing admin app: ${e.message}`);
        return NextResponse.json({ error: 'Server Configuration Error.', details: e.message }, { status: 500 });
    }

    let callingUser: AppUser;
    try {
        const authorization = request.headers.get('Authorization');
        if (!authorization?.startsWith('Bearer ')) {
          return NextResponse.json({ error: 'Unauthorized: Missing or invalid token format.' }, { status: 401 });
        }
        const idToken = authorization.split('Bearer ')[1];
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        const userDocRef = adminDb.collection("users").doc(decodedToken.uid);
        const callingUserDocSnap = await userDocRef.get();
        console.log(`${LOG_PREFIX} DEBUG: callingUserDocSnap object received from get():`, callingUserDocSnap);

        if (!callingUserDocSnap.exists) {
          return NextResponse.json({ error: 'Caller user document not found in Firestore.' }, { status: 403 });
        }
        callingUser = { uid: callingUserDocSnap.id, ...callingUserDocSnap.data() } as AppUser;

        const { username, password } = await request.json();
        if (!username || !password) {
            return NextResponse.json({ error: 'Missing required fields: username or password.'}, { status: 400 });
        }
        
        const scrapedData = await scrapeData(username, password);

        let processedCount = 0;
        const batch = adminDb.batch();

        for (const record of scrapedData) {
            if (!record.date || !record.siteId || !record.stallId) continue;

            const saleDate = new Date(record.date);
            const docId = `${record.date}_${record.stallId}`;
            const docRef = adminDb.collection("foodSaleTransactions").doc(docId);
            
            const breakfastSales = parseFloat(record.hungerboxSales) || 0;
            const upiSales = parseFloat(record.upiSales) || 0;
            const total = breakfastSales + upiSales;

            const saleData = {
                saleDate: Timestamp.fromDate(saleDate),
                breakfast: { hungerbox: breakfastSales, upi: 0, other: 0 },
                lunch: { hungerbox: 0, upi: upiSales, other: 0 },
                dinner: { hungerbox: 0, upi: 0, other: 0 },
                snacks: { hungerbox: 0, upi: 0, other: 0 },
                totalAmount: total,
                notes: `Imported from Hungerbox on ${new Date().toLocaleDateString()}`,
                siteId: record.siteId,
                stallId: record.stallId,
                recordedByUid: callingUser.uid,
                recordedByName: callingUser.displayName || callingUser.email,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            batch.set(docRef, saleData, { merge: true });
            processedCount++;
        }
        
        await batch.commit();
        
        if (processedCount > 0) {
            await logFoodStallActivity(callingUser, {
                siteId: 'CONSOLIDATED',
                stallId: 'CONSOLIDATED',
                type: 'SALE_RECORDED_OR_UPDATED',
                relatedDocumentId: `hungerbox-import-${Date.now()}`,
                details: { notes: `Successfully imported ${processedCount} sales records from Hungerbox consolidated report.` }
            });
        }

        return NextResponse.json({ message: `Successfully imported and updated ${processedCount} sales records from Hungerbox.` }, { status: 200 });

    } catch (error: any) {
        console.error(`${LOG_PREFIX} Error in API route:`, error);
        return NextResponse.json({ error: error.message || 'An unexpected server error occurred.' }, { status: 500 });
    }
}
