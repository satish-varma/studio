// This file is no longer needed as the auth URL is generated on the client.
// It can be safely deleted. To prevent build errors, we'll keep an empty module.
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ error: 'This endpoint is deprecated.' }, { status: 404 });
}
