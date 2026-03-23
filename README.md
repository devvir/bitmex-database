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

### `createTable(tableName, capOnInsertOnly)`

Returns a single-table accumulator, typed to the corresponding BitMEX item type.

```typescript
const orders    = createTable('order')       // Table<Order>
const book      = createTable('orderBookL2') // Table<OrderBookL2>
const positions = createTable('position')    // Table<Position>
```

**Options:**
- `capOnInsertOnly` (number, default: 10,000) — for insert-only tables, only applies when `wsPartialMode: false`. See below.

### `createDatabase(capOnInsertOnly)`

Returns a multi-table accumulator. Routes each incoming message to the correct internal table automatically.

**Options:**
- `capOnInsertOnly` (number, default: 10,000) — propagated to insert-only tables; only applies when `wsPartialMode: false`. See below.

### `.apply(message, wsPartialMode)`

Accepts any BitMEX WebSocket delta message. A `partial` initialises (or resets) the table; subsequent `insert`, `update`, and `delete` messages are applied incrementally using the table's key fields.

```typescript
table.apply({ table: 'order', action: 'partial', keys: ['orderID'], data: [...] })
table.apply({ table: 'order', action: 'update',  data: [{ orderID: '...', price: 49500 }] })
```

**Options:**
- `wsPartialMode` (boolean, default: false)
  - **false** (delta-server accumulation): Insert-only tables accumulate all items, capped at `capOnInsertOnly`.
  - **true** (websocket partial mode): Insert-only tables keep at most one item per symbol (or one item total if no symbol field). This replicates BitMEX WebSocket behavior for partials on insert-only tables.

**Keyed tables** (with key fields) behave identically in both modes: `insert` adds, `update` modifies in-place, `delete` removes. No cap or pruning of any kind. BitMEX messages fuly drive the state.

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

---

## Modes: Delta Accumulation vs WebSocket Partials

### Delta Accumulation Mode (`wsPartialMode: false`, default)

**Use this for delta servers or slow-updating data.**

- Insert-only tables accumulate **all items** across multiple deltas
- Items are trimmed to `capOnInsertOnly` when the buffer grows too large
- Updates and deletes are **ignored** (only inserts matter)
- Best for tables like `execution`, `funding`, `liquidation` where you want a rolling history

```typescript
const db = createDatabase()  // capOnInsertOnly defaults to 10,000

db.apply(msg, false)  // delta accumulation
const executions = db.snapshot(BitmexTable.Execution)  // up to 10,000 items
```

### WebSocket Partial Mode (`wsPartialMode: true`)

**Use this to match BitMEX WebSocket table semantics (use case: clone/proxy to bypass rate limits).**

- Insert-only tables keep **one item per symbol** (or one item total if no symbol available)
- Latest item always wins — older items for the same symbol are discarded
- Updates and deletes are **ignored** (known BitMEX WS bug: it is impossible to update/delete in tables without keys)
- Best for tables like `trade`, `quote`, `*bin*` where you want the latest snapshot per symbol

```typescript
const db = createDatabase()

db.apply(msg, true)  // websocket partial mode
const trades = db.snapshot(BitmexTable.Trade)  // one entry per symbol (e.g., XBTUSD, ETHUSD, ...)
```

---

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
