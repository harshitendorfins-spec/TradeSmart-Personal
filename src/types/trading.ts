export type InstrumentType = 'INDEX' | 'FUT' | 'CE' | 'PE' | 'COMMODITY' | 'STOCK';
export type ExchangeType = 'NSE' | 'BSE' | 'MCX';
export type MarketSegment = 'NSE_FO' | 'BSE_FO' | 'MCX_COMMODITY' | 'NSE_EQ';
export type TransactionType = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT';
export type ProductType = 'MIS' | 'NRML';
export type OrderStatus = 'COMPLETE' | 'REJECTED' | 'OPEN' | 'CANCELLED';

export interface SetupItem {
  id: string;
  name: string;
  description?: string;
  color?: string;
  createdAt: string;
  definedCapital?: number;   // Defined/allocated capital for this setup (e.g. ₹20,00,000)
  deployedMargin?: number;   // Realtime margin deployed in active open positions
  remainingCapital?: number; // definedCapital - deployedMargin
  tradesCount: number;
  winCount: number;
  lossCount: number;
  totalPnl: number;
  realizedPnl: number;
  unrealizedPnl?: number;
  winRate: number;      // in percentage
  avgWin?: number;      // Average profit in ₹ on winning trades
  avgLoss?: number;     // Average loss in ₹ on losing trades
  sharpeRatio?: number; // Sharpe ratio
  profitFactor: number; // gross win / gross loss
  riskReward: number;   // avg win / avg loss
  roi: number;          // return on margin allocated
  maxDrawdown: number;
}

export interface OptionGreeks {
  price: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  iv: number;
}

export interface MarketQuote {
  symbol: string;
  name?: string;
  ltp: number;
  prevClose: number;
  change: number;
  pchange: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  lotSize: number;
  type: InstrumentType;
  exchange: ExchangeType;
  segment: MarketSegment;
  underlying: string;
  strike?: number;
  expiry?: string;
  greeks?: OptionGreeks;
  flash?: 'up' | 'down' | null;
}

export interface DepthRow {
  price: number;
  orders: number;
  quantity: number;
}

export interface MarketDepth {
  bids: DepthRow[];
  asks: DepthRow[];
  totalBuyQty: number;
  totalSellQty: number;
}

export interface OrderItem {
  id: string;
  symbol: string;
  exchange: ExchangeType;
  transactionType: TransactionType;
  orderType: OrderType;
  product: ProductType;
  quantity: number;
  price: number;
  triggerPrice?: number;
  stopLoss?: number;
  averagePrice: number;
  status: OrderStatus;
  statusMessage?: string;
  strategyTag: string; // The selected setup name
  placedAt: string;
  completedAt?: string;
  parentPositionId?: string; // Linked position ID for SL / Target
  isStopLoss?: boolean;      // True if order is Stop Loss trigger
  isTarget?: boolean;        // True if order is Target limit
}

export interface PositionItem {
  id: string;
  symbol: string;
  exchange: ExchangeType;
  product: ProductType;
  quantity: number; // positive = long, negative = short, 0 = closed
  buyAvgPrice: number;
  sellAvgPrice: number;
  lastPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  strategyTag: string; // The setup name
  lotSize: number;
  underlying: string;
  updatedAt: string;
  change?: number;
  pchange?: number;
  exitPrice?: number;
  status?: 'OPEN' | 'CLOSED';
  closedAt?: string;
  slPrice?: number;          // Active SL price set from Positions tab
  targetPrice?: number;      // Active Target price set from Positions tab
  slOrderId?: string;
  targetOrderId?: string;
}

export interface PositionGroup {
  key: string;
  title: string;
  underlying: string;
  strategyTag: string;
  positions: PositionItem[];
  totalUnrealizedPnl: number;
  totalRealizedPnl: number;
  standaloneMargin: number;
  hedgedMargin: number;
  marginBenefit: number;
  netQty: number;
}

export interface LedgerItem {
  id: number;
  timestamp: string;
  particulars: string;
  voucherType: 'DEPOSIT' | 'TRADE' | 'REALIZED_PNL' | 'CHARGES' | 'SQUARE_OFF';
  debit: number;
  credit: number;
  runningBalance: number;
  referenceId: string;
}

export interface AccountFunds {
  startingCapital: number;
  availableCash: number;
  usedMargin: number;
  grossMargin: number;
  hedgeDiscount: number;
  realizedPnl: number;
  unrealizedPnl: number;
  netPnl: number;
}

export interface SmartAPIConfig {
  apiKey: string;
  clientId: string;
  pin: string;
  totpSecret: string;
  isActive: boolean;
  mode: 'SIMULATOR' | 'SMARTAPI_LIVE';
  lastConnectedAt?: string;
  fetchedInstrumentsCount?: number;
}

export interface LicenseInfo {
  machine_id: string;
  is_active: boolean;
  status: 'PRO_ACTIVE' | 'TRIAL_ACTIVE' | 'EXPIRED' | 'UNLICENSED';
  plan: 'YEAR' | 'MONTH' | 'LIFETIME' | 'TRIAL' | 'NONE';
  expiry_date: string;
  days_left: number;
  can_start_trial: boolean;
  message: string;
}
