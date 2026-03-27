# Design

**需求**: 增加一个切换K线时间周期的下拉选择器
**迭代**: 002-chart-interval-feature
**日期**: 2026-03-27
**项目**: Existing project（沿用既有结构）

---

## 变更方案

### 代码落位

| 文件 | 变更 |
|------|------|
| `components/TradingChart.tsx` | 核心变更：添加 interval 状态 + 下拉选择器 |

### 架构决策

**问题**: TradingView widget（免费版 tv.js）的 `interval` 参数在创建后无法通过 SDK 方法动态修改。

**技术验证**: TradingView Advanced Charts (付费 Charting Library) 支持 `activeChart().setResolution()`，但当前项目使用的是免费 `tv.js` Embedding Widget，经验证不支持运行时改 resolution，必须销毁重建。

**解决方案**: 周期切换时销毁旧 widget 实例并重建。

**生命周期分离（关键设计）**: 为避免竞态，必须将"脚本加载"和"widget 创建"拆分为两个独立的 useEffect：

```
┌─────────────────────────────────────────────────────┐
│ Effect A（仅执行一次，依赖 []）                        │
│ 负责加载 tv.js CDN 脚本，scriptRef 防止重复加载       │
└─────────────────────────────────────────────────────┘
                          │ scriptRef.current 标记已加载
                          ▼
┌─────────────────────────────────────────────────────┐
│ Effect B（依赖 [selectedInterval, scriptReady]）    │
│ 负责在脚本 ready 后，根据 selectedInterval           │
│ 创建或重建 widget                                    │
└─────────────────────────────────────────────────────┘
```

**重建流程**:
```
用户选择新周期
       │
       ▼
setSelectedInterval(newInterval)  ← 状态更新
       │
       ▼
Effect B 触发 → widgetRef.current?.remove()  ← 销毁旧 widget
       │
       ▼
createWidget(newInterval)   ← 以新 interval 重建
       │
       ▼
widgetRef.current = newWidget
```

### 组件接口变更

**Before**:
```typescript
interface Props {
  onPriceUpdate?: (price: number) => void;
}
```

**After**（采用非受控模式，内部管理 selectedInterval，暂不暴露 interval/onIntervalChange 受控接口）:
```typescript
interface Props {
  onPriceUpdate?: (price: number) => void;
  // 后续可扩展受控接口：
  // interval?: string;
  // onIntervalChange?: (i: string) => void;
}
```

**说明**: 本次迭代采用非受控模式，interval 状态完全由组件内部管理。父组件无需感知周期值。若后续需要受控模式，可通过 `interval` prop 传入并通过 `useEffect` 同步外部变化。

### 下拉选择器实现

**方案**: 使用原生 `<select>` 元素，通过 CSS 样式适配深色主题。

```tsx
// 下拉选项配置
const INTERVALS = [
  { label: '1分钟', value: '1' },
  { label: '5分钟', value: '5' },
  { label: '15分钟', value: '15' },
  { label: '30分钟', value: '30' },
  { label: '1小时', value: '60' },
  { label: '2小时', value: '120' },
  { label: '4小时', value: '240' },
  { label: '1天', value: '1D' },
  { label: '1周', value: '1W' },
] as const;
```

**样式**: 外层包裹 `relative` 定位容器，下拉选择器以 `absolute` 叠加在图表右上角：
```tsx
<div className="relative w-full h-full">
  {/* 下拉选择器（absolute 叠加在图表上方） */}
  <div className="absolute top-2 right-2 z-10">
    <select
      value={selectedInterval}
      onChange={(e) => setSelectedInterval(e.target.value)}
      className="bg-gray-800 border border-gray-600 text-white text-sm rounded px-2 py-1 cursor-pointer"
    >
      {INTERVALS.map(({ label, value }) => (
        <option key={value} value={value}>{label}</option>
      ))}
    </select>
  </div>

  {/* TradingView widget 挂载点（作为相对定位的子元素） */}
  <div id={CONTAINER_ID} className="w-full h-full" />
</div>
```

**注意**: `#tv_chart_container` 不再作为最外层容器，而是作为 `relative` 父 div 的子元素。下拉选择器和 widget 互为兄弟节点，叠加层通过 `z-10` 保证在 widget 之上。

### 周期状态管理

```typescript
export default function TradingChart(_props: Props) {
  const [selectedInterval, setSelectedInterval] = useState('15');
  const [scriptReady, setScriptReady] = useState(false);

  // Effect A：仅负责一次性加载 tv.js（依赖 []，只执行一次）
  useEffect(() => {
    if (window.TradingView) {
      setScriptReady(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => setScriptReady(true);
    document.head.appendChild(script);
    scriptRef.current = script;
  }, []);

  // Effect B：脚本 ready 后，根据 selectedInterval 创建或重建 widget
  useEffect(() => {
    if (!scriptReady || !window.TradingView) return;

    widgetRef.current?.remove?.();
    widgetRef.current = new window.TradingView.widget({
      // ... 使用 selectedInterval 作为 interval 参数
    });
  }, [selectedInterval, scriptReady]);

  // 周期变更时，只更新状态；销毁和重建由 Effect B 统一处理
  const handleIntervalChange = (newInterval: string) => {
    setSelectedInterval(newInterval);  // 状态更新触发 Effect B 重建
  };
}
```

### 持久化

**R-003 (可选)**: 使用 localStorage 记住用户选择的周期。

```typescript
// 读取（需 guard window，否则 SSR/Next.js 热更新时会报错）
const getSavedInterval = () => {
  if (typeof window === 'undefined') return '15';
  return localStorage.getItem('chartInterval') || '15';
};

// 保存
localStorage.setItem('chartInterval', selectedInterval);
```

在组件初始化时使用 `getSavedInterval()` 替代硬编码 `'15'`。

### 风险评估

| 风险 | 等级 | 缓解 |
|------|------|------|
| widget 重建时 UI 闪烁 | 低 | TradingView 自身有短暂 loading 动画 |
| interval 值与 TradingView API 不匹配 | 低 | 遵循 OKX 支持的 interval 格式 |
| 快速切换导致多次重建 | 低 | Effect B 依赖 `[selectedInterval, scriptReady]`，React 自动防重 |
| 重建后丢失用户图表状态（缩放/画线/指标） | 中 | 接受为本功能的产品行为（当前 UI 切换后重建属正常） |
| localStorage 值非法导致崩溃 | 低 | `getSavedInterval()` 中 try/catch 或 \|\| 回退 |
| 首次加载未完成时切换周期（脚本重复加载） | 低 | Effect A 依赖 [] 只执行一次，scriptRef 防止重复 append |
