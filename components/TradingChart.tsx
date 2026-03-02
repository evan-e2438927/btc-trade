'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    TradingView: {
      widget: new (config: Record<string, unknown>) => { remove?: () => void };
    };
  }
}

const CONTAINER_ID = 'tv_chart_container';

// onPriceUpdate 由父组件通过 /api/ticker 轮询获取，此处无需处理
interface Props {
  onPriceUpdate?: (price: number) => void;
}

export default function TradingChart(_props: Props) {
  const widgetRef = useRef<{ remove?: () => void } | null>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  useEffect(() => {
    const createWidget = () => {
      if (!window.TradingView) return;

      // 销毁旧 widget
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
      });
    };

    if (window.TradingView) {
      createWidget();
    } else {
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/tv.js';
      script.async = true;
      script.onload = createWidget;
      document.head.appendChild(script);
      scriptRef.current = script;
    }

    return () => {
      widgetRef.current?.remove?.();
      widgetRef.current = null;
      // script 只加载一次，不移除（避免重复加载）
    };
  }, []);

  return (
    <div id={CONTAINER_ID} className="w-full h-full" />
  );
}
