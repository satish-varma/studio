
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getApps, initializeApp, cert, App as AdminApp } from 'firebase-admin/app';

const LOG_PREFIX = "[API:GoogleInitiate]";

// Ensure these are in your .env.local file
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

function initializeAdminApp(): AdminApp {
    if (getApps().length > 0) return getApps()[0];
    const serviceAccountJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!serviceAccountJson) throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON is not set.");
    return initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
}

export async function GET(request: NextRequest) {
  
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    console.error(`${LOG_PREFIX} Missing Google OAuth2 credentials in environment variables.`);
    return NextResponse.json({ error: 'Server configuration error: Missing Google credentials.' }, { status: 500 });
  }

  // The user's UID needs to be passed to the 'state' parameter so we know who to associate the tokens with in the callback.
  // We will get it from a query parameter instead of a header.
  const { searchParams } = new URL(request.url);
  const uid = searchParams.get('uid');

  if (!uid) {
      return NextResponse.json({ error: 'This endpoint requires a user UID to be passed as a query parameter.' }, { status: 400 });
  }

  try {
    // Admin App initialization is not strictly needed here if we are not verifying the user token,
    // but it's good practice to keep the initialization check in case other logic is added later.
    initializeAdminApp(); 
    
    const oAuth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
    );
    
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/gmail.readonly'],
      // Pass the UID through the state parameter so we can identify the user upon callback
      state: JSON.stringify({ uid }),
      prompt: 'consent', // Force consent screen every time
    });

    // Instead of returning JSON, we redirect the user's browser directly.
    return NextResponse.redirect(authUrl);

  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error initiating Google OAuth flow:`, error.message);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
