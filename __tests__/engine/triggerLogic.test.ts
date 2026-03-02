/**
 * 订单引擎触发逻辑测试（纯逻辑，无 DB 依赖）
 *
 * 对应 server.js checkPendingOrders 中的触发条件：
 *  - 限价单触发（买/卖）
 *  - 止损触发（价格下跌）
 *  - 止盈触发（价格上涨）
 *  - 子平仓单不再触发二次子单（is_close_order 标志）
 *  - 持仓浮动盈亏计算
 */

// ──────────────────────────────────────────────
// 从 server.js 提取出的纯触发判断函数（内联以便测试）
// ──────────────────────────────────────────────

interface PendingOrder {
  id: number;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  price?: number | null;          // 限价单委托价
  stop_price?: number | null;     // 止损触发价
  take_profit_price?: number | null; // 止盈触发价
  sl_type?: 'market' | 'limit' | null;
  sl_order_price?: number | null;
  sl_quantity?: number | null;
  tp_type?: 'market' | 'limit' | null;
  tp_order_price?: number | null;
  tp_quantity?: number | null;
  quantity: number;
  is_close_order?: boolean;
}

interface TriggerResult {
  shouldFill: boolean;
  fillPrice: number;
  fillQty: number;
  filledBySLTP: boolean;
}

/** 模拟 server.js checkPendingOrders 中单个订单的触发判断 */
function evaluateOrder(order: PendingOrder, currentPrice: number): TriggerResult {
  let qty = order.quantity;
  const limitPrice = order.price ?? null;
  const stopPrice = order.stop_price ?? null;
  const takeProfitPrice = order.take_profit_price ?? null;

  let shouldFill = false;
  let fillPrice = currentPrice;
  let filledBySLTP = false;

  // 限价单触发
  if (order.type === 'limit') {
    if (order.side === 'buy' && limitPrice !== null && currentPrice <= limitPrice) {
      shouldFill = true;
      fillPrice = limitPrice;
    }
    if (order.side === 'sell' && limitPrice !== null && currentPrice >= limitPrice) {
      shouldFill = true;
      fillPrice = limitPrice;
    }
  }

  // 止损触发：价格下跌到触发价（适用于多头平仓）
  if (!shouldFill && stopPrice !== null) {
    if (currentPrice <= stopPrice) {
      shouldFill = true;
      filledBySLTP = true;
      const slType = order.sl_type || 'market';
      const slOrderPrice = order.sl_order_price ?? null;
      fillPrice = (slType === 'limit' && slOrderPrice !== null) ? slOrderPrice : currentPrice;
      qty = order.sl_quantity ?? qty;
    }
  }

  // 止盈触发：价格上涨到触发价（适用于多头平仓）
  if (!shouldFill && takeProfitPrice !== null) {
    if (currentPrice >= takeProfitPrice) {
      shouldFill = true;
      filledBySLTP = true;
      const tpType = order.tp_type || 'market';
      const tpOrderPrice = order.tp_order_price ?? null;
      fillPrice = (tpType === 'limit' && tpOrderPrice !== null) ? tpOrderPrice : currentPrice;
      qty = order.tp_quantity ?? qty;
    }
  }

  return { shouldFill, fillPrice, fillQty: qty, filledBySLTP };
}

/** 计算是否需要为成交订单创建止损/止盈子单 */
function needsCloseOrders(order: PendingOrder, filledBySLTP: boolean): boolean {
  return !filledBySLTP && !(order.is_close_order ?? false);
}

/** 浮动盈亏计算 */
function calcUnrealizedPnl(quantity: number, entryPrice: number, currentPrice: number): number {
  return quantity > 0 ? (currentPrice - entryPrice) * quantity : 0;
}

