import type {
  BitmexMessage,
  BitmexTable,
  Database as IDatabase,
  DatabaseSnapshot,
  Table,
  TableTypeMap,
  TableView,
} from './types.js';
import { createTable } from './table.js';

// ── StoredTable ───────────────────────────────────────────────────────────────

/** Minimal interface for heterogeneous table storage. Only what Database needs internally. */
interface StoredTable {
  apply(message: BitmexMessage): void;
  snapshot(): unknown[];
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a multi-table accumulator. Routes each incoming message to the
 * correct internal table automatically. Only tables that have received a
 * partial are present in snapshots.
 */
export function createDatabase(): IDatabase {
  return new Database();
}

// ── Database ──────────────────────────────────────────────────────────────────

class Database implements IDatabase {
  readonly #tables = new Map<BitmexTable, StoredTable>();

  #getTable<K extends BitmexTable>(name: K): Table<TableTypeMap[K]> | undefined {
    return this.#tables.get(name) as unknown as Table<TableTypeMap[K]> | undefined;
  }

  apply(message: BitmexMessage): void {
    const name = message.table as BitmexTable;

    if (message.action === 'partial' && !this.#tables.has(name)) {
      this.#tables.set(name, createTable(name) as unknown as StoredTable);
    }

    const table = this.#tables.get(name);

    if (!table) return;

    table.apply(message);
  }

  snapshot(): DatabaseSnapshot;
  snapshot<K extends BitmexTable>(table: K): TableTypeMap[K][];
  snapshot<K extends BitmexTable>(table?: K): DatabaseSnapshot | TableTypeMap[K][] {
    if (table !== undefined) {
      const t = this.#getTable(table);

      return t ? t.snapshot() : [];
    }

    const result: DatabaseSnapshot = {};

    for (const [key, t] of this.#tables) {
      (result as Record<string, unknown[]>)[key] = t.snapshot();
    }

    return result;
  }

  view<K extends BitmexTable>(table: K): TableView<TableTypeMap[K]> {
    const t = this.#getTable(table);

    if (!t) {
      return {
        table: table,
        keys: [],
        types: {},
        data: {
          [Symbol.iterator]() {
            return [][Symbol.iterator]();
          },
        },
      };
    }

    return t.view();
  }
}
