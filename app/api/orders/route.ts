/**
 * /api/orders — 订单 API
 *
 * GET  /api/orders  — 查询最近 50 条订单（含挂单中/已成交/已撤销）
 * POST /api/orders  — 创建新订单（市价单/限价单，可附带止损/止盈配置）
 */
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { createOrder } from '@/lib/orderService';
import { priceStore } from '@/lib/priceStore';

export async function GET() {
  // 左连接 trades 表获取成交价和成交时间，按创建时间倒序，最多返回 50 条
  const res = await pool.query(
    `SELECT o.*, COALESCE(o.fill_price, t.price) as filled_price, t.traded_at
     FROM orders o
     LEFT JOIN trades t ON t.order_id = o.id
     ORDER BY o.created_at DESC
     LIMIT 50`
  );
  return NextResponse.json({ orders: res.rows });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    side, type, price, quantity,
    // 止损参数
    slEnabled, slType, slTrigger, slOrderPrice, slQuantity,
    // 止盈参数
    tpEnabled, tpType, tpTrigger, tpOrderPrice, tpQuantity,
  } = body;

  // 基础参数校验
  if (!['buy', 'sell'].includes(side)) {
    return NextResponse.json({ error: '无效的方向' }, { status: 400 });
  }
  if (!['market', 'limit'].includes(type)) {
    return NextResponse.json({ error: '无效的订单类型' }, { status: 400 });
  }

  // 当前价格必须已就绪（server.js OKX WebSocket 尚未连通时返回 503）
  const currentPrice = priceStore.getPrice();
  if (!currentPrice) {
    return NextResponse.json({ error: '价格数据未就绪，请稍后重试' }, { status: 503 });
  }

  // 委托给 orderService 处理业务逻辑（余额校验、冻结资产、插入订单）
  const result = await createOrder({
    side,
    type,
    price: price ? Number(price) : undefined,
    quantity: Number(quantity),
    currentPrice,
    // 止损
    slEnabled: !!slEnabled,
    slType: slType || 'market',
    slTrigger: slTrigger ? Number(slTrigger) : undefined,
    slOrderPrice: slOrderPrice ? Number(slOrderPrice) : undefined,
    slQuantity: slQuantity ? Number(slQuantity) : undefined,
    // 止盈
    tpEnabled: !!tpEnabled,
    tpType: tpType || 'market',
    tpTrigger: tpTrigger ? Number(tpTrigger) : undefined,
    tpOrderPrice: tpOrderPrice ? Number(tpOrderPrice) : undefined,
    tpQuantity: tpQuantity ? Number(tpQuantity) : undefined,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ order: result.order }, { status: 201 });
}
