/**
 * GET /api/account — 查询账户余额
 *
 * 返回所有资产（BTC、USDT）的可用余额与冻结余额。
 * 前端每 3 秒轮询此接口以更新账户展示。
 */
import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  // 查询 accounts 表，按资产名称升序返回（BTC 在前，USDT 在后）
  const res = await pool.query(
    `SELECT asset, available_balance, frozen_balance FROM accounts ORDER BY asset`
  );
  return NextResponse.json({ accounts: res.rows });
}
