# Design — Black Theme

**Iteration**: 003-black-theme-feature
**Date**: 2026-03-27

---

## 无架构变更

本迭代仅调整 Tailwind CSS 类名，不涉及目录结构、API、数据模型或 workspace 变更。

## 设计方案

### 颜色策略

| 层级 | Tailwind 类 | 色值 | 说明 |
|------|-------------|------|------|
| 全局背景（body） | `bg-black` | `#000000` | 纯黑背景 |
| 主页面背景（page.tsx） | `bg-black` | `#000000` | 与 body 保持一致 |
| 交易面板容器 | `bg-gray-950` | `#030712` | 略深灰，与纯黑形成微弱层次 |
| 底部面板 | `bg-gray-950` | `#030712` | 与交易面板背景接近 |
| 顶部账户栏 | `bg-gray-900` | `#111827` | 次级面板，轻微凸出感 |
| 边框 | `border-gray-800` | `#1f2937` | 在纯黑背景上清晰可见 |

### 修改位置

- **`app/layout.tsx`** — `body` className: `bg-gray-950` → `bg-black`
- **`app/page.tsx`** — 主 div className: `bg-gray-950` → `bg-black`

### 层次保持

TradingView widget 使用自己的 `theme: 'dark'`，不受页面 CSS 影响，独立渲染 K 线图。

---

## 风险评估

| 风险 | 级别 | 缓解 |
|------|------|------|
| 边框颜色在纯黑背景下不清晰 | 低 | 使用 `gray-800`（比黑更浅），确保对比度 |
| 组件背景色与 body 过于接近导致边界模糊 | 低 | 面板使用 `gray-900` 或 `gray-950` 形成微弱层次 |
| 文字可读性 | 无 | 白色文字在黑色背景上对比度最佳 |
