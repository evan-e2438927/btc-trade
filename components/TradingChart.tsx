/**
 * TradingChart — K 线图组件（集成 TradingView Widget）
 *
 * 动态加载 TradingView 免费 Widget 库（tv.js），展示 OKX:BTCUSDT K 线图。
 * 支持通过下拉选择器切换时间周期（1m, 5m, 15m, 30m, 1H, 2H, 4H, 1D, 1W）。
 *
 * 生命周期：
 * - Effect A（依赖 []）：一次性加载 tv.js，script 标签保留避免重复加载
 * - Effect B（依赖 [selectedInterval, scriptReady]）：脚本就绪后创建/重建 widget
 *
 * 周期切换通过"销毁旧 widget + 重建新 widget"实现（TradingView tv.js 不支持动态修改 interval）。
 *
 * 注意：实时价格由父组件（page.tsx）通过轮询 /api/ticker 维护，
 *       onPriceUpdate prop 仅作预留接口。
 */
'use client';

import { useEffect, useRef, useState } from 'react';

// 声明 TradingView Widget 全局类型
declare global {
  interface Window {
    TradingView: {
      widget: new (config: Record<string, unknown>) => { remove?: () => void };
    };
  }
}

// TradingView Widget 挂载的 DOM 容器 ID
const CONTAINER_ID = 'tv_chart_container';

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

// localStorage key
const STORAGE_KEY = 'chartInterval';

/**
 * 从 localStorage 读取上次保存的周期（SSR/Next.js 热更新 guard）
 * 同时校验值是否在 INTERVALS 白名单中，防止非法值导致 widget 行为异常
 */
function getSavedInterval(): string {
  if (typeof window === 'undefined') return '15';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isValid = (INTERVALS as readonly any[]).some((i) => i.value === saved);
      if (isValid) return saved;
    }
  } catch {
    // ignore localStorage errors (private browsing, quota exceeded, etc.)
  }
  return '15';
}

interface Props {
  onPriceUpdate?: (price: number) => void;
}

export default function TradingChart(_props: Props) {
  const widgetRef = useRef<{ remove?: () => void } | null>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  // 周期状态（初始值从 localStorage 恢复）
  const [selectedInterval, setSelectedInterval] = useState(getSavedInterval);
  // 脚本是否已加载完成
  const [scriptReady, setScriptReady] = useState(false);

  // ── Effect A：一次性加载 tv.js CDN 脚本 ──────────────────────────────
  useEffect(() => {
    if (window.TradingView) {
      // 库已加载（如热更新时），直接标记 ready
      setScriptReady(true);
      return;
    }

    // 防止重复创建 script 标签
    if (scriptRef.current) {
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => setScriptReady(true);
    document.head.appendChild(script);
    scriptRef.current = script;

    return () => {
      // 组件卸载时移除 script 标签（但保留 window.TradingView 状态）
      if (scriptRef.current && document.head.contains(scriptRef.current)) {
        document.head.removeChild(scriptRef.current);
      }
      scriptRef.current = null;
    };
  }, []);

  // ── Effect B：脚本 ready 后，根据 selectedInterval 创建/重建 widget ──
  useEffect(() => {
    if (!scriptReady || !window.TradingView) return;

    // 销毁旧 widget（每次重建前清理，支持 StrictMode 双重挂载保护）
    widgetRef.current?.remove?.();

    widgetRef.current = new window.TradingView.widget({
      autosize: true,
      symbol: 'OKX:BTCUSDT',
      interval: selectedInterval,
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

    return () => {
      // 组件卸载时销毁 widget，释放内存
      widgetRef.current?.remove?.();
      widgetRef.current = null;
    };
  }, [selectedInterval, scriptReady]);

  // 周期变更时只更新状态；销毁和重建由 Effect B 统一处理
  const handleIntervalChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newInterval = e.target.value;
    setSelectedInterval(newInterval);
    // 保存到 localStorage（try/catch 防止 Storage 满或私人模式禁用）
    try {
      localStorage.setItem(STORAGE_KEY, newInterval);
    } catch {
      // ignore localStorage errors
    }
  };

  return (
    <div className="relative w-full h-full">
      {/* 下拉选择器（absolute 叠加在图表右上角） */}
      <div className="absolute top-2 right-2 z-10">
        <select
          value={selectedInterval}
          onChange={handleIntervalChange}
          className="bg-gray-800 border border-gray-600 text-white text-sm rounded px-2 py-1 cursor-pointer"
        >
          {INTERVALS.map(({ label, value }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* TradingView widget 挂载节点 */}
      <div id={CONTAINER_ID} className="w-full h-full" />
    </div>
  );
}
