import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ error: 'Canal privado descontinuado. Use WebSocket Render.' }, { status: 410 });
}
