import { MarketQuote, OptionGreeks, MarketDepth } from '../types/trading';
import { getAllStockFnoInstruments } from './fnoStocks';

export function erf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);

  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-absX * absX);

  return sign * y;
}

export function normalCdf(x: number): number {
  return (1.0 + erf(x / Math.SQRT2)) / 2.0;
}

export function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export function computeBlackScholes(
  spot: number,
  strike: number,
  timeToExpiryYears: number,
  volatility: number,
  riskFreeRate: number = 0.07,
  optionType: 'CE' | 'PE' = 'CE'
): OptionGreeks {
  if (timeToExpiryYears <= 0.0001) {
    const intrinsic = optionType === 'CE' ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
    return {
      price: Math.max(0.05, Math.round(intrinsic * 100) / 100),
      delta: optionType === 'CE' ? (spot >= strike ? 1 : 0) : (spot <= strike ? -1 : 0),
      gamma: 0,
      theta: 0,
      vega: 0,
      iv: Math.round(volatility * 1000) / 10
    };
  }

  const d1 = (Math.log(spot / strike) + (riskFreeRate + 0.5 * volatility * volatility) * timeToExpiryYears) /
    (volatility * Math.sqrt(timeToExpiryYears));
  const d2 = d1 - volatility * Math.sqrt(timeToExpiryYears);

  let price = 0;
  let delta = 0;
  let theta = 0;

  if (optionType === 'CE') {
    price = spot * normalCdf(d1) - strike * Math.exp(-riskFreeRate * timeToExpiryYears) * normalCdf(d2);
    delta = normalCdf(d1);
    theta = (- (spot * normalPdf(d1) * volatility) / (2 * Math.sqrt(timeToExpiryYears)) -
      riskFreeRate * strike * Math.exp(-riskFreeRate * timeToExpiryYears) * normalCdf(d2)) / 365;
  } else {
    price = strike * Math.exp(-riskFreeRate * timeToExpiryYears) * normalCdf(-d2) - spot * normalCdf(-d1);
    delta = normalCdf(d1) - 1.0;
    theta = (- (spot * normalPdf(d1) * volatility) / (2 * Math.sqrt(timeToExpiryYears)) +
      riskFreeRate * strike * Math.exp(-riskFreeRate * timeToExpiryYears) * normalCdf(-d2)) / 365;
  }

  const gamma = normalPdf(d1) / (spot * volatility * Math.sqrt(timeToExpiryYears));
  const vega = (spot * Math.sqrt(timeToExpiryYears) * normalPdf(d1)) / 100;

  return {
    price: Math.max(0.05, Math.round(price * 100) / 100),
    delta: Math.round(delta * 1000) / 1000,
    gamma: Math.round(gamma * 10000) / 10000,
    theta: Math.round(theta * 100) / 100,
    vega: Math.round(vega * 100) / 100,
    iv: Math.round(volatility * 1000) / 10
  };
}

export function generateMarketDepth(ltp: number, lotSize: number): MarketDepth {
  const tickSize = ltp < 100 ? 0.05 : (ltp < 500 ? 0.1 : 0.5);
  const bestBid = Math.max(0.05, Math.round((ltp - tickSize) * 100) / 100);
  const bestAsk = Math.round((ltp + tickSize) * 100) / 100;

  const bids = [];
  const asks = [];

  for (let i = 0; i < 5; i++) {
    const bidPrice = Math.max(0.05, Math.round((bestBid - i * tickSize) * 100) / 100);
    const askPrice = Math.round((bestAsk + i * tickSize) * 100) / 100;

    bids.push({
      price: bidPrice,
      orders: Math.floor(Math.random() * 20) + 3,
      quantity: (Math.floor(Math.random() * 12) + 2) * lotSize
    });

    asks.push({
      price: askPrice,
      orders: Math.floor(Math.random() * 20) + 3,
      quantity: (Math.floor(Math.random() * 12) + 2) * lotSize
    });
  }

  return {
    bids,
    asks,
    totalBuyQty: bids.reduce((acc, b) => acc + b.quantity, 0),
    totalSellQty: asks.reduce((acc, a) => acc + a.quantity, 0)
  };
}

export const INITIAL_WATCHLIST_INSTRUMENTS: Omit<MarketQuote, 'ltp' | 'change' | 'pchange' | 'open' | 'high' | 'low' | 'close' | 'volume'>[] = [];

export const ALL_MASTER_INSTRUMENTS: Omit<MarketQuote, 'ltp' | 'change' | 'pchange' | 'open' | 'high' | 'low' | 'close' | 'volume'>[] = [
  ...getAllStockFnoInstruments(),
];

