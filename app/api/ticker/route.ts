import { NextResponse } from 'next/server';
import { priceStore } from '@/lib/priceStore';

export async function GET() {
  return NextResponse.json(priceStore.getTicker());
}
