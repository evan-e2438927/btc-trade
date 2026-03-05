/**
 * GET /api/positions — 查询当前 BTCUSDT 持仓
 *
 * 返回持仓数量、开仓均价、浮动盈亏等信息。
 * 浮动盈亏由 server.js 引擎每 500ms 根据最新价格更新写入数据库。
 * 当持仓数量为 0 时，返回存在不为空的行（quantity=0）而非 null。
 */
import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  const res = await pool.query(
    `SELECT symbol, quantity, entry_price, unrealized_pnl, updated_at FROM positions WHERE symbol = 'BTCUSDT'`
  );
  // 返回持仓行，如果表中无记录则返回 null（正常情况下初始化后始终有出入开仓）
  return NextResponse.json({ position: res.rows[0] || null });
}
