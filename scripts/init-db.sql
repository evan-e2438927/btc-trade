-- ============================================================
-- init-db.sql — BTC 模拟交易系统数据库初始化脚本
--
-- 执行方式：
--   /opt/homebrew/opt/postgresql@18/bin/psql \
--     -h 192.168.0.105 -U postgres -d mydb -f scripts/init-db.sql
--
-- 包含表：accounts（账户）、orders（订单）、positions（持仓）、trades（成交记录）
-- 所有 CREATE TABLE 均使用 IF NOT EXISTS，可安全重复执行。
-- ============================================================

-- ── 账户表（单用户模式，每种资产对应一行） ────────────────────────
-- available_balance: 可用余额（可下单使用）
-- frozen_balance:    冻结余额（已挂单锁定，待成交或撤单后释放）
CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  asset VARCHAR(10) NOT NULL UNIQUE,               -- 资产名称：'USDT' 或 'BTC'
  available_balance DECIMAL(20, 8) NOT NULL DEFAULT 0,  -- 可用余额
  frozen_balance DECIMAL(20, 8) NOT NULL DEFAULT 0,     -- 冻结余额
  updated_at TIMESTAMP DEFAULT NOW()               -- 最后更新时间
);

-- ── 订单表 ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL DEFAULT 'BTCUSDT',
  side VARCHAR(4) NOT NULL CHECK (side IN ('buy', 'sell')),       -- 方向：buy 买入 | sell 卖出
  type VARCHAR(20) NOT NULL CHECK (type IN ('market', 'limit')), -- 类型：market 市价 | limit 限价
  price DECIMAL(20, 2),               -- 限价委托价格（市价单为 NULL）
  stop_price DECIMAL(20, 2),          -- 止损触发价格（NULL 表示无止损）
  take_profit_price DECIMAL(20, 2),   -- 止盈触发价格（NULL 表示无止盈）
  quantity DECIMAL(20, 8) NOT NULL,   -- 委托数量（BTC）
  executed_quantity DECIMAL(20, 8) DEFAULT 0, -- 已成交数量
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'filled', 'cancelled')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ── 持仓表（单用户单交易对） ──────────────────────────────────────────────
-- unrealized_pnl 由 server.js 引擎每 500ms 根据最新市场价格实时更新
CREATE TABLE IF NOT EXISTS positions (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL UNIQUE DEFAULT 'BTCUSDT',
  quantity DECIMAL(20, 8) NOT NULL DEFAULT 0,    -- 持仓数量（BTC）
  entry_price DECIMAL(20, 2) NOT NULL DEFAULT 0, -- 开仓均价（加权平均）
  unrealized_pnl DECIMAL(20, 8) DEFAULT 0,       -- 浮动盈亏（USDT）
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ── 成交记录表 ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trades (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id), -- 关联的订单 ID
  price DECIMAL(20, 2) NOT NULL,          -- 实际成交价格（USDT）
  quantity DECIMAL(20, 8) NOT NULL,       -- 实际成交数量（BTC）
  fee DECIMAL(20, 8) DEFAULT 0,           -- 手续费（模拟系统固定为 0）
  fee_asset VARCHAR(10) DEFAULT 'USDT',   -- 手续费资产类型
  traded_at TIMESTAMP DEFAULT NOW()       -- 成交时间
);

-- ── 初始化数据（幂等，可重复执行） ────────────────────────────────────────
-- 初始账户：10000 USDT 可用余额，0 BTC
INSERT INTO accounts (asset, available_balance, frozen_balance)
VALUES ('USDT', 10000, 0), ('BTC', 0, 0)
ON CONFLICT (asset) DO NOTHING;

-- 初始持仓：空仓（数量 = 0，均价 = 0）
INSERT INTO positions (symbol, quantity, entry_price, unrealized_pnl)
VALUES ('BTCUSDT', 0, 0, 0)
ON CONFLICT (symbol) DO NOTHING;
