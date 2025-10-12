
import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import { initializeApp, getApps, cert, App as AdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { hungerboxVendorMapping } from '@/lib/hungerbox-mapping';

const LOG_PREFIX = "[API:ScrapeHungerbox]";

function initializeAdminApp(): AdminApp {
    if (getApps().length > 0) return getApps()[0];
    const serviceAccountJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!serviceAccountJson) throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON is not set.");
    return initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
}

// --- MOCK IMPLEMENTATION ---
async function runMockScraping(username: string, password: string) {
    console.log(`${LOG_PREFIX} Running MOCK scraping process for user: ${username}`);
    
    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check for mock failure condition
    if (password === 'fail') {
        console.warn(`${LOG_PREFIX} Mock failure condition triggered.`);
        throw new Error("Mock scraping failed. Please check credentials (use password 'fail' to test).");
    }

    // Simulate downloading a CSV and parsing it.
    // The data structure here mirrors what a real parsed CSV might look like.
    const mockParsedCsv = [
        { vendor_id: '22911', order_date: '05/20/2024', actual_value: '5430.50' },
        { vendor_id: '22861', order_date: '05/20/2024', actual_value: '3210.00' },
        { vendor_id: '22912', order_date: '05/20/2024', actual_value: '7890.25' },
        { vendor_id: '22911', order_date: '05/19/2024', actual_value: '4890.00' },
        { vendor_id: 'INVALID_ID', order_date: '05/19/2024', actual_value: '100.00' }, // To test mapping failure
    ];

    console.log(`${LOG_PREFIX} Mock CSV data generated. Processing...`);

    // Aggregate the data using the mapping
    const aggregatedResults: { [key: string]: { siteName: string; stallName: string; totalSales: number } } = {};

    mockParsedCsv.forEach(row => {
        const mapping = hungerboxVendorMapping[row.vendor_id];
        if (mapping) {
            const key = `${mapping.site}-${mapping.stall}`;
            if (!aggregatedResults[key]) {
                aggregatedResults[key] = {
                    siteName: mapping.site,
                    stallName: mapping.stall,
                    totalSales: 0,
                };
            }
            aggregatedResults[key].totalSales += parseFloat(row.actual_value);
        } else {
            console.warn(`${LOG_PREFIX} No mapping found for vendor_id: ${row.vendor_id}. Skipping row.`);
        }
    });

    // Convert the aggregated object to an array
    const finalData = Object.values(aggregatedResults);

    console.log(`${LOG_PREFIX} Mock scraping and processing complete. Returning ${finalData.length} records.`);
    return {
        message: `Successfully scraped and processed mock data. ${finalData.length} records aggregated.`,
        data: finalData
    };
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
    
    // --- Using the Mock Implementation ---
    const result = await runMockScraping(username, password);
    
    return NextResponse.json(result, { status: 200 });

  } catch (error: any) {
    console.error(`${LOG_PREFIX} Unhandled error in API route:`, error);
    let errorMessage = "An unexpected error occurred during the scraping process.";
    if (error.code === 'auth/id-token-expired') {
        return NextResponse.json({ error: 'Authentication token expired.' }, { status: 401 });
    }
    if (error.message.includes("Mock scraping failed")) {
        errorMessage = error.message;
    }
    return NextResponse.json({ error: errorMessage, details: error.message }, { status: 500 });
  }
}
