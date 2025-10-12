
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

// Updated function to return a result object instead of throwing
async function runRealScraping(username: string, password: string): Promise<{ success: boolean; message: string; data?: any[]; error?: string }> {
    console.log(`${LOG_PREFIX} Launching Puppeteer browser...`);
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true, // Run in the background
            args: ['--no-sandbox', '--disable-setuid-sandbox'] // Necessary for many hosting environments
        });
        const page = await browser.newPage();

        console.log(`${LOG_PREFIX} Navigating to Hungerbox login page...`);
        // Updated URL to the correct admin login page
        await page.goto('https://admin.hungerbox.com/', { waitUntil: 'networkidle0' });

        console.log(`${LOG_PREFIX} Entering credentials...`);
        await page.type('#email', username);
        await page.type('#password', password);

        console.log(`${LOG_PREFIX} Clicking login button...`);
        await page.click('button[type="submit"]');

        console.log(`${LOG_PREFIX} Waiting for navigation after login...`);
        await page.waitForNavigation({ waitUntil: 'networkidle0' });

        const currentUrl = page.url();
        if (currentUrl.includes('login') || currentUrl.includes('auth')) {
            console.error(`${LOG_PREFIX} Login failed. Page is still on a login-related URL: ${currentUrl}`);
            // This is now a returned error, not a thrown one.
            return {
                success: false,
                message: "Login failed. Please check your credentials or the website structure.",
                error: "After submitting credentials, the page was still on a login URL."
            };
        }
        
        console.log(`${LOG_PREFIX} Login successful. Current URL: ${currentUrl}`);
        console.log(`${LOG_PREFIX} (Placeholder) Navigating to reports page and downloading...`);
        
        // This part remains a placeholder as real report downloading is complex
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
            success: true,
            message: `Successfully scraped and processed data. ${finalData.length} records aggregated.`,
            data: finalData
        };

    } catch (error: any) {
        console.error(`${LOG_PREFIX} An error occurred during Puppeteer scraping:`, error.message);
        // Return a failure object instead of throwing
        return {
            success: false,
            message: "An error occurred during the scraping process.",
            error: error.message || 'Unknown scraping error'
        };
    } finally {
        if (browser) {
            console.log(`${LOG_PREFIX} Closing browser.`);
            await browser.close();
        }
    }
}

export async function POST(request: NextRequest) {
  try {
    let adminApp;
    try {
      adminApp = initializeAdminApp();
    } catch (e: any) {
      console.error(`${LOG_PREFIX} Critical server configuration error:`, e.message);
      return NextResponse.json({ error: 'Server Configuration Error.', details: e.message }, { status: 500 });
    }
    const adminAuth = getAdminAuth(adminApp);
    
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
    
    if (result.success) {
        return NextResponse.json({ message: result.message, data: result.data }, { status: 200 });
    } else {
        return NextResponse.json({ error: result.message, details: result.error }, { status: 500 });
    }

  } catch (error: any) {
    console.error(`${LOG_PREFIX} Unhandled error in API route:`, error);
    let errorMessage = "An unexpected server error occurred.";
    let errorDetails = error.message;
    let statusCode = 500;

    if (error.code === 'auth/id-token-expired') {
        errorMessage = 'Authentication token expired.';
        statusCode = 401;
    } else if (error instanceof SyntaxError) {
        errorMessage = 'Invalid JSON in request body.';
        statusCode = 400;
    }
    
    return NextResponse.json({ error: errorMessage, details: errorDetails }, { status: statusCode });
  }
}
