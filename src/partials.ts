import type { BitmexTableType, PartialMessage, TableState } from './types.js';
import { isInsertOnlyTable, makeIndexKey } from './keys.js';

/**
 * Initialise or update table state from a `partial` message.
 *
 * - With no prior state, or an unfiltered partial, builds a fresh state from the message data
 *   (replacing any prior state).
 * - With prior state and a non-empty filter (e.g. `{ symbol: 'XBTUSD' }`), only entries matching
 *   the filter are replaced — entries for other filter values are left intact. This handles
 *   BitMEX's per-symbol partial delivery for multi-symbol subscriptions (e.g. `orderBookL2`,
 *   `instrument`).
 *
 * On the merge path, `state` is mutated in place and returned. On the fresh-build path, a new
 * state object is returned.
 */
export function applyPartial<T extends BitmexTableType>(
  state: TableState<T> | null,
  message: PartialMessage<T>,
  wsPartialMode: boolean = false,
): TableState<T> {
  if (! state || ! hasFilter(message.filter))
    return newState(message, wsPartialMode);

  mergePartial(state, message);

  return state;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build initial state from a partial message. Insert-only tables in non-wsPartial mode use a
 * plain array (accumulation); everything else uses an indexed Map.
 */
function newState<T extends BitmexTableType>(
  message: PartialMessage<T>,
  wsPartialMode: boolean,
): TableState<T> {
  const { table, keys, types, data } = message;

  if (isInsertOnlyTable(table, keys) && ! wsPartialMode)
    return { table, keys, types, data: data as T[] };

  const index = new Map<string, T>();

  for (const item of data)
    index.set(makeIndexKey(table, item, keys), item as T);

  return { table, keys, types, data: index };
}

/**
 * Merge a filtered partial into existing state. Removes entries whose fields match every
 * key/value in `message.filter`, then inserts the new data in their place. Mutates state.
 */
function mergePartial<T extends BitmexTableType>(
  state: TableState<T>,
  message: PartialMessage<T>,
): void {
  const filterEntries = Object.entries(message.filter ?? {}) as [keyof T & string, unknown][];

  if (state.data instanceof Map) {
    for (const [key, item] of state.data) {
      if (filterEntries.every(([k, v]) => item[k] === v))
        state.data.delete(key);
    }

    for (const item of message.data)
      state.data.set(makeIndexKey(state.table, item as T, state.keys), item as T);
  } else {
    const arr = state.data as T[];
    const keep = arr.filter(item => ! filterEntries.every(([k, v]) => item[k] === v));

    arr.length = 0;
    arr.push(...keep, ...(message.data as T[]));
  }
}

function hasFilter(filter: Record<string, unknown> | undefined): boolean {
  return filter != null && Object.keys(filter).length > 0;
}
