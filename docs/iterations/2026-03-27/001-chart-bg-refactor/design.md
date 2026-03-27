# Design

**需求**: 把K线图的背景颜色改成深灰色
**迭代**: 001-chart-bg-refactor
**日期**: 2026-03-27

---

## 变更方案

### 代码落位

- `components/TradingChart.tsx` — TradingView widget 配置

### 实现方式

TradingView 嵌入式 widget 支持通过 `overrides` 属性覆盖默认样式。

**修改前**（第44-60行）:
```typescript
widgetRef.current = new window.TradingView.widget({
  autosize: true,
  symbol: 'OKX:BTCUSDT',
  interval: '15',
  timezone: 'Asia/Shanghai',
  theme: 'dark',
  style: '1',
  locale: 'zh_CN',
  enable_publishing: false,
  allow_symbol_change: false,
  hide_side_toolbar: false,
  withdateranges: true,
  save_image: false,
  container_id: CONTAINER_ID,
  studies: ['Volume@tv-basicstudies'],
});
```

**修改后** — 添加 `overrides` 配置覆盖背景色:
```typescript
widgetRef.current = new window.TradingView.widget({
  ...existing config...,
  overrides: {
    'mainSeriesProperties.candleStyle.upColor': '#26a69a',
    'mainSeriesProperties.candleStyle.downColor': '#ef5350',
    'paneProperties.background': '#2a2a2a',
    'paneProperties.backgroundType': 'solid',
    'scalesProperties.backgroundColor': '#2a2a2a',
  },
});
```

### 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 背景色 | `#2a2a2a` | 深灰色，比 TradingView 默认深色更中性 |
| 背景类型 | `solid` | 纯色背景，避免渐变导致的显示问题 |
| 蜡烛颜色 | 保持原样 | `upColor: #26a69a`, `downColor: #ef5350` — 绿涨红跌，符合习惯 |

### 依赖

- TradingView `tv.js` 外部库（已有）
- 无需安装新包

### 风险

- TradingView widget 的 overrides 可能因版本更新而失效 → 低风险，有默认值兜底
- 背景色 `#2a2a2a` 与其他 UI 元素的搭配 → 低风险，深灰色与现有深色主题协调
