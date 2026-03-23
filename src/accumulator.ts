import cloneDeep from 'lodash.clonedeep';
import type { BitmexTableType, DeltaMessage, PartialMessage, TableState } from './types.js';

/** Build initial state from a partial message. */
export function newState<T extends BitmexTableType>(message: PartialMessage<T>, wsPartialMode: boolean = false): TableState<T> {
  const { table, keys, types, data } = message;

  if (keys.length === 0 && ! wsPartialMode) {
    return { table, keys, types, data: data as T[] };
  }

  const index = new Map<string, T>();

  for (const item of data) {
    const indexingKey = keys.length ? keys : ['symbol'] as (keyof T & string)[];
    index.set(makeKey(item, indexingKey), item as T);
  }

  return { table, keys, types, data: index };
}

/** Apply an insert/update/delete delta to existing state. Mutates state in place. */
export function applyDelta<T extends BitmexTableType>(
  state: TableState<T>,
  message: DeltaMessage<T>,
  wsPartialMode: boolean,
  maxItems: number,
): void {
  // Standard delta-aggregation for tables with keys (take update and or/delete deltas)
  if (state.keys.length > 0)
    applyKeyed(state.data as Map<string, T>, state.keys, message);

  // BitMEX websocket partials mode: non-keyed (insert-only) tables keep 0-1 items per symbol (most recent)
  else if (wsPartialMode)
    keepMostRecent(state.data as Map<string, T>, message);

  // Delta-server accumulation mode: non-keyed (insert-only) tables accumulate indefinitely (to a preset cap)
  else
    applyInsertOnly(state.data as T[], message, maxItems);
}

// ── Public: snapshot + view helpers ──────────────────────────────────────────

/** Return a deep copy of the state as a plain array. Safe to mutate freely. */
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
      if (state.data instanceof Map) {
        return state.data.values();
      }

      return state.data[Symbol.iterator]();
    },
  };
}

// ── Private: accumulators ─────────────────────────────────────────────────────

/**
 * Tables with keys (e.g. orderBookL2) apply inserts, updates and deletes in the traditional way, never
 * capping the max size nor "picking" what stays in any way: BitMex messages drive the state.
 */
function applyKeyed<T extends BitmexTableType>(
  index: Map<string, T>,
  keys: (keyof T & string)[],
  message: DeltaMessage<T>,
): void {
  if (message.action === 'insert') {
    for (const item of message.data) {
      index.set(makeKey(item as T, keys), item as T);
    }
  } else if (message.action === 'update') {
    for (const item of message.data) {
      const id = makeKey(item as Partial<T>, keys);
      const existing = index.get(id);

      if (existing) {
        Object.assign(existing, item);
      } else {
        // Update for unknown key — BitMEX sometimes sends updates before inserts.
        index.set(id, item as T);
      }
    }
  } else {
    for (const item of message.data) {
      index.delete(makeKey(item as Partial<T>, keys));
    }
  }
}

/**
 * Accumulate up to maxItems on insert-only tables. For use cases where we want to hold on to
 * a certain amount of most recent items from these tables (configurable max size).
 *
 * NOTE: to minimize overhead, purging is done when size reaches 120% of stated cap.
 */
function applyInsertOnly<T extends BitmexTableType>(data: T[], message: DeltaMessage<T>, maxItems: number): void {
  if (message.action !== 'insert') return;

  data.push(...(message.data as T[]));

  if (data.length > maxItems * 1.2) {
    data.splice(0, data.length - maxItems);
  }
}

/**
 * Keep at most 1 entry per symbol (the most recent), generating snapshots that mimic
 * BitMEX own partials for insert-only tables (trade, quote, bins, liquidation, etc.).
 *
 * Tables without a symbol keep a single item at most.
 */
function keepMostRecent<T extends BitmexTableType>(index: Map<string, T>, message: DeltaMessage<T>): void {
  if (message.action !== 'insert' || message.data.length === 0) return;

  const key = 'symbol' in message.data[0] ? message.data[0].symbol as string : '';

  for (const item of message.data)
    index.set(key, item as T);
}

// ── Private: helpers ──────────────────────────────────────────────────────────

function makeKey<T>(item: T | Partial<T>, keys: (keyof T & string)[]): string {
  return keys.map((k) => item[k]).join('|');
}
