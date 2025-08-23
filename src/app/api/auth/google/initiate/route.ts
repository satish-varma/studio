
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

const LOG_PREFIX = "[API:GoogleInitiate]";

// Ensure these are in your .env.local file
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
];


export async function POST(request: NextRequest) {
  
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    console.error(`${LOG_PREFIX} Missing Google OAuth2 credentials in environment variables.`);
    return NextResponse.json({ error: 'Server configuration error: Missing Google credentials.' }, { status: 500 });
  }

  const oAuth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );

  try {
    const { uid } = await request.json();

    if (!uid) {
      return NextResponse.json({ error: 'User ID (uid) is missing from the request body.' }, { status: 400 });
    }
    
    console.log(`${LOG_PREFIX} Generating auth URL for user UID: ${uid}`);
    
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: GMAIL_SCOPES,
      // Pass the UID in the state parameter to identify the user on callback
      state: JSON.stringify({ uid }),
      prompt: 'consent', // Force consent screen every time
    });

    console.log(`${LOG_PREFIX} Returning auth URL to client.`);
    return NextResponse.json({ authUrl });

  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error initiating Google OAuth flow:`, error.message, error.stack);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
