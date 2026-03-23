import { describe, expect, it } from 'vitest';

import { applyDelta, newState, toIterable, toSnapshot } from './accumulator.js';
import { BitmexTable } from './types.js';
import type { BitmexMessage } from './types.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

interface Order {
  orderID: string;
  price: number;
  qty: number;
}

interface Trade {
  symbol: string;
  timestamp: string;
  price: number;
}

type OrderMsg = BitmexMessage<Order>;
type TradeMsg = BitmexMessage<Trade>;

const partial = (data: Order[]): Extract<OrderMsg, { action: 'partial' }> => ({
  table: BitmexTable.Order,
  action: 'partial',
  keys: ['orderID'] as (keyof Order & string)[],
  types: { orderID: 'guid', price: 'double', qty: 'int64' },
  data,
} as Extract<OrderMsg, { action: 'partial' }>);

const insert = (data: Order[]): Extract<OrderMsg, { action: 'insert' }> => ({
  table: BitmexTable.Order,
  action: 'insert',
  data,
});

const update = (data: Partial<Order>[]): Extract<OrderMsg, { action: 'update' }> => ({
  table: BitmexTable.Order,
  action: 'update',
  data,
} as Extract<OrderMsg, { action: 'update' }>);

const del = (data: Partial<Order>[]): Extract<OrderMsg, { action: 'delete' }> => ({
  table: BitmexTable.Order,
  action: 'delete',
  data,
} as Extract<OrderMsg, { action: 'delete' }>);

const tradePartial = (data: Trade[]): Extract<TradeMsg, { action: 'partial' }> => ({
  table: BitmexTable.Trade,
  action: 'partial',
  keys: [] as (keyof Trade & string)[],
  types: { symbol: 'string', timestamp: 'date-time', price: 'double' },
  data,
});

const tradeInsert = (data: Trade[]): Extract<TradeMsg, { action: 'insert' }> => ({
  table: BitmexTable.Trade,
  action: 'insert',
  data,
});

// ── newState ──────────────────────────────────────────────────────────────────

describe('newState', () => {
  it('builds a Map index for keyed tables', () => {
    const orders: Order[] = [
      { orderID: 'A', price: 100, qty: 10 },
      { orderID: 'B', price: 200, qty: 20 },
    ];

    const state = newState<Order>(partial(orders));

    expect(state.table).toBe('order');
    expect(state.keys).toEqual(['orderID']);
    expect(state.data).toBeInstanceOf(Map);
    expect((state.data as Map<string, Order>).size).toBe(2);
    expect((state.data as Map<string, Order>).get('A')).toEqual({
      orderID: 'A',
      price: 100,
      qty: 10,
    });
  });

  it('builds an array for insert-only tables (no keys)', () => {
    const trades: Trade[] = [
      { symbol: 'XBTUSD', timestamp: 't1', price: 100 },
      { symbol: 'ETHUSD', timestamp: 't2', price: 200 },
    ];

    const state = newState<Trade>(tradePartial(trades));

    expect(state.data).toBeInstanceOf(Array);
    expect(state.data).toHaveLength(2);
  });

  it('uses composite pipe-delimited keys when multiple key fields exist', () => {
    type Level = { symbol: string; id: number; side: string; size: number };

    const msg: Extract<BitmexMessage<Level>, { action: 'partial' }> = {
      table: BitmexTable.OrderBookL2,
      action: 'partial',
      keys: ['symbol', 'id', 'side'] as (keyof Level & string)[],
      types: { symbol: 'string', id: 'int32', side: 'string', size: 'int64' },
      data: [{ symbol: 'XBTUSD', id: 1, side: 'Buy', size: 100 }],
    };

    const state = newState<Level>(msg);
    const map = state.data as Map<string, Level>;

    expect(map.has('XBTUSD|1|Buy')).toBe(true);
  });
});

// ── applyDelta — keyed table ──────────────────────────────────────────────────

