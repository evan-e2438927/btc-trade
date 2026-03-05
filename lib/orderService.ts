/**
 * lib/orderService.ts — 订单业务逻辑层
 *
 * 提供三个对外公开的核心函数：
 * - fillOrder    : 执行订单成交（更新账户余额、持仓均价、订单状态、写入成交记录）
 * - createOrder  : 创建新订单（余额校验 → 冻结资产 → 插入订单 → 市价单立即成交）
 * - cancelOrder  : 撤销挂单（解冻资产 → 更新订单状态为 cancelled）
 *
 * 同时被 API Routes（app/api/orders/）和 server.js 订单引擎调用。
 */
import pool from './db';

/**
 * 下单参数接口
 * 包含基本交易信息以及可选的止损（SL）和止盈（TP）配置。
 */
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

/**
 * 执行订单成交（被 createOrder 和 server.js 引擎复用）
 *
 * 买入成交流程：
 *   1. 解冻 USDT（frozen_balance -= cost）
 *   2. 增加 BTC 可用余额（available_balance += quantity）
 *   3. 用加权均价更新 BTCUSDT 持仓
 *   4. 将订单标记为 filled，写入 trades 成交记录
 *
 * 卖出成交流程：
 *   1. 解冻 BTC（frozen_balance -= quantity）
 *   2. 增加 USDT 可用余额（available_balance += cost）
 *   3. 减少持仓量；若持仓归零则同时清空均价
 */
export async function fillOrder(
  orderId: number,
  side: 'buy' | 'sell',
  quantity: number,
  fillPrice: number
) {
  const cost = quantity * fillPrice; // 总成交额（USDT）

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

/**
 * 创建止损/止盈平仓子单（仅在母单成交后调用）
 *
 * 子单由 server.js 订单引擎持续监控触发：
 * - 止损（sl）：currentPrice <= stop_price 时触发成交
 * - 止盈（tp）：currentPrice >= take_profit_price 时触发成交
 *
 * 创建子单时同步冻结所需平仓资产：
 * - 卖出平仓：冻结 BTC
 * - 买入平仓：冻结 USDT（按 closeOrderPrice || triggerPrice 估算）
 *
 * @param parentSide      - 母单方向（买入母单 → 卖出子单平仓）
 * @param closeType       - 'sl' 止损 | 'tp' 止盈
 * @param triggerPrice    - 触发价格
 * @param closeOrderType  - 委托类型：'market' | 'limit'
 * @param closeOrderPrice - 限价委托价格（市价时为 null）
 * @param quantity        - 平仓数量（BTC）
 */
async function createCloseOrder(
  parentSide: 'buy' | 'sell',
  closeType: 'sl' | 'tp',
  triggerPrice: number,
  closeOrderType: 'market' | 'limit',
  closeOrderPrice: number | null,
  quantity: number
) {
  // 平仓方向与母单相反：买入母单 → 卖出平仓；卖出母单 → 买入平仓
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

/**
 * 创建新订单（对外公开的主入口）
 *
 * 执行流程：
 * 1. 参数基础校验（数量必须大于 0）
 * 2. 余额校验：买入检查 USDT 可用余额，卖出检查 BTC 可用余额
 * 3. 冻结对应资产（买入冻结 USDT，卖出冻结 BTC）
 * 4. 插入 orders 表，初始状态为 pending
 * 5. 市价单：立即调用 fillOrder 成交，并创建止损/止盈子平仓挂单
 *    限价单：仅保持 pending，由 server.js 引擎每 500ms 扫描触发
 *
 * @returns { success: true, order } 或 { success: false, error: string }
 */
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

/**
 * 撤销挂单
 *
 * 只允许撤销 status='pending' 的订单。
 * 撤销时将创建订单时冻结的资产解冻回可用余额：
 * - 买单：解冻 USDT（qty × price）
 * - 卖单：解冻 BTC（qty）
 *
 * @param orderId - 要撤销的订单 ID
 * @returns { success: true } 或 { success: false, error: string }
 */
export async function cancelOrder(orderId: number): Promise<{ success: boolean; error?: string }> {
  const res = await pool.query(`SELECT * FROM orders WHERE id = $1`, [orderId]);
  if (!res.rows.length) return { success: false, error: '订单不存在' };

  const order = res.rows[0];
  if (order.status !== 'pending') return { success: false, error: '只能撤销挂单' };

  const qty = Number(order.quantity);
  const price = Number(order.price) || 0;

  // 将冻结资产归还到可用余额
  if (order.side === 'buy') {
    // 买单冻结的是 USDT，按委托价格计算冻结金额
    await pool.query(
      `UPDATE accounts SET available_balance = available_balance + $1, frozen_balance = frozen_balance - $1 WHERE asset = 'USDT'`,
      [qty * price]
    );
  } else {
    // 卖单冻结的是 BTC，按委托数量解冻
    await pool.query(
      `UPDATE accounts SET available_balance = available_balance + $1, frozen_balance = frozen_balance - $1 WHERE asset = 'BTC'`,
      [qty]
    );
  }

  // 更新订单状态为已撤销
  await pool.query(`UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [orderId]);
  return { success: true };
}
