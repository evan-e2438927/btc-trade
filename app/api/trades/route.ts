/**
 * GET /api/trades — 查询最近 50 条成交记录
 *
 * 联查 orders 表获取方向（buy/sell）和类型（market/limit），
 * 按成交时间倒序返回。
 */
import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  const res = await pool.query(
    // 联查 orders 获取方向和类型，按成交时间倒序，最多返回 50 条
    `SELECT t.id, t.order_id, t.price, t.quantity, t.fee, t.fee_asset, t.traded_at,
            o.side, o.type
     FROM trades t
     JOIN orders o ON o.id = t.order_id
     ORDER BY t.traded_at DESC
     LIMIT 50`
  );
  return NextResponse.json({ trades: res.rows });
}
