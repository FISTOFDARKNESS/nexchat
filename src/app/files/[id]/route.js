import { NextResponse } from 'next/server';

// Compat: URLs antigas /files/{id} (avatares já gravados no banco)
export async function GET(req, ctx) {
  const { id } = await ctx.params;
  const url = new URL(`/api/files/${id}`, req.url);
  return NextResponse.redirect(url, 307);
}
