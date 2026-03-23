import { describe, expect, it } from 'vitest';

import { createDatabase } from './database.js';
import { BitmexTable } from './types.js';
import type { BitmexMessage } from './types.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const partial = (
  table: BitmexTable,
  keys: string[],
  data: Record<string, unknown>[]
): BitmexMessage => ({
  table,
  action: 'partial',
  keys,
  types: {},
  data,
});

const insert = (table: BitmexTable, data: Record<string, unknown>[]): BitmexMessage => ({
  table,
  action: 'insert',
  data,
});

const update = (table: BitmexTable, data: Record<string, unknown>[]): BitmexMessage => ({
  table,
  action: 'update',
  data,
});

// ── Routing ───────────────────────────────────────────────────────────────────

describe('Database — routing', () => {
  it('routes messages to the correct internal table', () => {
    const db = createDatabase();

    db.apply(partial(BitmexTable.Order, ['orderID'], [{ orderID: 'A', price: 100 }]));
    db.apply(partial(BitmexTable.Instrument, ['symbol'], [{ symbol: 'XBTUSD', lotSize: 100 }]));
    db.apply(insert(BitmexTable.Order, [{ orderID: 'B', price: 200 }]));

    const orders = db.snapshot(BitmexTable.Order);
    const instruments = db.snapshot(BitmexTable.Instrument);

    expect(orders).toHaveLength(2);
    expect(instruments).toHaveLength(1);
    expect(instruments[0]).toEqual({ symbol: 'XBTUSD', lotSize: 100 });
  });

  it('discards delta for a table that has not received a partial', () => {
    const db = createDatabase();

    db.apply(insert(BitmexTable.Order, [{ orderID: 'A', price: 100 }]));

    expect(db.snapshot(BitmexTable.Order)).toEqual([]);
  });

  it('delta before partial is ignored; partial then works normally', () => {
    const db = createDatabase();

    db.apply(insert(BitmexTable.Order, [{ orderID: 'X', price: 999 }]));
    db.apply(partial(BitmexTable.Order, ['orderID'], [{ orderID: 'A', price: 100 }]));

    expect(db.snapshot(BitmexTable.Order)).toHaveLength(1);
    expect(db.snapshot(BitmexTable.Order)[0]).toEqual({ orderID: 'A', price: 100 });
  });
});

// ── snapshot() ────────────────────────────────────────────────────────────────

describe('Database — snapshot()', () => {
  it('snapshot(table) returns items for a specific table', () => {
    const db = createDatabase();

    db.apply(partial(BitmexTable.Order, ['orderID'], [{ orderID: 'A', price: 100 }]));

    const snap = db.snapshot(BitmexTable.Order);

    expect(snap).toEqual([{ orderID: 'A', price: 100 }]);
  });

  it('snapshot(table) returns empty array for unknown table', () => {
    const db = createDatabase();

    expect(db.snapshot(BitmexTable.Order)).toEqual([]);
  });

  it('snapshot() (no args) returns all tables that have received a partial', () => {
    const db = createDatabase();

    db.apply(partial(BitmexTable.Order, ['orderID'], [{ orderID: 'A' }]));
    db.apply(partial(BitmexTable.Position, ['symbol'], [{ symbol: 'XBTUSD', strategy: '' }]));

    const all = db.snapshot();

    expect(all).toHaveProperty('order');
    expect(all).toHaveProperty('position');
    expect((all.order ?? []).length).toBe(1);
    expect((all.position ?? []).length).toBe(1);
  });

  it('snapshot() (no args) does not include tables that never received a partial', () => {
    const db = createDatabase();

    db.apply(partial(BitmexTable.Order, ['orderID'], [{ orderID: 'A' }]));
    db.apply(insert(BitmexTable.Position, [{ symbol: 'XBTUSD' }])); // no prior partial

    const all = db.snapshot();

    expect(all).toHaveProperty('order');
    expect(all).not.toHaveProperty('position');
  });

  it('snapshot() is a deep copy — mutation does not affect internal state', () => {
    const db = createDatabase();

    db.apply(partial(BitmexTable.Order, ['orderID'], [{ orderID: 'A', price: 100 }]));

    const snap = db.snapshot(BitmexTable.Order) as Array<{ orderID: string; price: number }>;
    snap[0]!.price = 999;

    expect(db.snapshot(BitmexTable.Order)[0]).toEqual({ orderID: 'A', price: 100 });
  });
});

// ── view() ────────────────────────────────────────────────────────────────────

describe('Database — view()', () => {
  it('view(table) returns a live iterable', () => {
    const db = createDatabase();

    db.apply(partial(BitmexTable.Order, ['orderID'], [{ orderID: 'A', price: 100 }]));

    const view = db.view(BitmexTable.Order);

    db.apply(insert(BitmexTable.Order, [{ orderID: 'B', price: 200 }]));

    expect([...view.data]).toHaveLength(2);
  });

  it('view(table) table field is the BitmexTable enum value', () => {
    const db = createDatabase();

    db.apply(partial(BitmexTable.Order, ['orderID'], [{ orderID: 'A' }]));

    expect(db.view(BitmexTable.Order).table).toBe(BitmexTable.Order);
  });

  it('view(table) for unknown table returns empty iterable', () => {
    const db = createDatabase();
    const view = db.view(BitmexTable.Order);

    expect([...view.data]).toHaveLength(0);
  });

  it('view().data is re-iterable', () => {
    const db = createDatabase();

    db.apply(partial(BitmexTable.Order, ['orderID'], [{ orderID: 'A', price: 100 }]));

    const view = db.view(BitmexTable.Order);

    expect([...view.data]).toHaveLength(1);
    expect([...view.data]).toHaveLength(1);
  });
});

// ── Table isolation ───────────────────────────────────────────────────────────

describe('Database — table isolation', () => {
  it('deltas for one table do not affect another', () => {
    const db = createDatabase();

    db.apply(partial(BitmexTable.Order, ['orderID'], [{ orderID: 'A', price: 100 }]));
    db.apply(partial(BitmexTable.Position, ['symbol'], [{ symbol: 'XBTUSD', strategy: '', currentQty: 10 }]));

    db.apply(update(BitmexTable.Order, [{ orderID: 'A', price: 999 }]));

    const positions = db.snapshot(BitmexTable.Position);

    expect(positions[0]).toEqual({ symbol: 'XBTUSD', strategy: '', currentQty: 10 });
  });
});
