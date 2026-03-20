import { describe, expect, it } from 'vitest';

import { createTable } from './table.js';
import { BitmexTable } from './types.js';
import type { BitmexMessage } from './types.js';

// ── Local test types ──────────────────────────────────────────────────────────

interface TestOrder {
  orderID: string;
  price: number;
  qty?: number;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

type OrderMsg = BitmexMessage<TestOrder>;

const orderPartial = (data: TestOrder[]): OrderMsg => ({
  table: 'order',
  action: 'partial',
  keys: ['orderID'],
  types: { orderID: 'guid', price: 'float' },
  data,
});

const orderInsert = (data: TestOrder[]): OrderMsg => ({
  table: 'order',
  action: 'insert',
  data,
});

const orderUpdate = (data: Partial<TestOrder>[]): OrderMsg => ({
  table: 'order',
  action: 'update',
  data,
});

const orderDelete = (data: Partial<TestOrder>[]): OrderMsg => ({
  table: 'order',
  action: 'delete',
  data,
});

// ── createTable returns the right type ────────────────────────────────────────
// We test using a cast so the fixtures can use a simpler local interface
// rather than the full bitmex-api schema type.

const makeTable = () =>
  createTable(BitmexTable.Order) as unknown as import('./types.js').Table<TestOrder>;

// ── Before partial ────────────────────────────────────────────────────────────

describe('Table — before partial', () => {
  it('snapshot() returns empty array', () => {
    const t = makeTable();

    expect(t.snapshot()).toEqual([]);
  });

  it('view() returns empty iterable', () => {
    const t = makeTable();
    const view = t.view();

    expect([...view.data]).toEqual([]);
  });

  it('view() table field is the BitmexTable enum value', () => {
    const t = makeTable();

    expect(t.view().table).toBe(BitmexTable.Order);
  });

  it('discards delta messages silently', () => {
    const t = makeTable();

    expect(() => t.apply(orderInsert([{ orderID: 'A', price: 100 }]))).not.toThrow();

    expect(t.snapshot()).toEqual([]);
  });
});

// ── Initialisation ────────────────────────────────────────────────────────────

describe('Table — partial initialisation', () => {
  it('initialises state from partial', () => {
    const t = makeTable();

    t.apply(orderPartial([{ orderID: 'A', price: 100 }]));

    expect(t.snapshot()).toEqual([{ orderID: 'A', price: 100 }]);
  });

  it('view() reflects initial data and metadata', () => {
    const t = makeTable();

    t.apply(orderPartial([{ orderID: 'A', price: 100 }]));

    const view = t.view();

    expect(view.table).toBe(BitmexTable.Order);
    expect(view.keys).toEqual(['orderID']);
    expect(view.types).toEqual({ orderID: 'guid', price: 'float' });
    expect([...view.data]).toHaveLength(1);
  });

  it('a second partial resets state completely', () => {
    const t = makeTable();

    t.apply(
      orderPartial([
        { orderID: 'A', price: 100 },
        { orderID: 'B', price: 200 },
      ])
    );
    t.apply(orderPartial([{ orderID: 'C', price: 300 }]));

    const snap = t.snapshot();

    expect(snap).toHaveLength(1);
    expect(snap[0]).toEqual({ orderID: 'C', price: 300 });
  });
});

// ── Delta operations ──────────────────────────────────────────────────────────

describe('Table — delta operations', () => {
  it('insert adds a new item', () => {
    const t = makeTable();

    t.apply(orderPartial([{ orderID: 'A', price: 100 }]));
    t.apply(orderInsert([{ orderID: 'B', price: 200 }]));

    expect(t.snapshot()).toHaveLength(2);
  });

  it('update merges fields into existing item', () => {
    const t = makeTable();

    t.apply(orderPartial([{ orderID: 'A', price: 100, qty: 10 }]));
    t.apply(orderUpdate([{ orderID: 'A', price: 150 }]));

    const snap = t.snapshot();

    expect(snap[0]).toEqual({ orderID: 'A', price: 150, qty: 10 });
  });

  it('delete removes the item', () => {
    const t = makeTable();

    t.apply(
      orderPartial([
        { orderID: 'A', price: 100 },
        { orderID: 'B', price: 200 },
      ])
    );
    t.apply(orderDelete([{ orderID: 'A' }]));

    expect(t.snapshot()).toHaveLength(1);
    expect(t.snapshot()[0]).toEqual({ orderID: 'B', price: 200 });
  });
});

// ── snapshot() isolation ──────────────────────────────────────────────────────

describe('Table — snapshot() isolation', () => {
  it('returns a deep copy', () => {
    const t = makeTable();

    t.apply(orderPartial([{ orderID: 'A', price: 100 }]));

    const snap = t.snapshot();
    snap[0]!.price = 999;

    expect(t.snapshot()[0]).toEqual({ orderID: 'A', price: 100 });
  });

  it('each snapshot() call returns a new array', () => {
    const t = makeTable();

    t.apply(orderPartial([{ orderID: 'A', price: 100 }]));

    expect(t.snapshot()).not.toBe(t.snapshot());
  });
});

// ── view() live reference ─────────────────────────────────────────────────────

describe('Table — view() live reference', () => {
  it('view() called after partial reflects live changes from subsequent deltas', () => {
    const t = makeTable();

    t.apply(orderPartial([{ orderID: 'A', price: 100 }]));

    const view = t.view();

    t.apply(orderInsert([{ orderID: 'B', price: 200 }]));
    t.apply(orderUpdate([{ orderID: 'A', price: 999 }]));

    const items = [...view.data] as TestOrder[];

    expect(items).toHaveLength(2);

    const a = items.find((i) => i.orderID === 'A')!;

    expect(a.price).toBe(999);
  });

  it('view().data is re-iterable', () => {
    const t = makeTable();

    t.apply(orderPartial([{ orderID: 'A', price: 100 }]));

    const view = t.view();

    expect([...view.data]).toHaveLength(1);
    expect([...view.data]).toHaveLength(1);
  });
});
