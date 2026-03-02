import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  const res = await pool.query(
    `SELECT t.id, t.order_id, t.price, t.quantity, t.fee, t.fee_asset, t.traded_at,
            o.side, o.type
     FROM trades t
     JOIN orders o ON o.id = t.order_id
     ORDER BY t.traded_at DESC
     LIMIT 50`
  );
  return NextResponse.json({ trades: res.rows });
}
