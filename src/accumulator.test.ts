import { describe, expect, it } from 'vitest';

import { applyDelta, toIterable, toSnapshot } from './accumulator.js';
import { applyPartial } from './partials.js';
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
  types: { orderID: 'guid', price: 'float', qty: 'long' },
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
  types: { symbol: 'symbol', timestamp: 'timestamp', price: 'float' },
  data,
});

const tradeInsert = (data: Trade[]): Extract<TradeMsg, { action: 'insert' }> => ({
  table: BitmexTable.Trade,
  action: 'insert',
  data,
});

// ── applyPartial — initial (no prior state) ───────────────────────────────────

describe('applyPartial — initial state', () => {
  it('builds a Map index for keyed tables', () => {
    const orders: Order[] = [
      { orderID: 'A', price: 100, qty: 10 },
      { orderID: 'B', price: 200, qty: 20 },
    ];

    const state = applyPartial<Order>(null, partial(orders));

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

    const state = applyPartial<Trade>(null, tradePartial(trades));

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

    const state = applyPartial<Level>(null, msg);
    const map = state.data as Map<string, Level>;

    expect(map.has('XBTUSD|1|Buy')).toBe(true);
  });

  it('ignores the filter on the first partial — initialises from data only', () => {
    type Level = { symbol: string; id: number; side: string; size: number };
    type LevelMsg = BitmexMessage<Level>;

    const msg: Extract<LevelMsg, { action: 'partial' }> = {
      table: BitmexTable.OrderBookL2,
      action: 'partial',
      keys: ['symbol', 'id', 'side'] as (keyof Level & string)[],
      types: { symbol: 'symbol', id: 'long', side: 'string', size: 'long' },
      filter: { symbol: 'XBTUSD' } as Record<keyof Level & string, unknown>,
      data: [{ symbol: 'XBTUSD', id: 1, side: 'Buy', size: 100 }],
    } as Extract<LevelMsg, { action: 'partial' }>;

    const state = applyPartial<Level>(null, msg);
    const map = state.data as Map<string, Level>;

    expect(map.size).toBe(1);
    expect(map.has('XBTUSD|1|Buy')).toBe(true);
  });
});

// ── applyDelta — keyed table ──────────────────────────────────────────────────