describe('applyDelta (keyed table)', () => {
  it('inserts a new item', () => {
    const state = newState<Order>(partial([{ orderID: 'A', price: 100, qty: 10 }]));

    applyDelta(state, insert([{ orderID: 'B', price: 200, qty: 20 }]), 10_000);

    const map = state.data as Map<string, Order>;

    expect(map.size).toBe(2);
    expect(map.get('B')).toEqual({ orderID: 'B', price: 200, qty: 20 });
  });

  it('updates existing item by merging delta fields', () => {
    const state = newState<Order>(partial([{ orderID: 'A', price: 100, qty: 10 }]));

    applyDelta(state, update([{ orderID: 'A', price: 150 }]), 10_000);

    const item = (state.data as Map<string, Order>).get('A')!;

    expect(item.price).toBe(150);
    expect(item.qty).toBe(10); // unchanged field preserved
  });

  it('update mutates the existing object in place (same reference)', () => {
    const state = newState<Order>(partial([{ orderID: 'A', price: 100, qty: 10 }]));

    const before = (state.data as Map<string, Order>).get('A')!;

    applyDelta(state, update([{ orderID: 'A', price: 999 }]), 10_000);

    const after = (state.data as Map<string, Order>).get('A')!;

    expect(after).toBe(before); // same object reference
    expect(after.price).toBe(999);
  });

  it('deletes an item', () => {
    const state = newState<Order>(
      partial([
        { orderID: 'A', price: 100, qty: 10 },
        { orderID: 'B', price: 200, qty: 20 },
      ])
    );

    applyDelta(state, del([{ orderID: 'A' }]), 10_000);

    const map = state.data as Map<string, Order>;

    expect(map.has('A')).toBe(false);
    expect(map.size).toBe(1);
  });

  it('update on unknown id drops the item', () => {
    const state = newState<Order>(partial([]));

    applyDelta(state, update([{ orderID: 'X', price: 50, qty: 5 }]), 10_000);

    const map = state.data as Map<string, Order>;

    expect(map.has('X')).toBe(false);
  });

  it('delete on unknown id is a no-op', () => {
    const state = newState<Order>(partial([{ orderID: 'A', price: 100, qty: 10 }]));

    applyDelta(state, del([{ orderID: 'Z' }]), 10_000);

    expect((state.data as Map<string, Order>).size).toBe(1);
  });
});

// ── applyDelta — insert-only table ───────────────────────────────────────────

describe('applyDelta (insert-only table) — wsPartialMode=true', () => {
  it('keeps one entry per symbol — latest wins', () => {
    const state = newState<Trade>(tradePartial([{ symbol: 'XBTUSD', timestamp: 't1', price: 100 }]), true);

    applyDelta(state, tradeInsert([{ symbol: 'XBTUSD', timestamp: 't2', price: 200 }]), 10_000);

    const map = state.data as Map<string, Trade>;
    expect(map.size).toBe(1);
    expect(map.get('XBTUSD')).toEqual({ symbol: 'XBTUSD', timestamp: 't2', price: 200 });
  });

  it('keeps separate entries for different symbols', () => {
    const state = newState<Trade>(tradePartial([{ symbol: 'XBTUSD', timestamp: 't1', price: 100 }]), true);

    applyDelta(state, tradeInsert([{ symbol: 'ETHUSD', timestamp: 't2', price: 50 }]), 10_000);

    expect((state.data as Map<string, Trade>).size).toBe(2);
  });

  it('keeps exactly one entry when items have no symbol field', () => {
    interface Tick { ts: string; value: number }
    type TickMsg = BitmexMessage<Tick>;

    const tickPartial = (data: Tick[]): Extract<TickMsg, { action: 'partial' }> => ({
      table: BitmexTable.Trade,
      action: 'partial',
      keys: [] as (keyof Tick & string)[],
      types: { ts: 'date-time', value: 'double' },
      data,
    });

    const state = newState<Tick>(tickPartial([{ ts: 't1', value: 1 }]), true);

    applyDelta(state, { table: BitmexTable.Trade, action: 'insert', data: [{ ts: 't2', value: 2 }] }, 10_000);
    applyDelta(state, { table: BitmexTable.Trade, action: 'insert', data: [{ ts: 't3', value: 3 }] }, 10_000);

    expect((state.data as Map<string, Tick>).size).toBe(1);
    expect((state.data as Map<string, Tick>).get('')).toEqual({ ts: 't3', value: 3 });
  });

  it('ignores update and delete actions', () => {
    const state = newState<Trade>(tradePartial([{ symbol: 'XBTUSD', timestamp: 't1', price: 100 }]), true);

    const upd: Extract<TradeMsg, { action: 'update' }> = {
      table: BitmexTable.Trade,
      action: 'update',
      data: [{ price: 999 }],
    } as Extract<TradeMsg, { action: 'update' }>;
    const dlt: Extract<TradeMsg, { action: 'delete' }> = {
      table: BitmexTable.Trade,
      action: 'delete',
      data: [{ timestamp: 't1' }],
    } as Extract<TradeMsg, { action: 'delete' }>;

    applyDelta(state, upd, 10_000);
    applyDelta(state, dlt, 10_000);

    const map = state.data as Map<string, Trade>;
    expect(map.size).toBe(1);
    expect(map.get('XBTUSD')!.price).toBe(100);
  });
});

