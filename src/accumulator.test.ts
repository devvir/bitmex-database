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
  types: { orderID: 'guid', price: 'float', qty: 'long' },
  data,
});

const insert = (data: Order[]): Extract<OrderMsg, { action: 'insert' }> => ({
  table: BitmexTable.Order,
  action: 'insert',
  data,
});

const update = (data: Partial<Order>[]): Extract<OrderMsg, { action: 'update' }> => ({
  table: BitmexTable.Order,
  action: 'update',
  data,
});

const del = (data: Partial<Order>[]): Extract<OrderMsg, { action: 'delete' }> => ({
  table: BitmexTable.Order,
  action: 'delete',
  data,
});

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
      types: {},
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

    applyDelta(state, insert([{ orderID: 'B', price: 200, qty: 20 }]));

    const map = state.data as Map<string, Order>;

    expect(map.size).toBe(2);
    expect(map.get('B')).toEqual({ orderID: 'B', price: 200, qty: 20 });
  });

  it('updates existing item by merging delta fields', () => {
    const state = newState<Order>(partial([{ orderID: 'A', price: 100, qty: 10 }]));

    applyDelta(state, update([{ orderID: 'A', price: 150 }]));

    const item = (state.data as Map<string, Order>).get('A')!;

    expect(item.price).toBe(150);
    expect(item.qty).toBe(10); // unchanged field preserved
  });

  it('update mutates the existing object in place (same reference)', () => {
    const state = newState<Order>(partial([{ orderID: 'A', price: 100, qty: 10 }]));

    const before = (state.data as Map<string, Order>).get('A')!;

    applyDelta(state, update([{ orderID: 'A', price: 999 }]));

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

    applyDelta(state, del([{ orderID: 'A' }]));

    const map = state.data as Map<string, Order>;

    expect(map.has('A')).toBe(false);
    expect(map.size).toBe(1);
  });

  it('update on unknown id inserts the item', () => {
    const state = newState<Order>(partial([]));

    applyDelta(state, update([{ orderID: 'X', price: 50, qty: 5 }]));

    const map = state.data as Map<string, Order>;

    expect(map.has('X')).toBe(true);
  });

  it('delete on unknown id is a no-op', () => {
    const state = newState<Order>(partial([{ orderID: 'A', price: 100, qty: 10 }]));

    applyDelta(state, del([{ orderID: 'Z' }]));

    expect((state.data as Map<string, Order>).size).toBe(1);
  });
});

// ── applyDelta — insert-only table ───────────────────────────────────────────

describe('applyDelta (insert-only table)', () => {
  it('keeps one entry per symbol — latest wins', () => {
    const state = newState<Trade>(tradePartial([{ symbol: 'XBTUSD', timestamp: 't1', price: 100 }]));

    applyDelta(state, tradeInsert([{ symbol: 'XBTUSD', timestamp: 't2', price: 200 }]));

    expect((state.data as Trade[]).length).toBe(1);
    expect((state.data as Trade[])[0]).toEqual({ symbol: 'XBTUSD', timestamp: 't2', price: 200 });
  });

  it('keeps separate entries for different symbols', () => {
    const state = newState<Trade>(tradePartial([{ symbol: 'XBTUSD', timestamp: 't1', price: 100 }]));

    applyDelta(state, tradeInsert([{ symbol: 'ETHUSD', timestamp: 't2', price: 50 }]));

    expect((state.data as Trade[]).length).toBe(2);
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

    const state = newState<Tick>(tickPartial([{ ts: 't1', value: 1 }]));

    applyDelta(state, { table: BitmexTable.Trade, action: 'insert', data: [{ ts: 't2', value: 2 }] });
    applyDelta(state, { table: BitmexTable.Trade, action: 'insert', data: [{ ts: 't3', value: 3 }] });

    expect((state.data as Tick[]).length).toBe(1);
    expect((state.data as Tick[])[0]).toEqual({ ts: 't3', value: 3 });
  });

  it('ignores update and delete actions', () => {
    const state = newState<Trade>(tradePartial([{ symbol: 'XBTUSD', timestamp: 't1', price: 100 }]));

    const upd: Extract<TradeMsg, { action: 'update' }> = {
      table: BitmexTable.Trade,
      action: 'update',
      data: [{ price: 999 }],
    };
    const dlt: Extract<TradeMsg, { action: 'delete' }> = {
      table: BitmexTable.Trade,
      action: 'delete',
      data: [{ timestamp: 't1' }],
    };

    applyDelta(state, upd);
    applyDelta(state, dlt);

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

    applyDelta(state, insert([{ orderID: 'B', price: 200, qty: 20 }]));

    expect([...iterable]).toHaveLength(2);
  });

  it('reflects in-place updates on the same object reference', () => {
    const state = newState<Order>(partial([{ orderID: 'A', price: 100, qty: 10 }]));

    const iterable = toIterable(state);

    applyDelta(state, update([{ orderID: 'A', price: 999 }]));

    const items = [...iterable] as Order[];

    expect(items[0]!.price).toBe(999);
  });
});
