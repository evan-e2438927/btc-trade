# Requirements

**需求**: 把K线图的背景颜色改成深灰色
**迭代**: 001-chart-bg-refactor
**类型**: refactor
**日期**: 2026-03-27

---

## R-001: K线图背景色变更

**描述**: 将 TradingChart 组件的 K线图背景色从当前颜色变更为深灰色（#2a2a2a 或类似）。

**验收标准**:
- [ ] TradingView K线图背景变为深灰色
- [ ] 图表其他元素（网格线、标签等）保持可读性
- [ ] 深色主题整体协调，无明显色差

**当前状态**:
- TradingView widget 使用 `theme: 'dark'`，背景为深蓝黑色
- 可通过 TradingView 的 `overrides` 配置覆盖背景色

**置信度**: 高 (1.0) [✅ 已确认]
