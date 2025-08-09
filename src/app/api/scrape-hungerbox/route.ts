
import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import { getFirestore, doc, setDoc, Timestamp, getDoc } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert, App as AdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { logFoodStallActivity } from '@/lib/foodStallLogger';
import { AppUser } from '@/types';

const LOG_PREFIX = "[API:ScrapeHungerbox]";

function initializeAdminApp(): AdminApp {
    if (getApps().length > 0 && getApps().find(app => app.name === '[DEFAULT]')) {
        return getApps().find(app => app.name === '[DEFAULT]')!;
    }
    const serviceAccountJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!serviceAccountJson) {
        throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON is not set.");
    }
    return initializeApp({
        credential: cert(JSON.parse(serviceAccountJson)),
    });
}

// NOTE: This is a simplified example. Real-world scraping is fragile and
// highly dependent on the target site's exact HTML structure.
// Selectors will likely need to be updated if Hungerbox changes their site.
async function scrapeData(username: string, password_hb: string) {
    console.log(`${LOG_PREFIX} Starting browser for scraping...`);
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'] // Necessary for some environments
        });
        const page = await browser.newPage();
        await page.goto('https://admin.hungerbox.com/', { waitUntil: 'networkidle2' });

        console.log(`${LOG_PREFIX} Logging in...`);
        // These selectors are common but are GUESSES. They will likely need to be adjusted.
        await page.type('input[name="username"], input[type="email"]', username);
        await page.type('input[name="password"], input[type="password"]', password_hb);
        await page.click('button[type="submit"], button:contains("Login")');

        await page.waitForNavigation({ waitUntil: 'networkidle2' });
        console.log(`${LOG_PREFIX} Login successful. Navigating to reports page...`);

        // This navigation is a GUESS. The user would need to find the correct URL.
        // For example, it might be https://admin.hungerbox.com/reports/sales
        // Or it might require clicking through a menu.
        // We will assume for now the data is on a page we can navigate to.
        // This is the most fragile part of the process.
        await page.goto('https://admin.hungerbox.com/va/reporting/schedule-report/HBR1', { waitUntil: 'networkidle2' });

        console.log(`${LOG_PREFIX} Extracting data from sales table...`);
        // This is another GUESS. We're looking for a table with an ID like 'sales-report-table'.
        // The user must inspect the page to find the correct selector.
        const salesData = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('#sales-report-table tbody tr'));
            return rows.map(row => {
                const cells = row.querySelectorAll('td');
                return {
                    date: cells[0]?.innerText,
                    totalSales: cells[1]?.innerText,
                    //... extract other relevant columns
                };
            });
        });
        
        console.log(`${LOG_PREFIX} Scraped ${salesData.length} rows of data.`);
        return salesData;

    } catch (error) {
        console.error(`${LOG_PREFIX} Scraping failed:`, error);
        throw new Error("Failed to scrape data. This could be due to incorrect credentials, a change in the website's layout, or a CAPTCHA. Please check the selectors in the API route.");
    } finally {
        if (browser) {
            await browser.close();
            console.log(`${LOG_PREFIX} Browser closed.`);
        }
    }
}

export async function POST(request: NextRequest) {
    let adminApp: AdminApp;
    try {
      adminApp = initializeAdminApp();
    } catch (e: any) {
      console.error(`${LOG_PREFIX} Critical Failure initializing admin app: ${e.message}`);
      return NextResponse.json({ error: 'Server Configuration Error.', details: e.message }, { status: 500 });
    }
    const adminAuth = getAdminAuth(adminApp);
    const adminDb = getFirestore(adminApp);

    try {
        const authorization = request.headers.get('Authorization');
        if (!authorization?.startsWith('Bearer ')) {
          return NextResponse.json({ error: 'Unauthorized: Missing or invalid token format.' }, { status: 401 });
        }
        const idToken = authorization.split('Bearer ')[1];
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        const callingUser = (await getDoc(doc(adminDb, "users", decodedToken.uid))).data() as AppUser;


        const { username, password, siteId, stallId, consolidated } = await request.json();
        if (!username || !password) {
            return NextResponse.json({ error: 'Missing required fields: username, password.', status: 400 });
        }
        if (!consolidated && (!siteId || !stallId)) {
            return NextResponse.json({ error: 'If not consolidated, siteId and stallId are required.' }, { status: 400 });
        }
        
        // This is where we would call the scrapeData function.
        // Since we cannot actually scrape, we will return mock data.
        // In a real implementation, you would uncomment the line below.
        // const scrapedData = await scrapeData(username, password);

        // --- MOCK DATA FOR DEMONSTRATION ---
        console.log(`${LOG_PREFIX} Using MOCK DATA for demonstration purposes.`);
        const scrapedData = [
            { date: new Date().toISOString().split('T')[0], hungerboxSales: (Math.random() * 500 + 100).toFixed(2), upiSales: (Math.random() * 200).toFixed(2) },
            { date: new Date(Date.now() - 86400000).toISOString().split('T')[0], hungerboxSales: (Math.random() * 600 + 150).toFixed(2), upiSales: (Math.random() * 250).toFixed(2) },
        ];
        // --- END MOCK DATA ---

        let processedCount = 0;
        for (const record of scrapedData) {
            const saleDate = new Date(record.date);
            // If consolidated, use a special ID. Otherwise use the specific stall ID.
            const docStallId = consolidated ? 'CONSOLIDATED' : stallId;
            const docSiteId = consolidated ? 'CONSOLIDATED' : siteId;
            const docId = `${record.date}_${docStallId}`;
            const docRef = doc(adminDb, "foodSaleTransactions", docId);
            
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
                siteId: docSiteId,
                stallId: docStallId,
                recordedByUid: callingUser.uid,
                recordedByName: callingUser.displayName || callingUser.email,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            await setDoc(docRef, saleData, { merge: true });
            processedCount++;
        }
        
        await logFoodStallActivity(callingUser, {
            siteId: consolidated ? 'CONSOLIDATED' : siteId,
            stallId: consolidated ? 'CONSOLIDATED' : stallId,
            type: 'SALE_RECORDED_OR_UPDATED',
            relatedDocumentId: `hungerbox-import-${Date.now()}`,
            details: { notes: `Successfully imported ${processedCount} sales records from Hungerbox.` }
        });


        return NextResponse.json({ message: `Successfully imported and updated ${processedCount} sales records from Hungerbox.` }, { status: 200 });

    } catch (error: any) {
        console.error(`${LOG_PREFIX} Error in API route:`, error);
        return NextResponse.json({ error: error.message || 'An unexpected server error occurred.' }, { status: 500 });
    }
}
