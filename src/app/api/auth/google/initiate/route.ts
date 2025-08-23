
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { initializeApp, getApps, cert, App as AdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';

const LOG_PREFIX = "[API:GoogleInitiate]";

// Ensure these are in your .env.local file
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

const oAuth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
];

function initializeAdminApp(): AdminApp {
    if (getApps().length > 0) return getApps()[0];
    const serviceAccountJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!serviceAccountJson) throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON is not set.");
    return initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
}

export async function GET(request: NextRequest) {
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
      return NextResponse.json({ error: 'Unauthorized: Missing or invalid token format.' }, { status: 401 });
    }
    const idToken = authorization.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;
    
    console.log(`${LOG_PREFIX} Generating auth URL for user UID: ${uid}`);
    
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: GMAIL_SCOPES,
      // Pass the UID in the state parameter to identify the user on callback
      state: JSON.stringify({ uid }),
      prompt: 'consent', // Force consent screen every time
    });

    console.log(`${LOG_PREFIX} Redirecting user to Google consent screen.`);
    return NextResponse.redirect(authUrl);

  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error initiating Google OAuth flow:`, error.message, error.stack);
     if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
      return NextResponse.json({ error: 'Unauthorized: Invalid or expired token.' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
