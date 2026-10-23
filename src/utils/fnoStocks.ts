import fnoData from './fno_stocks_data.json';
import { MarketQuote } from '../types/trading';

export interface FnoStockMeta {
  symbol: string;
  name: string;
  lotSize: number;
  strikeStep: number;
  basePrice: number;
  minStrike: number;
  maxStrike: number;
}

export interface IndexMeta {
  symbol: string;
  name: string;
  lotSize: number;
  strikeStep: number;
  basePrice: number;
  minStrike: number;
  maxStrike: number;
  exchange: 'NSE' | 'BSE';
  segment: 'NSE_FO' | 'BSE_FO';
}

export const INDICES_META: Record<string, IndexMeta> = {
  NIFTY: {
    symbol: 'NIFTY',
    name: 'NIFTY 50',
    lotSize: 25,
    strikeStep: 50,
    basePrice: 24850,
    minStrike: 23200,
    maxStrike: 26500,
    exchange: 'NSE',
    segment: 'NSE_FO',
  },
  BANKNIFTY: {
    symbol: 'BANKNIFTY',
    name: 'BANK NIFTY',
    lotSize: 15,
    strikeStep: 100,
    basePrice: 52120,
    minStrike: 48500,
    maxStrike: 55500,
    exchange: 'NSE',
    segment: 'NSE_FO',
  },
  FINNIFTY: {
    symbol: 'FINNIFTY',
    name: 'FINNIFTY',
    lotSize: 25,
    strikeStep: 50,
    basePrice: 23850,
    minStrike: 22200,
    maxStrike: 25400,
    exchange: 'NSE',
    segment: 'NSE_FO',
  },
  MIDCPNIFTY: {
    symbol: 'MIDCPNIFTY',
    name: 'MIDCPNIFTY',
    lotSize: 50,
    strikeStep: 25,
    basePrice: 12820,
    minStrike: 11800,
    maxStrike: 13800,
    exchange: 'NSE',
    segment: 'NSE_FO',
  },
  SENSEX: {
    symbol: 'SENSEX',
    name: 'SENSEX',
    lotSize: 10,
    strikeStep: 100,
    basePrice: 81400,
    minStrike: 78500,
    maxStrike: 84500,
    exchange: 'BSE',
    segment: 'BSE_FO',
  },
  BANKEX: {
    symbol: 'BANKEX',
    name: 'BANKEX',
    lotSize: 15,
    strikeStep: 100,
    basePrice: 58240,
    minStrike: 54500,
    maxStrike: 61500,
    exchange: 'BSE',
    segment: 'BSE_FO',
  },
};

export const FNO_STOCKS: FnoStockMeta[] = fnoData as FnoStockMeta[];

export const FNO_STOCKS_MAP: Record<string, FnoStockMeta> = {};
FNO_STOCKS.forEach((stock) => {
  FNO_STOCKS_MAP[stock.symbol.toUpperCase()] = stock;
});

export const CURRENT_EXPIRY = '19OCT';

/**
 * Normalizes input symbol strings (e.g. "BANK NIFTY" -> "BANKNIFTY", "NIFTY 50" -> "NIFTY")
 */
export function normalizeSymbolKey(raw: string): string {
  const clean = raw.trim().toUpperCase().replace(/[\s\-_]+/g, '');
  if (clean === 'NIFTY50' || clean === 'NIFTY') return 'NIFTY';
  if (clean === 'NIFTYBANK' || clean === 'BANKNIFTY') return 'BANKNIFTY';
  if (clean === 'FINNIFTY' || clean === 'NIFTYFINSERVICE') return 'FINNIFTY';
  if (clean === 'MIDCPNIFTY' || clean === 'NIFTYMIDCAPSELECT') return 'MIDCPNIFTY';
  if (clean === 'SENSEX' || clean === 'BSESENSEX') return 'SENSEX';
  if (clean === 'BANKEX' || clean === 'BSEBANKEX') return 'BANKEX';
  return clean;
}

/**
 * Generate standard trading contracts for an index:
 * - Index Future (e.g. NIFTY 27OCT FUT)
 * - Complete strike chain across all active strikes
 */
