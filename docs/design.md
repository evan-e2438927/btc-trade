# BTC/USDT 模拟现货交易系统 — 设计文档

> 版本：v1.0 | 日期：2026-03-02 | 作者：内部

---

## 目录

- [BTC/USDT 模拟现货交易系统 — 设计文档](#btcusdt-模拟现货交易系统--设计文档)
  - [目录](#目录)
  - [1. 系统概述](#1-系统概述)
  - [2. 技术栈](#2-技术栈)
  - [3. 整体架构](#3-整体架构)
    - [关键设计决策](#关键设计决策)
  - [4. 目录结构](#4-目录结构)
  - [5. 数据库设计](#5-数据库设计)
    - [5.1 accounts（账户表）](#51-accounts账户表)
    - [5.2 orders（订单表）](#52-orders订单表)
    - [5.3 positions（持仓表）](#53-positions持仓表)
    - [5.4 trades（成交记录表）](#54-trades成交记录表)
  - [6. 模块详解](#6-模块详解)
    - [6.1 自定义服务器（server.js）](#61-自定义服务器serverjs)
    - [6.2 价格共享机制（priceStore）](#62-价格共享机制pricestore)
    - [6.3 订单服务（orderService.ts）](#63-订单服务orderservicets)
      - [`createOrder(input: OrderInput)`](#createorderinput-orderinput)
      - [`fillOrder(orderId, side, quantity, fillPrice)`](#fillorderorderid-side-quantity-fillprice)
      - [`createCloseOrder(parentSide, closeType, triggerPrice, ...)`](#createcloseorderparentside-closetype-triggerprice-)
      - [`cancelOrder(orderId)`](#cancelorderorderid)
    - [6.4 API Routes](#64-api-routes)
    - [6.5 前端组件](#65-前端组件)
  - [7. 核心业务流程](#7-核心业务流程)
    - [7.1 市价单下单流程](#71-市价单下单流程)
    - [7.2 限价单下单流程](#72-限价单下单流程)
    - [7.3 止损/止盈触发流程](#73-止损止盈触发流程)
    - [7.4 撤单流程](#74-撤单流程)
  - [8. 订单引擎设计](#8-订单引擎设计)
    - [触发优先级](#触发优先级)
    - [子平仓单防递归](#子平仓单防递归)
    - [性能特性](#性能特性)
  - [9. 账户与持仓计算](#9-账户与持仓计算)
    - [资产冻结模型](#资产冻结模型)
    - [持仓均价（VWAP）](#持仓均价vwap)
    - [浮动盈亏（Unrealized PnL）](#浮动盈亏unrealized-pnl)
  - [10. 测试策略](#10-测试策略)
    - [测试文件](#测试文件)
    - [Mock 架构](#mock-架构)
    - [运行](#运行)
  - [11. 已知限制与后续规划](#11-已知限制与后续规划)
    - [当前限制](#当前限制)
    - [后续规划](#后续规划)
  - [12. 术语表](#12-术语表)
    - [技术术语](#技术术语)
    - [金融 / 业务术语](#金融--业务术语)

---

## 1. 系统概述

本系统是一个**单用户 BTC/USDT 现货模拟交易平台**，目标是在不连接真实交易所账户的前提下，提供接近真实交易所的下单、撮合、持仓管理体验。

**功能范围：**

| 功能 | 说明 |
|------|------|
| 实时行情 | 通过 OKX WebSocket 订阅 BTC-USDT Ticker，前端每 2 秒轮询 |
| K 线图表 | 嵌入 TradingView Widget（OKX:BTCUSDT）|
| 订单簿 | 每 2 秒从 OKX REST API 拉取买卖盘各 8 档 |
| 市价单 | 以当前实时价立即成交 |
| 限价单 | 挂单，引擎轮询触发 |
| 止损（SL） | 价格下跌触发，支持市价/限价平仓 |
| 止盈（TP） | 价格上涨触发，支持市价/限价平仓 |
| 账户管理 | USDT / BTC 可用余额 & 冻结余额实时更新 |
| 持仓管理 | 均价、数量、浮动盈亏实时计算 |
| 撤单 | 限价挂单可撤，退还冻结资产 |

**不在范围内：**
- 用户认证与多账户
- 杠杆 / 合约交易
- 手续费收取（当前手续费=0，预留字段）
- 历史 K 线回放

---

## 2. 技术栈

| 层 | 技术 |
|----|------|
| 前端框架 | Next.js 16 (App Router) + React 19 + TypeScript |
| 样式 | Tailwind CSS v4 |
| 图表 | TradingView Widget（外部 CDN）|
| 后端 | Next.js API Routes（同一进程）|
| 数据库 | PostgreSQL 18（pg 驱动，无 ORM）|
| 实时行情 | OKX WebSocket v5 Public |
| 自定义服务器 | Node.js CommonJS（ws 库）|
| 测试 | Jest + ts-jest |

---

## 3. 整体架构

```
┌──────────────────────────────────────────────────────────────────┐
│                    Node.js 进程（server.js 启动）                 │
│                                                                  │
│  ┌─────────────────┐      ┌──────────────────────────────────┐  │
│  │  OKX WebSocket  │─────▶│   memPriceStore（内存价格）      │  │
│  │  wss://ws.okx   │      │   global.__priceStore            │  │
│  └─────────────────┘      └─────────────┬────────────────────┘  │
│                                         │ 每 500ms               │
│  ┌─────────────────┐                   ▼                        │
│  │  订单引擎        │          检查 pending 订单触发条件          │
│  │ checkPending()  │◀─────────────────────────────────────────  │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  Next.js App (HTTP Server)               │    │
│  │                                                          │    │
│  │   前端页面 (React)          API Routes                   │    │
│  │   ┌──────────────┐         ┌────────────────────────┐   │    │
│  │   │ TradingChart │         │ /api/ticker    (GET)   │   │    │
│  │   │ TradingPanel │────────▶│ /api/orders    (GET/POST│   │    │
│  │   │ OrderBook    │         │ /api/orders/[id] (DELETE│   │    │
│  │   │ AccountBar   │◀────────│ /api/account   (GET)   │   │    │
│  │   │ PositionList │ 轮询    │ /api/positions (GET)   │   │    │
│  │   │ OrderHistory │ 3s      │ /api/trades    (GET)   │   │    │
│  │   └──────────────┘         └──────────────┬─────────┘   │    │
│  └─────────────────────────────────────────── │ ────────────┘    │
│                                               │                  │
└───────────────────────────────────────────────│──────────────────┘
                                                │
                                                ▼
                               ┌────────────────────────────┐
                               │  PostgreSQL 192.168.0.105  │
                               │  mydb / postgres           │
                               │  tables: accounts, orders, │
                               │  positions, trades         │
                               └────────────────────────────┘
```

### 关键设计决策

**为什么用自定义 server.js？**

Next.js 的 `next start` 不支持在进程内维护长连接（WebSocket）和定时任务（订单引擎）。使用自定义 HTTP 服务器包裹 Next.js，让 OKX WebSocket 连接和订单引擎在同一 Node.js 进程中运行，通过 `global.__priceStore` 与 API Routes 共享实时价格，避免额外的消息队列或 Redis 依赖。

**为什么价格不存数据库？**

实时 Ticker 更新频率极高（每秒数次），写入数据库会产生大量 I/O。仅将价格存于内存（`memPriceStore`），API Routes 直接读取同进程内存，延迟为 0。

---

## 4. 目录结构

```
btc-trade/
├── server.js                      # 自定义 HTTP 服务器 + 订单引擎
├── app/
│   ├── layout.tsx                 # 根布局
│   ├── page.tsx                   # 主交易界面（状态聚合）
│   └── api/
│       ├── account/route.ts       # GET 账户余额
│       ├── orders/
│       │   ├── route.ts           # GET 订单列表 / POST 下单
│       │   └── [id]/route.ts      # DELETE 撤单
│       ├── positions/route.ts     # GET 当前持仓
│       ├── ticker/route.ts        # GET 实时价格（供前端轮询）
│       └── trades/route.ts        # GET 成交记录
├── components/
│   ├── AccountBar.tsx             # 顶部资产信息栏
│   ├── TradingChart.tsx           # TradingView K 线图
│   ├── TradingPanel.tsx           # 买入/卖出操作面板
│   ├── OrderBook.tsx              # 实时订单簿（OKX 8档）
│   ├── PositionList.tsx           # 当前持仓展示
│   └── OrderHistory.tsx           # 订单历史列表
├── lib/
│   ├── db.ts                      # pg Pool 连接（单例）
│   ├── priceStore.ts              # 价格共享（读 global.__priceStore）
│   └── orderService.ts            # 订单核心逻辑（createOrder / fillOrder / cancelOrder）
├── scripts/
│   └── init-db.sql                # 建表 + 初始化数据
├── __tests__/
│   ├── lib/orderService.test.ts   # 订单服务单元测试（29 用例）
│   ├── engine/triggerLogic.test.ts # 引擎触发逻辑测试（30 用例）
│   └── api/orders.test.ts         # API 路由测试（24 用例）
├── jest.config.js
└── package.json
```

---

## 5. 数据库设计

### 5.1 accounts（账户表）

| 列 | 类型 | 说明 |
|----|------|------|
| id | SERIAL | 主键 |
| asset | VARCHAR(10) | 资产类型：`USDT` / `BTC` |
| available_balance | DECIMAL(20,8) | 可用余额 |
| frozen_balance | DECIMAL(20,8) | 冻结余额（挂单占用）|
| updated_at | TIMESTAMP | 最后更新时间 |

初始数据：`USDT=10000.00, BTC=0`

**余额状态转换：**
```
下限价单 → available -= cost, frozen += cost
限价成交 → frozen -= cost, (对方资产) available += amount
市价成交 → available -= cost, (对方资产) available += amount
撤单     → frozen -= cost, available += cost
```

### 5.2 orders（订单表）

| 列 | 类型 | 说明 |
|----|------|------|
| id | SERIAL | 主键 |
| symbol | VARCHAR(20) | 交易对，固定 `BTCUSDT` |
| side | VARCHAR(4) | `buy` / `sell` |
| type | VARCHAR(20) | `market` / `limit` |
| price | DECIMAL(20,2) | 限价委托价（市价单为 NULL）|
| fill_price | DECIMAL | 实际成交价 |
| stop_price | DECIMAL(20,2) | 止损触发价 |
| take_profit_price | DECIMAL(20,2) | 止盈触发价 |
| sl_type | VARCHAR(10) | 止损平仓方式：`market` / `limit` |
| sl_order_price | DECIMAL(20,2) | 止损限价委托价（limit 时有效）|
| sl_quantity | DECIMAL(20,8) | 止损平仓数量 |
| tp_type | VARCHAR(10) | 止盈平仓方式：`market` / `limit` |
| tp_order_price | DECIMAL(20,2) | 止盈限价委托价（limit 时有效）|
| tp_quantity | DECIMAL(20,8) | 止盈平仓数量 |
| quantity | DECIMAL(20,8) | 委托数量 |
| executed_quantity | DECIMAL(20,8) | 已成交数量 |
| status | VARCHAR(20) | `pending` / `filled` / `cancelled` |
| is_close_order | BOOLEAN | 是否为系统自动创建的平仓子单 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 5.3 positions（持仓表）

| 列 | 类型 | 说明 |
|----|------|------|
| id | SERIAL | 主键 |
| symbol | VARCHAR(20) UNIQUE | 交易对，固定 `BTCUSDT` |
| quantity | DECIMAL(20,8) | 持仓数量（BTC）|
| entry_price | DECIMAL(20,2) | 加权平均持仓成本价 |
| unrealized_pnl | DECIMAL(20,8) | 浮动盈亏（USDT）|
| updated_at | TIMESTAMP | 最后更新时间 |

**均价计算公式（加仓）：**
```
新均价 = (原持仓量 × 原均价 + 新买入量 × 成交价) / (原持仓量 + 新买入量)
```

### 5.4 trades（成交记录表）

| 列 | 类型 | 说明 |
|----|------|------|
| id | SERIAL | 主键 |
| order_id | INTEGER | 关联 orders.id |
| price | DECIMAL(20,2) | 成交价格 |
| quantity | DECIMAL(20,8) | 成交数量 |
| fee | DECIMAL(20,8) | 手续费（当前恒为 0）|
| fee_asset | VARCHAR(10) | 手续费资产（预留）|
| traded_at | TIMESTAMP | 成交时间 |

---

## 6. 模块详解

### 6.1 自定义服务器（server.js）

**启动序列：**

```
app.prepare()
  └─▶ initDb()           // 初始化 pg 连接池
  └─▶ connectOKX()       // 建立 OKX WebSocket 连接，订阅 BTC-USDT Ticker
  └─▶ setInterval(checkPendingOrders, 500)  // 每 500ms 检查挂单
  └─▶ server.listen(PORT)  // 启动 HTTP 服务器
```

**OKX WebSocket 管理：**

- 订阅频道：`tickers / BTC-USDT`
- 每 20 秒发送 `ping` 保活
- 断线自动重连（5 秒延迟）
- 收到价格后更新 `memPriceStore` 及 `global.__priceStore`

**订单引擎（checkPendingOrders）：**

查询所有 `status='pending'` 的订单，对每条订单按以下顺序评估触发条件（优先级从高到低）：

```
1. 限价单触发（type='limit'）
   买单：currentPrice ≤ price  →  以 price 成交
   卖单：currentPrice ≥ price  →  以 price 成交

2. 止损触发（stop_price 不为 NULL）
   currentPrice ≤ stop_price  →  以 sl_order_price（或市价）成交

3. 止盈触发（take_profit_price 不为 NULL）
   currentPrice ≥ take_profit_price  →  以 tp_order_price（或市价）成交
```

触发后调用 `fillOrderInEngine()` 执行成交动作。若为限价单通过限价触发（非止损/止盈）且附带止损/止盈设置，则自动创建子平仓挂单（详见第 8 节）。

### 6.2 价格共享机制（priceStore）

server.js 与 Next.js API Routes 在同一 Node.js 进程内运行，通过 `global.__priceStore` 共享实时价格：

```
server.js                        API Routes
    │                                │
    │  global.__priceStore = {       │
    │    getPrice() { ... }          │
    │    getTicker() { ... }   ◀─────┘  lib/priceStore.ts 读取
    │    setTicker() { ... }         │
    │  }                             │
    │                                │
OKX WebSocket ─▶ setTicker() ─▶ 更新内存值
```

`lib/priceStore.ts` 为 TypeScript 适配层，在测试或独立 API Route 构建时提供类型安全的接口，生产环境读取 `global.__priceStore`。

### 6.3 订单服务（orderService.ts）

核心函数：

#### `createOrder(input: OrderInput)`

```
1. 参数校验（quantity > 0）
2. 余额检查
   - buy：检查 USDT available_balance ≥ quantity × price
   - sell：检查 BTC available_balance ≥ quantity
3. 冻结资产（available -= cost, frozen += cost）
4. INSERT 订单记录（status='pending'）
5. 若为市价单：
   a. 调用 fillOrder() 立即成交
   b. 若有止损设置 → createCloseOrder('sl', ...)
   c. 若有止盈设置 → createCloseOrder('tp', ...)
```

#### `fillOrder(orderId, side, quantity, fillPrice)`

```
1. 更新账户余额（解冻 + 对方资产入账）
   - buy：frozen USDT -= cost；available BTC += quantity
   - sell：frozen BTC -= quantity；available USDT += cost
2. 更新持仓（加权均价计算）
3. UPDATE orders SET status='filled', fill_price=fillPrice
4. INSERT trades 记录
```

#### `createCloseOrder(parentSide, closeType, triggerPrice, ...)`

市价单成交后自动创建止损/止盈子平仓单：

```
closeSide = parentSide === 'buy' ? 'sell' : 'buy'

止损子单：INSERT orders (is_close_order=true, stop_price=triggerPrice, ...)
止盈子单：INSERT orders (is_close_order=true, take_profit_price=triggerPrice, ...)
同时冻结平仓所需资产
```

#### `cancelOrder(orderId)`

```
1. 查询订单，验证 status='pending'
2. 退还冻结资产（buy → 退 USDT，sell → 退 BTC）
3. UPDATE orders SET status='cancelled'
```

### 6.4 API Routes

| 路由 | 方法 | 说明 | 主要参数 |
|------|------|------|---------|
| `/api/ticker` | GET | 返回实时 Ticker | - |
| `/api/account` | GET | 返回账户余额 | - |
| `/api/orders` | GET | 订单列表（最近 50 条）| - |
| `/api/orders` | POST | 下单 | side, type, quantity, price?, sl*, tp* |
| `/api/orders/[id]` | DELETE | 撤单 | id |
| `/api/positions` | GET | 当前持仓 | - |
| `/api/trades` | GET | 成交记录 | - |

**POST /api/orders 完整参数：**

```typescript
{
  side: 'buy' | 'sell'
  type: 'market' | 'limit'
  quantity: number        // BTC 数量
  price?: number          // 限价委托价（限价单必填）
  // 止损
  slEnabled?: boolean
  slType?: 'market' | 'limit'
  slTrigger?: number      // 触发价格
  slOrderPrice?: number   // 委托价（limit 时）
  slQuantity?: number     // 平仓数量
  // 止盈
  tpEnabled?: boolean
  tpType?: 'market' | 'limit'
  tpTrigger?: number
  tpOrderPrice?: number
  tpQuantity?: number
}
```

### 6.5 前端组件

| 组件 | 数据来源 | 更新频率 |
|------|---------|---------|
| `AccountBar` | `/api/account` 轮询 | 每 3 秒 |
| `TradingChart` | TradingView Widget 自管理 | 实时（Widget 内部）|
| `TradingPanel` | `/api/ticker` 轮询 | 每 2 秒 |
| `OrderBook` | OKX REST 直接调用 | 每 2 秒 |
| `PositionList` | `/api/positions` 轮询 | 每 3 秒 |
| `OrderHistory` | `/api/orders` 轮询 | 每 3 秒 |

**TradingPanel 交互逻辑：**

- BTC 数量 ↔ USDT 金额双向联动（根据当前执行价实时换算）
- 快速比例按钮（25% / 50% / 75% / 100%）：买入按 USDT 余额比例，卖出按 BTC 持仓比例
- 止损/止盈子面板：可独立开关，market 类型只需触发价和数量，limit 类型额外需要委托价

---

## 7. 核心业务流程

### 7.1 市价单下单流程

```
用户点击 "买入 BTC"
       │
       ▼
POST /api/orders { side:'buy', type:'market', quantity:0.001 }
       │
       ▼
createOrder()
  ├─ 余额检查（USDT available ≥ 0.001 × currentPrice）
  ├─ 冻结 USDT（available -= cost）
  ├─ INSERT orders (status='pending')
  ├─ fillOrder(id, 'buy', 0.001, currentPrice)
  │    ├─ USDT frozen -= cost
  │    ├─ BTC available += 0.001
  │    ├─ 更新持仓（加权均价）
  │    ├─ UPDATE orders SET status='filled', fill_price=currentPrice
  │    └─ INSERT trades
  └─ [若有止损] createCloseOrder('sl', slTrigger, ...)
       ├─ 冻结 BTC sl_quantity
       └─ INSERT orders (is_close_order=true, stop_price=slTrigger)
  └─ [若有止盈] createCloseOrder('tp', tpTrigger, ...)
       ├─ 冻结 BTC tp_quantity
       └─ INSERT orders (is_close_order=true, take_profit_price=tpTrigger)
       │
       ▼
返回 { order: { id, status:'filled', fill_price, ... } }
前端刷新账户/持仓/订单列表
```

### 7.2 限价单下单流程

```
用户输入限价 64000，点击 "买入 BTC"
       │
       ▼
POST /api/orders { side:'buy', type:'limit', price:64000, quantity:0.001 }
       │
       ▼
createOrder()
  ├─ 余额检查（USDT ≥ 0.001 × 64000 = 64 USDT）
  ├─ 冻结 64 USDT
  └─ INSERT orders (status='pending', price=64000)
       │
       ▼ （返回成功，订单挂起）

当前价格实时下跌
       │
       ▼
checkPendingOrders()（每 500ms）
  └─ currentPrice=63900 ≤ limitPrice=64000
       ├─ fillOrderInEngine(id, 'buy', 0.001, 64000)
       │    ├─ USDT frozen -= 64
       │    ├─ BTC available += 0.001
       │    ├─ 更新持仓
       │    ├─ UPDATE orders SET status='filled', fill_price=64000
       │    └─ INSERT trades
       └─ [若有止损] INSERT 止损子单（is_close_order=true）
       └─ [若有止盈] INSERT 止盈子单（is_close_order=true）
```

### 7.3 止损/止盈触发流程

子平仓单创建后（`is_close_order=true`），引擎持续监控：

```
止损子单（stop_price=64000, side='sell'）
       │
checkPendingOrders()
  └─ currentPrice=63800 ≤ stop_price=64000
       ├─ fillOrderInEngine(id, 'sell', sl_quantity, 63800)
       │    ├─ BTC frozen -= sl_quantity
       │    ├─ USDT available += sl_quantity × 63800
       │    ├─ 更新持仓（减仓）
       │    └─ INSERT trades
       └─ is_close_order=true → 不再创建新子单（防止递归）

止盈子单（take_profit_price=66000, side='sell'）
       │
checkPendingOrders()
  └─ currentPrice=66200 ≥ take_profit_price=66000
       └─ 同止损流程，以市价/限价 sell 平仓
```

**触发逻辑设计说明：**

止损/止盈的触发方向与 `order.side` 无关，采用绝对判断：
- `stop_price` → 价格下跌触发（`currentPrice ≤ stop_price`）适合多头平仓止损
- `take_profit_price` → 价格上涨触发（`currentPrice ≥ take_profit_price`）适合多头平仓止盈

此设计适用于现货做多场景，子平仓单始终为 `sell` 方向（多头平仓）。

### 7.4 撤单流程

```
用户点击 "撤单"
       │
       ▼
DELETE /api/orders/[id]
  └─ cancelOrder(id)
       ├─ 验证 status='pending'（已成交/已撤不可撤）
       ├─ buy 单：退还冻结 USDT（quantity × price）
       ├─ sell 单：退还冻结 BTC（quantity）
       └─ UPDATE orders SET status='cancelled'
```

---

## 8. 订单引擎设计

### 触发优先级

```
同一订单在一轮检查中按以下顺序评估（互斥，第一个满足即停止）：

Priority 1: 限价条件（type='limit'）
Priority 2: 止损条件（stop_price IS NOT NULL）
Priority 3: 止盈条件（take_profit_price IS NOT NULL）
```

### 子平仓单防递归

引入 `is_close_order` 字段：

```
原始订单（is_close_order=false）
  └─ 成交后若有 SL/TP → 创建子单（is_close_order=true）
       └─ 子单成交后 → 不再创建子单（!order.is_close_order 为 false）
```

### 性能特性

| 指标 | 值 |
|------|---|
| 检查频率 | 每 500ms |
| 批量检查 | 单次查询所有 pending 订单，顺序处理 |
| 价格延迟 | OKX WebSocket 推送延迟 + 轮询间隔（最大 500ms）|

---

## 9. 账户与持仓计算

### 资产冻结模型

```
账户总额 = available_balance + frozen_balance（不变）

下单 → 冻结：available -= X, frozen += X
成交 → 解冻：frozen -= X（对方资产 available += Y）
撤单 → 解冻：frozen -= X, available += X
```

### 持仓均价（VWAP）

每次买入触发加权平均计算：

```
new_qty = old_qty + buy_qty
new_entry = (old_qty × old_entry + buy_qty × fill_price) / new_qty
```

卖出时持仓数量减少，均价不变（直到清仓归零）。

### 浮动盈亏（Unrealized PnL）

```
PnL = (current_price - entry_price) × quantity
```

每 500ms 由订单引擎在检查挂单的同一循环内更新 `positions.unrealized_pnl`。

---

## 10. 测试策略

测试框架：**Jest + ts-jest**，全量 Mock 数据库（不依赖真实 PostgreSQL）。

### 测试文件

| 文件 | 用例数 | 覆盖重点 |
|------|--------|---------|
| `__tests__/lib/orderService.test.ts` | 29 | `fillOrder`（账户/持仓/均价/fill_price）、`createOrder`（市价/限价/余额校验/止损止盈子单创建）、`cancelOrder`（退款/状态校验）|
| `__tests__/engine/triggerLogic.test.ts` | 30 | 限价触发边界、止损触发（价格下跌）、止盈触发（价格上涨）、触发优先级、子单防递归、浮动盈亏计算 |
| `__tests__/api/orders.test.ts` | 24 | GET 订单列表、POST 参数校验与成功路径、止损止盈字段透传、DELETE 撤单错误处理 |
| **合计** | **83** | |

### Mock 架构

```
测试文件
  └─ jest.mock('../../lib/db', { __esModule: true, default: { query: jest.fn() } })
       │
       └─ pool.query = jest.fn()  ← 拦截所有 SQL，返回预设数据
```

### 运行

```bash
npm test                  # 运行所有测试
npm run test:coverage     # 生成覆盖率报告
```

---

## 11. 已知限制与后续规划

### 当前限制

| 限制 | 说明 |
|------|------|
| 单用户 | 无认证，数据库只有一个账户 |
| 无手续费 | `fee` 字段固定为 0 |
| 无历史行情 | K 线图依赖 TradingView Widget 实时数据，无法回放 |
| 止损/止盈只适用现货多头 | `stop_price` 触发逻辑固定为价格下跌，不支持空头止损 |
| 价格精度 | 使用 OKX 实时价，可能与 DB 中限价有微小误差 |
| 无事务保护 | 多个 `pool.query` 非原子操作，极端情况可能出现数据不一致 |

### 后续规划

- [ ] 数据库事务（BEGIN/COMMIT）保护账户更新原子性
- [ ] 手续费计算（Maker/Taker 费率）
- [ ] 支持空头止损/止盈（短仓平仓子单）
- [ ] 订单簿深度 WebSocket（替代 REST 轮询）
- [ ] 历史 K 线 + 回测功能
- [ ] 多交易对支持（ETH/USDT 等）
- [ ] 导出交易记录（CSV）

---

*文档基于 btc-trade v1.0 生成，如有疑问请对照源代码。*

---

## 12. 术语表

本文档涉及的技术术语与金融术语速查。

### 技术术语

| 术语 | 全称 / 解释 |
|------|------------|
| **WebSocket** | 一种基于 TCP 的全双工通信协议。与普通 HTTP"一问一答"不同，WebSocket 建立连接后服务端可以**主动推送**数据给客户端，无需客户端反复轮询。本系统用它接收 OKX 的实时价格推送。|
| **wss://** | WebSocket Secure，即加密版 WebSocket，相当于 HTTPS 之于 HTTP。|
| **App Router** | Next.js 13+ 引入的新路由系统，基于文件系统目录结构定义路由，支持 React Server Components，取代旧的 Pages Router。本系统使用 `app/` 目录组织页面与 API。|
| **API Routes** | Next.js 提供的轻量后端能力，在 `app/api/` 目录下创建 `route.ts` 文件即可定义 REST 接口，与前端共享同一 Node.js 进程。|
| **Tailwind CSS** | 一种"原子化 CSS"框架，不提供预制组件，而是提供大量细粒度工具类（如 `text-sm`、`flex`、`p-4`），通过组合类名直接在 HTML/JSX 中编写样式。|
| **TradingView Widget** | TradingView 提供的免费可嵌入式 K 线图表组件，通过 `<script>` 标签从 CDN 加载，数据由 TradingView 服务器托管，无需自建图表引擎。|
| **CDN** | Content Delivery Network，内容分发网络。将静态资源（JS/CSS/图片）缓存到全球各地节点，用户从距离最近的节点加载，提升访问速度。|
| **ORM** | Object-Relational Mapping，对象关系映射。一种让开发者用面向对象的方式操作数据库的技术，如 Prisma、TypeORM。本系统**不使用 ORM**，直接编写原生 SQL，更透明可控。|
| **pg / pg Pool** | `pg` 是 Node.js 的 PostgreSQL 官方驱动库。`Pool`（连接池）维护一组可复用的数据库连接，避免每次请求都重新建立连接的开销。|
| **ts-jest** | 让 Jest 测试框架能够直接运行 TypeScript 文件的适配器，无需预先将 `.ts` 编译为 `.js`。|
| **Jest** | Facebook 出品的 JavaScript 测试框架，支持单元测试、集成测试，内置 Mock、断言、代码覆盖率等能力。|
| **Mock** | 测试中用一个"假对象"替代真实依赖（如数据库、网络请求），使测试不依赖外部环境，运行快且可控。|
| **Redis** | 一种基于内存的键值数据库，常用于缓存、消息队列、分布式锁。本系统因单进程架构，直接用 `global` 变量共享价格，不需要 Redis。|
| **DECIMAL(20,8)** | PostgreSQL 精确小数类型，总共 20 位有效数字，其中小数点后 8 位。用于金融金额，避免浮点数精度误差。|
| **SERIAL** | PostgreSQL 自增整数类型，每次插入新行时自动分配一个递增的唯一 ID，等价于 `INTEGER DEFAULT nextval(...)`。|
| **TIMESTAMP** | 存储日期和时间的数据库类型，精确到微秒，用于记录订单创建时间、成交时间等。|
| **SIGTERM** | 操作系统发送给进程的"优雅终止"信号（如 `kill` 命令、`Ctrl+C`）。本系统监听此信号，收到后关闭 WebSocket、清理定时器、断开数据库连接，再退出进程。|

### 金融 / 业务术语

| 术语 | 全称 / 解释 |
|------|------------|
| **Ticker** | 行情快照。交易所对某个交易对当前市场状态的实时摘要，包含最新成交价（`last`）、24h 最高/最低价、成交量等。详见 [Ticker.md](./Ticker.md)。|
| **VWAP** | Volume-Weighted Average Price，成交量加权平均价。本系统用于计算持仓均价：每次买入时，新均价 = (原持仓量 × 原均价 + 新买入量 × 成交价) / 新总持仓量。|
| **PnL** | Profit and Loss，盈亏。分为"浮动盈亏"（持仓中，未卖出的纸面盈亏）和"已实现盈亏"（平仓后真实到账的盈亏）。|
| **SL** | Stop Loss，止损。当价格下跌到设定的触发价时，自动卖出持仓，防止亏损继续扩大。|
| **TP** | Take Profit，止盈。当价格上涨到设定的触发价时，自动卖出持仓，锁定利润。|
| **Maker / Taker** | 挂单方（Maker）与吃单方（Taker）。挂限价单等待成交的是 Maker（为市场提供流动性），主动发市价单立即成交的是 Taker（消耗流动性）。交易所通常对 Maker 收取更低手续费。|
| **Spread（价差）** | 最优卖价（Best Ask）与最优买价（Best Bid）之差。价差越小代表流动性越好。|
| **Slippage（滑点）** | 预期成交价与实际成交价之间的差距。市价大单或剧烈波动行情下容易产生。详见 [滑点.md](./滑点.md)。|
| **Spot（现货）** | 直接买卖真实资产，立即交割。与合约（期货）不同，现货无杠杆，最多亏光本金。|
| **Open Order（挂单）** | 尚未成交的订单，等待价格条件满足。对应本系统 `status = 'pending'`。|
| **Fill（成交）** | 订单实际买卖成功。`fillOrder` 函数名即来源于此。|
| **Close Order（平仓单）** | 专门用于结束持仓的卖单，对应本系统 `is_close_order = true` 的止损/止盈子单。|
| **USDT** | Tether USD，一种与美元 1:1 锚定的稳定币，是加密货币市场最主流的计价单位。|
| **BTC** | Bitcoin，比特币。本系统交易对为 BTC/USDT，用 USDT 买卖 BTC。|
