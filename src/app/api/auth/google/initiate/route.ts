
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

const LOG_PREFIX = "[API:GoogleInitiate]";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

export async function GET(request: NextRequest) {
    console.log(`${LOG_PREFIX} GET request received.`);
    
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
        console.error(`${LOG_PREFIX} Missing critical Google OAuth2 configuration in environment variables.`);
        return NextResponse.json({ error: "Server configuration error: Google API credentials not set." }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const uid = searchParams.get('uid');

    if (!uid) {
        console.warn(`${LOG_PREFIX} Request is missing the 'uid' query parameter.`);
        return NextResponse.json({ error: "Missing required 'uid' query parameter." }, { status: 400 });
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
            state: JSON.stringify({ uid: uid }), // Pass UID in state to identify user in callback
            prompt: 'consent',
        });
        
        console.log(`${LOG_PREFIX} Generated auth URL for UID: ${uid}. Redirecting...`);
        return NextResponse.redirect(authUrl);

    } catch (error: any) {
        console.error(`${LOG_PREFIX} Error generating Google auth URL:`, error.message, error.stack);
        return NextResponse.json({ error: 'Failed to generate authentication URL.', details: error.message }, { status: 500 });
    }
}
