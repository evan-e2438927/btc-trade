/**
 * lib/orderService.ts 单元测试
 *
 * 测试覆盖：
 *  - fillOrder: buy/sell 方向账户余额变更、持仓更新、fill_price 存储
 *  - createOrder: 市价/限价、余额不足、止损/止盈子单创建
 *  - cancelOrder: 退款逻辑、不存在/已成交不可撤
 */

// ──────────────────────────────────────────────
// Mock lib/db
// ──────────────────────────────────────────────
jest.mock('../../lib/db', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

import pool from '../../lib/db';
import { fillOrder, createOrder, cancelOrder } from '../../lib/orderService';

// jest.fn() 实例的类型化引用
const mockQuery = pool.query as jest.MockedFunction<typeof pool.query>;

// 常用帮助：返回一个 void 成功的 mockResolvedValue
const ok = () => mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
const row = (data: Record<string, unknown>) =>
  mockQuery.mockResolvedValueOnce({ rows: [data] });

// 空仓位初始状态
const EMPTY_POS = { quantity: '0', entry_price: '0' };
// 有仓位初始状态（0.01 BTC @ 64000）
const HAS_POS = { quantity: '0.01', entry_price: '64000' };

beforeEach(() => jest.clearAllMocks());

// ════════════════════════════════════════════
// fillOrder
// ════════════════════════════════════════════
describe('fillOrder', () => {
  // 为 fillOrder 准备标准 mock 序列
  const setupBuyFill = (pos = EMPTY_POS) => {
    ok();         // UPDATE accounts frozen USDT
    ok();         // UPDATE accounts available BTC
    row(pos);     // SELECT positions
    ok();         // UPDATE positions
    ok();         // UPDATE orders (fill)
    ok();         // INSERT trades
  };
  const setupSellFill = (pos = HAS_POS) => {
    ok();         // UPDATE accounts frozen BTC
    ok();         // UPDATE accounts available USDT
    row(pos);     // SELECT positions
    ok();         // UPDATE positions
    ok();         // UPDATE orders (fill)
    ok();         // INSERT trades
  };

  test('买入：解冻 USDT，增加可用 BTC', async () => {
    setupBuyFill();
    await fillOrder(1, 'buy', 0.001, 65000);

    // 解冻 USDT = 0.001 * 65000 = 65
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("frozen_balance = frozen_balance - $1"),
      [65]
    );
    // 增加 BTC
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("available_balance = available_balance + $1"),
      [0.001]
    );
  });

  test('卖出：解冻 BTC，增加可用 USDT', async () => {
    setupSellFill();
    await fillOrder(2, 'sell', 0.001, 66000);

    // 解冻 BTC
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("frozen_balance = frozen_balance - $1"),
      [0.001]
    );
    // 增加 USDT = 0.001 * 66000 = 66
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("available_balance = available_balance + $1"),
      [66]
    );
  });

  test('持仓从零买入：数量正确，均价 = 成交价', async () => {
    setupBuyFill(EMPTY_POS);
    await fillOrder(1, 'buy', 0.001, 65000);

    const posCall = mockQuery.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes('UPDATE positions SET quantity')
    )!;
    expect(posCall[1][0]).toBeCloseTo(0.001);    // 新持仓数量
    expect(posCall[1][1]).toBeCloseTo(65000);    // 新均价
  });

  test('加仓：均价重新计算', async () => {
    // 已持 0.01 BTC @ 64000，再买 0.01 BTC @ 66000
    // 新均价 = (0.01*64000 + 0.01*66000) / 0.02 = 65000
    setupBuyFill(HAS_POS);
    await fillOrder(3, 'buy', 0.01, 66000);

    const posCall = mockQuery.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes('UPDATE positions SET quantity')
    )!;
    expect(posCall[1][0]).toBeCloseTo(0.02);     // 总持仓
    expect(posCall[1][1]).toBeCloseTo(65000);    // 均价
  });

  test('完全卖出：持仓清零，均价清零', async () => {
    setupSellFill({ quantity: '0.01', entry_price: '65000' });
    await fillOrder(4, 'sell', 0.01, 66000);

    const posCall = mockQuery.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes('UPDATE positions SET quantity')
    )!;
    expect(posCall[1][0]).toBe(0);   // qty
    expect(posCall[1][1]).toBe(0);   // entry_price
  });

  test('部分卖出：持仓减少，均价不变', async () => {
    setupSellFill({ quantity: '0.01', entry_price: '65000' });
    await fillOrder(5, 'sell', 0.005, 66000);

    const posCall = mockQuery.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes('UPDATE positions SET quantity')
    )!;
    expect(posCall[1][0]).toBeCloseTo(0.005);
    expect(posCall[1][1]).toBeCloseTo(65000); // 均价不变
  });

  test('成交时记录 fill_price 到 orders 表', async () => {
    setupBuyFill();
    await fillOrder(1, 'buy', 0.001, 65000);

    const updateOrder = mockQuery.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes('fill_price')
    )!;
    expect(updateOrder).toBeDefined();
    expect(updateOrder[1]).toEqual([0.001, 65000, 1]); // [quantity, fill_price, id]
  });

  test('成交记录写入 trades 表', async () => {
    setupBuyFill();
    await fillOrder(1, 'buy', 0.001, 65000);

    const tradeCall = mockQuery.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes('INSERT INTO trades')
    )!;
    expect(tradeCall[1]).toEqual([1, 65000, 0.001]);
  });
});

