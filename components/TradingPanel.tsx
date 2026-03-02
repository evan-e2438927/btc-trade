'use client';

import { useState, useCallback } from 'react';

interface Props {
  ticker: { price: number; changePercent: number };
  usdtBalance: number;
  btcBalance: number;
  onOrderPlaced: () => void;
}

type SLTPType = 'market' | 'limit';

interface SLTPState {
  enabled: boolean;
  type: SLTPType;
  trigger: string;      // 触发价格 (USDT)
  orderPrice: string;   // 委托价格 (USDT)，仅限价时
  quantity: string;     // 数量 (BTC)
}

const defaultSLTP = (): SLTPState => ({
  enabled: false, type: 'market', trigger: '', orderPrice: '', quantity: '',
});

const fmt2 = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TradingPanel({ ticker, usdtBalance, btcBalance, onOrderPlaced }: Props) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [type, setType] = useState<'market' | 'limit'>('limit');
  const [limitPrice, setLimitPrice] = useState('');
  const [btcQty, setBtcQty] = useState('');
  const [usdtAmt, setUsdtAmt] = useState('');
  const [sl, setSl] = useState<SLTPState>(defaultSLTP());
  const [tp, setTp] = useState<SLTPState>(defaultSLTP());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const execPrice = type === 'market' ? ticker.price : (Number(limitPrice) || ticker.price);

  // BTC 变化 → 联动 USDT
  const handleBtcChange = useCallback((val: string) => {
    setBtcQty(val);
    const n = parseFloat(val);
    if (!isNaN(n) && execPrice > 0) setUsdtAmt((n * execPrice).toFixed(2));
    else setUsdtAmt('');
  }, [execPrice]);

  // USDT 变化 → 联动 BTC
  const handleUsdtChange = useCallback((val: string) => {
    setUsdtAmt(val);
    const n = parseFloat(val);
    if (!isNaN(n) && execPrice > 0) setBtcQty((n / execPrice).toFixed(6));
    else setBtcQty('');
  }, [execPrice]);

  // 切换限价/市价时重新联动
  const handleTypeChange = (t: 'market' | 'limit') => {
    setType(t);
    // 以 BTC 数量为准重新计算 USDT
    const qty = parseFloat(btcQty);
    const p = t === 'market' ? ticker.price : (Number(limitPrice) || ticker.price);
    if (!isNaN(qty) && p > 0) setUsdtAmt((qty * p).toFixed(2));
  };

  // 限价变化时重新联动
  const handleLimitPriceChange = (val: string) => {
    setLimitPrice(val);
    const p = parseFloat(val);
    const qty = parseFloat(btcQty);
    if (!isNaN(p) && !isNaN(qty) && p > 0) setUsdtAmt((qty * p).toFixed(2));
  };

  const handlePercentage = (pct: number) => {
    if (side === 'buy') {
      const usdt = usdtBalance * pct;
      setUsdtAmt(usdt.toFixed(2));
      if (execPrice > 0) setBtcQty((usdt / execPrice).toFixed(6));
    } else {
      const btc = btcBalance * pct;
      setBtcQty(btc.toFixed(6));
      if (execPrice > 0) setUsdtAmt((btc * execPrice).toFixed(2));
    }
  };

  const updateSl = (patch: Partial<SLTPState>) => setSl(s => ({ ...s, ...patch }));
  const updateTp = (patch: Partial<SLTPState>) => setTp(s => ({ ...s, ...patch }));

  const validate = () => {
    const qty = Number(btcQty);
    if (!qty || qty <= 0) return '请输入有效的 BTC 数量';
    if (type === 'limit' && (!limitPrice || Number(limitPrice) <= 0)) return '请输入限价价格';
    if (sl.enabled) {
      if (!sl.trigger || Number(sl.trigger) <= 0) return '请输入止损触发价格';
      if (sl.type === 'limit' && (!sl.orderPrice || Number(sl.orderPrice) <= 0)) return '请输入止损委托价格';
      if (!sl.quantity || Number(sl.quantity) <= 0) return '请输入止损数量';
    }
    if (tp.enabled) {
      if (!tp.trigger || Number(tp.trigger) <= 0) return '请输入止盈触发价格';
      if (tp.type === 'limit' && (!tp.orderPrice || Number(tp.orderPrice) <= 0)) return '请输入止盈委托价格';
      if (!tp.quantity || Number(tp.quantity) <= 0) return '请输入止盈数量';
    }
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { setMessage({ text: err, ok: false }); return; }

    setLoading(true);
    setMessage(null);
    try {
      const body: Record<string, unknown> = {
        side, type, quantity: Number(btcQty),
        ...(type === 'limit' && { price: Number(limitPrice) }),
        slEnabled: sl.enabled,
        ...(sl.enabled && {
          slType: sl.type,
          slTrigger: Number(sl.trigger),
          ...(sl.type === 'limit' && { slOrderPrice: Number(sl.orderPrice) }),
          slQuantity: Number(sl.quantity),
        }),
        tpEnabled: tp.enabled,
        ...(tp.enabled && {
          tpType: tp.type,
          tpTrigger: Number(tp.trigger),
          ...(tp.type === 'limit' && { tpOrderPrice: Number(tp.orderPrice) }),
          tpQuantity: Number(tp.quantity),
        }),
      };

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ text: data.error || '下单失败', ok: false });
      } else {
        setMessage({ text: `${side === 'buy' ? '买入' : '卖出'}订单已提交`, ok: true });
        setBtcQty(''); setUsdtAmt('');
        setSl(defaultSLTP()); setTp(defaultSLTP());
        onOrderPlaced();
      }
    } catch {
      setMessage({ text: '网络错误', ok: false });
    } finally {
      setLoading(false);
    }
  };

  const changeColor = ticker.changePercent >= 0 ? 'text-green-400' : 'text-red-400';

  // 止损/止盈子面板
  const SLTPPanel = ({
    label, color, state, update,
  }: {
    label: string;
    color: 'red' | 'green';
    state: SLTPState;
    update: (p: Partial<SLTPState>) => void;
  }) => {
    const accent = color === 'red' ? 'accent-red-500' : 'accent-green-500';
    const border = color === 'red' ? 'border-red-800' : 'border-green-800';
    const focusBorder = color === 'red' ? 'focus:border-red-500' : 'focus:border-green-500';
    const activeBorder = color === 'red' ? 'border-red-500 text-red-400 bg-red-500/10' : 'border-green-500 text-green-400 bg-green-500/10';

    return (
      <div className={`rounded border ${state.enabled ? border : 'border-gray-700'} p-2 transition-colors`}>
        {/* 标题行 */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={state.enabled} onChange={e => update({ enabled: e.target.checked })} className={accent} />
          <span className={`text-xs font-medium ${state.enabled ? (color === 'red' ? 'text-red-400' : 'text-green-400') : 'text-gray-400'}`}>
            {label}
          </span>
          {state.enabled && (
            <div className="ml-auto flex gap-1">
              {(['market', 'limit'] as SLTPType[]).map(t => (
                <button
                  key={t}
                  onClick={() => update({ type: t })}
                  className={`px-2 py-0.5 text-xs rounded border transition-colors ${state.type === t ? activeBorder : 'border-gray-600 text-gray-400'}`}
                >
                  {t === 'market' ? '市价' : '限价'}
                </button>
              ))}
            </div>
          )}
        </label>

        {state.enabled && (
          <div className="mt-2 flex flex-col gap-1.5">
            {/* 触发价格 */}
            <div>
              <label className="text-xs text-gray-500 mb-0.5 block">触发价格 (USDT)</label>
              <input
                type="number" value={state.trigger} onChange={e => update({ trigger: e.target.value })}
                placeholder="0.00"
                className={`w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-xs text-white ${focusBorder} focus:outline-none`}
              />
            </div>
            {/* 委托价格（仅限价） */}
            {state.type === 'limit' && (
              <div>
                <label className="text-xs text-gray-500 mb-0.5 block">委托价格 (USDT)</label>
                <input
                  type="number" value={state.orderPrice} onChange={e => update({ orderPrice: e.target.value })}
                  placeholder="0.00"
                  className={`w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-xs text-white ${focusBorder} focus:outline-none`}
                />
              </div>
            )}
            {/* 数量 */}
            <div>
              <label className="text-xs text-gray-500 mb-0.5 block">数量 (BTC)</label>
              <input
                type="number" value={state.quantity} onChange={e => update({ quantity: e.target.value })}
                placeholder="0.000000" step="0.000001"
                className={`w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-xs text-white ${focusBorder} focus:outline-none`}
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-gray-900 p-3 flex flex-col gap-2.5 h-full overflow-y-auto">

      {/* 当前价格 */}
      <div className="bg-gray-800 rounded p-2.5">
        <div className="text-xl font-bold text-white">${ticker.price > 0 ? fmt2(ticker.price) : '--'}</div>
        <div className={`text-xs font-medium ${changeColor}`}>
          {ticker.changePercent >= 0 ? '+' : ''}{ticker.changePercent.toFixed(2)}%
        </div>
      </div>

      {/* 买/卖 */}
      <div className="flex rounded overflow-hidden border border-gray-600">
        <button onClick={() => setSide('buy')}
          className={`flex-1 py-2 text-sm font-semibold transition-colors ${side === 'buy' ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
          买入
        </button>
        <button onClick={() => setSide('sell')}
          className={`flex-1 py-2 text-sm font-semibold transition-colors ${side === 'sell' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
          卖出
        </button>
      </div>

      {/* 限价/市价 */}
      <div className="flex gap-1.5">
        {(['limit', 'market'] as const).map(t => (
          <button key={t} onClick={() => handleTypeChange(t)}
            className={`flex-1 py-1.5 text-xs rounded border transition-colors ${type === t ? 'border-yellow-500 text-yellow-400 bg-yellow-500/10' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`}>
            {t === 'limit' ? '限价' : '市价'}
          </button>
        ))}
      </div>

      {/* 可用余额 */}
      <div className="text-xs text-gray-400">
        {side === 'buy' ? `可用: ${usdtBalance.toFixed(2)} USDT` : `可用: ${btcBalance.toFixed(6)} BTC`}
      </div>

      {/* 限价输入 */}
      {type === 'limit' && (
        <div>
          <label className="text-xs text-gray-400 mb-1 block">价格 (USDT)</label>
          <input type="number" value={limitPrice} onChange={e => handleLimitPriceChange(e.target.value)}
            placeholder={ticker.price > 0 ? ticker.price.toFixed(2) : '0.00'}
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-yellow-500 focus:outline-none" />
        </div>
      )}

      {/* 数量 BTC + USDT 联动 */}
      <div className="flex flex-col gap-1.5">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">数量 (BTC)</label>
          <input type="number" value={btcQty} onChange={e => handleBtcChange(e.target.value)}
            placeholder="0.000000" step="0.000001"
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-yellow-500 focus:outline-none" />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">金额 (USDT)</label>
          <input type="number" value={usdtAmt} onChange={e => handleUsdtChange(e.target.value)}
            placeholder="0.00"
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-yellow-500 focus:outline-none" />
        </div>
      </div>

      {/* 快速比例 */}
      <div className="flex gap-1">
        {[0.25, 0.5, 0.75, 1].map(pct => (
          <button key={pct} onClick={() => handlePercentage(pct)}
            className="flex-1 text-xs py-1 bg-gray-800 text-gray-400 rounded hover:bg-gray-700 hover:text-white transition-colors border border-gray-600">
            {(pct * 100).toFixed(0)}%
          </button>
        ))}
      </div>

      {/* 止损 */}
      <SLTPPanel label="止损 (Stop Loss)" color="red" state={sl} update={updateSl} />

      {/* 止盈 */}
      <SLTPPanel label="止盈 (Take Profit)" color="green" state={tp} update={updateTp} />

      {/* 提示消息 */}
      {message && (
        <div className={`text-xs px-3 py-2 rounded ${message.ok ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
          {message.text}
        </div>
      )}

      {/* 下单按钮 */}
      <button onClick={handleSubmit} disabled={loading}
        className={`w-full py-3 rounded font-semibold text-sm transition-colors disabled:opacity-50 ${
          side === 'buy' ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-red-600 hover:bg-red-500 text-white'
        }`}>
        {loading ? '处理中...' : `${side === 'buy' ? '买入' : '卖出'} BTC`}
      </button>

    </div>
  );
}