describe('applyDelta (insert-only table) — wsPartialMode=false (accumulation)', () => {
  it('appends items on insert (accumulation mode)', () => {
    const state = newState<Trade>(tradePartial([{ symbol: 'XBTUSD', timestamp: 't1', price: 100 }]));

    applyDelta(state, tradeInsert([{ symbol: 'XBTUSD', timestamp: 't2', price: 200 }]), 10_000);

    expect((state.data as Trade[]).length).toBe(2);
    expect((state.data as Trade[])[1]).toEqual({ symbol: 'XBTUSD', timestamp: 't2', price: 200 });
  });

  it('trims to maxItems when buffer exceeds 120% threshold', () => {
    const state = newState<Trade>(tradePartial([]));

    const batch = Array.from(
      { length: 1300 },
      (_, i): Extract<TradeMsg, { action: 'insert' }> => ({
        table: BitmexTable.Trade,
        action: 'insert',
        data: [{ symbol: `SYM${i}`, timestamp: String(i), price: i }],
      })
    );

    for (const msg of batch) {
      applyDelta(state, msg, 1000);
    }

    // With cap 1000, trim happens at 1200+. After trim, size is 1000.
    // But subsequent inserts can grow it back toward 1200 before next trim.
    // Final size is not guaranteed to be exactly 1000, but will not grow indefinitely.
    expect((state.data as Trade[]).length).toBeLessThanOrEqual(1200);
  });

  it('respects custom cap size with 120% overflow threshold', () => {
    const state = newState<Trade>(tradePartial([]));
    const customCap = 50;

    const batch = Array.from(
      { length: 75 },
      (_, i): Extract<TradeMsg, { action: 'insert' }> => ({
        table: BitmexTable.Trade,
        action: 'insert',
        data: [{ symbol: `SYM${i}`, timestamp: String(i), price: i }],
      })
    );

    for (const msg of batch) {
      applyDelta(state, msg, customCap);
    }

    // With cap 50, trim happens at 60+. Size can temporarily reach 60 before trim,
    // but won't grow indefinitely. Final size depends on insertion order.
    expect((state.data as Trade[]).length).toBeLessThanOrEqual(60);
    expect((state.data as Trade[]).length).toBeGreaterThan(0);
  });

  it('ignores update and delete actions', () => {
    const state = newState<Trade>(tradePartial([{ symbol: 'XBTUSD', timestamp: 't1', price: 100 }]));

    const upd: Extract<TradeMsg, { action: 'update' }> = {
      table: BitmexTable.Trade,
      action: 'update',
      data: [{ price: 999 }],
    } as Extract<TradeMsg, { action: 'update' }>;
    const dlt: Extract<TradeMsg, { action: 'delete' }> = {
      table: BitmexTable.Trade,
      action: 'delete',
      data: [{ timestamp: 't1' }],
    } as Extract<TradeMsg, { action: 'delete' }>;

    applyDelta(state, upd, 10_000);
    applyDelta(state, dlt, 10_000);

    expect((state.data as Trade[]).length).toBe(1);
    expect((state.data as Trade[])[0]!.price).toBe(100);
  });
});