// ════════════════════════════════════════════
// createOrder
// ════════════════════════════════════════════
describe('createOrder', () => {

  // 为市价买单准备完整 mock 序列（不含 SL/TP 子单）
  const setupMarketBuy = (available = '10000', pos = EMPTY_POS) => {
    row({ available_balance: available }); // SELECT USDT balance
    ok();                                  // freeze USDT
    row({ id: 1, side: 'buy', type: 'market', quantity: '0.001' }); // INSERT order
    // fillOrder 内部 6 次调用
    ok(); ok(); row(pos); ok(); ok(); ok();
  };

  const setupMarketSell = (available = '1', pos = HAS_POS) => {
    row({ available_balance: available }); // SELECT BTC balance
    ok();                                  // freeze BTC
    row({ id: 2, side: 'sell', type: 'market', quantity: '0.001' });
    ok(); ok(); row(pos); ok(); ok(); ok();
  };

  // ── 市价单立即成交 ─────────────────────────
  test('市价买单：立即成交，状态变为 filled', async () => {
    setupMarketBuy();
    const result = await createOrder({ side: 'buy', type: 'market', quantity: 0.001, currentPrice: 65000 });

    expect(result.success).toBe(true);
    const filled = mockQuery.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes("status = 'filled'")
    );
    expect(filled).toBeDefined();
  });

  test('市价卖单：立即成交', async () => {
    setupMarketSell();
    const result = await createOrder({ side: 'sell', type: 'market', quantity: 0.001, currentPrice: 65000 });
    expect(result.success).toBe(true);
  });

  // ── 限价单 ─────────────────────────────────
  test('限价买单：冻结 USDT，不立即成交', async () => {
    row({ available_balance: '10000' });   // balance check
    ok();                                  // freeze USDT
    row({ id: 3, type: 'limit', status: 'pending' }); // INSERT order

    const result = await createOrder({ side: 'buy', type: 'limit', price: 64000, quantity: 0.001, currentPrice: 65000 });

    expect(result.success).toBe(true);
    // fillOrder 不应被调用（无 fill_price 写入）
    const fillCall = mockQuery.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes('fill_price')
    );
    expect(fillCall).toBeUndefined();
  });

  test('限价卖单：冻结 BTC', async () => {
    row({ available_balance: '0.1' });
    ok();
    row({ id: 4, type: 'limit', status: 'pending' });

    const result = await createOrder({ side: 'sell', type: 'limit', price: 66000, quantity: 0.001, currentPrice: 65000 });
    expect(result.success).toBe(true);

    const freezeBtc = mockQuery.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes("asset = 'BTC'") && c[0].includes('frozen_balance')
    );
    expect(freezeBtc).toBeDefined();
    expect(freezeBtc![1]).toEqual([0.001]);
  });

  // ── 余额不足 ───────────────────────────────
  test('USDT 不足：返回余额不足错误', async () => {
    row({ available_balance: '10' }); // 只有 10 USDT，需要 65

    const result = await createOrder({ side: 'buy', type: 'market', quantity: 0.001, currentPrice: 65000 });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/USDT 余额不足/);
    expect(result.error).toContain('65.00');  // 需要的金额
    expect(result.error).toContain('10.00');  // 可用的金额
  });

  test('BTC 不足：返回余额不足错误', async () => {
    row({ available_balance: '0.0001' }); // 只有 0.0001 BTC

    const result = await createOrder({ side: 'sell', type: 'market', quantity: 0.001, currentPrice: 65000 });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/BTC 余额不足/);
  });

  test('数量为 0：返回错误', async () => {
    const result = await createOrder({ side: 'buy', type: 'market', quantity: 0, currentPrice: 65000 });
    expect(result.success).toBe(false);
    expect(result.error).toBe('数量必须大于0');
  });

  test('数量为负：返回错误', async () => {
    const result = await createOrder({ side: 'buy', type: 'market', quantity: -0.001, currentPrice: 65000 });
    expect(result.success).toBe(false);
  });

  // ── 市价单 + 止损子单 ─────────────────────
  test('市价买单 + 止损：成交后创建 sell 子平仓单', async () => {
    setupMarketBuy();
    // createCloseOrder (SL): freeze BTC + INSERT child
    ok(); ok();

    const result = await createOrder({
      side: 'buy', type: 'market', quantity: 0.001, currentPrice: 65000,
      slEnabled: true, slType: 'market', slTrigger: 64000, slQuantity: 0.001,
    });

    expect(result.success).toBe(true);
    const childInsert = mockQuery.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes('is_close_order')
    );
    expect(childInsert).toBeDefined();
    expect(childInsert![1][0]).toBe('sell');   // 子单方向为 sell（平多仓）
    expect(childInsert![1][3]).toBe(64000);    // stop_price = slTrigger
  });

  test('止损子单冻结 BTC 数量与 slQuantity 一致', async () => {
    setupMarketBuy();
    ok(); ok();

    await createOrder({
      side: 'buy', type: 'market', quantity: 0.001, currentPrice: 65000,
      slEnabled: true, slType: 'market', slTrigger: 64000, slQuantity: 0.001,
    });

    const freezeBtc = mockQuery.mock.calls.find(c =>
      typeof c[0] === 'string' &&
      c[0].includes("asset = 'BTC'") &&
      c[0].includes('frozen_balance') &&
      c[1]?.[0] === 0.001
    );
    expect(freezeBtc).toBeDefined();
  });

  // ── 市价单 + 止盈子单 ─────────────────────
  test('市价买单 + 止盈：成交后创建 sell 子平仓单', async () => {
    setupMarketBuy();
    ok(); ok();

    const result = await createOrder({
      side: 'buy', type: 'market', quantity: 0.001, currentPrice: 65000,
      tpEnabled: true, tpType: 'market', tpTrigger: 66000, tpQuantity: 0.001,
    });

    expect(result.success).toBe(true);
    // 通过 is_close_order 找到子平仓单（区别于主订单 INSERT）
    const childInsert = mockQuery.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes('is_close_order')
    );
    expect(childInsert).toBeDefined();
    expect(childInsert![1][0]).toBe('sell');
    expect(childInsert![1][3]).toBe(66000); // take_profit_price = tpTrigger
  });

  // ── 市价单 + 止损 + 止盈 ──────────────────
  test('市价买单 + 止损 + 止盈：创建两个子平仓单', async () => {
    setupMarketBuy();
    ok(); ok(); // SL child
    ok(); ok(); // TP child

    await createOrder({
      side: 'buy', type: 'market', quantity: 0.001, currentPrice: 65000,
      slEnabled: true, slType: 'market', slTrigger: 64000, slQuantity: 0.001,
      tpEnabled: true, tpType: 'market', tpTrigger: 66000, tpQuantity: 0.001,
    });

    const childOrders = mockQuery.mock.calls.filter(c =>
      typeof c[0] === 'string' && c[0].includes('is_close_order')
    );
    expect(childOrders).toHaveLength(2);
  });

  // ── 止盈止损未 enable 时不创建子单 ─────────
  test('slEnabled=false：不创建止损子单', async () => {
    setupMarketBuy();

    await createOrder({
      side: 'buy', type: 'market', quantity: 0.001, currentPrice: 65000,
      slEnabled: false, slTrigger: 64000, slQuantity: 0.001,
    });

    const childOrders = mockQuery.mock.calls.filter(c =>
      typeof c[0] === 'string' && c[0].includes('is_close_order')
    );
    expect(childOrders).toHaveLength(0);
  });

  // ── 限价止盈止损字段写入 DB ────────────────
  test('止损触发价正确写入 orders.stop_price', async () => {
    row({ available_balance: '10000' });
    ok();
    row({ id: 5 });

    await createOrder({
      side: 'buy', type: 'limit', price: 65000, quantity: 0.001, currentPrice: 66000,
      slEnabled: true, slType: 'market', slTrigger: 64000, slQuantity: 0.001,
    });

    const insertOrder = mockQuery.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes('INSERT INTO orders')
    );
    // stop_price ($5) = slTrigger = 64000
    expect(insertOrder![1][4]).toBe(64000);
  });

  test('止盈触发价正确写入 orders.take_profit_price', async () => {
    row({ available_balance: '10000' });
    ok();
    row({ id: 6 });

    await createOrder({
      side: 'buy', type: 'limit', price: 65000, quantity: 0.001, currentPrice: 66000,
      tpEnabled: true, tpType: 'limit', tpTrigger: 67000, tpOrderPrice: 67100, tpQuantity: 0.001,
    });

    const insertOrder = mockQuery.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes('INSERT INTO orders')
    );
    // take_profit_price ($9) = tpTrigger = 67000
    expect(insertOrder![1][8]).toBe(67000);
    // tp_order_price ($11) = 67100
    expect(insertOrder![1][10]).toBe(67100);
  });
});