// ════════════════════════════════════════════
// 限价单触发
// ════════════════════════════════════════════
describe('限价单触发', () => {
  const limitBuy: PendingOrder = { id: 1, side: 'buy', type: 'limit', price: 65000, quantity: 0.001 };
  const limitSell: PendingOrder = { id: 2, side: 'sell', type: 'limit', price: 66000, quantity: 0.001 };

  test('限价买单：当前价 ≤ 委托价时触发', () => {
    expect(evaluateOrder(limitBuy, 64999).shouldFill).toBe(true);
    expect(evaluateOrder(limitBuy, 65000).shouldFill).toBe(true); // 等于边界
  });

  test('限价买单：当前价 > 委托价时不触发', () => {
    expect(evaluateOrder(limitBuy, 65001).shouldFill).toBe(false);
    expect(evaluateOrder(limitBuy, 70000).shouldFill).toBe(false);
  });

  test('限价卖单：当前价 ≥ 委托价时触发', () => {
    expect(evaluateOrder(limitSell, 66001).shouldFill).toBe(true);
    expect(evaluateOrder(limitSell, 66000).shouldFill).toBe(true); // 等于边界
  });

  test('限价卖单：当前价 < 委托价时不触发', () => {
    expect(evaluateOrder(limitSell, 65999).shouldFill).toBe(false);
  });

  test('限价买单成交价 = 委托价（非当前价）', () => {
    const result = evaluateOrder(limitBuy, 64000);
    expect(result.fillPrice).toBe(65000); // fillPrice = limitPrice
  });

  test('限价买单成交量 = 委托数量', () => {
    const result = evaluateOrder(limitBuy, 64000);
    expect(result.fillQty).toBe(0.001);
  });

  test('限价买单触发后不标记为 SLTP', () => {
    const result = evaluateOrder(limitBuy, 64000);
    expect(result.filledBySLTP).toBe(false);
  });
});

// ════════════════════════════════════════════
// 止损触发
// ════════════════════════════════════════════
describe('止损触发（SL）', () => {
  const slOrder: PendingOrder = {
    id: 3, side: 'sell', type: 'market', quantity: 0.001,
    stop_price: 64000,
    sl_type: 'market', sl_quantity: 0.001,
  };

  test('当前价 ≤ 止损触发价时触发', () => {
    expect(evaluateOrder(slOrder, 63999).shouldFill).toBe(true);
    expect(evaluateOrder(slOrder, 64000).shouldFill).toBe(true); // 等于边界
  });

  test('当前价 > 止损触发价时不触发', () => {
    expect(evaluateOrder(slOrder, 64001).shouldFill).toBe(false);
    expect(evaluateOrder(slOrder, 70000).shouldFill).toBe(false);
  });

  test('止损市价单：成交价 = 当前价', () => {
    const result = evaluateOrder(slOrder, 63500);
    expect(result.fillPrice).toBe(63500);
  });

  test('止损限价单：成交价 = sl_order_price', () => {
    const limitSlOrder: PendingOrder = {
      ...slOrder,
      sl_type: 'limit', sl_order_price: 63900,
    };
    const result = evaluateOrder(limitSlOrder, 63800);
    expect(result.fillPrice).toBe(63900);
  });

  test('止损成交量取 sl_quantity', () => {
    const customQtyOrder: PendingOrder = {
      ...slOrder, quantity: 0.01, sl_quantity: 0.005,
    };
    const result = evaluateOrder(customQtyOrder, 63000);
    expect(result.fillQty).toBe(0.005);
  });

  test('止损触发后标记为 SLTP', () => {
    expect(evaluateOrder(slOrder, 63000).filledBySLTP).toBe(true);
  });
});