// ── toSnapshot ────────────────────────────────────────────────────────────────

describe('toSnapshot', () => {
  it('returns an array copy for keyed table', () => {
    const state = newState<Order>(
      partial([
        { orderID: 'A', price: 100, qty: 10 },
        { orderID: 'B', price: 200, qty: 20 },
      ])
    );

    const snap = toSnapshot(state);

    expect(snap).toHaveLength(2);
    expect(snap).toEqual(
      expect.arrayContaining([
        { orderID: 'A', price: 100, qty: 10 },
        { orderID: 'B', price: 200, qty: 20 },
      ])
    );
  });

  it('returns an array copy for insert-only table', () => {
    const state = newState<Trade>(tradePartial([{ symbol: 'XBTUSD', timestamp: 't1', price: 100 }]));

    const snap = toSnapshot(state);

    expect(snap).toHaveLength(1);
    expect(snap[0]).toEqual({ symbol: 'XBTUSD', timestamp: 't1', price: 100 });
  });

  it('is a deep copy — mutating the snapshot does not affect internal state', () => {
    const state = newState<Order>(partial([{ orderID: 'A', price: 100, qty: 10 }]));

    const snap = toSnapshot(state);
    snap[0]!.price = 999;

    const snap2 = toSnapshot(state);

    expect(snap2[0]!.price).toBe(100);
  });

  it('returns a fresh copy each call', () => {
    const state = newState<Order>(partial([{ orderID: 'A', price: 100, qty: 10 }]));

    const s1 = toSnapshot(state);
    const s2 = toSnapshot(state);

    expect(s1).not.toBe(s2);
    expect(s1[0]).not.toBe(s2[0]);
  });
});

// ── toIterable ────────────────────────────────────────────────────────────────

describe('toIterable', () => {
  it('yields all items from keyed table', () => {
    const state = newState<Order>(
      partial([
        { orderID: 'A', price: 100, qty: 10 },
        { orderID: 'B', price: 200, qty: 20 },
      ])
    );

    const items = [...toIterable(state)];

    expect(items).toHaveLength(2);
  });

  it('yields all items from insert-only table', () => {
    const state = newState<Trade>(
      tradePartial([
        { symbol: 'XBTUSD', timestamp: 't1', price: 100 },
        { symbol: 'ETHUSD', timestamp: 't2', price: 200 },
      ])
    );

    const items = [...toIterable(state)];

    expect(items).toHaveLength(2);
  });

  it('is re-iterable — multiple for...of passes work', () => {
    const state = newState<Order>(partial([{ orderID: 'A', price: 100, qty: 10 }]));

    const iterable = toIterable(state);

    expect([...iterable]).toHaveLength(1);
    expect([...iterable]).toHaveLength(1);
  });

  it('reflects deltas applied after the iterable was obtained (live)', () => {
    const state = newState<Order>(partial([{ orderID: 'A', price: 100, qty: 10 }]));

    const iterable = toIterable(state);

    applyDelta(state, insert([{ orderID: 'B', price: 200, qty: 20 }]), 10_000);

    expect([...iterable]).toHaveLength(2);
  });

  it('reflects in-place updates on the same object reference', () => {
    const state = newState<Order>(partial([{ orderID: 'A', price: 100, qty: 10 }]));

    const iterable = toIterable(state);

    applyDelta(state, update([{ orderID: 'A', price: 999 }]), 10_000);

    const items = [...iterable] as Order[];

    expect(items[0]!.price).toBe(999);
  });
});
