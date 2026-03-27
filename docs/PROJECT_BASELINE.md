# Project Baseline

> 生成时间: 2026-03-27
> 项目类型: Existing Project (已存在业务代码)

## 1. 项目概述

**项目名称**: btc-trade
**版本**: 0.1.0
**描述**: BTC 模拟交易系统（支持市价/限价下单、止损/止盈、实时行情）

## 2. 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| 前端框架 | Next.js (App Router) | 16.1.6 |
| UI 框架 | React | 19.2.3 |
| 语言 | TypeScript | 5.x |
| 样式 | Tailwind CSS | 4.x |
| 数据库 | PostgreSQL (pg) | 8.19.0 |
| WebSocket | ws | 8.19.0 |
| 图表 | lightweight-charts | 5.1.0 |
| 测试框架 | Jest + ts-jest | 30.x |
| 包管理器 | npm | - |

## 3. 核心业务逻辑

### 3.1 订单服务 (`lib/orderService.ts`)

对外暴露三个核心函数：

- **createOrder**: 创建订单（余额校验 → 冻结资产 → 插入订单 → 市价单立即成交）
- **fillOrder**: 执行订单成交（更新账户余额、持仓均价、订单状态、写入成交记录）
- **cancelOrder**: 撤销挂单（解冻资产 → 更新订单状态为 cancelled）

### 3.2 订单引擎 (`server.js`)

- **行情来源**: OKX WebSocket 公共频道 (`wss://ws.okx.com:8443/ws/v5/public`)
- **扫描频率**: 每 500ms 检查一次 pending 订单
- **触发条件**:
  - 限价买单: `currentPrice <= 委托价`
  - 限价卖单: `currentPrice >= 委托价`
  - 止损触发: `currentPrice <= 止损触发价`
  - 止盈触发: `currentPrice >= 止盈触发价`
- **持仓更新**: 每次成交后更新 `positions.unrealized_pnl`

### 3.3 账户模型

- 每个资产(`asset`)有两条记录: `available_balance` 和 `frozen_balance`
- 买入时冻结 USDT，卖出时冻结 BTC
- 成交后解冻并更新可用余额

## 4. API Routes

| 路径 | 方法 | 描述 |
|------|------|------|
| `/api/ticker` | GET | 获取实时行情（Ticker） |
| `/api/account` | GET | 获取账户余额 |
| `/api/positions` | GET | 获取当前持仓 |
| `/api/orders` | GET/POST | 查询/创建订单 |
| `/api/orders/[id]` | GET/DELETE | 查询/撤销单个订单 |
| `/api/trades` | GET | 获取成交记录 |

## 5. 数据库表

> PostgreSQL via `lib/db.ts`，连接参数来自环境变量：
> `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`

核心表:
- **accounts**: 账户余额（available_balance, frozen_balance）
- **orders**: 订单（含止损止盈子单标识 is_close_order）
- **positions**: 持仓（quantity, entry_price, unrealized_pnl）
- **trades**: 成交记录

## 6. 配置要求

```bash
# .env (需创建)
DB_HOST=192.168.0.105
DB_PORT=5432
DB_NAME=mydb
DB_USER=postgres
DB_PASSWORD=admin
PORT=3002
NODE_ENV=production
```

## 7. 测试现状

现有测试文件:
- `__tests__/lib/orderService.test.ts`
- `__tests__/api/orders.test.ts`
- `__tests__/engine/triggerLogic.test.ts`

Jest 配置覆盖:
- `lib/orderService.ts`
- `lib/priceStore.ts`
- `app/api/**/*.ts`

## 8. 目录偏离记录

本项目 **未采用** Better-T-Stack monorepo 结构，采用的是传统 Next.js 单项目结构：

| 实际路径 | Better-T-Stack 约定 |
|----------|---------------------|
| `app/` (Next.js pages) | `apps/web/src/` |
| `lib/` (业务逻辑) | `packages/*` |
| `components/` | `apps/web/src/components/` |

**风险**: 无 monorepo 支持，跨项目共享代码困难
**迁移计划**: 未来可考虑重构为 `apps/web` + `apps/server` 结构

## 9. 已知假设

- 数据库默认连接 `192.168.0.105:5432`（本地开发机）
- 仅支持 BTC-USDT 交易对
- 所有价格精度和数量精度未在代码中严格校验
