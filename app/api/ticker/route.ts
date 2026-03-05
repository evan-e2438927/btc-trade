/**
 * GET /api/ticker — 获取最新 BTC-USDT 实时行情 Ticker
 *
 * 直接读取内存 priceStore（由 server.js OKX WebSocket 实时更新）。
 * 返回：{ price, changePercent, high24h, low24h, volume24h }
 * 前端每 2 秒轮询此接口以更新价格展示和订单引擎触发逻辑。
 */
import { NextResponse } from 'next/server';
import { priceStore } from '@/lib/priceStore';

export async function GET() {
  // 直接返回内存价格，无需数据库查询，响应极快
  return NextResponse.json(priceStore.getTicker());
}
