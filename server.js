/**
 * server.js — 自定义 HTTP 服务器入口
 *
 * 职责：
 * 1. 启动 Next.js 应用并代理所有 HTTP 请求
 * 2. 通过 OKX WebSocket 实时订阅 BTC-USDT 行情，写入内存价格存储
 * 3. 初始化 PostgreSQL 连接池
 * 4. 每 500ms 扫描一次挂单，触发限价/止损/止盈成交逻辑
 *
 * 启动方式：NODE_ENV=production PORT=3002 node server.js
 */
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const WebSocket = require('ws');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const OKX_WS = 'wss://ws.okx.com:8443/ws/v5/public';

// 简单内存价格存储（由 OKX WebSocket 更新，API Routes 通过 global 读取）
const memPriceStore = {
  _price: 0,
  _ticker: { price: 0, changePercent: 0, high24h: 0, low24h: 0, volume24h: 0 },
  setPrice(p) { this._price = p; },
  getPrice() { return this._price; },
  setTicker(d) { this._ticker = d; this._price = d.price; },
  getTicker() { return this._ticker; },
};

// 暴露到 global，让 API Routes 可以访问
global.__priceStore = memPriceStore;

let okxWs = null;
let pingInterval = null;
let orderCheckInterval = null;
let pool = null;

/**
 * 连接 OKX 公共 WebSocket，订阅 BTC-USDT 实时 Ticker。
 * 断线后自动 5 秒重连；每 20 秒发送 ping 维持心跳。
 * 收到行情数据后写入 memPriceStore，由 API Routes 轮询读取。
 */
function connectOKX() {
  console.log('[OKX] 连接 WebSocket:', OKX_WS);
  okxWs = new WebSocket(OKX_WS);

  okxWs.on('open', () => {
    console.log('[OKX] WebSocket 已连接');
    // 订阅 BTC-USDT ticker
    okxWs.send(JSON.stringify({
      op: 'subscribe',
      args: [{ channel: 'tickers', instId: 'BTC-USDT' }],
    }));
    // 每 20 秒发送 ping 防止断连
    pingInterval = setInterval(() => {
      if (okxWs.readyState === WebSocket.OPEN) okxWs.send('ping');
    }, 20000);
  });

  okxWs.on('message', (data) => {
    const raw = data.toString();
    if (raw === 'pong') return;
    try {
      const msg = JSON.parse(raw);
      if (msg.arg?.channel === 'tickers' && msg.data?.length) {
        const d = msg.data[0];
        const price = parseFloat(d.last);
        const open24h = parseFloat(d.open24h);
        const changePercent = open24h > 0 ? ((price - open24h) / open24h) * 100 : 0;
        memPriceStore.setTicker({
          price,
          changePercent,
          high24h: parseFloat(d.high24h),
          low24h: parseFloat(d.low24h),
          volume24h: parseFloat(d.vol24h),
        });
      }
    } catch { /* ignore */ }
  });

  okxWs.on('close', () => {
    console.log('[OKX] WebSocket 断开，5 秒后重连...');
    clearInterval(pingInterval);
    setTimeout(connectOKX, 5000);
  });

  okxWs.on('error', (err) => {
    console.error('[OKX] WebSocket 错误:', err.message);
    okxWs.terminate();
  });
}

/**
 * 初始化 PostgreSQL 连接池。
 * 在 app.prepare()（Next.js 编译完成）后调用，确保 .env 环境变量已加载。
 */
async function initDb() {
  const { Pool } = require('pg');
  pool = new Pool({
    host: process.env.DB_HOST || '192.168.0.105',
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'mydb',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'admin',
  });
  console.log('[DB] 数据库连接池已初始化');
}

/**
 * 订单触发引擎（每 500ms 调用一次）
 *
 * 扫描所有 status='pending' 的挂单，判断是否满足成交条件：
 * - 限价单：买单当前价 <= 委托价 / 卖单当前价 >= 委托价
 * - 止损单：当前价 <= 止损触发价
 * - 止盈单：当前价 >= 止盈触发价
 * 成交后调用 fillOrderInEngine，并为母单创建止损/止盈平仓子单。
 * 最后更新 BTCUSDT 持仓的浮动盈亏。
 */
