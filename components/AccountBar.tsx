/**
 * AccountBar — 顶部账户信息栏
 *
 * 水平展示总资产、USDT 可用/冻结余额、BTC 持仓量和浮动盈亏。
 * 数据由父组件（page.tsx）每 3 秒轮询 /api/account 和 /api/positions 后传入。
 * 总资产 = USDT 可用 + USDT 冻结 + BTC总量 × 当前价格
 */
'use client';

interface AccountData {
  usdt: { available: number; frozen: number };
  btc: { available: number; frozen: number };
}

interface TickerData {
  price: number;
  changePercent: number;
}

interface Position {
  quantity: number;
  entry_price: number;
  unrealized_pnl: number;
}

interface Props {
  account: AccountData;
  ticker: TickerData;
  position: Position | null;
}

export default function AccountBar({ account, ticker, position }: Props) {
  const btcPrice = ticker.price;
  // BTC 总量（可用 + 冻结）× 当前价格 = BTC 折算 USDT 价值
  const btcValue = (account.btc.available + account.btc.frozen) * btcPrice;
  // 总资产 = USDT 总量 + BTC 折算价值
  const totalAsset = account.usdt.available + account.usdt.frozen + btcValue;
  const pnl = position ? Number(position.unrealized_pnl) : 0;
  const isPositive = pnl >= 0;

  return (
    <div className="bg-gray-900 border-b border-gray-700 px-4 py-2 flex items-center gap-6 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-yellow-400 font-bold text-base">₿ BTC模拟交易</span>
      </div>

      <div className="h-4 w-px bg-gray-600" />

      <div className="flex items-center gap-1">
        <span className="text-gray-400">总资产:</span>
        <span className="text-white font-semibold">{totalAsset.toFixed(2)}</span>
        <span className="text-gray-400">USDT</span>
      </div>

      <div className="flex items-center gap-1">
        <span className="text-gray-400">可用USDT:</span>
        <span className="text-green-400 font-semibold">{account.usdt.available.toFixed(2)}</span>
      </div>

      <div className="flex items-center gap-1">
        <span className="text-gray-400">冻结USDT:</span>
        <span className="text-yellow-300">{account.usdt.frozen.toFixed(2)}</span>
      </div>

      <div className="h-4 w-px bg-gray-600" />

      <div className="flex items-center gap-1">
        <span className="text-gray-400">BTC持仓:</span>
        <span className="text-orange-400 font-semibold">{(account.btc.available + account.btc.frozen).toFixed(6)}</span>
      </div>

      <div className="flex items-center gap-1">
        <span className="text-gray-400">浮动盈亏:</span>
        <span className={isPositive ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
          {isPositive ? '+' : ''}{pnl.toFixed(2)} USDT
        </span>
      </div>
    </div>
  );
}
