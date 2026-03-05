# Ticker（行情快照）详解

> 本文面向不熟悉金融/加密货币术语的开发者，解释 Ticker 是什么、包含哪些数据，以及在本系统中如何使用。

---

## 目录

1. [什么是 Ticker](#1-什么是-ticker)
2. [Ticker 包含哪些数据](#2-ticker-包含哪些数据)
3. [Ticker vs K线 vs 订单簿](#3-ticker-vs-k线-vs-订单簿)
4. [OKX Ticker 数据格式](#4-okx-ticker-数据格式)
5. [本系统中的 Ticker 流转过程](#5-本系统中的-ticker-流转过程)
6. [WebSocket vs REST 获取 Ticker](#6-websocket-vs-rest-获取-ticker)

---

## 1. 什么是 Ticker

**Ticker**（行情快照）是交易所对某个交易对**当前市场状态的一次完整快照**，包含最新成交价、涨跌幅、24 小时成交量等摘要信息。

### 词源

"Ticker" 源自早期股票市场的**纸带打印机**（Ticker Tape），它会不断打印出最新的股票价格，发出"嗒嗒"（tick）的声音。现代交易中，"Ticker" 泛指**实时价格行情数据流**。

### 通俗类比

> 就像你打开某宝商品页面看到的"**当前价格 + 今日销量 + 涨跌幅**"实时摘要，Ticker 就是交易所实时播报的"行情摘要"。

---

## 2. Ticker 包含哪些数据

一条完整的 Ticker 通常包含以下字段：

| 字段 | 英文名 | 含义 |
|------|--------|------|
| 最新成交价 | `last` / `lastPrice` | 最近一笔成交的价格，即"当前价" |
| 最优买价 | `bestBid` | 当前买盘最高出价（买一价）|
| 最优卖价 | `bestAsk` | 当前卖盘最低要价（卖一价）|
| 24h 开盘价 | `open24h` | 24 小时前的价格 |
| 24h 最高价 | `high24h` | 过去 24 小时内的最高成交价 |
| 24h 最低价 | `low24h` | 过去 24 小时内的最低成交价 |
| 24h 成交量 | `vol24h` | 过去 24 小时内成交的 BTC 数量 |
| 24h 成交额 | `volCcy24h` | 过去 24 小时内成交的 USDT 金额 |
| 涨跌幅 | `changeRate` | 相对 24h 前价格的涨跌百分比 |
| 时间戳 | `ts` | 数据生成时间（毫秒）|

### 最重要的字段：`last`（最新成交价）

本系统最核心的用途是从 Ticker 中提取 `last` 字段作为**当前市场价格**，用于：
- 市价单的成交定价
- 止损/止盈的触发判断
- 浮动盈亏的实时计算
- 前端显示当前价格

---

## 3. Ticker vs K线 vs 订单簿

这三者都是行情数据，但用途不同：

| 数据类型 | 更新频率 | 包含内容 | 主要用途 |
|---------|---------|---------|---------|
| **Ticker** | 每次成交（毫秒级）| 当前最新价、24h 统计摘要 | 显示当前价，触发订单 |
| **K 线** | 按时间周期汇总（1m/5m…）| 开高低收 + 成交量 | 图表展示，趋势分析 |
| **订单簿** | 持续变化 | 买卖双方所有挂单的价格和数量 | 查看市场深度，评估流动性 |

```
Ticker  → 告诉你现在的价格是多少
K 线    → 告诉你历史上价格是怎么走的
订单簿  → 告诉你现在有哪些人想以什么价格买/卖
```

---

## 4. OKX Ticker 数据格式

本系统通过 OKX WebSocket v5 订阅 BTC-USDT 的 Ticker 数据。

### 订阅请求

```json
{
  "op": "subscribe",
  "args": [
    {
      "channel": "tickers",
      "instId": "BTC-USDT"
    }
  ]
}
```

### 推送数据示例

```json
{
  "arg": {
    "channel": "tickers",
    "instId": "BTC-USDT"
  },
  "data": [
    {
      "instType": "SPOT",
      "instId": "BTC-USDT",
      "last": "65032.5",        ← 最新成交价（本系统最关键的字段）
      "lastSz": "0.00021",      ← 最新成交数量
      "askPx": "65033.0",       ← 最优卖价（卖一价）
      "askSz": "0.12",          ← 卖一挂单数量
      "bidPx": "65032.4",       ← 最优买价（买一价）
      "bidSz": "0.35",          ← 买一挂单数量
      "open24h": "63500.0",     ← 24h 前价格
      "high24h": "65800.0",     ← 24h 最高价
      "low24h": "63200.0",      ← 24h 最低价
      "volCcy24h": "1234567.8", ← 24h 成交额（USDT）
      "vol24h": "19.456",       ← 24h 成交量（BTC）
      "ts": "1740000000000"     ← 时间戳（毫秒）
    }
  ]
}
```

### 涨跌幅计算

OKX 的 Ticker 不直接返回涨跌幅百分比，需要自行计算：

$$
\text{涨跌幅} = \frac{\text{last} - \text{open24h}}{\text{open24h}} \times 100\%
$$

例：last = 65032.5，open24h = 63500.0

$$
\frac{65032.5 - 63500}{63500} \times 100\% \approx +2.41\%
$$

---

## 5. 本系统中的 Ticker 流转过程

```
OKX 交易所
    │
    │  WebSocket 推送（每次成交触发，毫秒级）
    │  channel: tickers / BTC-USDT
    ▼
server.js（connectOKX 函数）
    │
    │  解析 data[0].last → 提取最新价格
    ▼
memPriceStore.setTicker(ticker)
global.__priceStore = memPriceStore      ← 存入进程内存
    │
    ├──────────────────────────────────────────────────┐
    │                                                  │
    ▼（每 500ms）                                      ▼（前端每 2 秒轮询）
订单引擎                                         GET /api/ticker
checkPendingOrders()                                   │
    │                                                  │
    │  currentPrice = priceStore.getPrice()            │  return { price, ticker }
    │                                                  │
    ├─ 触发限价单                                      ▼
    ├─ 触发止损                               TradingPanel 显示当前价
    ├─ 触发止盈                               AccountBar 显示浮动盈亏
    └─ 更新浮动盈亏
```

### 关键路径：`server.js` → `global.__priceStore` → `lib/priceStore.ts`

```typescript
// lib/priceStore.ts
// 读取 server.js 存入 global 的价格对象
export function getPrice(): number {
  const store = (global as any).__priceStore;
  return store ? store.getPrice() : 0;
}

export function getTicker() {
  const store = (global as any).__priceStore;
  return store ? store.getTicker() : null;
}
```

之所以通过 `global` 共享而非 Redis/数据库，原因见 [design.md 第 3 节](./design.md#3-整体架构)：同一进程内读内存延迟为 0，无需额外基础设施。

---

## 6. WebSocket vs REST 获取 Ticker

| 方式 | 延迟 | 资源消耗 | 适用场景 |
|------|------|---------|---------|
| **WebSocket 推送**（本系统用于订单引擎）| 极低（毫秒级）| 长连接，一次建立持续接收 | 需要实时价格触发逻辑（止损/止盈）|
| **REST 轮询**（本系统前端用）| 较高（取决于轮询间隔）| 每次请求独立连接 | 展示用，对延迟要求不高 |

```
本系统的两条价格链路：

链路 1（高精度，后端用）：
  OKX WebSocket → server.js → memPriceStore → 订单引擎
  延迟：毫秒级，价格几乎实时

链路 2（展示用，前端用）：
  前端 → GET /api/ticker（每 2 秒）→ priceStore.getTicker() → 显示
  延迟：最大 2 秒，够用于界面展示
```

---

## 总结

```
Ticker = 交易所对某交易对当前市场状态的实时快照

核心字段：last（最新成交价）

本系统用途：
  ├── 订单引擎：判断止损/止盈/限价单的触发条件
  ├── 市价单：以 last 作为成交价
  ├── 浮动盈亏：(last - entry_price) × quantity
  └── 前端展示：当前价格、24h 涨跌幅

数据来源：OKX WebSocket v5，channel = tickers/BTC-USDT
共享方式：server.js → global.__priceStore → lib/priceStore.ts
```

---

> 相关概念：[K 线图](./concepts.md#11-k-线图) | [订单簿撮合](./订单簿撮合.md) | [滑点](./滑点.md)