export function generateContractsForIndex(
  meta: IndexMeta,
  spotPrice?: number
): Omit<MarketQuote, 'ltp' | 'change' | 'pchange' | 'open' | 'high' | 'low' | 'close' | 'volume'>[] {
  const spot = spotPrice || meta.basePrice;
  const step = meta.strikeStep;
  const instruments: Omit<MarketQuote, 'ltp' | 'change' | 'pchange' | 'open' | 'high' | 'low' | 'close' | 'volume'>[] = [];

  // Future Contract
  instruments.push({
    symbol: `${meta.symbol} ${CURRENT_EXPIRY} FUT`,
    name: `${meta.symbol} FUT ${CURRENT_EXPIRY}`,
    prevClose: Math.round(spot * 1.002 * 100) / 100,
    lotSize: meta.lotSize,
    type: 'FUT',
    exchange: meta.exchange,
    segment: meta.segment,
    underlying: meta.name,
    expiry: CURRENT_EXPIRY,
  });

  // Complete strike range
  for (let strike = meta.minStrike; strike <= meta.maxStrike; strike += step) {
    const ceIntrinsic = Math.max(0, spot - strike);
    const peIntrinsic = Math.max(0, strike - spot);
    const timeVal = Math.round(Math.max(2.0, spot * 0.012) * 100) / 100;

    // CE
    instruments.push({
      symbol: `${meta.symbol} ${CURRENT_EXPIRY} ${strike} CE`,
      name: `${meta.symbol} ${strike} CALL`,
      strike,
      prevClose: Math.max(0.5, Math.round((ceIntrinsic + timeVal) * 100) / 100),
      lotSize: meta.lotSize,
      type: 'CE',
      exchange: meta.exchange,
      segment: meta.segment,
      underlying: meta.name,
      expiry: CURRENT_EXPIRY,
    });

    // PE
    instruments.push({
      symbol: `${meta.symbol} ${CURRENT_EXPIRY} ${strike} PE`,
      name: `${meta.symbol} ${strike} PUT`,
      strike,
      prevClose: Math.max(0.5, Math.round((peIntrinsic + timeVal) * 100) / 100),
      lotSize: meta.lotSize,
      type: 'PE',
      exchange: meta.exchange,
      segment: meta.segment,
      underlying: meta.name,
      expiry: CURRENT_EXPIRY,
    });
  }

  return instruments;
}

/**
 * Generate standard trading contracts for an F&O stock:
 * - Stock Future (e.g. TCS 27OCT FUT)
 * - ATM Options (Call & Put for 7 strikes around current price)
 */
export function generateContractsForStock(
  stock: FnoStockMeta,
  spotPrice?: number
): Omit<MarketQuote, 'ltp' | 'change' | 'pchange' | 'open' | 'high' | 'low' | 'close' | 'volume'>[] {
  const spot = spotPrice || stock.basePrice;
  const step = stock.strikeStep;
  const atm = Math.round(spot / step) * step;

  const instruments: Omit<MarketQuote, 'ltp' | 'change' | 'pchange' | 'open' | 'high' | 'low' | 'close' | 'volume'>[] = [];

  // Stock Future Contract
  instruments.push({
    symbol: `${stock.symbol} ${CURRENT_EXPIRY} FUT`,
    name: `${stock.symbol} FUT ${CURRENT_EXPIRY}`,
    prevClose: Math.round(spot * 1.002 * 100) / 100,
    lotSize: stock.lotSize,
    type: 'FUT',
    exchange: 'NSE',
    segment: 'NSE_FO',
    underlying: stock.symbol,
    expiry: CURRENT_EXPIRY,
  });

  // Strike levels (-5 to +5 from ATM)
  const strikeDeltas = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
  strikeDeltas.forEach((delta) => {
    const strike = atm + delta * step;
    if (strike <= 0) return;

    // Call Option (CE)
    const ceIntrinsic = Math.max(0, spot - strike);
    const ceEstPrice = Math.max(0.5, Math.round((ceIntrinsic + spot * 0.015) * 100) / 100);
    instruments.push({
      symbol: `${stock.symbol} ${CURRENT_EXPIRY} ${strike} CE`,
      name: `${stock.symbol} ${strike} CALL`,
      strike,
      prevClose: ceEstPrice,
      lotSize: stock.lotSize,
      type: 'CE',
      exchange: 'NSE',
      segment: 'NSE_FO',
      underlying: stock.symbol,
      expiry: CURRENT_EXPIRY,
    });

    // Put Option (PE)
    const peIntrinsic = Math.max(0, strike - spot);
    const peEstPrice = Math.max(0.5, Math.round((peIntrinsic + spot * 0.015) * 100) / 100);
    instruments.push({
      symbol: `${stock.symbol} ${CURRENT_EXPIRY} ${strike} PE`,
      name: `${stock.symbol} ${strike} PUT`,
      strike,
      prevClose: peEstPrice,
      lotSize: stock.lotSize,
      type: 'PE',
      exchange: 'NSE',
      segment: 'NSE_FO',
      underlying: stock.symbol,
      expiry: CURRENT_EXPIRY,
    });
  });

  return instruments;
}

