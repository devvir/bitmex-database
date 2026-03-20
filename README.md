# @devvir/bitmex-database

In-memory accumulation of BitMEX WebSocket table data. Feed it raw delta messages; read typed snapshots or live views at any time.

Works with any BitMEX-compatible WebSocket endpoint — live, testnet, or replay.

---

## Install

```sh
npm install @devvir/bitmex-database
```

---

## Quick start

```typescript
import { createTable } from '@devvir/bitmex-database'

const orders = createTable('order')

// Feed it raw WS messages — handles partial, insert, update, delete automatically
ws.on('message', msg => orders.apply(JSON.parse(msg)))

// Deep copy — safe to hold onto and mutate freely
const myOrders = orders.snapshot()

// Live view — no copy, for high-frequency reads
for (const order of orders.view().data) {
  console.log(order.clOrdID, order.price)
}
```

---

## Multiple tables

```typescript
import { createDatabase, BitmexTable } from '@devvir/bitmex-database'

const db = createDatabase()

ws.on('message', msg => db.apply(JSON.parse(msg)))

// Typed snapshot for a specific table
const orders = db.snapshot(BitmexTable.Order)

// Live view of the order book
const book = db.view(BitmexTable.OrderBookL2)
for (const level of book.data) {
  console.log(level.side, level.price, level.size)
}
```

---

## API

### `createTable(tableName)`

Returns a single-table accumulator, typed to the corresponding BitMEX item type.

```typescript
const orders    = createTable('order')       // Table<Order>
const book      = createTable('orderBookL2') // Table<OrderBookL2>
const positions = createTable('position')    // Table<Position>
```

### `createDatabase()`

Returns a multi-table accumulator. Routes each incoming message to the correct internal table automatically.

### `.apply(message)`

Accepts any BitMEX WebSocket delta message. A `partial` initialises (or resets) the table; subsequent `insert`, `update`, and `delete` messages are applied incrementally using the table's key fields.

```typescript
table.apply({ table: 'order', action: 'partial', keys: ['orderID'], data: [...] })
table.apply({ table: 'order', action: 'update',  data: [{ orderID: '...', price: 49500 }] })
```

### `.snapshot([table])`

Returns a **deep copy** of the accumulated data — safe to hold onto, pass around, or mutate without affecting internal state.

```typescript
const items = table.snapshot()                      // T[]
const items = db.snapshot(BitmexTable.Order)        // Order[]
const all   = db.snapshot()                         // all accumulated tables
```

### `.view([table])`

Returns a **live reference** to internal state — no copy. Use this for high-frequency reads where deep copying would be wasteful. The `data` field is a re-iterable over the live data (a fresh iteration is available on each `for...of`).

```typescript
interface TableView<T> {
  table: string
  keys:  string[]
  types: Record<string, string>
  data:  Iterable<Readonly<T>>
}
```

Items are typed as `Readonly<T>` — TypeScript will prevent property assignment on them. Note that `Readonly` is shallow; nested objects are not protected.

### `BitmexTable`

Enum of all known BitMEX WebSocket table names.

```typescript
import { BitmexTable } from '@devvir/bitmex-database'

BitmexTable.Order         // 'order'
BitmexTable.OrderBookL2   // 'orderBookL2'
BitmexTable.Trade         // 'trade'
BitmexTable.Position      // 'position'
BitmexTable.Margin        // 'margin'
BitmexTable.Execution     // 'execution'
BitmexTable.Instrument    // 'instrument'
// ... and more
```
