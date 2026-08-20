import { NextResponse } from 'next/server';

export async function GET() {
  return new Response('SSE descontinuado. Use WebSocket.', { status: 410 });
}
