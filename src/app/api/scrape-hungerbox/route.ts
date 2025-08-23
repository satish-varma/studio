// This API route was part of a previous experimental feature and is no longer used.
// The functionality has been replaced by the more robust /api/gmail-handler and /api/auth/google routes.
// It is kept as an empty, valid module to prevent build errors.
import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ error: 'This endpoint is deprecated and no longer configured.' }, { status: 410 });
}
