
import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import { initializeApp, getApps, cert, App as AdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { hungerboxVendorMapping } from '@/lib/hungerbox-mapping';
import Papa from 'papaparse';

const LOG_PREFIX = "[API:ScrapeHungerbox]";

function initializeAdminApp(): AdminApp {
    if (getApps().length > 0) return getApps()[0];
    const serviceAccountJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!serviceAccountJson) throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON is not set.");
    return initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
}

async function runRealScraping(username: string, password: string): Promise<{ message: string; data: any[] }> {
    console.log(`${LOG_PREFIX} Launching Puppeteer browser...`);
    let browser;
    try {
        browser = await puppeteer.launch({ 
            headless: true, // Run in the background
            args: ['--no-sandbox', '--disable-setuid-sandbox'] // Necessary for many hosting environments
        });
        const page = await browser.newPage();

        console.log(`${LOG_PREFIX} Navigating to Hungerbox login page...`);
        await page.goto('https://hbstg.hungerbox.com/login', { waitUntil: 'networkidle0' });

        console.log(`${LOG_PREFIX} Entering credentials...`);
        await page.type('#email', username);
        await page.type('#password', password);

        console.log(`${LOG_PREFIX} Clicking login button...`);
        await page.click('button[type="submit"]');

        console.log(`${LOG_PREFIX} Waiting for navigation after login...`);
        await page.waitForNavigation({ waitUntil: 'networkidle0' });

        console.log(`${LOG_PREFIX} Login successful. Navigating to reports page...`);
        await page.goto('https://hbstg.hungerbox.com/admin/reports', { waitUntil: 'networkidle0' });

        console.log(`${LOG_PREFIX} (Placeholder) Selecting date range and clicking download...`);
        
        const mockCsvContent = `vendor_id,order_date,is_mrp,actual_value\n"22911","05/20/2024","0","5430.50"\n"22861","05/20/2024","1","3210.00"\n"22912","05/20/2024","0","7890.25"`;
        
        console.log(`${LOG_PREFIX} Parsing downloaded CSV content...`);
        const parsedResult = Papa.parse(mockCsvContent, { header: true });
        const mockParsedCsv = parsedResult.data as { vendor_id: string, actual_value: string }[];
        
        const aggregatedResults: { [key: string]: { siteName: string; stallName: string; totalSales: number } } = {};
        mockParsedCsv.forEach(row => {
            const mapping = hungerboxVendorMapping[row.vendor_id];
            if (mapping) {
                const key = `${mapping.site}-${mapping.stall}`;
                if (!aggregatedResults[key]) {
                    aggregatedResults[key] = { siteName: mapping.site, stallName: mapping.stall, totalSales: 0 };
                }
                aggregatedResults[key].totalSales += parseFloat(row.actual_value);
            }
        });
        const finalData = Object.values(aggregatedResults);

        return {
            message: `Successfully scraped and processed data. ${finalData.length} records aggregated.`,
            data: finalData
        };

    } catch (error: any) {
        console.error(`${LOG_PREFIX} An error occurred during Puppeteer scraping:`, error);
        // Re-throw the error to be caught by the main POST handler
        throw error;
    } finally {
        if (browser) {
            console.log(`${LOG_PREFIX} Closing browser.`);
            await browser.close();
        }
    }
}

export async function POST(request: NextRequest) {
  let adminApp;
  try {
    adminApp = initializeAdminApp();
  } catch (e: any) {
    return NextResponse.json({ error: 'Server Configuration Error.', details: e.message }, { status: 500 });
  }
  const adminAuth = getAdminAuth(adminApp);
  
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing token.' }, { status: 401 });
    }
    const idToken = authorization.split('Bearer ')[1];
    await adminAuth.verifyIdToken(idToken);

    const { username, password } = await request.json();
    if (!username || !password) {
      return NextResponse.json({ error: 'Missing username or password in request body.' }, { status: 400 });
    }
    
    const result = await runRealScraping(username, password);
    
    return NextResponse.json(result, { status: 200 });

  } catch (error: any) {
    console.error(`${LOG_PREFIX} Unhandled error in API route:`, error);

    if (error.code === 'auth/id-token-expired') {
        return NextResponse.json({ error: 'Authentication token expired.' }, { status: 401 });
    }

    let errorMessage = "An unexpected error occurred during the scraping process.";
    let errorDetails = error.message;

    // Check if the error is likely due to Puppeteer failing to launch
    if (error.message.includes("Failed to launch the browser process") || error.message.includes("puppeteer")) {
        errorMessage = "Failed to start the web scraping process.";
        errorDetails = "This is likely due to the execution environment missing necessary dependencies for running the headless browser (Puppeteer). This is a common issue in minimal container environments. To fix this, you may need to switch to a different hosting environment or ensure that all required libraries (like libnss3, libgconf-2-4, etc.) are installed.";
    } else if (error.message.includes("Scraping failed")) {
        errorMessage = error.message;
    }

    return NextResponse.json({ error: errorMessage, details: errorDetails }, { status: 500 });
  }
}
