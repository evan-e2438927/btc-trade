# Tasks

**需求**: 增加一个切换K线时间周期的下拉选择器
**迭代**: 002-chart-interval-feature
**日期**: 2026-03-27

---

## T-001: 重构生命周期 + 添加 interval 状态和下拉选择器 UI

**验收标准**:
- [x] `components/TradingChart.tsx` 重构为两段式 useEffect（Effect A: 脚本加载，Effect B: widget 创建/重建）
- [x] `scriptReady` state 控制 Effect B 的执行时机
- [x] `selectedInterval` state（初始值由 `getSavedInterval()` 读取，详见 T-003）
- [x] 定义 `INTERVALS` 常量数组（包含 1m, 5m, 15m, 30m, 1H, 2H, 4H, 1D, 1W）
- [x] 外层包裹 `relative` 定位 div，内含 widget 挂载节点和下拉选择器
- [x] 右上角添加 `<select>` 下拉选择器（absolute + z-10）
- [x] 下拉样式：深色背景（bg-gray-800）、白色文字、圆角边框
- [x] `handleIntervalChange` 只调用 `setSelectedInterval()`，不直接调用 `remove()`

**代码变更位置**: `components/TradingChart.tsx`

---

## T-002: 实现 interval 变更时自动重建 widget

**验收标准**:
- [x] Effect B 依赖数组为 `[selectedInterval, scriptReady]`
- [x] Effect B 内部先调用 `widgetRef.current?.remove?.()` 销毁旧 widget
- [x] `createWidget` 使用 `selectedInterval` 作为 `interval` 参数
- [x] Widget 重建后图表正确显示新周期数据
- [x] `handleIntervalChange` 不直接调用 `remove()`，由 Effect B 统一处理销毁

**依赖**: T-001

---

## T-003: localStorage 持久化（可选）

**验收标准**:
- [x] `getSavedInterval()` 函数含 `typeof window === 'undefined'` guard
- [x] 页面加载时从 `localStorage.getItem('chartInterval')` 读取上次选择的周期
- [x] 周期变更时自动保存到 `localStorage.setItem('chartInterval', selectedInterval)`
- [x] 若 localStorage 无值或非法，默认回退 '15'

**依赖**: T-001

---

## T-004: 单元测试

**验收标准**:
- [x] 测试文件写入 `tests/unit/web/TradingChart.test.tsx`
- [x] 测试用例覆盖：默认周期为 15、9个选项、下拉容器结构、z-10样式
- [x] 使用 React Testing Library 渲染组件并验证 select 元素存在

**结果**: 5 tests pass | 65/65 total | 1 pre-existing suite (`orders.test.ts`) fails due to unrelated module resolution

**依赖**: T-001, T-002, T-003

---

## T-005: E2E 测试（Playwright）

**验收标准**:
- [x] E2E 文件写入 `tests/e2e/chart-interval/E2E-001-interval-switch.e2e.ts`
- [x] 场景：打开页面 → 选择 "1小时" → 验证图表重新加载
- [x] 验证无控制台错误

**注意**: Playwright 测试需要 `npm run dev` 在 localhost:3000 运行，Step ⑨ test-pipeline 中执行

**依赖**: T-001, T-002

---

**预估工时**: 1.5h（UI + 重建逻辑 + 测试）
