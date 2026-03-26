import { z } from 'zod';
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

// ── Bespoke schemas for undocumented / schema-less tables ────────────────────

const CsaStateSchema = z.object({
  account:                      z.number(),
  valuationCurrency:            z.string().optional(),
  maintMarginRatio:             z.number().optional(),
  maintMarginRatioMarginCall:   z.number().optional(),
  maintMarginRatioLiquidation:  z.number().optional(),
  maintMarginRatioStatus:       z.string().optional(),
  marginBalance:                z.number().optional(),
  marginBalanceMarginCall:      z.number().optional(),
  marginBalanceLiquidation:     z.number().optional(),
  marginBalanceStatus:          z.string().optional(),
  overallStatus:                z.string().optional(),
  liquidationDeadline:          z.string().optional(),
  timestamp:                    z.string().optional(),
});

const IsolationSchema = z.object({
  account:     z.number(),
  symbol:      z.string(),
  crossMargin: z.boolean().optional(),
});

const MamAllocationSchema = z.object({
  account:        z.number(),
  marginCurrency: z.string(),
  allocations:    z.array(z.object({ type: z.string(), amount: z.number() })).optional(),
  timestamp:      z.string().optional(),
});

const VoucherSchema = z.object({
  account:         z.number().optional(),
  voucherId:       z.string(),
  currency:        z.string().optional(),
  balance:         z.number().optional(),
  expiry:          z.string().optional(),
  voucherType:     z.string().optional(),
  transactTime:    z.string().optional(),
  timestamp:       z.string().optional(),
  masterVoucherId: z.string().optional(),
});

// ── Table → Zod schema mapping ───────────────────────────────────────────────
//
// Maps each BitmexTable to the Zod schema that validates its items.
// Tables without a REST API equivalent (OrderBook10, Transact) have no schema.

export const tableSchemas: Partial<Record<BitmexTable, ZodType>> = {
  [BitmexTable.Announcement]: AnnouncementGetResponseItem,
  [BitmexTable.Affiliate]: UserAffiliatesGetResponseItem,
  [BitmexTable.Chat]: ChatGetResponseItem,
  [BitmexTable.Connected]: ChatGetConnectedResponse,
  [BitmexTable.CsaState]: CsaStateSchema,
  [BitmexTable.Execution]: ExecutionGetResponseItem,
  [BitmexTable.Funding]: FundingGetResponseItem,
  [BitmexTable.Instrument]: InstrumentGetResponseItem,
  [BitmexTable.Insurance]: InsuranceGetResponseItem,
  [BitmexTable.Isolation]: IsolationSchema,
  [BitmexTable.Leverage]: PositionGetResponseItem,
  [BitmexTable.Liquidation]: LiquidationGetResponseItem,
  [BitmexTable.MamAllocation]: MamAllocationSchema,
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
  // BitMEX spec marks trdMatchID as required, but real data frequently omits it.
  [BitmexTable.Trade]: TradeGetResponseItem.extend({ trdMatchID: TradeGetResponseItem.shape.trdMatchID.optional() }),
  [BitmexTable.TradeBin1m]: TradeGetBucketedResponseItem,
  [BitmexTable.TradeBin5m]: TradeGetBucketedResponseItem,
  [BitmexTable.TradeBin1h]: TradeGetBucketedResponseItem,
  [BitmexTable.TradeBin1d]: TradeGetBucketedResponseItem,
  [BitmexTable.Voucher]: VoucherSchema,
  [BitmexTable.Wallet]: UserGetWalletResponse,
};
