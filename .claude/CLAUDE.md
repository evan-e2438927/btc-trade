# CLAUDE.md — BTC 模拟交易系统

## 项目概述

BTC/USDT 模拟现货交易平台，基于 Next.js（App Router）+ TypeScript 构建。

## 技术栈

- **前端**: Next.js 15 (App Router), React, TypeScript, Tailwind CSS
- **后端**: Next.js API Routes (serverless)
- **数据**: 客户端内存状态 + 轮询价格接口
- **图表**: TradingView tv.js (CDN, 免费版)
- **样式**: Tailwind CSS (dark theme)

## 目录结构

```
btc-trade/
  app/                    # Next.js App Router 页面
    api/                  # API Routes
      ticker/            # 价格 ticker 接口
      orders/            # 订单接口
    page.tsx             # 主页（交易面板 + K线图）
    layout.tsx           # 根布局
  components/
    TradingChart.tsx     # TradingView K线图组件（支持周期切换）
  lib/
    orderService.ts      # 订单业务逻辑
    priceStore.ts        # 价格状态
  docs/
    design.md            # 系统设计文档
    iterations/          # 迭代记录
      YYYY-MM-DD/        # 每日迭代
  tests/
    unit/                # 单元测试 (jest + jsdom)
    e2e/                 # E2E 测试 (Playwright)
```

## 迭代记录

| 日期 | 迭代 | 类型 | 变更 |
|------|------|------|------|
| 2026-03-27 | 002-chart-interval-feature | feature | TradingChart 增加K线周期下拉选择器（1m~1W），支持 localStorage 持久化，Effect B cleanup 防止内存泄漏 |

## 开发命令

```bash
npm run dev      # 启动开发服务器 localhost:3000
npm test         # 运行所有测试
npx jest --selectProjects=web  # 只运行 web 单元测试
npx playwright test tests/e2e/ # 运行 E2E 测试
```