// ════════════════════════════════════════════
// 止盈触发
// ════════════════════════════════════════════
describe('止盈触发（TP）', () => {
  const tpOrder: PendingOrder = {
    id: 4, side: 'sell', type: 'market', quantity: 0.001,
    take_profit_price: 66000,
    tp_type: 'market', tp_quantity: 0.001,
  };

  test('当前价 ≥ 止盈触发价时触发', () => {
    expect(evaluateOrder(tpOrder, 66001).shouldFill).toBe(true);
    expect(evaluateOrder(tpOrder, 66000).shouldFill).toBe(true); // 等于边界
  });

  test('当前价 < 止盈触发价时不触发', () => {
    expect(evaluateOrder(tpOrder, 65999).shouldFill).toBe(false);
    expect(evaluateOrder(tpOrder, 60000).shouldFill).toBe(false);
  });

  test('止盈市价单：成交价 = 当前价', () => {
    const result = evaluateOrder(tpOrder, 66500);
    expect(result.fillPrice).toBe(66500);
  });

  test('止盈限价单：成交价 = tp_order_price', () => {
    const limitTpOrder: PendingOrder = {
      ...tpOrder,
      tp_type: 'limit', tp_order_price: 66100,
    };
    const result = evaluateOrder(limitTpOrder, 66200);
    expect(result.fillPrice).toBe(66100);
  });

  test('止盈成交量取 tp_quantity', () => {
    const customQtyOrder: PendingOrder = {
      ...tpOrder, quantity: 0.01, tp_quantity: 0.005,
    };
    const result = evaluateOrder(customQtyOrder, 67000);
    expect(result.fillQty).toBe(0.005);
  });

  test('止盈触发后标记为 SLTP', () => {
    expect(evaluateOrder(tpOrder, 67000).filledBySLTP).toBe(true);
  });
});

// ════════════════════════════════════════════
// 优先级：限价 > 止损 > 止盈
// ════════════════════════════════════════════
describe('触发优先级', () => {
  test('限价和止损同时满足：优先执行限价成交', () => {
    // 限价买单 65000，止损触发 66000（价格上涨到 66500 时两者都满足吗？）
    // 实际：限价买单在价格 ≤ 65000 时触发，止损在价格 ≤ 66000 时触发
    // 当价格 = 64000 时，限价 & 止损都满足，应优先执行限价
    const order: PendingOrder = {
      id: 5, side: 'buy', type: 'limit', price: 65000, quantity: 0.001,
      stop_price: 66000, sl_quantity: 0.001, sl_type: 'market',
    };
    const result = evaluateOrder(order, 64000);
    expect(result.shouldFill).toBe(true);
    expect(result.filledBySLTP).toBe(false); // 由限价触发，非 SLTP
    expect(result.fillPrice).toBe(65000);    // 限价成交价
  });

  test('限价未满足时，止损独立触发', () => {
    const order: PendingOrder = {
      id: 6, side: 'sell', type: 'market', quantity: 0.001,
      stop_price: 64000, sl_quantity: 0.001, sl_type: 'market',
      take_profit_price: 66000, tp_quantity: 0.001, tp_type: 'market',
    };
    const result = evaluateOrder(order, 63000); // 止损触发
    expect(result.shouldFill).toBe(true);
    expect(result.filledBySLTP).toBe(true);
    expect(result.fillPrice).toBe(63000); // 市价成交
  });

  test('止损未触发时，止盈独立触发', () => {
    const order: PendingOrder = {
      id: 7, side: 'sell', type: 'market', quantity: 0.001,
      stop_price: 64000, sl_quantity: 0.001, sl_type: 'market',
      take_profit_price: 66000, tp_quantity: 0.001, tp_type: 'market',
    };
    const result = evaluateOrder(order, 66500); // 止盈触发，止损未触发
    expect(result.shouldFill).toBe(true);
    expect(result.filledBySLTP).toBe(true);
    expect(result.fillPrice).toBe(66500);
  });

  test('当前价格处于止损/止盈之间：不触发', () => {
    const order: PendingOrder = {
      id: 8, side: 'sell', type: 'market', quantity: 0.001,
      stop_price: 64000,
      take_profit_price: 66000,
    };
    const result = evaluateOrder(order, 65000); // 64000 < 65000 < 66000
    expect(result.shouldFill).toBe(false);
  });
});

