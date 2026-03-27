/**
 * TradingChart — K 线图组件（集成 TradingView Widget）
 *
 * 动态加载 TradingView 免费 Widget 库（tv.js），展示 OKX:BTCUSDT K 线图。
 * 默认周期：15 分钟；默认内置指标：成交量（Volume）。
 * script 标签只加载一次，组件卸载时销毁 widget 实例但不移除 script，
 * 避免重新挂载时重复加载 JS 资源。
 *
 * 注意：实时价格由父组件（page.tsx）通过轮询 /api/ticker 维护，
 *       onPriceUpdate prop 仅作预留接口，当前版本不在此组件内使用。
 */
'use client';

import { useEffect, useRef } from 'react';

// 声明 TradingView Widget 全局类型，避免 TypeScript 报 window.TradingView 不存在
declare global {
  interface Window {
    TradingView: {
      widget: new (config: Record<string, unknown>) => { remove?: () => void };
    };
  }
}

// TradingView Widget 挂载的 DOM 容器 ID
const CONTAINER_ID = 'tv_chart_container';

// onPriceUpdate 由父组件通过 /api/ticker 轮询获取，此处无需处理价格
interface Props {
  onPriceUpdate?: (price: number) => void;
}

export default function TradingChart(_props: Props) {
  const widgetRef = useRef<{ remove?: () => void } | null>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  useEffect(() => {
    const createWidget = () => {
      if (!window.TradingView) return;

      // 销毁旧 widget 实例（防止 React StrictMode 双重调用等场景下重复创建）
      widgetRef.current?.remove?.();

      widgetRef.current = new window.TradingView.widget({
        autosize: true,
        symbol: 'OKX:BTCUSDT',
        interval: '15',
        timezone: 'Asia/Shanghai',
        theme: 'dark',
        style: '1',           // 蜡烛图
        locale: 'zh_CN',
        enable_publishing: false,
        allow_symbol_change: false,
        hide_side_toolbar: false,
        withdateranges: true,
        save_image: false,
        container_id: CONTAINER_ID,
        // 常用默认指标（可在图表内自行添加/删除）
        studies: ['Volume@tv-basicstudies'],
        // 背景色覆盖：深灰色 #2a2a2a
        overrides: {
          'mainSeriesProperties.candleStyle.upColor': '#26a69a',
          'mainSeriesProperties.candleStyle.downColor': '#ef5350',
          'paneProperties.background': '#2a2a2a',
          'paneProperties.backgroundType': 'solid',
          'scalesProperties.backgroundColor': '#2a2a2a',
        },
      });
    };

    if (window.TradingView) {
      // 库已加载（如页面热更新时），直接创建 widget
      createWidget();
    } else {
      // 第一次挂载：动态创建 script 标签异步加载 TradingView 库
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/tv.js';
      script.async = true;
      script.onload = createWidget; // 加载完成后自动创建 widget
      document.head.appendChild(script);
      scriptRef.current = script;
    }

    return () => {
      // 组件卸载时销毁 widget，释放内存；script 标签保留，供下次挂载直接复用
      widgetRef.current?.remove?.();
      widgetRef.current = null;
    };
  }, []);

  return (
    <div id={CONTAINER_ID} className="w-full h-full" />
  );
}
