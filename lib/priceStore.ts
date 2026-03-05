/**
 * lib/priceStore.ts — 全局实时价格存储模块
 *
 * 架构说明：
 * - server.js 在自定义 HTTP 服务器启动时，通过 OKX WebSocket 持续接收
 *   BTC-USDT 行情，并写入 global.__priceStore
 * - API Routes（与 server.js 运行在同一 Node.js 进程内）通过此模块读取最新价格，
 *   避免在每个 Route 内单独建立 WebSocket 连接
 * - 开发模式下若 global.__priceStore 未初始化（如直接 next dev 启动），
 *   此处会创建一个内存回退实现，防止 API Routes 访问 undefined 而崩溃
 */

declare global {
  // 声明全局 __priceStore 类型，供 TypeScript 识别（避免 any 类型报错）
  // eslint-disable-next-line no-var
  var __priceStore: {
    setPrice(p: number): void;
    getPrice(): number;
    setTicker(d: { price: number; changePercent: number; high24h: number; low24h: number; volume24h: number }): void;
    getTicker(): { price: number; changePercent: number; high24h: number; low24h: number; volume24h: number };
  };
}

// 开发模式回退：直接 `next dev` 启动时 server.js 不运行，global.__priceStore 为 undefined
// 此处提供纯内存实现，确保 API Routes 不会因读取 undefined 而报错
if (!global.__priceStore) {
  global.__priceStore = {
    _price: 0,
    _ticker: { price: 0, changePercent: 0, high24h: 0, low24h: 0, volume24h: 0 },
    setPrice(p: number) { (this as any)._price = p; },
    getPrice() { return (this as any)._price; },
    setTicker(d: any) { (this as any)._ticker = d; (this as any)._price = d.price; },
    getTicker() { return (this as any)._ticker; },
  } as any;
}

// 导出统一的 priceStore 访问入口，所有需要读写价格的模块均通过此导出访问
export const priceStore = global.__priceStore;
