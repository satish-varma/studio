
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { initializeApp, getApps, cert, App as AdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';

const LOG_PREFIX = "[API:GoogleCallback]";

// Ensure these are in your .env.local file
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

const oAuth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

function initializeAdminApp(): AdminApp {
    if (getApps().length > 0) return getApps()[0];
    const serviceAccountJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!serviceAccountJson) throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON is not set.");
    return initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
}

const renderAutoClosingPage = (message: string) => `
  <!DOCTYPE html>
  <html>
    <head>
      <title>Authentication Complete</title>
      <script>
        window.onload = function() {
          if (window.opener) {
            window.opener.postMessage("${message}", "${new URL(GOOGLE_REDIRECT_URI!).origin}");
          }
          window.close();
        };
      </script>
    </head>
    <body>
      <p>Authentication successful. This window will now close.</p>
    </body>
  </html>
`;

export async function GET(request: NextRequest) {
  let adminApp;
  try {
    adminApp = initializeAdminApp();
  } catch (e: any) {
    return new Response(`<h1>Server Configuration Error</h1><p>${e.message}</p>`, { status: 500, headers: { 'Content-Type': 'text/html' } });
  }

  const adminDb = getAdminFirestore(adminApp);
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!code || !state) {
    console.error(`${LOG_PREFIX} Missing 'code' or 'state' in callback URL.`);
    return new Response(`<h1>Authentication Failed</h1><p>Required parameters 'code' or 'state' were missing.</p>`, { status: 400, headers: { 'Content-Type': 'text/html' } });
  }

  try {
    const { uid } = JSON.parse(state);
    if (!uid) {
      throw new Error("UID not found in state parameter.");
    }
    
    console.log(`${LOG_PREFIX} Received callback for user UID: ${uid}. Exchanging code for tokens...`);

    const { tokens } = await oAuth2Client.getToken(code);
    console.log(`${LOG_PREFIX} Tokens received from Google.`);

    const tokensDocRef = adminDb.collection('user_tokens').doc(uid);
    await tokensDocRef.set({
      ...tokens,
      uid: uid,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    console.log(`${LOG_PREFIX} Tokens for user ${uid} saved successfully.`);

    return new Response(renderAutoClosingPage('auth_success'), { status: 200, headers: { 'Content-Type': 'text/html' } });

  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error processing Google OAuth callback:`, error.message, error.stack);
    return new Response(`<h1>Authentication Error</h1><p>${error.message}</p>`, { status: 500, headers: { 'Content-Type': 'text/html' } });
  }
}
