import type {
  BitmexMessage,
  BitmexTable,
  Table as ITable,
  TableTypeMap,
  TableView,
} from './types.js';
import { applyDelta, newState, toIterable, toSnapshot, type TableState } from './accumulator.js';

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a single-table accumulator typed to the corresponding BitMEX item type.
 *
 * ```typescript
 * const orders = createTable(BitmexTable.Order)    // Table<Order>
 * const book   = createTable(BitmexTable.OrderBookL2) // Table<OrderBookL2>
 * ```
 */
export function createTable<K extends BitmexTable>(tableName: K): ITable<TableTypeMap[K]> {
  return new Table<TableTypeMap[K]>(tableName);
}

// ── Table ─────────────────────────────────────────────────────────────────────

class Table<T> implements ITable<T> {
  readonly #name: BitmexTable;
  #state: TableState<T> | null = null;

  constructor(name: BitmexTable) {
    this.#name = name;
  }

  apply(message: BitmexMessage<T>): void {
    if (message.action === 'partial') {
      this.#state = newState<T>(message);
      return;
    }

    if (!this.#state) return;

    applyDelta(this.#state, message);
  }

  snapshot(): T[] {
    if (!this.#state) return [];

    return toSnapshot(this.#state);
  }

  view(): TableView<T> {
    const state = this.#state;

    if (!state) {
      return {
        table: this.#name,
        keys: [],
        types: {},
        data: {
          [Symbol.iterator](): Iterator<Readonly<T>> {
            return [][Symbol.iterator]();
          },
        },
      };
    }

    return {
      table: state.table as BitmexTable,
      keys: state.keys as (keyof T & string)[],
      types: state.types,
      data: toIterable<T>(state),
    };
  }
}
