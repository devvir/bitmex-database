import type {
  BitmexFieldType,
  BitmexMessage,
  BitmexTable,
  Table as ITable,
  TableTypeMap,
  TableView,
  TableState,
  BitmexTableType,
} from './types.js';
import { applyDelta, newState, toIterable, toSnapshot } from './accumulator.js';
import { tableSchemas } from './schemas.js';

import type { ZodType } from 'zod';

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a single-table accumulator typed to the corresponding BitMEX item type.
 *
 * ```typescript
 * const orders = createTable(BitmexTable.Order)    // Table<Order>
 * const book   = createTable(BitmexTable.OrderBookL2) // Table<OrderBookL2>
 * ```
 *
 * @param tableName The BitMEX table name
 * @param capOnInsertOnly Maximum items to keep for insert-only tables when wsPartialMode is false (default: 10,000)
 */
export function createTable<K extends BitmexTable>(tableName: K, capOnInsertOnly: number = 10_000): ITable<TableTypeMap[K]> {
  return new Table<TableTypeMap[K]>(tableName, capOnInsertOnly);
}

// ── Table ─────────────────────────────────────────────────────────────────────

class Table<T extends BitmexTableType> implements ITable<T> {
  readonly #name: BitmexTable;
  readonly #schema: ZodType | undefined;
  readonly #capOnInsertOnly: number;
  #state: TableState<T> | null = null;

  constructor(name: BitmexTable, capOnInsertOnly: number = 10_000) {
    this.#name = name;
    this.#schema = tableSchemas[name];
    this.#capOnInsertOnly = capOnInsertOnly;
  }

  apply(message: BitmexMessage<T>, wsPartialMode: boolean = false): void {
    this.#validate(message);

    if (message.action === 'partial') {
      this.#state = newState<T>(message, wsPartialMode);
      return;
    }

    if (! this.#state) return;

    applyDelta(this.#state, message, this.#capOnInsertOnly, wsPartialMode);
  }

  #validate(message: BitmexMessage<T>): void {
    if (! this.#schema) return;
    if (message.action === 'update' || message.action === 'delete') return;

    const data = message.data as T[];
    const valid: T[] = [];

    for (const item of data) {
      const result = this.#schema.safeParse(item);

      if (result.success) {
        valid.push(item);
      } else {
        console.warn(`[bitmex-database] ${this.#name}: dropped invalid item`, result.error);
      }
    }

    message.data = valid;
  }

  snapshot(): T[] {
    if (!this.#state) return [];

    return toSnapshot(this.#state);
  }

  view(): TableView<T> {
    const state = this.#state;

    if (! state) {
      return {
        table: this.#name,
        keys: [],
        types: {} as Record<keyof T & string, BitmexFieldType>,
        data: {
          [Symbol.iterator](): Iterator<Readonly<T>> {
            return [][Symbol.iterator]();
          },
        },
      };
    }

    return {
      table: state.table,
      keys: state.keys,
      types: state.types,
      data: toIterable<T>(state),
    };
  }
}
