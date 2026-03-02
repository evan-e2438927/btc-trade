'use client';

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

interface Props {
  orders: Order[];
  onCancel: (id: number) => void;
}

const STATUS_LABELS: Record<string, string> = {
  pending: '挂单中',
  filled: '已成交',
  cancelled: '已撤销',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'text-yellow-400',
  filled: 'text-green-400',
  cancelled: 'text-gray-500',
};

const fmtPrice = (v: string | null) =>
  v ? Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--';

export default function OrderHistory({ orders, onCancel }: Props) {
  return (
    <div>
      <div className="text-xs text-gray-400 font-medium mb-2">订单历史</div>
      {orders.length === 0 ? (
        <div className="text-xs text-gray-500 py-4 text-center">暂无订单</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-700">
                <th className="pb-1 text-left">ID</th>
                <th className="pb-1 text-left">方向</th>
                <th className="pb-1 text-left">类型</th>
                <th className="pb-1 text-right">委托价</th>
                <th className="pb-1 text-right">数量(BTC)</th>
                <th className="pb-1 text-right">成交价</th>
                <th className="pb-1 text-right">金额(U)</th>
                <th className="pb-1 text-right">止损</th>
                <th className="pb-1 text-right">止盈</th>
                <th className="pb-1 text-center">状态</th>
                <th className="pb-1 text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const execPrice = order.filled_price || order.fill_price;
                const usdtAmt = execPrice
                  ? (Number(order.quantity) * Number(execPrice)).toFixed(2)
                  : null;
                return (
                  <tr key={order.id} className="border-b border-gray-800 text-gray-200">
                    <td className="py-1.5 text-gray-400">
                      #{order.id}
                      {order.is_close_order && (
                        <span className="ml-1 text-yellow-500/70">[平]</span>
                      )}
                    </td>
                    <td className={`py-1.5 font-medium ${order.side === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
                      {order.side === 'buy' ? '买' : '卖'}
                    </td>
                    <td className="py-1.5 text-gray-300">{order.type === 'market' ? '市价' : '限价'}</td>
                    <td className="py-1.5 text-right font-mono">
                      {order.price ? fmtPrice(order.price) : <span className="text-gray-500">市价</span>}
                    </td>
                    <td className="py-1.5 text-right font-mono">{Number(order.quantity).toFixed(6)}</td>
                    <td className="py-1.5 text-right font-mono">
                      {execPrice ? fmtPrice(execPrice) : '--'}
                    </td>
                    <td className="py-1.5 text-right font-mono text-yellow-300">
                      {usdtAmt ? Number(usdtAmt).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--'}
                    </td>
                    <td className="py-1.5 text-right font-mono text-red-400">
                      {order.stop_price ? fmtPrice(order.stop_price) : '--'}
                    </td>
                    <td className="py-1.5 text-right font-mono text-green-400">
                      {order.take_profit_price ? fmtPrice(order.take_profit_price) : '--'}
                    </td>
                    <td className={`py-1.5 text-center ${STATUS_COLORS[order.status] || 'text-gray-400'}`}>
                      {STATUS_LABELS[order.status] || order.status}
                    </td>
                    <td className="py-1.5 text-center">
                      {order.status === 'pending' && (
                        <button
                          onClick={() => onCancel(order.id)}
                          className="text-xs text-red-400 hover:text-red-300 border border-red-700 hover:border-red-500 px-2 py-0.5 rounded transition-colors"
                        >
                          撤单
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
