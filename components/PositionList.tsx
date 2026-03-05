/**
 * PositionList — 当前持仓展示组件
 *
 * 展示 BTCUSDT 持仓的数量、开仓均价、当前价、浮动盈亏和收益率（ROE）。
 * position 和 currentPrice 由父组件传入（每 3s 轮询更新）。
 * ROE（收益率）= (currentPrice - entryPrice) / entryPrice × 100%
 */
'use client';

interface Position {
  symbol: string;
  quantity: number;
  entry_price: number;
  unrealized_pnl: number;
}

interface Props {
  position: Position | null;
  currentPrice: number;
}

export default function PositionList({ position, currentPrice }: Props) {
  const qty = position ? Number(position.quantity) : 0;
  const entryPrice = position ? Number(position.entry_price) : 0;
  const pnl = position ? Number(position.unrealized_pnl) : 0;
  // 仅在有持仓且开仓均价 > 0 时计算收益率，避免除零错误
  const roe = qty > 0 && entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;

  return (
    <div>
      <div className="text-xs text-gray-400 font-medium mb-2">当前持仓</div>
      {qty <= 0 ? (
        <div className="text-xs text-gray-500 py-4 text-center">暂无持仓</div>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-gray-700">
              <th className="pb-1 text-left">交易对</th>
              <th className="pb-1 text-right">数量(BTC)</th>
              <th className="pb-1 text-right">开仓均价</th>
              <th className="pb-1 text-right">当前价</th>
              <th className="pb-1 text-right">浮动盈亏</th>
              <th className="pb-1 text-right">收益率</th>
            </tr>
          </thead>
          <tbody>
            <tr className="text-gray-200">
              <td className="py-1.5 font-medium">BTCUSDT</td>
              <td className="text-right font-mono">{qty.toFixed(6)}</td>
              <td className="text-right font-mono">{entryPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              <td className="text-right font-mono">{currentPrice > 0 ? currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '--'}</td>
              <td className={`text-right font-mono font-medium ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
              </td>
              <td className={`text-right font-mono ${roe >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {roe >= 0 ? '+' : ''}{roe.toFixed(2)}%
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
