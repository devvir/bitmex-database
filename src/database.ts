import type {
  BitmexFieldType,
  BitmexMessage,
  BitmexTable,
  Database as IDatabase,
  DatabaseSnapshot,
  StoredTable,
  Table,
  TableTypeMap,
  TableView,
} from './types.js';
import { createTable } from './table.js';

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a multi-table accumulator. Routes each incoming message to the
 * correct internal table automatically. Only tables that have received a
 * partial are present in snapshots.
 *
 * @param capOnInsertOnly Maximum items to keep for insert-only tables (default: 10,000).
 *                         Only applies when wsPartialMode is false.
 */
export function createDatabase(capOnInsertOnly: number = 10_000): IDatabase {
  return new Database(capOnInsertOnly);
}

// ── Database ──────────────────────────────────────────────────────────────────

class Database implements IDatabase {
  readonly #tables = new Map<BitmexTable, StoredTable>();
  readonly #capOnInsertOnly: number;

  constructor(capOnInsertOnly: number = 10_000) {
    this.#capOnInsertOnly = capOnInsertOnly;
  }

  #getTable<K extends BitmexTable>(name: K): Table<TableTypeMap[K]> | undefined {
    return this.#tables.get(name) as unknown as Table<TableTypeMap[K]> | undefined;
  }

  apply(message: BitmexMessage, wsPartialMode: boolean = false): void {
    const name = message.table;

    if (message.action === 'partial' && ! this.#tables.has(name)) {
      this.#tables.set(name, createTable(name, this.#capOnInsertOnly) as unknown as StoredTable);
    }

    const table = this.#tables.get(name);

    if (! table) return;

    table.apply(message, wsPartialMode);
  }

  snapshot(): DatabaseSnapshot;
  snapshot<K extends BitmexTable>(tableName: K): TableTypeMap[K][];
  snapshot<K extends BitmexTable>(tableName?: K): DatabaseSnapshot | TableTypeMap[K][] {
    if (tableName !== undefined) {
      const table = this.#getTable(tableName);

      return table ? table.snapshot() : [];
    }

    const result: DatabaseSnapshot = {};

    for (const [key, table] of this.#tables) {
      (result as Record<string, unknown[]>)[key] = table.snapshot();
    }

    return result;
  }

  view<K extends BitmexTable>(tableName: K): TableView<TableTypeMap[K]> {
    const table = this.#getTable(tableName);

    if (! table) {
      return {
        table: tableName,
        keys: [],
        types: {} as Record<keyof TableTypeMap[K] & string, BitmexFieldType>,
        data: {
          [Symbol.iterator]() { return [][Symbol.iterator](); },
        },
      };
    }

    return table.view();
  }
}
