import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  const res = await pool.query(
    `SELECT symbol, quantity, entry_price, unrealized_pnl, updated_at FROM positions WHERE symbol = 'BTCUSDT'`
  );
  return NextResponse.json({ position: res.rows[0] || null });
}
