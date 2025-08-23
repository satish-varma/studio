
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

export async function GET(request: NextRequest) {
  let adminApp;
  try {
    adminApp = initializeAdminApp();
  } catch (e: any) {
    return NextResponse.json({ error: 'Server Configuration Error.', details: e.message }, { status: 500 });
  }

  const adminDb = getAdminFirestore(adminApp);
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!code || !state) {
    console.error(`${LOG_PREFIX} Missing 'code' or 'state' in callback URL.`);
    return NextResponse.redirect(new URL('/foodstall/sales?error=auth_failed', request.url));
  }

  try {
    const { uid } = JSON.parse(state);
    if (!uid) {
      throw new Error("UID not found in state parameter.");
    }
    
    console.log(`${LOG_PREFIX} Received callback for user UID: ${uid}. Exchanging code for tokens...`);

    const { tokens } = await oAuth2Client.getToken(code);
    console.log(`${LOG_PREFIX} Tokens received from Google.`);

    // Securely store the tokens in Firestore, associated with the user.
    // It's good practice to encrypt these tokens before storing.
    const tokensDocRef = doc(adminDb, 'user_tokens', uid);
    await setDoc(tokensDocRef, {
      ...tokens,
      uid: uid,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    console.log(`${LOG_PREFIX} Tokens for user ${uid} saved successfully.`);

    // Redirect user back to the app, indicating success.
    return NextResponse.redirect(new URL('/foodstall/sales?success=gmail_connected', request.url));

  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error processing Google OAuth callback:`, error.message, error.stack);
    return NextResponse.redirect(new URL(`/foodstall/sales?error=${encodeURIComponent(error.message)}`, request.url));
  }
}