// ════════════════════════════════════════════
// 子平仓单（is_close_order）
// ════════════════════════════════════════════
describe('子平仓单防递归', () => {
  test('限价成交 + 有止损止盈：需要创建子单', () => {
    const order: PendingOrder = {
      id: 9, side: 'buy', type: 'limit', price: 65000, quantity: 0.001,
      stop_price: 64000, sl_quantity: 0.001, sl_type: 'market',
      is_close_order: false,
    };
    const { filledBySLTP } = evaluateOrder(order, 64000);
    expect(needsCloseOrders(order, filledBySLTP)).toBe(true);
  });

  test('is_close_order=true 的子单成交后：不再创建子单', () => {
    const closeOrder: PendingOrder = {
      id: 10, side: 'sell', type: 'market', quantity: 0.001,
      stop_price: 64000, sl_quantity: 0.001, sl_type: 'market',
      is_close_order: true,
    };
    const { filledBySLTP } = evaluateOrder(closeOrder, 63000);
    expect(needsCloseOrders(closeOrder, filledBySLTP)).toBe(false);
  });

  test('止损/止盈触发成交：不创建子单', () => {
    const order: PendingOrder = {
      id: 11, side: 'sell', type: 'market', quantity: 0.001,
      stop_price: 64000, sl_quantity: 0.001, sl_type: 'market',
      is_close_order: false,
    };
    const { filledBySLTP } = evaluateOrder(order, 63000);
    expect(filledBySLTP).toBe(true);
    expect(needsCloseOrders(order, filledBySLTP)).toBe(false);
  });
});

// ════════════════════════════════════════════
// 持仓浮动盈亏计算
// ════════════════════════════════════════════
describe('持仓浮动盈亏（unrealized PnL）', () => {
  test('盈利场景：当前价高于均价', () => {
    const pnl = calcUnrealizedPnl(0.01, 64000, 66000);
    expect(pnl).toBeCloseTo(20); // (66000 - 64000) * 0.01
  });

  test('亏损场景：当前价低于均价', () => {
    const pnl = calcUnrealizedPnl(0.01, 65000, 64000);
    expect(pnl).toBeCloseTo(-10); // (64000 - 65000) * 0.01
  });

  test('持仓为零：PnL = 0', () => {
    expect(calcUnrealizedPnl(0, 65000, 66000)).toBe(0);
  });

  test('持平：当前价 = 均价，PnL = 0', () => {
    expect(calcUnrealizedPnl(0.01, 65000, 65000)).toBe(0);
  });

  test('大仓位计算精度', () => {
    const pnl = calcUnrealizedPnl(1.5, 60000, 65000);
    expect(pnl).toBeCloseTo(7500); // 5000 * 1.5
  });
});

// ════════════════════════════════════════════
// 边界条件
// ════════════════════════════════════════════
describe('边界条件', () => {
  test('价格恰好等于限价买单委托价：触发', () => {
    const order: PendingOrder = { id: 12, side: 'buy', type: 'limit', price: 65000, quantity: 0.001 };
    expect(evaluateOrder(order, 65000).shouldFill).toBe(true);
  });

  test('价格恰好等于止损触发价：触发', () => {
    const order: PendingOrder = { id: 13, side: 'sell', type: 'market', quantity: 0.001, stop_price: 64000, sl_quantity: 0.001 };
    expect(evaluateOrder(order, 64000).shouldFill).toBe(true);
  });

  test('价格恰好等于止盈触发价：触发', () => {
    const order: PendingOrder = { id: 14, side: 'sell', type: 'market', quantity: 0.001, take_profit_price: 66000, tp_quantity: 0.001 };
    expect(evaluateOrder(order, 66000).shouldFill).toBe(true);
  });

  test('市价单（无限价）：跳过限价触发逻辑', () => {
    const order: PendingOrder = { id: 15, side: 'buy', type: 'market', quantity: 0.001 };
    const result = evaluateOrder(order, 99999);
    expect(result.shouldFill).toBe(false); // 无止损/止盈，无限价 → 不触发
  });

  test('stop_price 和 take_profit_price 均为 null：不触发 SLTP', () => {
    const order: PendingOrder = { id: 16, side: 'sell', type: 'limit', price: 66000, quantity: 0.001 };
    const result = evaluateOrder(order, 65000);
    expect(result.filledBySLTP).toBe(false);
  });
});
