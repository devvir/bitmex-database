import cloneDeep from 'lodash.clonedeep';

import type { BitmexMessage } from './types.js';

// ── Private: message variant aliases ─────────────────────────────────────────

type PartialMsg<T> = Extract<BitmexMessage<T>, { action: 'partial' }>;
type DeltaMsg<T> = Exclude<BitmexMessage<T>, { action: 'partial' }>;

// ── Private: constants ────────────────────────────────────────────────────────

const MAX_ITEMS = 10_000;

// ── Public: state shape ───────────────────────────────────────────────────────

/** Internal state for a single table. Exported for use by table.ts only — not public API. */
export interface TableState<T> {
  table: string;
  keys: string[];
  types: Record<string, string>;
  /** Keyed tables use Map<compositeKey, item>; insert-only tables use T[]. */
  data: Map<string, T> | T[];
}

// ── Public: state factories ───────────────────────────────────────────────────

/** Build initial state from a partial message. */
export function newState<T>(message: PartialMsg<T>): TableState<T> {
  const { table, keys, types, data } = message;

  if (keys.length === 0) {
    return { table, keys, types, data: [...data] };
  }

  const index = new Map<string, T>();

  for (const item of data) {
    index.set(makeKey(item as Record<string, unknown>, keys), item);
  }

  return { table, keys, types, data: index };
}

/** Apply an insert/update/delete delta to existing state. Mutates state in place. */
export function applyDelta<T>(state: TableState<T>, message: DeltaMsg<T>): void {
  if (state.data instanceof Map) {
    applyKeyed(state.data, state.keys, message);
  } else {
    applyInsertOnly(state.data, message);
  }
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
        return state.data.values() as IterableIterator<Readonly<T>>;
      }

      return (state.data as T[])[Symbol.iterator]() as Iterator<Readonly<T>>;
    },
  };
}

// ── Private: helpers ──────────────────────────────────────────────────────────

function makeKey(item: Record<string, unknown>, keys: string[]): string {
  return keys.map((k) => String(item[k])).join('|');
}

function applyKeyed<T>(index: Map<string, T>, keys: string[], message: DeltaMsg<T>): void {
  if (message.action === 'insert') {
    for (const item of message.data) {
      index.set(makeKey(item as Record<string, unknown>, keys), item);
    }
  } else if (message.action === 'update') {
    for (const item of message.data) {
      const id = makeKey(item as Record<string, unknown>, keys);
      const existing = index.get(id);

      if (existing) {
        Object.assign(existing as Record<string, unknown>, item);
      } else {
        index.set(id, item as unknown as T);
      }
    }
  } else {
    for (const item of message.data) {
      index.delete(makeKey(item as Record<string, unknown>, keys));
    }
  }
}

function applyInsertOnly<T>(data: T[], message: DeltaMsg<T>): void {
  if (message.action !== 'insert') return;

  data.push(...message.data);

  if (data.length > MAX_ITEMS * 1.1) {
    data.splice(0, data.length - MAX_ITEMS);
  }
}
