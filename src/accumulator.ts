import cloneDeep from 'lodash.clonedeep';
import type { BitmexTable, BitmexTableType, DeltaMessage, PartialMessage, TableState } from './types.js';

/**
 * A few insert-only tables have keys, but should still be pruned selectively in wsPartialMode,
 * usually keeping only one entry of a kind (symbol or currency). Fallback index for insert-only
 * tables without keys is symbol (if they have it), or finally empty string.
 *
 * Notice that if wsPartialMode=false, insert-only tables will just accumulate up to defined cap.
 */
const INSERTONLY_TABLE_INDEX = {
  funding: 'symbol',      // Original: timestamp, symbol
  insurance: 'currency',  // Original: timestamp, currency
  settlement: 'symbol',   // Original: timestamp, symbol
} as Record<BitmexTable, string>;

/**
 * Build initial state from a message with action=partial.
 */
export function newState<T extends BitmexTableType>(
  message: PartialMessage<T>,
  wsPartialMode: boolean = false,
): TableState<T> {
  const { table, keys, types, data } = message;

  /** Insert-only tables accumulate (up to max size) in non-wsPartial mode */
  if (isInsertOnlyTable(table, keys) && ! wsPartialMode)
    return { table, keys, types, data: data as T[] };

  /**
   * Tables with update/delete (always), and insert-only tables in wsPartialMode are indexed
   *   - update/delete: for performant lookups and updates
   *   - insert-only: for trivial last-item replacement
   */
  const index = new Map<string, T>();

  for (const item of data)
    index.set(makeIndexKey(table, item, keys), item as T);

  return { table, keys, types, data: index };
}

/**
 * Apply an insert/update/delete delta to existing state. Mutates state in place.
 */
export function applyDelta<T extends BitmexTableType>(
  state: TableState<T>,
  message: DeltaMessage<T>,
  maxItems: number,
  wsPartialMode: boolean = false,
): void {
  // Announcement and Chat partials from the BitMEX WebSocket are always empty
  if (wsPartialMode && ['announcement', 'chat'].includes(message.table)) return;

  // BitMEX WebSocket bug: sometimes update and delete messages are sent to tables without keys
  if (state.keys.length === 0 && message.action !== 'insert') return;

  return state.data instanceof Map
    ? applyIndexed(state.data as Map<string, T>, state.keys, message)
    : applyNonIndexed(state.data as T[], message, maxItems);
}

// ── Public: snapshot + view helpers ──────────────────────────────────────────

/**
 * Return a deep copy of the state as a plain array. Safe to mutate freely.
 */
export function toSnapshot<T>(state: TableState<T>): T[] {
  const items = state.data instanceof Map
    ? Array.from(state.data.values())
    : state.data;

  return cloneDeep(items);
}

/**
 * Return a re-iterable over the live data. Each for...of yields a fresh
 * iterator over the current contents of state.data — no copy is taken.
 */
export function toIterable<T>(state: TableState<T>): Iterable<Readonly<T>> {
  return {
    [Symbol.iterator]() {
      if (state.data instanceof Map)
        return state.data.values();

      return state.data[Symbol.iterator]();
    },
  };
}

// ── Private: accumulators ─────────────────────────────────────────────────────

/**
 * Tables with keys (e.g. orderBookL2) apply inserts, updates and deletes in the traditional way, never
 * capping the max size nor "picking" what stays in any way: BitMex messages drive the state.
 *
 * Insert-only tables on wsPartialMode simulate keys (symbol or currency) to keep only most recent entry.
 */
function applyIndexed<T extends BitmexTableType>(
  index: Map<string, T>,
  keys: (keyof T & string)[],
  message: DeltaMessage<T>,
): void {
  switch (message.action) {
    case 'insert':
      for (const item of message.data)
        index.set(makeIndexKey(message.table, item as T, keys), item as T);
      break;

    case 'update':
      for (const item of message.data) {
        const id = makeIndexKey(message.table, item as Partial<T>, keys);
        const existing = index.get(id);

        if (existing)
          Object.assign(existing, item);
        else
          console.warn(`Received update for non-existing item in table ${message.table}.`);
      }
      break;
    case 'delete':
      for (const item of message.data) {
        index.delete(makeIndexKey(message.table, item as Partial<T>, keys));
      }
      break;
  }
}

/**
 * Accumulate up to maxItems on insert-only tables. For use cases where we want to hold on to
 * a certain amount of most recent items from these tables (configurable max size).
 *
 * NOTE: to minimize overhead, purging is done when size reaches 120% of stated cap.
 */
function applyNonIndexed<T extends BitmexTableType>(data: T[], message: DeltaMessage<T>, maxItems: number): void {
  if (message.action !== 'insert')
    return console.warn(`Invalid action ${message.action} for non-keyed table ${message.table}.`);

  data.push(...(message.data as T[]));

  if (data.length > maxItems * 1.2)
    data.splice(0, data.length - maxItems);
}

// ── Private: helpers ──────────────────────────────────────────────────────────

function isInsertOnlyTable(table: BitmexTable, keys: (keyof any & string)[]): boolean {
  return keys.length === 0 || table in INSERTONLY_TABLE_INDEX;
}

function makeIndexKey<T extends BitmexTableType>(
  table: BitmexTable,
  item: T | Partial<T>,
  keys: (keyof T & string)[],
): string {
  const fallback = 'symbol' in item ? item.symbol as string : '';
  const indexKeys = table in INSERTONLY_TABLE_INDEX
    ? [ INSERTONLY_TABLE_INDEX[table] as (keyof T & string) ]
    : keys;

  return indexKeys.map((k) => item[k]).join('|') || fallback;
}
