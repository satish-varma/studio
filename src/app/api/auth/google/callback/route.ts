
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { initializeApp, getApps, getApp, App as AdminApp } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { google, Auth } from 'googleapis';
import type { UserGoogleOAuthTokens } from '@/types'; 

// Ensure Firebase Admin SDK is initialized
let adminApp: AdminApp;
let adminDb: ReturnType<typeof getAdminFirestore>;

if (!getApps().length) {
  try {
    adminApp = initializeApp(); // Relies on GOOGLE_APPLICATION_CREDENTIALS
    console.log("Firebase Admin SDK initialized successfully in OAuth callback route.");
  } catch (e: any) {
    console.error("Firebase Admin SDK initialization error in OAuth callback route:", e.message);
  }
} else {
  adminApp = getApp();
  console.log("Firebase Admin SDK already initialized, got existing instance in OAuth callback route.");
}

if (adminApp!) {
    adminDb = getAdminFirestore(adminApp);
} else {
    console.error("CRITICAL: Firebase Admin App is not initialized in OAuth callback. Firestore Admin DB cannot be obtained.");
}

// Google OAuth2 Client Setup
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI; // Should point to this callback route

let oauth2Client: Auth.OAuth2Client | null = null;
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI) {
    oauth2Client = new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI
    );
    console.log("Google OAuth2 client configured in OAuth callback route.");
} else {
    console.error("CRITICAL: Google OAuth2 client credentials (ID, Secret, Redirect URI) are not configured in callback. OAuth flow will fail.");
}

export async function GET(request: NextRequest) {
  if (!adminDb || !oauth2Client) {
    return NextResponse.json({ error: 'Server configuration error (Admin SDK or OAuth2 client not initialized).' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // This should be the Firebase uid

  if (!code) {
    console.error("OAuth Callback Error: Missing authorization code from Google.");
    return NextResponse.redirect(new URL('/settings?error=oauth_missing_code', request.nextUrl.origin), { status: 302 });
  }

  if (!state) {
    console.error("OAuth Callback Error: Missing state parameter (expected Firebase uid).");
    // Potentially a security risk or misconfiguration.
    return NextResponse.redirect(new URL('/settings?error=oauth_missing_state', request.nextUrl.origin), { status: 302 });
  }
  const uid = state; // The state parameter carries the Firebase uid

  try {
    console.log(`OAuth Callback: Received code for uid: ${uid}. Exchanging for tokens...`);
    const { tokens } = await oauth2Client.getToken(code);
    console.log(`OAuth Callback: Tokens received for uid: ${uid}`, tokens);

    if (!tokens.access_token || !tokens.refresh_token) {
        console.error(`OAuth Callback Error for uid ${uid}: Missing access_token or refresh_token from Google.`, tokens);
        return NextResponse.redirect(new URL('/settings?error=oauth_token_exchange_failed_partial', request.nextUrl.origin), { status: 302 });
    }

    const userGoogleTokens: UserGoogleOAuthTokens = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope,
      token_type: tokens.token_type!, // Assuming token_type is always present
      expiry_date: tokens.expiry_date,
      id_token: tokens.id_token,
    };

    // Store tokens in Firestore
    const tokenDocRef = adminDb.collection('userGoogleOAuthTokens').doc(uid);
    await tokenDocRef.set(userGoogleTokens);
    console.log(`OAuth Callback: Tokens stored successfully in Firestore for uid: ${uid}`);

    // Redirect user back to the settings page or another appropriate page
    // You might want to pass a success query parameter
    return NextResponse.redirect(new URL('/settings?oauth_success=true', request.nextUrl.origin), { status: 302 });

  } catch (error: any) {
    console.error(`OAuth Callback Error for uid ${uid} during token exchange or storage:`, error);
    // Handle specific errors like 'invalid_grant' which means the code might be expired or already used.
    let errorQueryParam = 'oauth_token_exchange_failed';
    if (error.response?.data?.error === 'invalid_grant') {
        errorQueryParam = 'oauth_invalid_grant';
    }
    return NextResponse.redirect(new URL(`/settings?error=${errorQueryParam}`, request.nextUrl.origin), { status: 302 });
  }
}

