import cloneDeep from 'lodash.clonedeep';
import type { DeltaMessage, PartialMessage, TableState } from './types.js';

// ── Public: state factories ───────────────────────────────────────────────────

/** Build initial state from a partial message. */
export function newState<T>(message: PartialMessage<T>): TableState<T> {
  const { table, keys, types, data } = message;

  if (keys.length === 0) {
    return { table, keys, types, data: [...data] };
  }

  const index = new Map<string, T>();

  for (const item of data) {
    index.set(makeKey(item, keys), item);
  }

  return { table, keys, types, data: index };
}

/** Apply an insert/update/delete delta to existing state. Mutates state in place. */
export function applyDelta<T>(state: TableState<T>, message: DeltaMessage<T>): void {
  if (state.data instanceof Map) {
    applyKeyed(state.data, state.keys, message);
  } else {
    applyInsertOnly(state, message);
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
        return state.data.values();
      }

      return state.data[Symbol.iterator]();
    },
  };
}

// ── Private: helpers ──────────────────────────────────────────────────────────

function makeKey<T>(item: T | Partial<T>, keys: (keyof T & string)[]): string {
  return keys.map((k) => String(item[k])).join('|');
}

function applyKeyed<T>(index: Map<string, T>, keys: (keyof T & string)[], message: DeltaMessage<T>): void {
  if (message.action === 'insert') {
    for (const item of message.data) {
      index.set(makeKey(item, keys), item);
    }
  } else if (message.action === 'update') {
    for (const item of message.data) {
      const id = makeKey(item, keys);
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
      index.delete(makeKey(item, keys));
    }
  }
}

function symbolKey<T>(item: T): string {
  if (typeof item === 'object' && item !== null && 'symbol' in item && typeof item.symbol === 'string') {
    return item.symbol;
  }

  return '';
}

function applyInsertOnly<T>(state: TableState<T>, message: DeltaMessage<T>): void {
  if (message.action !== 'insert') return;

  if (! state.symbolIndex)
    state.symbolIndex = new Map<string, T>();

  for (const item of state.data)
    state.symbolIndex.set(symbolKey(item), item as T);

  state.data = [...state.symbolIndex.values()];
}
