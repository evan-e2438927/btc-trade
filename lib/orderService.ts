import pool from './db';

export interface OrderInput {
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  price?: number;
  quantity: number;
  currentPrice: number;
  // 止损
  slEnabled?: boolean;
  slType?: 'market' | 'limit';
  slTrigger?: number;
  slOrderPrice?: number;
  slQuantity?: number;
  // 止盈
  tpEnabled?: boolean;
  tpType?: 'market' | 'limit';
  tpTrigger?: number;
  tpOrderPrice?: number;
  tpQuantity?: number;
}

export async function fillOrder(
  orderId: number,
  side: 'buy' | 'sell',
  quantity: number,
  fillPrice: number
) {
  const cost = quantity * fillPrice;

  if (side === 'buy') {
    await pool.query(
      `UPDATE accounts SET frozen_balance = frozen_balance - $1, updated_at = NOW() WHERE asset = 'USDT'`,
      [cost]
    );
    await pool.query(
      `UPDATE accounts SET available_balance = available_balance + $1, updated_at = NOW() WHERE asset = 'BTC'`,
      [quantity]
    );
  } else {
    await pool.query(
      `UPDATE accounts SET frozen_balance = frozen_balance - $1, updated_at = NOW() WHERE asset = 'BTC'`,
      [quantity]
    );
    await pool.query(
      `UPDATE accounts SET available_balance = available_balance + $1, updated_at = NOW() WHERE asset = 'USDT'`,
      [cost]
    );
  }

  const posRes = await pool.query(`SELECT quantity, entry_price FROM positions WHERE symbol = 'BTCUSDT'`);
  const pos = posRes.rows[0];
  let newQty = Number(pos.quantity);
  let newEntryPrice = Number(pos.entry_price);

  if (side === 'buy') {
    const totalCost = newQty * newEntryPrice + quantity * fillPrice;
    newQty += quantity;
    newEntryPrice = newQty > 0 ? totalCost / newQty : 0;
  } else {
    newQty -= quantity;
    if (newQty <= 0) { newQty = 0; newEntryPrice = 0; }
  }

  await pool.query(
    `UPDATE positions SET quantity = $1, entry_price = $2, updated_at = NOW() WHERE symbol = 'BTCUSDT'`,
    [newQty, newEntryPrice]
  );
  await pool.query(
    `UPDATE orders SET status = 'filled', executed_quantity = $1, fill_price = $2, updated_at = NOW() WHERE id = $3`,
    [quantity, fillPrice, orderId]
  );
  await pool.query(
    `INSERT INTO trades (order_id, price, quantity, fee, fee_asset) VALUES ($1, $2, $3, 0, 'USDT')`,
    [orderId, fillPrice, quantity]
  );
}

// 订单成交后，为止损/止盈创建独立的子平仓挂单（由引擎监控触发）
async function createCloseOrder(
  parentSide: 'buy' | 'sell',
  closeType: 'sl' | 'tp',
  triggerPrice: number,
  closeOrderType: 'market' | 'limit',
  closeOrderPrice: number | null,
  quantity: number
) {
  const closeSide = parentSide === 'buy' ? 'sell' : 'buy';

  // 冻结平仓所需资产
  if (closeSide === 'sell') {
    await pool.query(
      `UPDATE accounts SET available_balance = available_balance - $1, frozen_balance = frozen_balance + $1 WHERE asset = 'BTC'`,
      [quantity]
    );
  } else {
    const refPrice = closeOrderPrice || triggerPrice;
    await pool.query(
      `UPDATE accounts SET available_balance = available_balance - $1, frozen_balance = frozen_balance + $1 WHERE asset = 'USDT'`,
      [quantity * refPrice]
    );
  }

  if (closeType === 'sl') {
    await pool.query(
      `INSERT INTO orders (symbol, side, type, quantity, status, stop_price, sl_type, sl_order_price, sl_quantity, is_close_order)
       VALUES ('BTCUSDT', $1, $2, $3, 'pending', $4, $5, $6, $7, true)`,
      [closeSide, closeOrderType, quantity, triggerPrice, closeOrderType, closeOrderPrice, quantity]
    );
  } else {
    await pool.query(
      `INSERT INTO orders (symbol, side, type, quantity, status, take_profit_price, tp_type, tp_order_price, tp_quantity, is_close_order)
       VALUES ('BTCUSDT', $1, $2, $3, 'pending', $4, $5, $6, $7, true)`,
      [closeSide, closeOrderType, quantity, triggerPrice, closeOrderType, closeOrderPrice, quantity]
    );
  }
}

