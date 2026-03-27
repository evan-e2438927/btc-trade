# BTC 模拟交易系统 (btc-trade)

## 项目概述

BTC 模拟交易系统，支持市价/限价下单、止损/止盈、实时行情（OKX WebSocket）、历史订单查询。

**技术架构**: Next.js (App Router) + 自定义 Node.js 服务器 + PostgreSQL

## 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| 前端 | Next.js + React | 16.1.6 + 19.2.3 |
| 语言 | TypeScript | 5.x |
| 数据库 | PostgreSQL | via pg 8.19.0 |
| WebSocket | ws | 8.19.0 (OKX 行情) |
| 图表 | lightweight-charts | 5.1.0 |
| 测试 | Jest + ts-jest | 30.x |

## 目录结构

```
app/              # Next.js App Router (pages + API routes)
components/       # React 组件 (TradingPanel, OrderBook, etc.)
lib/              # 业务逻辑 (orderService, db, priceStore)
server.js         # 自定义服务器 (Next.js + WebSocket + 订单引擎)
__tests__/        # Jest 单元测试
tests/            # SDLC 测试目录 (unit/e2e/reports)
docs/             # 项目文档 (含 iterations/ 迭代历史)
```

## 目录偏离记录

⚠️ **本项目未采用 Better-T-Stack monorepo 结构**，采用传统 Next.js 单项目结构：

- `app/` 在根目录（而非 `apps/web/src/`）
- `lib/` 在根目录（而非 `packages/`）
- `components/` 在根目录

如需重构，需更新 `docs/ARCHITECTURE.md` 偏离记录。

## 开发约定
- 参考 docs/ARCHITECTURE.md 了解架构设计
- 参考 docs/SECURITY.md 了解安全规范
- 参考 docs/CODING_GUIDELINES.md 了解编码规范
- 若项目为 existing project，先参考 `docs/PROJECT_BASELINE.md`、`docs/EXISTING_STRUCTURE.md`、`docs/TEST_BASELINE.md`
- 使用 Conventional Commits 格式提交
- 默认遵循 Better-T-Stack 风格目录：
  - `apps/web/src` 放 Web 前端代码
  - `apps/server/src` 放后端代码
  - `packages/config` 为基础包
  - `packages/env|api|auth|db|infra|ui` 按能力启用并承载共享逻辑
- 默认不新建根目录级 `web/`、`api/`、`server/` 等目录，除非设计文档明确批准

## 迭代历史

| 日期 | 迭代 | 类型 | 需求 |
|------|------|------|------|
| 2026-03-27 | 001-chart-bg-refactor | refactor | K线图背景色改为深灰色 #2a2a2a |

历史迭代记录存放在 `docs/iterations/` 目录下，按日期和需求顺序组织：

```
docs/iterations/
└── YYYY-MM-DD/
    └── <序号>-<需求名>-<变更类型>/
        ├── requirements.md    # 结构化需求
        ├── design.md          # 技术设计
        └── tasks.md           # 任务分解
```

**在处理新需求时，务必先阅读 `docs/iterations/` 下的历史迭代**，了解已有的设计决策、架构变更和业务上下文，避免：
- 与已有设计冲突
- 重复实现已存在的功能
- 引入与历史决策矛盾的方案

**若项目已经有既有技术架构，不得把它当 fresh project 重建目录。** 必须先尊重 baseline，再决定是否需要结构调整。

## SDLC Workflow
本项目使用 sdlc-workflow 技能进行自动化开发。
- 首次接入运行 `/sdlc-init`
- 标准需求运行 `/sdlc-doit <需求>`
- 小任务运行 `/sdlc-doit-mini <需求>`
- 配置见 `.env` 文件
