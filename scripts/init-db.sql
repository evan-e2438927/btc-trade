-- 初始化 BTC 模拟交易数据库

-- 账户表（单用户，每种资产一行）
CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  asset VARCHAR(10) NOT NULL UNIQUE,
  available_balance DECIMAL(20, 8) NOT NULL DEFAULT 0,
  frozen_balance DECIMAL(20, 8) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 订单表
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL DEFAULT 'BTCUSDT',
  side VARCHAR(4) NOT NULL CHECK (side IN ('buy', 'sell')),
  type VARCHAR(20) NOT NULL CHECK (type IN ('market', 'limit')),
  price DECIMAL(20, 2),
  stop_price DECIMAL(20, 2),
  take_profit_price DECIMAL(20, 2),
  quantity DECIMAL(20, 8) NOT NULL,
  executed_quantity DECIMAL(20, 8) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'filled', 'cancelled')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 持仓表（单用户单交易对）
CREATE TABLE IF NOT EXISTS positions (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL UNIQUE DEFAULT 'BTCUSDT',
  quantity DECIMAL(20, 8) NOT NULL DEFAULT 0,
  entry_price DECIMAL(20, 2) NOT NULL DEFAULT 0,
  unrealized_pnl DECIMAL(20, 8) DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 成交记录表
CREATE TABLE IF NOT EXISTS trades (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  price DECIMAL(20, 2) NOT NULL,
  quantity DECIMAL(20, 8) NOT NULL,
  fee DECIMAL(20, 8) DEFAULT 0,
  fee_asset VARCHAR(10) DEFAULT 'USDT',
  traded_at TIMESTAMP DEFAULT NOW()
);

-- 初始化账户（10000 USDT，0 BTC）
INSERT INTO accounts (asset, available_balance, frozen_balance)
VALUES ('USDT', 10000, 0), ('BTC', 0, 0)
ON CONFLICT (asset) DO NOTHING;

-- 初始化持仓（空仓）
INSERT INTO positions (symbol, quantity, entry_price, unrealized_pnl)
VALUES ('BTCUSDT', 0, 0, 0)
ON CONFLICT (symbol) DO NOTHING;