export async function createOrder(input: OrderInput): Promise<{ success: boolean; order?: Record<string, unknown>; error?: string }> {
  const {
    side, type, price, quantity, currentPrice,
    slEnabled, slType, slTrigger, slOrderPrice, slQuantity,
    tpEnabled, tpType, tpTrigger, tpOrderPrice, tpQuantity,
  } = input;

  if (quantity <= 0) return { success: false, error: '数量必须大于0' };

  const fillPrice = type === 'market' ? currentPrice : (price || currentPrice);
  const cost = quantity * fillPrice;

  if (side === 'buy') {
    const res = await pool.query(`SELECT available_balance FROM accounts WHERE asset = 'USDT'`);
    const available = Number(res.rows[0]?.available_balance || 0);
    if (available < cost) return { success: false, error: `USDT 余额不足（需要 ${cost.toFixed(2)}，可用 ${available.toFixed(2)}）` };

    await pool.query(
      `UPDATE accounts SET available_balance = available_balance - $1, frozen_balance = frozen_balance + $1 WHERE asset = 'USDT'`,
      [cost]
    );
  } else {
    const res = await pool.query(`SELECT available_balance FROM accounts WHERE asset = 'BTC'`);
    const available = Number(res.rows[0]?.available_balance || 0);
    if (available < quantity) return { success: false, error: `BTC 余额不足（需要 ${quantity}，可用 ${available.toFixed(8)}）` };

    await pool.query(
      `UPDATE accounts SET available_balance = available_balance - $1, frozen_balance = frozen_balance + $1 WHERE asset = 'BTC'`,
      [quantity]
    );
  }

  const orderRes = await pool.query(
    `INSERT INTO orders (
       symbol, side, type, price, quantity, status,
       stop_price, sl_type, sl_order_price, sl_quantity,
       take_profit_price, tp_type, tp_order_price, tp_quantity
     ) VALUES (
       'BTCUSDT', $1, $2, $3, $4, 'pending',
       $5, $6, $7, $8,
       $9, $10, $11, $12
     ) RETURNING *`,
    [
      side, type, price || null, quantity,
      (slEnabled && slTrigger) ? slTrigger : null,
      (slEnabled && slType) ? slType : null,
      (slEnabled && slOrderPrice) ? slOrderPrice : null,
      (slEnabled && slQuantity) ? slQuantity : null,
      (tpEnabled && tpTrigger) ? tpTrigger : null,
      (tpEnabled && tpType) ? tpType : null,
      (tpEnabled && tpOrderPrice) ? tpOrderPrice : null,
      (tpEnabled && tpQuantity) ? tpQuantity : null,
    ]
  );
  const order = orderRes.rows[0];

  if (type === 'market') {
    await fillOrder(order.id, side, quantity, currentPrice);
    // 市价单立即成交，创建止损/止盈子平仓挂单供引擎监控
    if (slEnabled && slTrigger && slQuantity) {
      await createCloseOrder(side, 'sl', slTrigger, slType || 'market', slOrderPrice || null, slQuantity);
    }
    if (tpEnabled && tpTrigger && tpQuantity) {
      await createCloseOrder(side, 'tp', tpTrigger, tpType || 'market', tpOrderPrice || null, tpQuantity);
    }
  }

  return { success: true, order };
}

export async function cancelOrder(orderId: number): Promise<{ success: boolean; error?: string }> {
  const res = await pool.query(`SELECT * FROM orders WHERE id = $1`, [orderId]);
  if (!res.rows.length) return { success: false, error: '订单不存在' };

  const order = res.rows[0];
  if (order.status !== 'pending') return { success: false, error: '只能撤销挂单' };

  const qty = Number(order.quantity);
  const price = Number(order.price) || 0;

  if (order.side === 'buy') {
    await pool.query(
      `UPDATE accounts SET available_balance = available_balance + $1, frozen_balance = frozen_balance - $1 WHERE asset = 'USDT'`,
      [qty * price]
    );
  } else {
    await pool.query(
      `UPDATE accounts SET available_balance = available_balance + $1, frozen_balance = frozen_balance - $1 WHERE asset = 'BTC'`,
      [qty]
    );
  }

  await pool.query(`UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [orderId]);
  return { success: true };
}
