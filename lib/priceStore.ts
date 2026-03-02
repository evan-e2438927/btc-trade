// 全局价格存储
// server.js 通过 global.__priceStore 暴露价格
// API Routes 通过此模块读取

declare global {
  // eslint-disable-next-line no-var
  var __priceStore: {
    setPrice(p: number): void;
    getPrice(): number;
    setTicker(d: { price: number; changePercent: number; high24h: number; low24h: number; volume24h: number }): void;
    getTicker(): { price: number; changePercent: number; high24h: number; low24h: number; volume24h: number };
  };
}

// 回退：开发模式下如果 global 未设置则用本地内存
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

export const priceStore = global.__priceStore;