// ════════════════════════════════════════════
// cancelOrder
// ════════════════════════════════════════════
describe('cancelOrder', () => {

  test('撤销限价买单：退回冻结的 USDT', async () => {
    row({ status: 'pending', side: 'buy', quantity: '0.001', price: '64000' });
    ok(); // refund USDT
    ok(); // UPDATE orders status

    const result = await cancelOrder(1);

    expect(result.success).toBe(true);
    // 退回 USDT = 0.001 * 64000 = 64
    const refund = mockQuery.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes("asset = 'USDT'") && c[0].includes('available_balance = available_balance + $1')
    );
    expect(refund).toBeDefined();
    expect(refund![1][0]).toBeCloseTo(64);
  });

  test('撤销限价卖单：退回冻结的 BTC', async () => {
    row({ status: 'pending', side: 'sell', quantity: '0.001', price: '66000' });
    ok(); ok();

    const result = await cancelOrder(2);

    expect(result.success).toBe(true);
    const refund = mockQuery.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes("asset = 'BTC'") && c[0].includes('available_balance = available_balance + $1')
    );
    expect(refund).toBeDefined();
    expect(refund![1][0]).toBe(0.001);
  });

  test('撤销后订单状态更新为 cancelled', async () => {
    row({ status: 'pending', side: 'buy', quantity: '0.001', price: '64000' });
    ok(); ok();

    await cancelOrder(1);

    const statusUpdate = mockQuery.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes("status = 'cancelled'")
    );
    expect(statusUpdate).toBeDefined();
    expect(statusUpdate![1]).toContain(1); // orderId
  });

  test('订单不存在：返回错误', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // empty result

    const result = await cancelOrder(999);
    expect(result.success).toBe(false);
    expect(result.error).toBe('订单不存在');
  });

  test('已成交订单不可撤：返回错误', async () => {
    row({ status: 'filled', side: 'buy', quantity: '0.001', price: '65000' });

    const result = await cancelOrder(1);
    expect(result.success).toBe(false);
    expect(result.error).toBe('只能撤销挂单');
  });

  test('已撤销订单不可再撤：返回错误', async () => {
    row({ status: 'cancelled', side: 'buy', quantity: '0.001', price: '65000' });

    const result = await cancelOrder(1);
    expect(result.success).toBe(false);
    expect(result.error).toBe('只能撤销挂单');
  });
});
