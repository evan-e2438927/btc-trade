# Architecture

## 系统概要

BTC 模拟交易系统，采用 Next.js + 自定义 Node.js 服务器架构：

```
┌─────────────────────────────────────────────────────────────┐
│                    server.js                                │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │ OKX WebSocket │  │ 500ms 订单引擎 │  │ Next.js Handler │ │
│  │   行情订阅    │  │ (pending扫描)  │  │   (API Routes)  │ │
│  └──────────────┘  └──────────────┘  └─────────────────┘ │
│         │                  │                   │          │
│         ▼                  ▼                   ▼          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              PostgreSQL (accounts/orders/positions)  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  React 前端 UI  │
                    │ TradingPanel    │
                    │ OrderBook       │
                    │ TradingChart    │
                    └─────────────────┘
```

## 技术栈

- **前端**: Next.js 16.1.6 (App Router), React 19.2.3, Tailwind CSS v4
- **后端**: Node.js + 自定义 HTTP 服务器
- **数据库**: PostgreSQL via `pg` 8.19.0
- **实时行情**: OKX WebSocket (`wss://ws.okx.com:8443/ws/v5/public`)
- **图表**: lightweight-charts 5.1.0
- **测试**: Jest 30.x + ts-jest

## 目录约定

默认采用 Better-T-Stack 风格 monorepo：

```text
apps/
├── web/          # Web 前端
├── server/       # 后端 API / BFF / Worker
├── native/       # 移动端（可选）
└── docs/         # 文档站点（可选）

packages/
├── config/       # 始终存在
├── env/          # 存在前端或后端时
├── api/          # 启用 API 层时
├── auth/         # 启用认证时
├── db/           # 启用数据库 + ORM 时
├── infra/        # 启用 Cloudflare / infra 时
└── ui/           # React Web 共享 UI 时
```

约束：

- Web UI 和页面逻辑默认放在 `apps/web/src/`
- 后端入口、路由、服务默认放在 `apps/server/src/`
- 共享逻辑优先进入 `packages/*`，并根据所选能力启用对应包
- 默认不新增根目录级 `web/`、`server/`、`api/`、`frontend/`、`backend/`
- 若偏离该结构，必须记录原因和影响范围

## 模块结构

| 模块 | 职责 |
|------|------|
| `server.js` | 生产服务器入口：Next.js + OKX WebSocket 行情 + 500ms 订单引擎 |
| `lib/orderService.ts` | 订单业务逻辑：创建/成交/撤销 + 止损止盈子单 |
| `lib/db.ts` | PostgreSQL 连接池封装 |
| `lib/priceStore.ts` | 内存价格存储（OKX WebSocket 数据） |
| `app/api/*/route.ts` | App Router API Routes（REST 接口） |
| `components/` | React UI 组件（TradingPanel, OrderBook, PositionList 等） |

**跨层依赖约束**:
- `server.js` 依赖 `lib/db.ts` 和 `lib/orderService.ts`
- API Routes 通过 `global.__priceStore` 读取行情数据
- 前端组件通过 `fetch('/api/*')` 与后端通信

## 数据流
<!-- 描述数据如何在系统中流转 -->

## 外部依赖
<!-- 列出外部服务、API、数据库等 -->

## 部署架构
<!-- 描述部署环境和方式 -->

## 目录偏离记录

⚠️ **本项目未采用 Better-T-Stack monorepo 结构**

**原因**: 项目初始采用传统 Next.js 单项目结构，后续未重构

**实际结构**:
- `app/` = Next.js App Router（前端页面 + API Routes）
- `components/` = React 组件
- `lib/` = 业务逻辑层（数据库、订单服务、价格存储）

**风险**:
- 前后端代码未分离，难以独立部署
- 跨项目共享代码困难

**迁移计划**（未来可选）:
1. 将 `app/` 移动到 `apps/web/src/`
2. 将 `server.js` 移动到 `apps/server/src/`
3. 将 `lib/` 中的共享逻辑迁移到 `packages/`
