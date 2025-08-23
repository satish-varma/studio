
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

const LOG_PREFIX = "[API:GoogleInitiate]";

// Ensure these are in your .env.local file
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;


export async function GET(request: NextRequest) {
  
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    console.error(`${LOG_PREFIX} Missing Google OAuth2 credentials in environment variables.`);
    return NextResponse.json({ error: 'Server configuration error: Missing Google credentials.' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const uid = searchParams.get('uid');

  if (!uid) {
      return NextResponse.json({ error: 'This endpoint requires a user UID to be passed as a query parameter.' }, { status: 400 });
  }

  try {
    const oAuth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
    );
    
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/gmail.readonly'],
      // Pass user's UID in the state to retrieve it in the callback
      state: JSON.stringify({ uid }),
      // Force the consent screen to appear every time, useful for development and ensuring refresh tokens are granted
      prompt: 'consent', 
    });

    console.log(`${LOG_PREFIX} Generated auth URL for UID: ${uid}. Redirecting...`);
    // Redirect the user to Google's OAuth consent screen
    return NextResponse.redirect(authUrl);

  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error initiating Google OAuth flow:`, error.message);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
