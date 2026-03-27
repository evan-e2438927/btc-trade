# Requirements — Black Theme

**Iteration**: 003-black-theme-feature
**Date**: 2026-03-27
**Type**: feature (mini)

---

## 需求描述

将页面背景色统一调整为纯黑（#000000）主题，去除现有 gray-950 的深灰残留，实现更彻底的暗色视觉风格。

## 验收标准

1. 页面整体背景（layout.tsx body）变为纯黑 `#000000`
2. 主交易页面（page.tsx）背景统一为 `#000000`
3. 底部面板背景与整体背景一致，无明显色差
4. 边框颜色在纯黑背景下仍然清晰可见（使用 gray-700 或更浅色）
5. 文字在纯黑背景上保持良好的可读性（白色文字）

## 约束

- 仅修改 CSS/Tailwind 类名，不改任何业务逻辑
- 影响文件不超过 2 个（layout.tsx, page.tsx）
- 无架构变更
- TradingView chart 主题保持 dark（独立于页面背景）

## 现状分析

当前 Tailwind 颜色映射：
- `gray-950` = `#030712` (RGB 3,3,18) — 当前 body/page 背景
- `gray-900` = `#111827` (RGB 17,24,39) — 底部面板
- `gray-800` = `#1f2937` (RGB 31,41,55) — 交易面板卡片

目标：
- `black` = `#000000` (RGB 0,0,0) — 全局背景
- `gray-900` 或更高 — 面板背景以形成对比
