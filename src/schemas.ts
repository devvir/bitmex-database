import type { ZodType } from 'zod';
import {
  AnnouncementGetResponseItem,
  ChatGetConnectedResponse,
  ChatGetResponseItem,
  ExecutionGetResponseItem,
  FundingGetResponseItem,
  GlobalNotificationGetResponseItem,
  InstrumentGetResponseItem,
  InsuranceGetResponseItem,
  LiquidationGetResponseItem,
  OrderBookGetL2ResponseItem,
  OrderGetOrdersResponseItem,
  PositionGetResponseItem,
  QuoteGetBucketedResponseItem,
  QuoteGetResponseItem,
  SettlementGetResponseItem,
  TradeGetBucketedResponseItem,
  TradeGetResponseItem,
  UserAffiliatesGetResponseItem,
  UserGetMarginResponse,
  UserGetWalletResponse,
} from '@devvir/bitmex-api/schemas';

import { BitmexTable } from './types.js';

// ── Table → Zod schema mapping ───────────────────────────────────────────────
//
// Maps each BitmexTable to the Zod schema that validates its items.
// Tables without a REST API equivalent (OrderBook10, Transact) have no schema.

export const tableSchemas: Partial<Record<BitmexTable, ZodType>> = {
  [BitmexTable.Announcement]: AnnouncementGetResponseItem,
  [BitmexTable.Affiliate]: UserAffiliatesGetResponseItem,
  [BitmexTable.Chat]: ChatGetResponseItem,
  [BitmexTable.Connected]: ChatGetConnectedResponse,
  [BitmexTable.Execution]: ExecutionGetResponseItem,
  [BitmexTable.Funding]: FundingGetResponseItem,
  [BitmexTable.Instrument]: InstrumentGetResponseItem,
  [BitmexTable.Insurance]: InsuranceGetResponseItem,
  [BitmexTable.Liquidation]: LiquidationGetResponseItem,
  [BitmexTable.Margin]: UserGetMarginResponse,
  [BitmexTable.Order]: OrderGetOrdersResponseItem,
  [BitmexTable.OrderBookL2]: OrderBookGetL2ResponseItem,
  [BitmexTable.OrderBookL2_25]: OrderBookGetL2ResponseItem,
  [BitmexTable.Position]: PositionGetResponseItem,
  [BitmexTable.PrivateNotification]: GlobalNotificationGetResponseItem,
  [BitmexTable.PublicNotification]: GlobalNotificationGetResponseItem,
  [BitmexTable.Quote]: QuoteGetResponseItem,
  [BitmexTable.QuoteBin1m]: QuoteGetBucketedResponseItem,
  [BitmexTable.QuoteBin5m]: QuoteGetBucketedResponseItem,
  [BitmexTable.QuoteBin1h]: QuoteGetBucketedResponseItem,
  [BitmexTable.QuoteBin1d]: QuoteGetBucketedResponseItem,
  [BitmexTable.Settlement]: SettlementGetResponseItem,
  [BitmexTable.Trade]: TradeGetResponseItem,
  [BitmexTable.TradeBin1m]: TradeGetBucketedResponseItem,
  [BitmexTable.TradeBin5m]: TradeGetBucketedResponseItem,
  [BitmexTable.TradeBin1h]: TradeGetBucketedResponseItem,
  [BitmexTable.TradeBin1d]: TradeGetBucketedResponseItem,
  [BitmexTable.Wallet]: UserGetWalletResponse,
};
