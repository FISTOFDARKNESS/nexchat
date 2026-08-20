import { NextResponse } from 'next/server';
import { getClientIp } from '@/lib/ip';

export async function GET(req) {
  try {
    const ip = getClientIp(req);
    
    if (!ip) {
      return NextResponse.json({ country: null, error: 'Could not determine client IP' });
    }

    const res = await fetch(`https://ip-api.com/json/${ip}?fields=status,country,countryCode,message,query`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000)
    });
    
    if (res.status === 429) {
      
      return NextResponse.json({ country: null, error: 'Geolocation rate limited' });
    }
    if (!res.ok) {
      return NextResponse.json({ country: null, error: 'Geolocation service unavailable' });
    }
    
    const data = await res.json();
    
    if (data.status !== 'success') {
      return NextResponse.json({ country: null, error: data.message || 'Geolocation failed' });
    }
    
    return NextResponse.json({ 
      country: data.countryCode || null,
      countryName: data.country || null
    });
  } catch (error) {
    console.error('IP geolocation error:', error);
    return NextResponse.json({ country: null, error: 'Geolocation service unavailable' });
  }
}
