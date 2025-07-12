
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { google, Auth } from 'googleapis';
import type { UserGoogleOAuthTokens } from '@/types'; 
import { initializeAdminSdk } from '@/lib/firebaseAdmin';

const LOG_PREFIX = "[API:GoogleCallback]";

// Ensure Firebase Admin SDK is initialized
const { adminApp, error: adminAppError } = initializeAdminSdk();
let adminDb: ReturnType<typeof getAdminFirestore> | undefined;

if (adminApp) {
    adminDb = getAdminFirestore(adminApp);
} else {
    console.error(`${LOG_PREFIX} CRITICAL: Firebase Admin App is not initialized due to error: ${adminAppError}. Firestore Admin DB cannot be obtained.`);
}

// Google OAuth2 Client Setup
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI; 

let oauth2Client: Auth.OAuth2Client | null = null;
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI) {
    oauth2Client = new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI
    );
    console.log(`${LOG_PREFIX} Google OAuth2 client configured.`);
} else {
    console.error(`${LOG_PREFIX} CRITICAL: Google OAuth2 client credentials (ID, Secret, Redirect URI) are not configured. OAuth flow will fail.`);
}

export async function GET(request: NextRequest) {
  console.log(`${LOG_PREFIX} GET request received. URL: ${request.url}`);
  if (!adminDb || !oauth2Client) {
    console.error(`${LOG_PREFIX} Server configuration error. Admin SDK Initialized: ${!!adminDb}, OAuth2 Client Initialized: ${!!oauth2Client}`);
    return NextResponse.json({ error: 'Server configuration error (Admin SDK or OAuth2 client not initialized).' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state'); 

  if (!code) {
    console.error(`${LOG_PREFIX} Missing 'code' query parameter.`);
    return NextResponse.redirect(new URL('/settings?error=oauth_missing_code&details=Authorization code from Google was not provided.', request.nextUrl.origin), { status: 302 });
  }

  if (!state) {
    console.error(`${LOG_PREFIX} Missing 'state' query parameter (expected Firebase uid).`);
    return NextResponse.redirect(new URL('/settings?error=oauth_missing_state&details=State parameter was not provided or is invalid.', request.nextUrl.origin), { status: 302 });
  }
  const uid = state; 
  console.log(`${LOG_PREFIX} Received 'code' and 'state' (UID: ${uid}).`);

  // Optional: Validate UID (e.g., check if user exists in Firestore)
  try {
    const userRef = adminDb.collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
        console.warn(`${LOG_PREFIX} UID from state ('${uid}') does not correspond to an existing user in Firestore.`);
        return NextResponse.redirect(new URL('/settings?error=oauth_invalid_user_state&details=User identified by state parameter not found.', request.nextUrl.origin), { status: 302 });
    }
    console.log(`${LOG_PREFIX} UID '${uid}' from state validated against existing user.`);
  } catch (userValidationError: any) {
     console.error(`${LOG_PREFIX} Error validating UID from state '${uid}':`, userValidationError.message);
     return NextResponse.redirect(new URL('/settings?error=oauth_user_validation_failed&details=Could not verify user from state parameter.', request.nextUrl.origin), { status: 302 });
  }


  try {
    console.log(`${LOG_PREFIX} Exchanging authorization code for tokens for UID: ${uid}.`);
    const { tokens } = await oauth2Client.getToken(code);
    console.log(`${LOG_PREFIX} Tokens received for UID: ${uid}. Access token present: ${!!tokens.access_token}, Refresh token present: ${!!tokens.refresh_token}`);

    if (!tokens.access_token) { 
        console.error(`${LOG_PREFIX} Missing access_token from Google for UID ${uid}. Tokens:`, tokens);
        return NextResponse.redirect(new URL('/settings?error=oauth_token_exchange_failed_no_access_token&details=Google did not return an access token.', request.nextUrl.origin), { status: 302 });
    }
    if (!tokens.refresh_token && !tokens.id_token) { 
        console.warn(`${LOG_PREFIX} No refresh_token or id_token received for UID ${uid}. This is unusual if this is the first authorization.`);
    }


    const userGoogleTokens: UserGoogleOAuthTokens = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || "", 
      scope: tokens.scope,
      token_type: tokens.token_type!, 
      expiry_date: tokens.expiry_date,
      id_token: tokens.id_token,
    };

    const tokenDocRef = adminDb.collection('userGoogleOAuthTokens').doc(uid);
    await tokenDocRef.set(userGoogleTokens, { merge: true }); 
    console.log(`${LOG_PREFIX} Tokens stored successfully in Firestore for UID: ${uid}`);

    return NextResponse.redirect(new URL('/settings?oauth_success=true', request.nextUrl.origin), { status: 302 });

  } catch (error: any) {
    console.error(`${LOG_PREFIX} OAuth token exchange or storage error for UID ${uid}:`, { message: error.message, responseData: error.response?.data, stack: error.stack });
    let errorQueryParam = 'oauth_token_exchange_failed';
    let errorDetails = 'Could not exchange authorization code for tokens.';
    if (error.response?.data?.error === 'invalid_grant') {
        errorQueryParam = 'oauth_invalid_grant';
        errorDetails = 'Authorization code is invalid or expired. Please try authorizing again.';
    } else if (error.response?.data?.error) {
        errorDetails = error.response.data.error_description || error.response.data.error;
    } else {
        errorDetails = error.message || errorDetails;
    }
    console.log(`${LOG_PREFIX} Redirecting with error. Param: ${errorQueryParam}, Details: ${errorDetails}`);
    return NextResponse.redirect(new URL(`/settings?error=${errorQueryParam}&details=${encodeURIComponent(errorDetails)}`, request.nextUrl.origin), { status: 302 });
  }
}
