import cloneDeep from 'lodash.clonedeep';
import type { BitmexTableType, DeltaMessage, TableState } from './types.js';
import { makeIndexKey } from './keys.js';

/**
 * These tables always yield empty partials from BitMEX upon subscription.
 *
 * NOTE: if wsPartialMode=false, these tables will still accumulate normally, up to defined cap.
 */
const EMPTY_PARTIALS = [
  'announcement',
  'chat',
  'execution',
  'leverage',
  'privateNotifications',
  'publicNotifications',
  'transact',
];

/**
 * Apply an insert/update/delete delta to existing state. Mutates state in place.
 */
export function applyDelta<T extends BitmexTableType>(
  state: TableState<T>,
  message: DeltaMessage<T>,
  maxItems: number,
  wsPartialMode: boolean = false,
): void {
  // These partials from the BitMEX WebSocket are always empty
  if (wsPartialMode && EMPTY_PARTIALS.includes(message.table)) return;

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
  /** For some reason, BitMEX sends updates for new transactions, instead of inserts */
  const updateShouldBeInsert = message.table === 'transact';

  switch (message.action) {
    case 'insert':
      for (const item of message.data)
        index.set(makeIndexKey(message.table, item as T, keys), item as T);
      break;

    case 'update':
      for (const item of message.data) {
        const id = makeIndexKey(message.table, item as Partial<T>, keys);
        const existing = index.get(id);

        if (existing || updateShouldBeInsert)
          Object.assign(existing ?? index.set(id, {} as T), item);
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


