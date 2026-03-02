'use client';

import { useEffect, useState } from 'react';

interface OrderEntry {
  price: number;
  quantity: number;
}

export default function OrderBook() {
  const [asks, setAsks] = useState<OrderEntry[]>([]);
  const [bids, setBids] = useState<OrderEntry[]>([]);

  useEffect(() => {
    const fetchDepth = async () => {
      try {
        // OKX order book: asks/bids 各 [price, size, liquidated_orders, orders_count]
        const res = await fetch('https://www.okx.com/api/v5/market/books?instId=BTC-USDT&sz=8');
        const json = await res.json();
        if (json.code !== '0' || !json.data?.[0]) return;
        const { asks: rawAsks, bids: rawBids } = json.data[0];
        // OKX asks 已升序（卖价从低到高），bids 已降序
        setAsks(rawAsks.slice(0, 8).map((a: string[]) => ({ price: parseFloat(a[0]), quantity: parseFloat(a[1]) })));
        setBids(rawBids.slice(0, 8).map((b: string[]) => ({ price: parseFloat(b[0]), quantity: parseFloat(b[1]) })));
      } catch { /* ignore */ }
    };

    fetchDepth();
    const timer = globalThis.setInterval(fetchDepth, 2000);
    return () => globalThis.clearInterval(timer);
  }, []);

  const maxQty = Math.max(...[...asks, ...bids].map((e) => e.quantity), 1);

  return (
    <div className="bg-gray-900 p-2">
      <div className="text-xs text-gray-400 font-medium mb-2">订单簿</div>
      <div className="grid grid-cols-2 gap-2">
        {/* 卖盘（价格低到高，从下到上显示，所以 reverse） */}
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1 px-1">
            <span>卖价</span>
            <span>数量</span>
          </div>
          {[...asks].reverse().map((a, i) => (
            <div key={i} className="relative flex justify-between text-xs py-0.5 px-1">
              <div
                className="absolute inset-0 bg-red-500/10"
                style={{ width: `${(a.quantity / maxQty) * 100}%`, right: 0, left: 'auto' }}
              />
              <span className="text-red-400 font-mono z-10">
                {a.price.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </span>
              <span className="text-gray-300 font-mono z-10">{a.quantity.toFixed(4)}</span>
            </div>
          ))}
        </div>
        {/* 买盘（价格高到低） */}
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1 px-1">
            <span>买价</span>
            <span>数量</span>
          </div>
          {bids.map((b, i) => (
            <div key={i} className="relative flex justify-between text-xs py-0.5 px-1">
              <div
                className="absolute inset-0 bg-green-500/10"
                style={{ width: `${(b.quantity / maxQty) * 100}%` }}
              />
              <span className="text-green-400 font-mono z-10">
                {b.price.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </span>
              <span className="text-gray-300 font-mono z-10">{b.quantity.toFixed(4)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
