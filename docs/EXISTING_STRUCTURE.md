# Existing Structure

> 生成时间: 2026-03-27

## 目录树

```
btc-trade/
├── .env                        # 环境变量（需从 .env.example 复制）
├── .env.example                # 环境变量模板（由 init-project.sh 生成）
├── .gitignore
├── .next/                      # Next.js 构建产物
├── .claude/                    # SDLC Workflow 配置
│   └── CLAUDE.md              # 项目元数据（需填写）
├── app/                        # Next.js App Router
│   ├── api/                   # API Routes
│   │   ├── account/route.ts   # GET /api/account
│   │   ├── orders/
│   │   │   ├── route.ts       # GET,POST /api/orders
│   │   │   └── [id]/route.ts  # GET,DELETE /api/orders/:id
│   │   ├── positions/route.ts # GET /api/positions
│   │   ├── ticker/route.ts    # GET /api/ticker
│   │   └── trades/route.ts    # GET /api/trades
│   ├── globals.css
│   ├── layout.tsx
│   ├── page.tsx               # 主页（交易界面）
│   └── favicon.ico
├── components/                 # React 组件
│   ├── AccountBar.tsx          # 账户余额栏
│   ├── OrderBook.tsx           # 订单簿显示
│   ├── OrderHistory.tsx        # 历史订单
│   ├── PositionList.tsx        # 持仓列表
│   ├── TradingChart.tsx        # K线图表（lightweight-charts）
│   └── TradingPanel.tsx        # 交易下单面板
├── lib/                        # 业务逻辑层
│   ├── db.ts                   # PostgreSQL 连接池
│   ├── orderService.ts         # 订单服务（createOrder/fillOrder/cancelOrder）
│   └── priceStore.ts           # 内存价格存储（OKX WebSocket 数据）
├── docs/                       # 项目文档
│   ├── ARCHITECTURE.md         # 架构文档（模板）
│   ├── CODING_GUIDELINES.md    # 编码规范（模板）
│   ├── SECURITY.md             # 安全文档（模板）
│   ├── iterations/             # SDLC 迭代目录
│   ├── concepts.md             # 概念文档
│   ├── design.md               # 设计文档
│   ├── lifecycle.md            # 生命周期文档
│   ├── Ticker.md              # 行情相关
│   ├── TradingView.md          # 交易视图
│   ├── 币安现货交易 BTC - mvp.md
│   ├── 订单部分成交.md
│   ├── 订单簿撮合.md
│   ├── 滑点.md
│   ├── 平仓.md
│   ├── 数据库连接.md
│   └── 做空.md
├── __tests__/                  # Jest 单元测试
│   ├── api/orders.test.ts
│   ├── engine/triggerLogic.test.ts
│   └── lib/orderService.test.ts
├── tests/                      # SDLC 测试目录（init-project.sh 创建）
│   ├── unit/                   # 单元测试输出目录
│   ├── e2e/                    # E2E 测试目录
│   └── reports/                # 测试报告目录
├── scripts/                    # 构建脚本
├── server.js                   # 自定义 HTTP 服务器（Next.js + WebSocket + 订单引擎）
├── jest.config.js
├── next.config.ts
├── package.json
├── package-lock.json
├── postcss.config.mjs
├── tailwind.config.ts (v4 无需此文件)
└── tsconfig.json
```

## 文件用途速查

| 文件 | 职责 |
|------|------|
| `server.js` | 生产服务器入口：启动 Next.js + OKX WebSocket 行情 + 500ms 订单引擎 |
| `lib/db.ts` | PostgreSQL 连接池封装 |
| `lib/orderService.ts` | 订单业务逻辑：创建/成交/撤销 + 止损止盈子单 |
| `lib/priceStore.ts` | 内存价格存储，被 `server.js` 和 API Routes 共享 |
| `app/api/*/route.ts` | Next.js App Router API Routes |
| `components/TradingPanel.tsx` | 核心 UI：下单面板（含市价/限价、止损止盈） |
| `components/TradingChart.tsx` | K线图表（TradingView lightweight-charts） |
| `components/OrderBook.tsx` | 订单簿展示 |
| `components/PositionList.tsx` | 持仓列表 + 浮动盈亏 |
| `components/AccountBar.tsx` | 账户余额栏 |
| `components/OrderHistory.tsx` | 历史订单查询 |

## 组件依赖关系

```
app/page.tsx (主页面)
├── components/TradingPanel.tsx
├── components/TradingChart.tsx
├── components/OrderBook.tsx
├── components/PositionList.tsx
├── components/AccountBar.tsx
└── components/OrderHistory.tsx

server.js (订单引擎)
├── lib/db.ts (数据库)
├── lib/priceStore.ts (价格存储)
└── API Routes 共享 global.__priceStore

lib/orderService.ts
└── lib/db.ts (数据库)
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DB_HOST` | 192.168.0.105 | PostgreSQL 主机 |
| `DB_PORT` | 5432 | PostgreSQL 端口 |
| `DB_NAME` | mydb | 数据库名 |
| `DB_USER` | postgres | 用户名 |
| `DB_PASSWORD` | admin | 密码 |
| `PORT` | 3002 | 服务端口 |
| `NODE_ENV` | - | production/development |
