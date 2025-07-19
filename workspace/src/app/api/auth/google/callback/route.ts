// This API route was part of a previous Google Sheets integration and is no longer used.
// It is kept as an empty, valid module to prevent build errors.
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ message: 'Endpoint not configured.' }, { status: 404 });
}
