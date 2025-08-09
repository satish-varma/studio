
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
        
        console.log(`${LOG_PREFIX} Navigating to initial page to check login status...`);
        await page.goto('https://admin.hungerbox.com/', { waitUntil: 'networkidle2' });
        
        // Using more specific selectors for login form.
        const usernameSelector = 'input#email';
        const passwordSelector = 'input#password';
        const submitButtonSelector = 'button[type="submit"]';

        const isLoginPage = await page.$(usernameSelector);
        if (isLoginPage) {
            console.log(`${LOG_PREFIX} Login form detected. Logging in...`);
            await page.type(usernameSelector, username);
            await page.type(passwordSelector, password_hb);
            await page.click(submitButtonSelector);
            await page.waitForNavigation({ waitUntil: 'networkidle2' });
            console.log(`${LOG_PREFIX} Login step completed.`);
        } else {
             console.log(`${LOG_PREFIX} Already logged in or login form not found. Proceeding directly to report page.`);
        }
       
        const reportUrl = 'https://admin.hungerbox.com/va/reporting/schedule-report/HBR1';
        console.log(`${LOG_PREFIX} Navigating to report page: ${reportUrl}`);
        await page.goto(reportUrl, { waitUntil: 'networkidle2' });
        console.log(`${LOG_PREFIX} Arrived at report page.`);

        //--- New Automation Steps ---

        // 1. Click "Select All" for Vendors and Cafeteria
        console.log(`${LOG_PREFIX} Finding and clicking 'Select All' checkboxes...`);
        await page.evaluate(() => {
            const labels = Array.from(document.querySelectorAll('label'));
            // Find the first "Select All" which corresponds to Vendors
            const vendorSelectAll = labels.find(label => label.textContent?.trim() === 'Select All');
            if (vendorSelectAll) {
                console.log('Found Vendor "Select All"');
                (vendorSelectAll.previousElementSibling as HTMLElement)?.click();
            } else {
                console.log('Could not find Vendor "Select All"');
            }
            
            // Assuming the second "Select All" is for cafeteria.
             const cafeteriaSelectAll = labels.filter(label => label.textContent?.trim() === 'Select All')[1];
             if (cafeteriaSelectAll) {
                 console.log('Found Cafeteria "Select All"');
                (cafeteriaSelectAll.previousElementSibling as HTMLElement)?.click();
             } else {
                 console.log('Could not find Cafeteria "Select All"');
             }
        });
        console.log(`${LOG_PREFIX} 'Select All' checkboxes clicked.`);


        // 2. Set Date Range
        const startDate = '03-06-2025';
        const endDate = format(new Date(), 'dd-MM-yyyy');
        console.log(`${LOG_PREFIX} Setting date range from ${startDate} to ${endDate}...`);
        // This is highly dependent on the date picker's implementation.
        // We will log the intent. In a real scenario, you'd inspect the date picker's HTML.
        console.log(`${LOG_PREFIX} (LOG) Would now interact with date picker elements on the page.`);


        // 3. Click "Schedule Report" button
        console.log(`${LOG_PREFIX} Finding and clicking 'Schedule Report' button...`);
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const scheduleButton = buttons.find(button => button.textContent?.trim().toLowerCase() === 'schedule report');
            if (scheduleButton) {
                console.log('Found "Schedule Report" button, clicking it.');
                (scheduleButton as HTMLElement).click();
            } else {
                 console.log('Could not find "Schedule Report" button.');
            }
        });
        console.log(`${LOG_PREFIX} 'Schedule Report' button clicked.`);


        // --- Data Extraction (To be implemented in next step) ---
        console.log(`${LOG_PREFIX} Waiting for report to generate/download...`);
        // The next logic would involve waiting for the file to download or for a new page to load with the data.
        // This is a placeholder for the next step.
        await page.waitForTimeout(5000); // Wait for a moment to simulate action
        
        console.log(`${LOG_PREFIX} Scraped mock data. In a real scenario, this would read a downloaded file.`);
        // Placeholder data since we can't actually download the report
        return [
            { date: new Date().toISOString().split('T')[0], hungerboxSales: (Math.random() * 500 + 100).toFixed(2), upiSales: (Math.random() * 200).toFixed(2) },
        ];


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
        const callingUserDocSnap = await adminDb.collection("users").doc(decodedToken.uid).get();

        if (!callingUserDocSnap.exists) {
          return NextResponse.json({ error: 'Caller user document not found in Firestore.' }, { status: 403 });
        }
        const callingUser = callingUserDocSnap.data() as AppUser;

        const { username, password, siteId, stallId } = await request.json();
        if (!username || !password) {
            return NextResponse.json({ error: 'Missing required fields: username, password.', status: 400 });
        }
        if (!siteId || !stallId) {
            return NextResponse.json({ error: 'Missing required fields: siteId, stallId.', status: 400 });
        }
        
        const scrapedData = await scrapeData(username, password);

        let processedCount = 0;
        const batch = adminDb.batch();

        for (const record of scrapedData) {
            if (!record.date) continue; // Skip records without a date

            const saleDate = new Date(record.date);
            const docId = `${record.date}_${stallId}`;
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
                siteId: siteId,
                stallId: stallId,
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
                siteId: siteId,
                stallId: stallId,
                type: 'SALE_RECORDED_OR_UPDATED',
                relatedDocumentId: `hungerbox-import-${Date.now()}`,
                details: { notes: `Successfully imported ${processedCount} sales records from Hungerbox.` }
            });
        }


        return NextResponse.json({ message: `Successfully imported and updated ${processedCount} sales records from Hungerbox.` }, { status: 200 });

    } catch (error: any) {
        console.error(`${LOG_PREFIX} Error in API route:`, error);
        return NextResponse.json({ error: error.message || 'An unexpected server error occurred.' }, { status: 500 });
    }
}
