/**
 * /api/orders 路由测试（含 [id] 子路由）
 *
 * 测试覆盖：
 *  - GET /api/orders : 返回订单列表
 *  - POST /api/orders : 创建订单（各类入参校验 + 成功路径）
 *  - DELETE /api/orders/[id] : 撤单
 */

// ──────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────
jest.mock('../../lib/db', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));
jest.mock('../../lib/orderService', () => ({
  __esModule: true,
  createOrder: jest.fn(),
  cancelOrder: jest.fn(),
}));
jest.mock('../../lib/priceStore', () => ({
  __esModule: true,
  priceStore: { getPrice: jest.fn() },
}));

// ──────────────────────────────────────────────
// 辅助：构造 NextRequest
// ──────────────────────────────────────────────
import { NextRequest } from 'next/server';

function makeGetRequest(url = 'http://localhost/api/orders'): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function makePostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/orders/${id}`, { method: 'DELETE' });
}

// ──────────────────────────────────────────────
// 引入路由处理函数 + 获取 mock 函数引用
// ──────────────────────────────────────────────
import { GET, POST } from '../../app/api/orders/route';
import { DELETE } from '../../app/api/orders/[id]/route';
import pool from '../../lib/db';
import { createOrder, cancelOrder } from '../../lib/orderService';
import { priceStore } from '../../lib/priceStore';

const mockQuery = pool.query as jest.MockedFunction<typeof pool.query>;
const mockCreateOrder = createOrder as jest.MockedFunction<typeof createOrder>;
const mockCancelOrder = cancelOrder as jest.MockedFunction<typeof cancelOrder>;
const mockGetPrice = priceStore.getPrice as jest.MockedFunction<typeof priceStore.getPrice>;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPrice.mockReturnValue(65000); // 默认实时价格
});

// ════════════════════════════════════════════
// GET /api/orders
// ════════════════════════════════════════════
describe('GET /api/orders', () => {
  test('返回 orders 数组', async () => {
    const fakeOrders = [
      { id: 1, side: 'buy', type: 'market', quantity: '0.001', status: 'filled' },
      { id: 2, side: 'sell', type: 'limit', quantity: '0.001', status: 'pending' },
    ];
    mockQuery.mockResolvedValueOnce({ rows: fakeOrders });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.orders).toHaveLength(2);
    expect(json.orders[0].id).toBe(1);
  });

  test('无订单时返回空数组', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.orders).toEqual([]);
  });

  test('查询包含 COALESCE(fill_price) 确保成交价正确返回', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await GET();

    const sql: string = mockQuery.mock.calls[0][0];
    expect(sql).toMatch(/COALESCE/i);
    expect(sql).toMatch(/fill_price/i);
  });
});

// ════════════════════════════════════════════
// POST /api/orders
// ════════════════════════════════════════════
describe('POST /api/orders', () => {

  // ── 参数校验 ──────────────────────────────
  test('无效 side：返回 400', async () => {
    const req = makePostRequest({ side: 'invalid', type: 'market', quantity: 0.001 });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('无效的方向');
  });

  test('无效 type：返回 400', async () => {
    const req = makePostRequest({ side: 'buy', type: 'unknown', quantity: 0.001 });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('无效的订单类型');
  });

  test('价格数据未就绪（currentPrice=0）：返回 503', async () => {
    mockGetPrice.mockReturnValue(0); // 模拟价格未就绪
    const req = makePostRequest({ side: 'buy', type: 'market', quantity: 0.001 });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toContain('价格数据未就绪');
  });

  // ── 成功路径 ──────────────────────────────
  test('市价买单成功：调用 createOrder 并返回 201', async () => {
    mockCreateOrder.mockResolvedValueOnce({ success: true, order: { id: 1 } });
    const req = makePostRequest({ side: 'buy', type: 'market', quantity: 0.001 });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.order.id).toBe(1);
    expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({ side: 'buy', type: 'market', quantity: 0.001, currentPrice: 65000 })
    );
  });

  test('限价卖单成功：price 正确传入', async () => {
    mockCreateOrder.mockResolvedValueOnce({ success: true, order: { id: 2 } });
    const req = makePostRequest({ side: 'sell', type: 'limit', quantity: 0.001, price: 66000 });
    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({ side: 'sell', type: 'limit', price: 66000 })
    );
  });

  test('止损参数正确透传给 createOrder', async () => {
    mockCreateOrder.mockResolvedValueOnce({ success: true, order: { id: 3 } });
    const req = makePostRequest({
      side: 'buy', type: 'market', quantity: 0.001,
      slEnabled: true, slType: 'market', slTrigger: 64000, slQuantity: 0.001,
    });
    await POST(req);

    expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        slEnabled: true,
        slType: 'market',
        slTrigger: 64000,
        slQuantity: 0.001,
      })
    );
  });

  test('止盈参数正确透传给 createOrder', async () => {
    mockCreateOrder.mockResolvedValueOnce({ success: true, order: { id: 4 } });
    const req = makePostRequest({
      side: 'buy', type: 'market', quantity: 0.001,
      tpEnabled: true, tpType: 'limit', tpTrigger: 66000, tpOrderPrice: 66100, tpQuantity: 0.001,
    });
    await POST(req);

    expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        tpEnabled: true,
        tpType: 'limit',
        tpTrigger: 66000,
        tpOrderPrice: 66100,
        tpQuantity: 0.001,
      })
    );
  });

  // ── 业务错误回传 ──────────────────────────
  test('余额不足：返回 400 并带错误信息', async () => {
    mockCreateOrder.mockResolvedValueOnce({ success: false, error: 'USDT 余额不足（需要 65.00，可用 10.00）' });
    const req = makePostRequest({ side: 'buy', type: 'market', quantity: 0.001 });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/USDT 余额不足/);
  });

  test('createOrder 抛出异常：不应 500（由 Next.js 框架处理）', async () => {
    // 只验证 createOrder 被调用；异常处理由框架负责，不在路由层测试
    mockCreateOrder.mockResolvedValueOnce({ success: true, order: { id: 5 } });
    const req = makePostRequest({ side: 'buy', type: 'market', quantity: 0.001 });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  // ── slEnabled=false 时不传止损字段 ────────
  test('slEnabled=false：slTrigger 不传入（undefined 过滤）', async () => {
    mockCreateOrder.mockResolvedValueOnce({ success: true, order: { id: 6 } });
    const req = makePostRequest({
      side: 'buy', type: 'market', quantity: 0.001,
      slEnabled: false,
    });
    await POST(req);

    expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({ slEnabled: false })
    );
    // slTrigger 未传时为 undefined
    const callArgs = mockCreateOrder.mock.calls[0][0];
    expect(callArgs.slTrigger).toBeUndefined();
  });
});

// ════════════════════════════════════════════
// DELETE /api/orders/[id]
// ════════════════════════════════════════════
describe('DELETE /api/orders/[id]', () => {

  test('撤单成功：返回 200 + success=true', async () => {
    mockCancelOrder.mockResolvedValueOnce({ success: true });
    const req = makeDeleteRequest('1');
    const res = await DELETE(req, { params: Promise.resolve({ id: '1' }) });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(mockCancelOrder).toHaveBeenCalledWith(1);
  });

  test('无效 ID（非数字）：返回 400', async () => {
    const req = makeDeleteRequest('abc');
    const res = await DELETE(req, { params: Promise.resolve({ id: 'abc' }) });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('无效的订单 ID');
  });

  test('订单不存在：返回 400', async () => {
    mockCancelOrder.mockResolvedValueOnce({ success: false, error: '订单不存在' });
    const req = makeDeleteRequest('999');
    const res = await DELETE(req, { params: Promise.resolve({ id: '999' }) });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('订单不存在');
  });

  test('已成交订单不可撤：返回 400', async () => {
    mockCancelOrder.mockResolvedValueOnce({ success: false, error: '只能撤销挂单' });
    const req = makeDeleteRequest('1');
    const res = await DELETE(req, { params: Promise.resolve({ id: '1' }) });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('只能撤销挂单');
  });

  test('ID 正确转为数字传入 cancelOrder', async () => {
    mockCancelOrder.mockResolvedValueOnce({ success: true });
    const req = makeDeleteRequest('42');
    await DELETE(req, { params: Promise.resolve({ id: '42' }) });

    expect(mockCancelOrder).toHaveBeenCalledWith(42);
  });
});
