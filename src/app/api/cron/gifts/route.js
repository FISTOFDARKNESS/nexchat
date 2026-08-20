import { NextResponse } from 'next/server';
import { processGiftMaintenance, GIFT_CRON_SECRET } from '@/lib/gifts';

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const secret = url.searchParams.get('secret');
    
    if (!GIFT_CRON_SECRET || secret !== GIFT_CRON_SECRET) {
      return NextResponse.json({ error: 'Manutenção de presentes desabilitada' }, { status: 503 });
    }
    const result = await processGiftMaintenance();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Erro no cron de Presentes:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}