
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuth } from 'firebase-admin/auth';
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
  
  // This check is to ensure we can get a UID to pass in the state.
  // It relies on cookies being sent by the browser during navigation.
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'This endpoint requires user authentication to proceed.' }, { status: 401 });
  }

  try {
    const adminApp = initializeAdminApp();
    const idToken = authorization.split('Bearer ')[1];
    const decodedToken = await getAuth(adminApp).verifyIdToken(idToken);
    const uid = decodedToken.uid;
    
    const oAuth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
    );
    
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/gmail.readonly'],
      state: JSON.stringify({ uid }),
      prompt: 'consent',
    });

    // Instead of returning JSON, we redirect the user's browser directly.
    return NextResponse.redirect(authUrl);

  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error initiating Google OAuth flow:`, error.message);
    if (error.code === 'auth/id-token-expired') {
       return NextResponse.json({ error: 'Authentication token expired. Please try again.' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
