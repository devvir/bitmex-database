import type { components } from '@devvir/bitmex-api/types';

// ── BitMEX schema shorthands ─────────────────────────────────────────────────

type Schema = components['schemas'];

// ── Types for tables that have no REST API equivalent ────────────────────────

/** Connected users summary. Emitted as a partial-only stream on each tick. */
interface Connected {
  id: number;
  users: number;
  bots: number;
}

/** 10-level aggregated order book (bids/asks as price+size pairs). */
interface OrderBook10 {
  symbol: string;
  bids: [number, number][];
  asks: [number, number][];
}

// ── Table name enum ───────────────────────────────────────────────────────────

export enum BitmexTable {
  Announcement = 'announcement',
  Affiliate = 'affiliate',
  Chat = 'chat',
  Connected = 'connected',
  Execution = 'execution',
  Funding = 'funding',
  Instrument = 'instrument',
  Insurance = 'insurance',
  Liquidation = 'liquidation',
  Margin = 'margin',
  Order = 'order',
  OrderBook10 = 'orderBook10',
  OrderBookL2 = 'orderBookL2',
  OrderBookL2_25 = 'orderBookL2_25',
  Position = 'position',
  PrivateNotification = 'privateNotifications',
  PublicNotification = 'publicNotifications',
  Quote = 'quote',
  QuoteBin1m = 'quoteBin1m',
  QuoteBin5m = 'quoteBin5m',
  QuoteBin1h = 'quoteBin1h',
  QuoteBin1d = 'quoteBin1d',
  Settlement = 'settlement',
  Trade = 'trade',
  TradeBin1m = 'tradeBin1m',
  TradeBin5m = 'tradeBin5m',
  TradeBin1h = 'tradeBin1h',
  TradeBin1d = 'tradeBin1d',
  Transact = 'transact',
  Wallet = 'wallet',
}

// ── Table → item type mapping ─────────────────────────────────────────────────

export type TableTypeMap = {
  [BitmexTable.Announcement]: Schema['Announcement'];
  [BitmexTable.Affiliate]: Schema['Affiliate'];
  [BitmexTable.Chat]: Schema['Chat'];
  [BitmexTable.Connected]: Connected;
  [BitmexTable.Execution]: Schema['Execution'];
  [BitmexTable.Funding]: Schema['Funding'];
  [BitmexTable.Instrument]: Schema['Instrument'];
  [BitmexTable.Insurance]: Schema['Insurance'];
  [BitmexTable.Liquidation]: Schema['Liquidation'];
  [BitmexTable.Margin]: Schema['Margin'];
  [BitmexTable.Order]: Schema['Order'];
  [BitmexTable.OrderBook10]: OrderBook10;
  [BitmexTable.OrderBookL2]: Schema['OrderBookL2'];
  [BitmexTable.OrderBookL2_25]: Schema['OrderBookL2'];
  [BitmexTable.Position]: Schema['Position'];
  [BitmexTable.PrivateNotification]: Schema['GlobalNotification'];
  [BitmexTable.PublicNotification]: Schema['GlobalNotification'];
  [BitmexTable.Quote]: Schema['Quote'];
  [BitmexTable.QuoteBin1m]: Schema['Quote'];
  [BitmexTable.QuoteBin5m]: Schema['Quote'];
  [BitmexTable.QuoteBin1h]: Schema['Quote'];
  [BitmexTable.QuoteBin1d]: Schema['Quote'];
  [BitmexTable.Settlement]: Schema['Settlement'];
  [BitmexTable.Trade]: Schema['Trade'];
  [BitmexTable.TradeBin1m]: Schema['Trade'];
  [BitmexTable.TradeBin5m]: Schema['Trade'];
  [BitmexTable.TradeBin1h]: Schema['Trade'];
  [BitmexTable.TradeBin1d]: Schema['Trade'];
  [BitmexTable.Transact]: Schema['Transaction'];
  [BitmexTable.Wallet]: Schema['Wallet'];
};

// ── Message types ─────────────────────────────────────────────────────────────

/**
 * A BitMEX WebSocket message. T is the full item type for the table.
 *
 * Discriminated on `action`:
 * - `partial`  — first message for a table; includes `keys` and `types` metadata
 * - `insert`   — new items
 * - `update`   — partial item patches (key fields + changed fields only)
 * - `delete`   — key fields only, identifies items to remove
 */
export type BitmexMessage<T = Record<string, unknown>> =
  | {
      table: string;
      action: 'partial';
      keys: (keyof T & string)[];
      types: Record<string, string>;
      data: T[];
    }
  | {
      table: string;
      action: 'insert';
      data: T[];
    }
  | {
      table: string;
      action: 'update' | 'delete';
      data: Partial<T>[];
    };

// ── Public API types ──────────────────────────────────────────────────────────

/** Returned by `.view()`. Items are read-only; the iterable is live (no copy). */
export interface TableView<T> {
  table: BitmexTable;
  keys: (keyof T & string)[];
  types: Record<string, string>;
  data: Iterable<Readonly<T>>;
}

/** A single-table accumulator. */
export interface Table<T> {
  apply(message: BitmexMessage<T>): void;
  snapshot(): T[];
  view(): TableView<T>;
}

/** All accumulated tables keyed by table name. Only tables that have received a partial are present. */
export type DatabaseSnapshot = {
  [K in BitmexTable]?: TableTypeMap[K][];
};

/** A multi-table accumulator. Routes messages by table name. */
export interface Database {
  apply(message: BitmexMessage): void;
  snapshot(): DatabaseSnapshot;
  snapshot<K extends BitmexTable>(table: K): TableTypeMap[K][];
  view<K extends BitmexTable>(table: K): TableView<TableTypeMap[K]>;
}
