# Tasks

**需求**: 把K线图的背景颜色改成深灰色
**迭代**: 001-chart-bg-refactor
**日期**: 2026-03-27

---

## T-001: 修改 TradingChart 组件背景色

**验收标准**:
- [x] 在 `components/TradingChart.tsx` 的 TradingView widget 配置中添加 `overrides` 属性
- [x] `paneProperties.background` 设置为 `#2a2a2a`
- [x] `paneProperties.backgroundType` 设置为 `'solid'`
- [x] `scalesProperties.backgroundColor` 设置为 `#2a2a2a`

**代码变更**:
```diff
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
+   overrides: {
+     'mainSeriesProperties.candleStyle.upColor': '#26a69a',
+     'mainSeriesProperties.candleStyle.downColor': '#ef5350',
+     'paneProperties.background': '#2a2a2a',
+     'paneProperties.backgroundType': 'solid',
+     'scalesProperties.backgroundColor': '#2a2a2a',
+   },
  });
```

**预估工时**: 0.1h（纯配置变更）
**实际落位**: `components/TradingChart.tsx`
