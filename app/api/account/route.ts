import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  const res = await pool.query(
    `SELECT asset, available_balance, frozen_balance FROM accounts ORDER BY asset`
  );
  return NextResponse.json({ accounts: res.rows });
}