async function checkPendingOrders() {
  const currentPrice = memPriceStore.getPrice();
  if (!currentPrice || !pool) return; // 价格未就绪或 DB 未初始化则跳过

  try {
    const res = await pool.query(`SELECT * FROM orders WHERE status = 'pending'`);
    for (const order of res.rows) {
      let qty = Number(order.quantity);  // let，允许止损/止盈触发时修改平仓数量
      const limitPrice = order.price ? Number(order.price) : null;
      const stopPrice = order.stop_price ? Number(order.stop_price) : null;
      const takeProfitPrice = order.take_profit_price ? Number(order.take_profit_price) : null;

      let shouldFill = false;
      let fillPrice = currentPrice;
      let filledBySLTP = false;  // 是否由止损/止盈触发（与常规限价单成交区分）

      // 限价单触发
      if (order.type === 'limit') {
        if (order.side === 'buy' && limitPrice && currentPrice <= limitPrice) { shouldFill = true; fillPrice = limitPrice; }
        if (order.side === 'sell' && limitPrice && currentPrice >= limitPrice) { shouldFill = true; fillPrice = limitPrice; }
      }

      // 止损触发：价格下跌到触发价时触发（适用于多头平仓止损）
      if (!shouldFill && stopPrice) {
        if (currentPrice <= stopPrice) {
          shouldFill = true;
          filledBySLTP = true;
          const slType = order.sl_type || 'market';
          const slOrderPrice = order.sl_order_price ? Number(order.sl_order_price) : null;
          fillPrice = (slType === 'limit' && slOrderPrice) ? slOrderPrice : currentPrice;
          qty = order.sl_quantity ? Number(order.sl_quantity) : qty;
        }
      }

      // 止盈触发：价格上涨到触发价时触发（适用于多头平仓止盈）
      if (!shouldFill && takeProfitPrice) {
        if (currentPrice >= takeProfitPrice) {
          shouldFill = true;
          filledBySLTP = true;
          const tpType = order.tp_type || 'market';
          const tpOrderPrice = order.tp_order_price ? Number(order.tp_order_price) : null;
          fillPrice = (tpType === 'limit' && tpOrderPrice) ? tpOrderPrice : currentPrice;
          qty = order.tp_quantity ? Number(order.tp_quantity) : qty;
        }
      }

      if (shouldFill) {
        await fillOrderInEngine(order.id, order.side, qty, fillPrice);
        console.log(`[OrderEngine] 订单 #${order.id} (${order.side} ${order.type}) 成交 @ ${fillPrice}`);

        // 限价单成交后（非止损/止盈触发），为止损/止盈创建子平仓挂单
        if (!filledBySLTP && !order.is_close_order) {
          const closeSide = order.side === 'buy' ? 'sell' : 'buy';
          if (order.stop_price && order.sl_quantity) {
            const slType = order.sl_type || 'market';
            const slOrderPrice = order.sl_order_price ? Number(order.sl_order_price) : null;
            const slQty = Number(order.sl_quantity);
            if (closeSide === 'sell') {
              await pool.query(`UPDATE accounts SET available_balance = available_balance - $1, frozen_balance = frozen_balance + $1 WHERE asset = 'BTC'`, [slQty]);
            } else {
              const refPrice = slOrderPrice || Number(order.stop_price);
              await pool.query(`UPDATE accounts SET available_balance = available_balance - $1, frozen_balance = frozen_balance + $1 WHERE asset = 'USDT'`, [slQty * refPrice]);
            }
            await pool.query(
              `INSERT INTO orders (symbol, side, type, quantity, status, stop_price, sl_type, sl_order_price, sl_quantity, is_close_order) VALUES ('BTCUSDT', $1, $2, $3, 'pending', $4, $5, $6, $7, true)`,
              [closeSide, slType, slQty, order.stop_price, slType, slOrderPrice, slQty]
            );
            console.log(`[OrderEngine] 订单 #${order.id} 成交，创建止损子单 @ ${order.stop_price}`);
          }
          if (order.take_profit_price && order.tp_quantity) {
            const tpType = order.tp_type || 'market';
            const tpOrderPrice = order.tp_order_price ? Number(order.tp_order_price) : null;
            const tpQty = Number(order.tp_quantity);
            if (closeSide === 'sell') {
              await pool.query(`UPDATE accounts SET available_balance = available_balance - $1, frozen_balance = frozen_balance + $1 WHERE asset = 'BTC'`, [tpQty]);
            } else {
              const refPrice = tpOrderPrice || Number(order.take_profit_price);
              await pool.query(`UPDATE accounts SET available_balance = available_balance - $1, frozen_balance = frozen_balance + $1 WHERE asset = 'USDT'`, [tpQty * refPrice]);
            }
            await pool.query(
              `INSERT INTO orders (symbol, side, type, quantity, status, take_profit_price, tp_type, tp_order_price, tp_quantity, is_close_order) VALUES ('BTCUSDT', $1, $2, $3, 'pending', $4, $5, $6, $7, true)`,
              [closeSide, tpType, tpQty, order.take_profit_price, tpType, tpOrderPrice, tpQty]
            );
            console.log(`[OrderEngine] 订单 #${order.id} 成交，创建止盈子单 @ ${order.take_profit_price}`);
          }
        }
      }
    }

    // 更新持仓浮动盈亏
    const posRes = await pool.query(`SELECT quantity, entry_price FROM positions WHERE symbol = 'BTCUSDT'`);
    if (posRes.rows.length) {
      const { quantity, entry_price } = posRes.rows[0];
      const qty = Number(quantity);
      const ep = Number(entry_price);
      const pnl = qty > 0 ? (currentPrice - ep) * qty : 0;
      await pool.query(
        `UPDATE positions SET unrealized_pnl = $1, updated_at = NOW() WHERE symbol = 'BTCUSDT'`,
        [pnl]
      );
    }
  } catch (e) {
    console.error('[OrderEngine] 检查订单失败:', e.message);
  }
}

/**
 * 执行订单成交（原子性更新账户、持仓、订单、成交记录）
 * @param {number} orderId   - 订单 ID
 * @param {string} side      - 方向：'buy' | 'sell'
 * @param {number} quantity  - 成交数量（BTC）
 * @param {number} fillPrice - 成交价格（USDT）
 *
 * 买入流程：解冻 USDT → 增加 BTC 可用余额 → 更新持仓均价
 * 卖出流程：解冻 BTC  → 增加 USDT 可用余额 → 减少持仓（归零时清空均价）
 */
async function fillOrderInEngine(orderId, side, quantity, fillPrice) {
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

app.prepare().then(async () => {
  await initDb();
  connectOKX();

  // 每 500ms 检查一次挂单
  orderCheckInterval = setInterval(checkPendingOrders, 500);

  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`\n🚀 BTC 模拟交易系统已启动: http://localhost:${PORT}\n`);
  });

  process.on('SIGTERM', () => {
    clearInterval(orderCheckInterval);
    clearInterval(pingInterval);
    if (okxWs) okxWs.terminate();
    if (pool) pool.end();
    process.exit(0);
  });
});