/**
 * Pre-generate full universe of:
 * - All major indices (NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, SENSEX, BANKEX)
 * - All 213 F&O stocks with Futures and Options
 */
export function getAllStockFnoInstruments(): Omit<MarketQuote, 'ltp' | 'change' | 'pchange' | 'open' | 'high' | 'low' | 'close' | 'volume'>[] {
  const all: Omit<MarketQuote, 'ltp' | 'change' | 'pchange' | 'open' | 'high' | 'low' | 'close' | 'volume'>[] = [];

  // 1. Generate full index option chains
  Object.values(INDICES_META).forEach((idx) => {
    const contracts = generateContractsForIndex(idx);
    all.push(...contracts);
  });

  // 2. Generate stock contracts
  FNO_STOCKS.forEach((stock) => {
    const contracts = generateContractsForStock(stock);
    all.push(...contracts);
  });

  return all;
}

/**
 * Dynamic parser: if user types any custom strike like:
 * - "NIFTY 25000 CE", "NIFTY 25000 PE", "NIFTY 25000"
 * - "BANK NIFTY 52500 CE", "BANKNIFTY 52000"
 * - "FINNIFTY 24000 CE", "MIDCPNIFTY 13000 PE"
 * - "SENSEX 82000 CE", "BANKEX 58000 PE"
 * - "TCS 4500 CE", "RELIANCE 3150 PE"
 *
 * It dynamically creates and returns matches.
 */
