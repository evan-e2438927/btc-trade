import { NextRequest, NextResponse } from 'next/server';
import { cancelOrder } from '@/lib/orderService';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
