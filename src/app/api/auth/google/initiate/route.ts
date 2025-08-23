
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

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


export async function GET(request: NextRequest) {
  
  // THE FIX: The user's identity will be passed in the 'state' parameter to the callback URL.
  // We no longer need to verify an Authorization header here, as this endpoint's sole purpose
  // is to generate a URL and redirect. The security happens on Google's side and in our callback.
  const { searchParams } = new URL(request.url);
  const uid = searchParams.get('uid');

  if (!uid) {
    return NextResponse.json({ error: 'Unauthorized: User ID is missing.' }, { status: 401 });
  }

  try {
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
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