describe('applyDelta (keyed table)', () => {
  it('inserts a new item', () => {
    const state = applyPartial<Order>(null, partial([{ orderID: 'A', price: 100, qty: 10 }]));

    applyDelta(state, insert([{ orderID: 'B', price: 200, qty: 20 }]), 10_000);

    const map = state.data as Map<string, Order>;

    expect(map.size).toBe(2);
    expect(map.get('B')).toEqual({ orderID: 'B', price: 200, qty: 20 });
  });

  it('updates existing item by merging delta fields', () => {
    const state = applyPartial<Order>(null, partial([{ orderID: 'A', price: 100, qty: 10 }]));

    applyDelta(state, update([{ orderID: 'A', price: 150 }]), 10_000);

    const item = (state.data as Map<string, Order>).get('A')!;

    expect(item.price).toBe(150);
    expect(item.qty).toBe(10); // unchanged field preserved
  });

  it('update mutates the existing object in place (same reference)', () => {
    const state = applyPartial<Order>(null, partial([{ orderID: 'A', price: 100, qty: 10 }]));

    const before = (state.data as Map<string, Order>).get('A')!;

    applyDelta(state, update([{ orderID: 'A', price: 999 }]), 10_000);

    const after = (state.data as Map<string, Order>).get('A')!;

    expect(after).toBe(before); // same object reference
    expect(after.price).toBe(999);
  });

  it('deletes an item', () => {
    const state = applyPartial<Order>(
      null,
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
    const state = applyPartial<Order>(null, partial([]));

    applyDelta(state, update([{ orderID: 'X', price: 50, qty: 5 }]), 10_000);

    const map = state.data as Map<string, Order>;

    expect(map.has('X')).toBe(false);
  });

  it('delete on unknown id is a no-op', () => {
    const state = applyPartial<Order>(null, partial([{ orderID: 'A', price: 100, qty: 10 }]));

    applyDelta(state, del([{ orderID: 'Z' }]), 10_000);

    expect((state.data as Map<string, Order>).size).toBe(1);
  });
});

// ── applyDelta — insert-only table ───────────────────────────────────────────

describe('applyDelta (insert-only table) — wsPartialMode=true', () => {
  it('keeps one entry per symbol — latest wins', () => {
    const state = applyPartial<Trade>(null, tradePartial([{ symbol: 'XBTUSD', timestamp: 't1', price: 100 }]), true);

    applyDelta(state, tradeInsert([{ symbol: 'XBTUSD', timestamp: 't2', price: 200 }]), 10_000);

    const map = state.data as Map<string, Trade>;
    expect(map.size).toBe(1);
    expect(map.get('XBTUSD')).toEqual({ symbol: 'XBTUSD', timestamp: 't2', price: 200 });
  });

  it('keeps separate entries for different symbols', () => {
    const state = applyPartial<Trade>(null, tradePartial([{ symbol: 'XBTUSD', timestamp: 't1', price: 100 }]), true);

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

    const state = applyPartial<Tick>(null, tickPartial([{ ts: 't1', value: 1 }]), true);

    applyDelta(state, { table: BitmexTable.Trade, action: 'insert', data: [{ ts: 't2', value: 2 }] }, 10_000);
    applyDelta(state, { table: BitmexTable.Trade, action: 'insert', data: [{ ts: 't3', value: 3 }] }, 10_000);

    expect((state.data as Map<string, Tick>).size).toBe(1);
    expect((state.data as Map<string, Tick>).get('')).toEqual({ ts: 't3', value: 3 });
  });

  it('ignores update and delete actions', () => {
    const state = applyPartial<Trade>(null, tradePartial([{ symbol: 'XBTUSD', timestamp: 't1', price: 100 }]), true);

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
    const state = applyPartial<Trade>(null, tradePartial([{ symbol: 'XBTUSD', timestamp: 't1', price: 100 }]));

    applyDelta(state, tradeInsert([{ symbol: 'XBTUSD', timestamp: 't2', price: 200 }]), 10_000);

    expect((state.data as Trade[]).length).toBe(2);
    expect((state.data as Trade[])[1]).toEqual({ symbol: 'XBTUSD', timestamp: 't2', price: 200 });
  });

  it('trims to maxItems when buffer exceeds 120% threshold', () => {
    const state = applyPartial<Trade>(null, tradePartial([]));

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
    const state = applyPartial<Trade>(null, tradePartial([]));
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
    const state = applyPartial<Trade>(null, tradePartial([{ symbol: 'XBTUSD', timestamp: 't1', price: 100 }]));

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
    const state = applyPartial<Order>(
      null,
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
    const state = applyPartial<Trade>(null, tradePartial([{ symbol: 'XBTUSD', timestamp: 't1', price: 100 }]));

    const snap = toSnapshot(state);

    expect(snap).toHaveLength(1);
    expect(snap[0]).toEqual({ symbol: 'XBTUSD', timestamp: 't1', price: 100 });
  });

  it('is a deep copy — mutating the snapshot does not affect internal state', () => {
    const state = applyPartial<Order>(null, partial([{ orderID: 'A', price: 100, qty: 10 }]));

    const snap = toSnapshot(state);
    snap[0]!.price = 999;

    const snap2 = toSnapshot(state);

    expect(snap2[0]!.price).toBe(100);
  });

  it('returns a fresh copy each call', () => {
    const state = applyPartial<Order>(null, partial([{ orderID: 'A', price: 100, qty: 10 }]));

    const s1 = toSnapshot(state);
    const s2 = toSnapshot(state);

    expect(s1).not.toBe(s2);
    expect(s1[0]).not.toBe(s2[0]);
  });
});

// ── toIterable ────────────────────────────────────────────────────────────────

describe('toIterable', () => {
  it('yields all items from keyed table', () => {
    const state = applyPartial<Order>(
      null,
      partial([
        { orderID: 'A', price: 100, qty: 10 },
        { orderID: 'B', price: 200, qty: 20 },
      ])
    );

    const items = [...toIterable(state)];

    expect(items).toHaveLength(2);
  });

  it('yields all items from insert-only table', () => {
    const state = applyPartial<Trade>(
      null,
      tradePartial([
        { symbol: 'XBTUSD', timestamp: 't1', price: 100 },
        { symbol: 'ETHUSD', timestamp: 't2', price: 200 },
      ])
    );

    const items = [...toIterable(state)];

    expect(items).toHaveLength(2);
  });

  it('is re-iterable — multiple for...of passes work', () => {
    const state = applyPartial<Order>(null, partial([{ orderID: 'A', price: 100, qty: 10 }]));

    const iterable = toIterable(state);

    expect([...iterable]).toHaveLength(1);
    expect([...iterable]).toHaveLength(1);
  });

  it('reflects deltas applied after the iterable was obtained (live)', () => {
    const state = applyPartial<Order>(null, partial([{ orderID: 'A', price: 100, qty: 10 }]));

    const iterable = toIterable(state);

    applyDelta(state, insert([{ orderID: 'B', price: 200, qty: 20 }]), 10_000);

    expect([...iterable]).toHaveLength(2);
  });

  it('reflects in-place updates on the same object reference', () => {
    const state = applyPartial<Order>(null, partial([{ orderID: 'A', price: 100, qty: 10 }]));

    const iterable = toIterable(state);

    applyDelta(state, update([{ orderID: 'A', price: 999 }]), 10_000);

    const items = [...iterable] as Order[];

    expect(items[0]!.price).toBe(999);
  });
});

// ── applyPartial — filtered re-partial on keyed (Map) state ───────────────────

describe('applyPartial — filtered re-partial on keyed state', () => {
  type Level = { symbol: string; id: number; side: string; size: number };
  type LevelMsg = BitmexMessage<Level>;

  const bookPartial = (symbol: string, data: Level[]): Extract<LevelMsg, { action: 'partial' }> => ({
    table: BitmexTable.OrderBookL2,
    action: 'partial',
    keys: ['symbol', 'id', 'side'] as (keyof Level & string)[],
    types: { symbol: 'symbol', id: 'long', side: 'string', size: 'long' },
    filter: { symbol } as Record<keyof Level & string, unknown>,
    data,
  } as Extract<LevelMsg, { action: 'partial' }>);

  it('replaces only entries matching the filter, leaving others intact', () => {
    const state = applyPartial<Level>(null, bookPartial('XBTUSD', [
      { symbol: 'XBTUSD', id: 1, side: 'Buy', size: 100 },
      { symbol: 'XBTUSD', id: 2, side: 'Sell', size: 200 },
    ]));

    // inject an ETHUSD entry directly so state has two symbols
    (state.data as Map<string, Level>).set('ETHUSD|9|Buy', { symbol: 'ETHUSD', id: 9, side: 'Buy', size: 50 });

    const result = applyPartial(state, bookPartial('XBTUSD', [
      { symbol: 'XBTUSD', id: 1, side: 'Buy', size: 999 }, // updated
      { symbol: 'XBTUSD', id: 3, side: 'Buy', size: 300 }, // new
    ]));

    expect(result).toBe(state); // same reference — merge mutated in place

    const map = result.data as Map<string, Level>;

    // XBTUSD|2|Sell was removed (matched filter, not in new partial)
    expect(map.has('XBTUSD|2|Sell')).toBe(false);
    // XBTUSD|1|Buy was replaced with updated size
    expect(map.get('XBTUSD|1|Buy')).toEqual({ symbol: 'XBTUSD', id: 1, side: 'Buy', size: 999 });
    // XBTUSD|3|Buy was added
    expect(map.get('XBTUSD|3|Buy')).toEqual({ symbol: 'XBTUSD', id: 3, side: 'Buy', size: 300 });
    // ETHUSD entry is untouched
    expect(map.get('ETHUSD|9|Buy')).toEqual({ symbol: 'ETHUSD', id: 9, side: 'Buy', size: 50 });
    expect(map.size).toBe(3);
  });

  it('handles an empty partial for a symbol — removes all matching entries', () => {
    const state = applyPartial<Level>(null, bookPartial('XBTUSD', [
      { symbol: 'XBTUSD', id: 1, side: 'Buy', size: 100 },
    ]));

    (state.data as Map<string, Level>).set('ETHUSD|9|Buy', { symbol: 'ETHUSD', id: 9, side: 'Buy', size: 50 });

    applyPartial(state, bookPartial('XBTUSD', []));

    const map = state.data as Map<string, Level>;

    expect(map.has('XBTUSD|1|Buy')).toBe(false);
    expect(map.get('ETHUSD|9|Buy')).toEqual({ symbol: 'ETHUSD', id: 9, side: 'Buy', size: 50 });
    expect(map.size).toBe(1);
  });

  it('an unfiltered re-partial replaces the entire state', () => {
    const state = applyPartial<Level>(null, bookPartial('XBTUSD', [
      { symbol: 'XBTUSD', id: 1, side: 'Buy', size: 100 },
    ]));

    (state.data as Map<string, Level>).set('ETHUSD|9|Buy', { symbol: 'ETHUSD', id: 9, side: 'Buy', size: 50 });

    const noFilterPartial: Extract<LevelMsg, { action: 'partial' }> = {
      table: BitmexTable.OrderBookL2,
      action: 'partial',
      keys: ['symbol', 'id', 'side'] as (keyof Level & string)[],
      types: { symbol: 'symbol', id: 'long', side: 'string', size: 'long' },
      filter: {} as Record<keyof Level & string, unknown>,
      data: [{ symbol: 'BTCUSD', id: 5, side: 'Buy', size: 77 }],
    } as Extract<LevelMsg, { action: 'partial' }>;

    const result = applyPartial(state, noFilterPartial);

    expect(result).not.toBe(state); // fresh state on replace path

    const map = result.data as Map<string, Level>;

    expect(map.has('XBTUSD|1|Buy')).toBe(false);
    expect(map.has('ETHUSD|9|Buy')).toBe(false);
    expect(map.get('BTCUSD|5|Buy')).toEqual({ symbol: 'BTCUSD', id: 5, side: 'Buy', size: 77 });
    expect(map.size).toBe(1);
  });
});

// ── applyPartial — filtered re-partial on insert-only (array) state ───────────

describe('applyPartial — filtered re-partial on insert-only state', () => {
  const tradeFilteredPartial = (symbol: string, data: Trade[]): Extract<TradeMsg, { action: 'partial' }> => ({
    table: BitmexTable.Trade,
    action: 'partial',
    keys: [] as (keyof Trade & string)[],
    types: { symbol: 'symbol', timestamp: 'timestamp', price: 'float' },
    filter: { symbol } as Record<keyof Trade & string, unknown>,
    data,
  });

  it('replaces only entries matching the filter symbol', () => {
    const state = applyPartial<Trade>(null, tradePartial([
      { symbol: 'XBTUSD', timestamp: 't1', price: 100 },
      { symbol: 'ETHUSD', timestamp: 't2', price: 50 },
    ]));

    const result = applyPartial(state, tradeFilteredPartial('XBTUSD', [
      { symbol: 'XBTUSD', timestamp: 't3', price: 200 },
    ]));

    expect(result).toBe(state); // mutated in place

    const arr = result.data as Trade[];

    expect(arr).toHaveLength(2);
    expect(arr.find(t => t.symbol === 'XBTUSD')).toEqual({ symbol: 'XBTUSD', timestamp: 't3', price: 200 });
    expect(arr.find(t => t.symbol === 'ETHUSD')).toEqual({ symbol: 'ETHUSD', timestamp: 't2', price: 50 });
  });

  it('removes all matching entries when partial data is empty', () => {
    const state = applyPartial<Trade>(null, tradePartial([
      { symbol: 'XBTUSD', timestamp: 't1', price: 100 },
      { symbol: 'ETHUSD', timestamp: 't2', price: 50 },
    ]));

    applyPartial(state, tradeFilteredPartial('XBTUSD', []));

    const arr = state.data as Trade[];

    expect(arr).toHaveLength(1);
    expect(arr[0]!.symbol).toBe('ETHUSD');
  });
});