export function parseCustomFnoQueries(
  query: string
): Omit<MarketQuote, 'ltp' | 'change' | 'pchange' | 'open' | 'high' | 'low' | 'close' | 'volume'>[] {
  const cleanQ = query.trim().toUpperCase();
  if (!cleanQ) return [];

  // Handle multi-word index names like "BANK NIFTY", "NIFTY 50", "FIN NIFTY", "MIDCP NIFTY"
  let normalizedQ = cleanQ;
  if (normalizedQ.includes('BANK NIFTY')) normalizedQ = normalizedQ.replace('BANK NIFTY', 'BANKNIFTY');
  if (normalizedQ.includes('NIFTY 50')) normalizedQ = normalizedQ.replace('NIFTY 50', 'NIFTY');
  if (normalizedQ.includes('FIN NIFTY')) normalizedQ = normalizedQ.replace('FIN NIFTY', 'FINNIFTY');
  if (normalizedQ.includes('MIDCP NIFTY')) normalizedQ = normalizedQ.replace('MIDCP NIFTY', 'MIDCPNIFTY');

  const parts = normalizedQ.split(/\s+/);
  if (parts.length === 0) return [];

  const symKey = normalizeSymbolKey(parts[0]);
  const indexMeta = INDICES_META[symKey];
  const stockMeta = FNO_STOCKS_MAP[symKey];

  if (!indexMeta && !stockMeta) return [];

  const basePrice = indexMeta ? indexMeta.basePrice : stockMeta.basePrice;
  const lotSize = indexMeta ? indexMeta.lotSize : stockMeta.lotSize;
  const exchange = indexMeta ? indexMeta.exchange : 'NSE';
  const segment = indexMeta ? indexMeta.segment : 'NSE_FO';
  const underlying = indexMeta ? indexMeta.name : stockMeta.symbol;
  const dispSymbol = indexMeta ? indexMeta.symbol : stockMeta.symbol;

  const results: Omit<MarketQuote, 'ltp' | 'change' | 'pchange' | 'open' | 'high' | 'low' | 'close' | 'volume'>[] = [];

  // Check if user wants FUT
  if (parts.includes('FUT') || parts.includes('FUTURE')) {
    results.push({
      symbol: `${dispSymbol} ${CURRENT_EXPIRY} FUT`,
      name: `${dispSymbol} FUT ${CURRENT_EXPIRY}`,
      prevClose: Math.round(basePrice * 1.002 * 100) / 100,
      lotSize,
      type: 'FUT',
      exchange,
      segment,
      underlying,
      expiry: CURRENT_EXPIRY,
    });
    return results;
  }

  // Look for numeric strike in query
  const strikePart = parts.find((p) => /^\d+(\.\d+)?$/.test(p));
  if (!strikePart) return results;

  const strike = parseFloat(strikePart);
  const isCE = parts.includes('CE') || parts.includes('CALL');
  const isPE = parts.includes('PE') || parts.includes('PUT');

  const timeVal = Math.round(Math.max(1.5, basePrice * 0.012) * 100) / 100;
  const ceIntrinsic = Math.max(0, basePrice - strike);
  const peIntrinsic = Math.max(0, strike - basePrice);

  if (isCE || (!isCE && !isPE)) {
    results.push({
      symbol: `${dispSymbol} ${CURRENT_EXPIRY} ${strike} CE`,
      name: `${dispSymbol} ${strike} CALL`,
      strike,
      prevClose: Math.max(0.5, Math.round((ceIntrinsic + timeVal) * 100) / 100),
      lotSize,
      type: 'CE',
      exchange,
      segment,
      underlying,
      expiry: CURRENT_EXPIRY,
    });
  }

  if (isPE || (!isCE && !isPE)) {
    results.push({
      symbol: `${dispSymbol} ${CURRENT_EXPIRY} ${strike} PE`,
      name: `${dispSymbol} ${strike} PUT`,
      strike,
      prevClose: Math.max(0.5, Math.round((peIntrinsic + timeVal) * 100) / 100),
      lotSize,
      type: 'PE',
      exchange,
      segment,
      underlying,
      expiry: CURRENT_EXPIRY,
    });
  }

  return results;
}

export function parseCustomFnoQuery(
  query: string
): Omit<MarketQuote, 'ltp' | 'change' | 'pchange' | 'open' | 'high' | 'low' | 'close' | 'volume'> | null {
  const matches = parseCustomFnoQueries(query);
  return matches.length > 0 ? matches[0] : null;
}

/**
 * Universal normalization key generator for F&O contracts.
 * Matches Angel One raw symbols (NIFTY19OCT2622950PE) and UI display symbols (NIFTY 19OCT 22950 PE) to the same key.
 */
export function getContractKey(symbol: string): string {
  if (!symbol) return '';
  const clean = symbol.trim().toUpperCase();
  // Options: NIFTY 19OCT 22950 PE or NIFTY19OCT2622950PE
  const mOpt = clean.match(/^([A-Z0-9\s]+?)\s*(\d{2}[A-Z]{3})(?:\d{2})?\s*(\d+)\s*(CE|PE)$/);
  if (mOpt) {
    const name = mOpt[1].replace(/\s+/g, '');
    return `${name}_${mOpt[2]}_${mOpt[3]}_${mOpt[4]}`;
  }
  // Futures: NIFTY 27OCT FUT or NIFTY27OCT26FUT
  const mFut = clean.match(/^([A-Z0-9\s]+?)\s*(\d{2}[A-Z]{3})(?:\d{2})?\s*FUT(?:URE)?$/);
  if (mFut) {
    const name = mFut[1].replace(/\s+/g, '');
    return `${name}_${mFut[2]}_FUT`;
  }
  return clean.replace(/\s+/g, '');
}

/**
 * Checks whether an ISO date string matches today's date in Indian Standard Time (IST).
 */
export function isTodayIST(isoString?: string): boolean {
  if (!isoString) return false;
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return false;
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return fmt.format(d) === fmt.format(new Date());
  } catch {
    return false;
  }
}

