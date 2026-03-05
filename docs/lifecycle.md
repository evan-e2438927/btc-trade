# 订单生命周期与时序图

> 本文描述订单从创建到终结的完整生命周期，以及各类场景下的系统内部交互时序。

---

## 目录

1. [订单状态机](#1-订单状态机)
2. [市价单时序图](#2-市价单时序图)
3. [限价单时序图](#3-限价单时序图)
4. [止损/止盈触发时序图](#4-止损止盈触发时序图)
5. [撤单时序图](#5-撤单时序图)
6. [账户余额变化时序](#6-账户余额变化时序)

---

## 1. 订单状态机

### 状态定义

| 状态 | 说明 | 可操作 |
|------|------|--------|
| `pending` | 挂单中，等待价格触发 | 可撤单 |
| `filled` | 已全部成交，资产已划转 | 不可操作 |
| `cancelled` | 已撤销，冻结资金已解冻 | 不可操作 |

### 状态转移图

```mermaid
stateDiagram-v2
    [*] --> pending : 下单（限价单）
    [*] --> filled  : 下单（市价单，立即成交）

    pending --> filled    : 价格达到触发条件（引擎 500ms 轮询）
    pending --> cancelled : 用户手动撤单

    filled    --> [*]
    cancelled --> [*]
```

### ASCII 版（无 Mermaid 环境）

```
                    ┌─────────────────────────────┐
                    │           下单                │
                    └──────────┬──────────┬────────┘
                               │          │
                          限价单           市价单
                               │          │
                               ▼          ▼
                           pending     filled ◄──── 终态
                           （挂单中）  （已成交）
                           │
              ┌────────────┴────────────┐
              │                         │
         价格触发                    用户撤单
              │                         │
              ▼                         ▼
           filled                  cancelled ◄──── 终态
          （已成交）               （已撤销）
```

---

## 2. 市价单时序图

市价单的特点：**下单即成交**，不进入挂单队列。

```mermaid
sequenceDiagram
    participant U as 用户（前端）
    participant API as API Route<br/>/api/orders POST
    participant OS as orderService.ts
    participant DB as PostgreSQL
    participant PS as priceStore<br/>（内存）

    U->>API: POST /api/orders<br/>{ type:'market', side:'buy', quantity:0.01 }

    API->>OS: createOrder(params)

    OS->>PS: getPrice('BTC-USDT')
    PS-->>OS: 65000

    OS->>DB: 检查 available_balance >= 650 USDT
    DB-->>OS: ✓ 充足

    OS->>DB: INSERT orders (status='pending')
    DB-->>OS: order.id = 42

    Note over OS: 市价单 → 立即成交
    OS->>DB: BEGIN 事务

    OS->>DB: UPDATE orders SET status='filled',<br/>fill_price=65000 WHERE id=42
    OS->>DB: INSERT trades (order_id=42, price=65000)
    OS->>DB: UPDATE accounts SET<br/>usdt_available -= 650,<br/>btc_available += 0.01
    OS->>DB: UPDATE positions SET<br/>quantity += 0.01, entry_price=均价

    OS->>DB: COMMIT

    alt 设置了止损或止盈
        OS->>DB: INSERT orders (is_close_order=true,<br/>type='limit'/market, stop_price/tp_price)
        Note over DB: 子平仓挂单进入 pending<br/>由引擎持续监控
    end

    OS-->>API: { id:42, status:'filled', fill_price:65000 }
    API-->>U: 200 OK
```

---

## 3. 限价单时序图

限价单分为两个阶段：**下单挂起** + **引擎触发成交**。

### 阶段一：下单

```mermaid
sequenceDiagram
    participant U as 用户（前端）
    participant API as API Route<br/>/api/orders POST
    participant OS as orderService.ts
    participant DB as PostgreSQL

    U->>API: POST /api/orders<br/>{ type:'limit', side:'buy',<br/>  price:63000, quantity:0.01 }

    API->>OS: createOrder(params)

    OS->>DB: 检查 available_balance >= 630 USDT
    DB-->>OS: ✓ 充足

    OS->>DB: BEGIN 事务
    OS->>DB: INSERT orders<br/>(status='pending', price=63000)
    OS->>DB: UPDATE accounts SET<br/>usdt_available -= 630,<br/>usdt_frozen += 630
    OS->>DB: COMMIT

    OS-->>API: { id:43, status:'pending' }
    API-->>U: 200 OK
    Note over U: 页面显示"挂单中"
```

### 阶段二：引擎触发成交

```mermaid
sequenceDiagram
    participant OKX as OKX WebSocket
    participant SRV as server.js<br/>订单引擎
    participant PS as priceStore（内存）
    participant OS as orderService.ts
    participant DB as PostgreSQL

    loop 每 500ms
        SRV->>DB: SELECT * FROM orders WHERE status='pending'
        DB-->>SRV: [{ id:43, type:'limit', price:63000, side:'buy' }]

        SRV->>PS: getPrice('BTC-USDT')
        PS-->>SRV: currentPrice

        alt currentPrice <= 63000（买单，价格到位）
            Note over SRV: 触发条件满足
            SRV->>OS: fillOrderInEngine(id=43, side='buy',<br/>qty=0.01, fillPrice=currentPrice)

            OS->>DB: BEGIN 事务
            OS->>DB: UPDATE orders SET status='filled',<br/>fill_price=currentPrice
            OS->>DB: INSERT trades
            OS->>DB: UPDATE accounts SET<br/>usdt_frozen -= 630,<br/>btc_available += 0.01
            OS->>DB: UPDATE positions（更新均价）
            OS->>DB: COMMIT

            alt 订单带有止损/止盈 且非子平仓单
                SRV->>DB: INSERT 子平仓挂单<br/>(is_close_order=true)
            end
        else 价格未到位
            Note over SRV: 继续等待下一轮
        end
    end

    OKX-->>SRV: 实时价格推送（更新 priceStore）
```

---

## 4. 止损/止盈触发时序图

止损/止盈本质是一种**特殊的限价单自动成交**，触发逻辑与限价单相同，但判断方向固定。

```mermaid
sequenceDiagram
    participant SRV as server.js 引擎
    participant PS as priceStore
    participant DB as PostgreSQL

    Note over SRV: 轮询到子平仓挂单<br/>{ is_close_order:true,<br/>  stop_price:62000,<br/>  take_profit_price:68000 }

    SRV->>PS: getPrice('BTC-USDT')
    PS-->>SRV: currentPrice = 61500

    alt currentPrice <= stop_price (61500 ≤ 62000) → 止损触发
        SRV->>DB: 成交子平仓单（卖出 BTC）
        Note over DB: 账户: btc_available -= qty<br/>        usdt_available += qty × fillPrice
        Note over DB: 持仓清空或减少
        Note over SRV: is_close_order=true<br/>不再创建新子平仓单（防递归）
    else currentPrice >= take_profit_price → 止盈触发
        SRV->>DB: 成交子平仓单（卖出 BTC）
    else 价格在止损止盈区间内
        Note over SRV: 继续等待
    end
```

### 止损止盈价格示意

```
  价格轴
  ────────────────────────────────────────────►

  61000     62000       65000       68000     69000
    │          │           │           │
    │        止损价      当前价       止盈价
    │      ← 触发区                  触发区 →
    │
    └── 价格跌到此处 → 自动卖出（止损）
                                        价格涨到此处 → 自动卖出（止盈）
```

---

## 5. 撤单时序图

```mermaid
sequenceDiagram
    participant U as 用户（前端）
    participant API as API Route<br/>/api/orders/[id] DELETE
    participant OS as orderService.ts
    participant DB as PostgreSQL

    U->>API: DELETE /api/orders/43

    API->>DB: SELECT * FROM orders WHERE id=43
    DB-->>API: { status:'pending', side:'buy',<br/>  price:63000, quantity:0.01 }

    alt status != 'pending'
        API-->>U: 400 只有挂单才能撤销
    else status == 'pending'
        API->>OS: cancelOrder(43)

        OS->>DB: BEGIN 事务
        OS->>DB: UPDATE orders SET status='cancelled'

        alt side == 'buy'（冻结的是 USDT）
            OS->>DB: UPDATE accounts SET<br/>usdt_frozen -= 630,<br/>usdt_available += 630
        else side == 'sell'（冻结的是 BTC）
            OS->>DB: UPDATE accounts SET<br/>btc_frozen -= 0.01,<br/>btc_available += 0.01
        end

        OS->>DB: COMMIT

        OS-->>API: OK
        API-->>U: 200 { message: '撤单成功' }
    end
```

---

## 6. 账户余额变化时序

以下展示一次完整交易循环中账户各字段的变化过程。

**初始状态**：10000 USDT / 0 BTC

```
操作                         USDT可用    USDT冻结    BTC可用    BTC冻结
────────────────────────────────────────────────────────────────────────
初始                         10000        0           0          0

① 限价买 0.01 BTC @ 63000    9370         630         0          0
  （挂单，冻结 630 USDT）

② 价格跌到 63000，订单成交    9370         0           0.01       0
  冻结解冻 → 换成 BTC

③ 对持仓设止盈 @ 68000        9370         0           0.01       0
  （子平仓挂单 pending，不冻结 BTC？*）

④ 价格涨到 68000，止盈触发    10050        0           0          0
  卖出 0.01 BTC → +680 USDT
  利润 = 680 - 630 = +50 USDT
────────────────────────────────────────────────────────────────────────
```

> *注：当前实现中，子平仓挂单（`is_close_order=true`）的卖单不单独冻结 BTC，
> 因为持仓本身已代表持有量。正式交易所通常会冻结对应 BTC，本系统为简化处理。

---

## 附：各时序图参与者说明

| 参与者 | 文件 | 职责 |
|--------|------|------|
| 用户（前端） | `app/page.tsx` | 发起 HTTP 请求，展示数据 |
| API Route | `app/api/orders/route.ts` | 请求校验、调用 service |
| orderService | `lib/orderService.ts` | 业务逻辑、数据库操作 |
| server.js 引擎 | `server.js` | 500ms 轮询、触发成交 |
| priceStore | `server.js` 内存 | `global.__priceStore` 实时价格 |
| OKX WebSocket | 外部 | 推送实时行情到 server.js |
| PostgreSQL | 数据库 | 持久化所有状态 |

---

> 返回核心概念：[concepts.md](./concepts.md) | 系统设计：[design.md](./design.md)
