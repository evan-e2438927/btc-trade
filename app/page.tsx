'use client';

import { useCallback, useEffect, useState } from 'react';
import AccountBar from '@/components/AccountBar';
import TradingChart from '@/components/TradingChart';
import TradingPanel from '@/components/TradingPanel';
import OrderBook from '@/components/OrderBook';
import PositionList from '@/components/PositionList';
import OrderHistory from '@/components/OrderHistory';

interface AccountData {
  usdt: { available: number; frozen: number };
  btc: { available: number; frozen: number };
}

interface TickerData {
  price: number;
  changePercent: number;
  high24h: number;
  low24h: number;
  volume24h: number;
}

interface Position {
  symbol: string;
  quantity: number;
  entry_price: number;
  unrealized_pnl: number;
}

interface Order {
  id: number;
  side: string;
  type: string;
  price: string | null;
  stop_price: string | null;
  take_profit_price: string | null;
  quantity: string;
  status: string;
  filled_price: string | null;
  fill_price: string | null;
  is_close_order: boolean;
  created_at: string;
}

const DEFAULT_ACCOUNT: AccountData = {
  usdt: { available: 0, frozen: 0 },
  btc: { available: 0, frozen: 0 },
};

const DEFAULT_TICKER: TickerData = {
  price: 0,
  changePercent: 0,
  high24h: 0,
  low24h: 0,
  volume24h: 0,
};

type BottomTab = 'orderbook' | 'positions' | 'orders';

export default function TradingPage() {
  const [account, setAccount] = useState<AccountData>(DEFAULT_ACCOUNT);
  const [ticker, setTicker] = useState<TickerData>(DEFAULT_TICKER);
  const [position, setPosition] = useState<Position | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [bottomTab, setBottomTab] = useState<BottomTab>('positions');
  const [livePrice, setLivePrice] = useState(0);

  const fetchAccount = useCallback(async () => {
    try {
      const res = await fetch('/api/account');
      const data = await res.json();
      const usdt = data.accounts.find((a: { asset: string }) => a.asset === 'USDT');
      const btc = data.accounts.find((a: { asset: string }) => a.asset === 'BTC');
      setAccount({
        usdt: { available: Number(usdt?.available_balance || 0), frozen: Number(usdt?.frozen_balance || 0) },
        btc: { available: Number(btc?.available_balance || 0), frozen: Number(btc?.frozen_balance || 0) },
      });
    } catch { /* ignore */ }
  }, []);

  const fetchPosition = useCallback(async () => {
    try {
      const res = await fetch('/api/positions');
      const data = await res.json();
      setPosition(data.position);
    } catch { /* ignore */ }
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/orders');
      const data = await res.json();
      setOrders(data.orders || []);
    } catch { /* ignore */ }
  }, []);

  const refreshAll = useCallback(() => {
    fetchAccount();
    fetchPosition();
    fetchOrders();
  }, [fetchAccount, fetchPosition, fetchOrders]);

  useEffect(() => {
    refreshAll();
    const timer = setInterval(refreshAll, 3000);
    return () => clearInterval(timer);
  }, [refreshAll]);

  // 从 /api/ticker（由 server.js REST 轮询维护）获取实时 ticker
  useEffect(() => {
    const fetchTicker = async () => {
      try {
        const res = await fetch('/api/ticker');
        const data = await res.json();
        if (data.price) {
          setTicker(data);
          setLivePrice(data.price);
        }
      } catch { /* ignore */ }
    };
    fetchTicker();
    const t = setInterval(fetchTicker, 2000);
    return () => clearInterval(t);
  }, []);

  const handleCancel = async (orderId: number) => {
    await fetch(`/api/orders/${orderId}`, { method: 'DELETE' });
    fetchOrders();
    fetchAccount();
  };

  const currentPrice = livePrice || ticker.price;

  return (
    <div className="flex flex-col h-screen bg-gray-950 overflow-hidden">
      {/* 顶部账户栏 */}
      <AccountBar account={account} ticker={ticker} position={position} />

      {/* 主内容区 */}
      <div className="flex flex-1 min-h-0">
        {/* 左侧：图表 + 底部面板 */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* K 线图 */}
          <div className="flex-1 min-h-0">
            <TradingChart onPriceUpdate={setLivePrice} />
          </div>

          {/* 底部面板 */}
          <div className="h-56 border-t border-gray-700 bg-gray-900 flex flex-col overflow-hidden">
            {/* 标签页 */}
            <div className="flex border-b border-gray-700 shrink-0">
              {([
                { key: 'orderbook', label: '订单簿' },
                { key: 'positions', label: '持仓' },
                { key: 'orders', label: '订单记录' },
              ] as { key: BottomTab; label: string }[]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setBottomTab(key)}
                  className={`px-4 py-2 text-xs font-medium transition-colors ${
                    bottomTab === key
                      ? 'text-yellow-400 border-b-2 border-yellow-400'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* 内容 */}
            <div className="flex-1 overflow-auto p-3 min-h-0">
              {bottomTab === 'orderbook' && <OrderBook />}
              {bottomTab === 'positions' && (
                <PositionList position={position} currentPrice={currentPrice} />
              )}
              {bottomTab === 'orders' && (
                <OrderHistory orders={orders} onCancel={handleCancel} />
              )}
            </div>
          </div>
        </div>

        {/* 右侧：交易面板 */}
        <div className="w-72 shrink-0 border-l border-gray-700 overflow-y-auto">
          <TradingPanel
            ticker={{ price: currentPrice, changePercent: ticker.changePercent }}
            usdtBalance={account.usdt.available}
            btcBalance={account.btc.available}
            onOrderPlaced={refreshAll}
          />
        </div>
      </div>
    </div>
  );
}
