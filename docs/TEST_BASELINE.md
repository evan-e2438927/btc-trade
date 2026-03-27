# Test Baseline

> 生成时间: 2026-03-27

## 测试框架

| 类别 | 工具 | 配置 |
|------|------|------|
| 单元测试 | Jest | `jest.config.js` |
| 类型支持 | ts-jest | ts-jest preset |
| E2E 测试 | Playwright | 待配置 |
| 报告格式 | Jest JSON Coverage | `tests/reports/` |

## Jest 配置

**配置文件**: `jest.config.js`

```javascript
preset: 'ts-jest'
testEnvironment: 'node'
testMatch: ['**/__tests__/**/*.test.ts']
collectCoverageFrom: [
  'lib/orderService.ts',
  'lib/priceStore.ts',
  'app/api/**/*.ts',
]
```

**运行命令**:
- `npm test` - 运行所有测试
- `npm run test:coverage` - 运行测试并生成覆盖率报告

## 现有测试文件

| 文件 | 覆盖范围 |
|------|----------|
| `__tests__/lib/orderService.test.ts` | 订单服务核心逻辑 |
| `__tests__/api/orders.test.ts` | 订单 API Routes |
| `__tests__/engine/triggerLogic.test.ts` | 订单引擎触发逻辑 |

## 测试目录规范 (SDLC Workflow)

根据 SDLC Workflow 规范，测试文件必须写入以下目录：

```
tests/
├── unit/              # 单元测试（按模块分组）
│   ├── web/           # 前端单元测试
│   ├── server/        # 后端单元测试
│   └── packages/      # 共享包单元测试
├── e2e/               # E2E 测试（Playwright）
│   └── <slug>/        # 按需求命名的 E2E 场景
│       └── E2E-*.e2e.ts
└── reports/           # 测试报告
    └── <slug>-coverage.md
```

**注意**: 现有 `__tests__/` 目录保持不变，新增测试应遵循 SDLC 规范写入 `tests/` 目录。

## 测试覆盖率目标

| 模块 | 当前覆盖率 | 目标 |
|------|------------|------|
| `lib/orderService.ts` | 未测试 | ≥80% |
| `lib/priceStore.ts` | 未测试 | ≥80% |
| `app/api/**/*.ts` | 部分 | ≥70% |
| `server.js` 引擎 | 未测试 | ≥60% |

## 待配置

1. **Playwright E2E**: 需安装 `npm install -D @playwright/test && npx playwright install`
2. **E2E 测试场景**: 需为关键用户路径编写 E2E 测试
3. **CI 集成**: 需配置 GitHub Actions 或其他 CI 工具

## 测试数据

测试使用真实数据库连接（通过 `lib/db.ts`），建议：

1. 测试前创建测试数据库
2. 使用事务回滚隔离测试数据
3. 或使用 mock 替代真实数据库连接
