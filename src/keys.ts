import type { BitmexTable, BitmexTableType } from './types.js';

/**
 * A few insert-only tables have keys, but should still be pruned selectively in wsPartialMode,
 * usually keeping only one entry of a kind (symbol or currency). Fallback index for insert-only
 * tables without keys is symbol (if they have it), or finally empty string.
 *
 * NOTE: if wsPartialMode=false, these tables will still accumulate normally, up to defined cap.
 */
const INSERTONLY_TABLE_INDEX = {
  funding: 'symbol',      // Original: timestamp, symbol
  insurance: 'currency',  // Original: timestamp, currency
  settlement: 'symbol',   // Original: timestamp, symbol
} as Record<BitmexTable, string>;

/**
 * Build a stable index key for an item. Keyed tables join their declared key fields with `|`.
 * Insert-only tables override this with a single field (symbol or currency) so only the latest
 * entry per kind is retained in wsPartialMode. Falls back to the item's symbol, or empty string.
 */
export function makeIndexKey<T extends BitmexTableType>(
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

/**
 * Whether a table has insert-only semantics — either no declared keys, or one of the special
 * tables that have keys but should still be pruned by symbol/currency.
 */
export function isInsertOnlyTable(table: BitmexTable, keys: (keyof any & string)[]): boolean {
  return keys.length === 0 || table in INSERTONLY_TABLE_INDEX;
}
