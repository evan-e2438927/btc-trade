/**
 * DELETE /api/orders/[id] — 撤销挂单
 *
 * 只能撤销 status='pending' 的订单。
 * 撤销时解冻对应资产（买单解冻 USDT，卖单解冻 BTC）并将订单状态更新为 cancelled。
 */
import { NextRequest, NextResponse } from 'next/server';
import { cancelOrder } from '@/lib/orderService';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Next.js App Router 动态路由参数为 Promise，需要 await 解包
  const { id } = await params;
  const orderId = Number(id);
  if (isNaN(orderId)) {
    return NextResponse.json({ error: '无效的订单 ID' }, { status: 400 });
  }

  const result = await cancelOrder(orderId);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
