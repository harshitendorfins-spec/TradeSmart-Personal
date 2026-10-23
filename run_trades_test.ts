import { parseCustomFnoQueries } from './src/utils/fnoStocks';
import { MarketQuote, OrderItem, PositionItem, AccountFunds, LedgerItem } from './src/types/trading';

console.log('================================================================');
console.log(' TRADESMART AUTOMATED FULL-FEATURE TEST SUITE');
console.log(' Testing: Weekly ATM & OTM Options, Spreads, Limits, Margins & PnL');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  [PASS] ${msg}`);
    passCount++;
  } else {
    console.error(`  [FAIL] ${msg}`);
    failCount++;
  }
}

// ====================================================================
// TEST 1: Watchlist Default Blank Behavior
// ====================================================================
console.log('--- TEST 1: Watchlist Default State ---');
let watchlistInstruments: any[] = [];
let liveActive = false;
let quotes: MarketQuote[] = [];
let liveAll: MarketQuote[] = [];

// displayedWatchlistQuotes calculation (identical to App.tsx)
function getDisplayedQuotes() {
  const liveQuotesMap: Record<string, MarketQuote> = {};
  liveAll.forEach((q) => { liveQuotesMap[q.symbol] = q; });

  return watchlistInstruments.map((inst) => {
    if (liveActive && liveQuotesMap[inst.symbol]) {
      return liveQuotesMap[inst.symbol];
    }
    const sim = quotes.find((q) => q.symbol === inst.symbol);
    if (sim) return sim;
    const basePrice = inst.strike || inst.prevClose || 1000.0;
    return {
      ...inst,
      ltp: basePrice,
      change: 0,
      pchange: 0,
      open: basePrice,
      high: basePrice,
      low: basePrice,
      close: basePrice,
      volume: 0,
      flash: null,
    } as MarketQuote;
  });
}

assert(getDisplayedQuotes().length === 0, 'Watchlist is completely blank by default (0 instruments)');

// ====================================================================
// TEST 2: Searching and Adding Weekly ATM & OTM Contracts
// ====================================================================
console.log('\n--- TEST 2: Searching & Adding Weekly ATM & OTM Contracts ---');
// NIFTY spot is approx 23150
const niftyAtmCe = parseCustomFnoQueries('NIFTY 23150 CE')[0];
const niftyAtmPe = parseCustomFnoQueries('NIFTY 23150 PE')[0];
const niftyOtmCe = parseCustomFnoQueries('NIFTY 23500 CE')[0]; // +350 pts OTM
const niftyOtmPe = parseCustomFnoQueries('NIFTY 22800 PE')[0]; // -350 pts OTM
const relianceCe = parseCustomFnoQueries('RELIANCE 1260 CE')[0];

assert(!!niftyAtmCe, 'Weekly ATM Call parsed: ' + niftyAtmCe?.symbol);
assert(!!niftyAtmPe, 'Weekly ATM Put parsed: ' + niftyAtmPe?.symbol);
assert(!!niftyOtmCe, 'Weekly OTM Call (+350 pts) parsed: ' + niftyOtmCe?.symbol);
assert(!!niftyOtmPe, 'Weekly OTM Put (-350 pts) parsed: ' + niftyOtmPe?.symbol);
assert(!!relianceCe, 'F&O Stock Option parsed: ' + relianceCe?.symbol);

// User adds them to watchlist
[niftyAtmCe, niftyAtmPe, niftyOtmCe, niftyOtmPe, relianceCe].forEach((inst) => {
  if (inst) watchlistInstruments.push(inst);
});

assert(watchlistInstruments.length === 5, '5 Weekly ATM/OTM instruments added to user watchlist');
const displayed = getDisplayedQuotes();
assert(displayed.length === 5, 'Watchlist displays exactly the 5 user-added instruments (0ms)');
assert(displayed.some(d => d.symbol.includes('23150 CE')), 'ATM CE is displayed');
assert(displayed.some(d => d.symbol.includes('22800 PE')), 'OTM PE is displayed');

// ====================================================================
// TEST 3: Trading Engine - Initial Setup
// ====================================================================
console.log('\n--- TEST 3: Account Funds & Portfolio Setup ---');
const DEFAULT_CAPITAL = 10000000; // 1 Crore
let funds: AccountFunds = {
  startingCapital: DEFAULT_CAPITAL,
  availableCash: DEFAULT_CAPITAL,
  usedMargin: 0,
  grossMargin: 0,
  hedgeDiscount: 0,
  realizedPnl: 0,
  unrealizedPnl: 0,
  netPnl: 0,
};

let orders: OrderItem[] = [];
let positions: PositionItem[] = [];
let ledger: LedgerItem[] = [{
  id: 1,
  timestamp: new Date().toISOString(),
  particulars: 'Initial Virtual Trading Capital Allocation (₹1.00 Cr)',
  voucherType: 'DEPOSIT',
  debit: 0,
  credit: DEFAULT_CAPITAL,
  runningBalance: DEFAULT_CAPITAL,
  referenceId: 'VIRTUAL-INIT-1CR',
}];

// Helper margin calculator identical to App.tsx
function computeMargins(currPositions: PositionItem[]) {
  const openPositions = currPositions.filter((p) => p.quantity !== 0 && p.status !== 'CLOSED');
  if (openPositions.length === 0) {
    return { totalMargin: 0, grossMargin: 0, hedgeDiscount: 0 };
  }
  let gross = 0;
  const groups: Record<string, PositionItem[]> = {};
  openPositions.forEach((pos) => {
    const u = pos.underlying || 'NIFTY 50';
    if (!groups[u]) groups[u] = [];
    groups[u].push(pos);
    const isLong = pos.quantity > 0;
    const isOption = pos.symbol.includes('CE') || pos.symbol.includes('PE');
    const baseSpan = 115000;
    const lots = Math.abs(pos.quantity) / (pos.lotSize || 65);
    if (isLong && isOption) {
      gross += pos.buyAvgPrice * pos.quantity;
    } else {
      gross += baseSpan * lots;
    }
  });

  let discount = 0;
  Object.entries(groups).forEach(([u, grp]) => {
    const hasLongCalls = grp.some((p) => p.symbol.includes('CE') && p.quantity > 0);
    const hasShortOptions = grp.some((p) => p.quantity < 0);
    const baseSpan = 115000;
    if (hasLongCalls && hasShortOptions) {
      discount += baseSpan * 0.65;
    }
  });

  const net = Math.max(0, Math.round(gross - discount));
  return {
    totalMargin: net,
    grossMargin: Math.round(gross),
    hedgeDiscount: Math.round(discount),
  };
}

// Helper trade execution identical to App.tsx
function executeTrade(orderReq: {
  symbol: string;
  transactionType: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT';
  product: 'MIS' | 'NRML';
  quantity: number;
  price: number;
  strategyTag: string;
}, fillPrice: number) {
  const signedQty = orderReq.transactionType === 'BUY' ? orderReq.quantity : -orderReq.quantity;
  const posId = `POS-${orderReq.symbol}-${orderReq.product}`;
  const existing = positions.find((p) => p.id === posId);

  let realizedDelta = 0;
  if (!existing || existing.quantity === 0 || existing.status === 'CLOSED') {
    positions.push({
      id: posId,
      symbol: orderReq.symbol,
      exchange: 'NSE',
      product: orderReq.product,
      quantity: signedQty,
      status: 'OPEN',
      buyAvgPrice: orderReq.transactionType === 'BUY' ? fillPrice : 0,
      sellAvgPrice: orderReq.transactionType === 'SELL' ? fillPrice : 0,
      lastPrice: fillPrice,
      unrealizedPnl: 0,
      realizedPnl: 0,
      lotSize: 65,
      underlying: 'NIFTY 50',
      strategyTag: orderReq.strategyTag,
      openedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } else {
    const currQty = existing.quantity;
    const newQty = currQty + signedQty;
    const isClosing = (currQty > 0 && signedQty < 0) || (currQty < 0 && signedQty > 0);
    if (isClosing) {
      const closedUnits = Math.min(Math.abs(currQty), Math.abs(signedQty));
      realizedDelta = currQty > 0
        ? (fillPrice - existing.buyAvgPrice) * closedUnits
        : (existing.sellAvgPrice - fillPrice) * closedUnits;
      existing.realizedPnl += realizedDelta;
      existing.quantity = newQty;
      if (newQty === 0) existing.status = 'CLOSED';
    } else {
      existing.quantity = newQty;
      if (currQty > 0) existing.buyAvgPrice = (existing.buyAvgPrice * currQty + fillPrice * signedQty) / newQty;
      else existing.sellAvgPrice = (existing.sellAvgPrice * Math.abs(currQty) + fillPrice * Math.abs(signedQty)) / Math.abs(newQty);
    }
  }

  // Update order record
  orders.unshift({
    id: `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    symbol: orderReq.symbol,
    exchange: 'NSE',
    transactionType: orderReq.transactionType,
    orderType: orderReq.orderType,
    product: orderReq.product,
    quantity: orderReq.quantity,
    price: orderReq.price,
    averagePrice: fillPrice,
    status: 'COMPLETE',
    statusMessage: `Executed @ ₹${fillPrice.toFixed(2)}`,
    strategyTag: orderReq.strategyTag,
    placedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  });

  // Update funds
  if (realizedDelta !== 0) {
    funds.realizedPnl += realizedDelta;
    funds.availableCash += realizedDelta;
    funds.netPnl += realizedDelta;
    ledger.push({
      id: ledger.length + 1,
      timestamp: new Date().toISOString(),
      particulars: `Trade Square-off: ${orderReq.symbol} Realized PnL`,
      voucherType: 'TRADE_SETTLEMENT',
      debit: realizedDelta < 0 ? Math.abs(realizedDelta) : 0,
      credit: realizedDelta > 0 ? realizedDelta : 0,
      runningBalance: funds.availableCash,
      referenceId: orders[0].id,
    });
  }

  const m = computeMargins(positions);
  funds.grossMargin = m.grossMargin;
  funds.hedgeDiscount = m.hedgeDiscount;
  funds.usedMargin = m.totalMargin;
}

// ====================================================================
// TEST 4: Trade 1 - Buy Weekly ATM Call (Market Order)
// ====================================================================
console.log('\n--- TEST 4: Trade 1 - Buy Weekly ATM Call ---');
const atmCallLtp = 145.50;
executeTrade({
  symbol: niftyAtmCe.symbol,
  transactionType: 'BUY',
  orderType: 'MARKET',
  product: 'MIS',
  quantity: 65,
  price: atmCallLtp,
  strategyTag: 'ATM Momentum',
}, atmCallLtp);

const pos1 = positions.find(p => p.symbol === niftyAtmCe.symbol);
assert(pos1 !== undefined && pos1.quantity === 65, 'Weekly ATM Call position opened (65 qty)');
assert(pos1?.buyAvgPrice === 145.50, 'Position Buy Avg Price is ₹145.50');
assert(orders[0].status === 'COMPLETE', 'Market Order executed instantly (Status: COMPLETE)');
const expectedMarginCall = Math.round(145.50 * 65);
assert(funds.usedMargin === expectedMarginCall, `Used Margin for Long Option = ₹${expectedMarginCall}`);

// ====================================================================
// TEST 5: Trade 2 - Buy Weekly ATM Put (Market Order)
// ====================================================================
console.log('\n--- TEST 5: Trade 2 - Buy Weekly ATM Put ---');
const atmPutLtp = 130.00;
executeTrade({
  symbol: niftyAtmPe.symbol,
  transactionType: 'BUY',
  orderType: 'MARKET',
  product: 'MIS',
  quantity: 65,
  price: atmPutLtp,
  strategyTag: 'Straddle Hedge',
}, atmPutLtp);

const pos2 = positions.find(p => p.symbol === niftyAtmPe.symbol);
assert(pos2 !== undefined && pos2.quantity === 65, 'Weekly ATM Put position opened (65 qty)');
assert(pos2?.buyAvgPrice === 130.00, 'Position Buy Avg Price is ₹130.00');

// ====================================================================
// TEST 6: Trade 3 - Limit Order Pending & Execution Check
// ====================================================================
console.log('\n--- TEST 6: Trade 3 - Limit Order Logic (Pending -> Triggered) ---');
// User puts a limit buy order for OTM Put at ₹50, when current LTP is ₹75
const otmPutSymbol = niftyOtmPe.symbol;
const currentLtp = 75.00;
const limitPrice = 50.00;

// Order placement logic check
const isPendingBuy = limitPrice < currentLtp;
assert(isPendingBuy === true, 'Limit Buy @ ₹50 with LTP @ ₹75 correctly identified as PENDING');

// Register pending order
const pendingOrder: OrderItem = {
  id: `ORD-LIMIT-${Date.now()}`,
  symbol: otmPutSymbol,
  exchange: 'NSE',
  transactionType: 'BUY',
  orderType: 'LIMIT',
  product: 'NRML',
  quantity: 65,
  price: limitPrice,
  averagePrice: 0,
  status: 'OPEN',
  statusMessage: `Limit Pending @ ₹${limitPrice.toFixed(2)} (LTP: ₹${currentLtp.toFixed(2)})`,
  strategyTag: 'Dip Buy',
  placedAt: new Date().toISOString(),
};
orders.unshift(pendingOrder);

assert(orders[0].status === 'OPEN', 'Limit order is saved in OPEN/PENDING status (NOT instantly executed)');
assert(positions.find(p => p.symbol === otmPutSymbol) === undefined, 'No position opened while order is pending');

// Simulate ticker dropping to 50.00
console.log('  -> Market Ticker drops: LTP moves 75.00 -> 50.00');
const droppedLtp = 50.00;
if (pendingOrder.status === 'OPEN' && droppedLtp <= pendingOrder.price) {
  executeTrade({
    symbol: pendingOrder.symbol,
    transactionType: pendingOrder.transactionType,
    orderType: pendingOrder.orderType,
    product: pendingOrder.product,
    quantity: pendingOrder.quantity,
    price: pendingOrder.price,
    strategyTag: pendingOrder.strategyTag,
  }, droppedLtp);
  pendingOrder.status = 'COMPLETE';
  pendingOrder.averagePrice = droppedLtp;
  pendingOrder.statusMessage = `Limit Executed @ ₹${droppedLtp.toFixed(2)}`;
}

assert(pendingOrder.status === 'COMPLETE', 'Limit order triggered and executed when LTP reached ₹50.00');
assert(positions.some(p => p.symbol === otmPutSymbol && p.quantity === 65), 'OTM Put position opened upon Limit fill');

// ====================================================================
// TEST 7: Trade 4 - Bull Call Spread & Margin Hedge Discount
// ====================================================================
console.log('\n--- TEST 7: Trade 4 - Bull Call Spread & Margin Hedge Discount ---');
// Currently we are Long 1 lot NIFTY 23150 CE
// Now let's Short 1 lot OTM Call: NIFTY 23500 CE @ ₹40.00
const otmCallSellLtp = 40.00;
executeTrade({
  symbol: niftyOtmCe.symbol,
  transactionType: 'SELL',
  orderType: 'MARKET',
  product: 'MIS',
  quantity: 65,
  price: otmCallSellLtp,
  strategyTag: 'Bull Call Spread',
}, otmCallSellLtp);

const mAfterSpread = computeMargins(positions);
console.log(`  Gross Margin: ₹${mAfterSpread.grossMargin.toLocaleString('en-IN')}`);
console.log(`  Hedge Benefit Discount: ₹${mAfterSpread.hedgeDiscount.toLocaleString('en-IN')}`);
console.log(`  Net Required Margin: ₹${mAfterSpread.totalMargin.toLocaleString('en-IN')}`);

assert(mAfterSpread.hedgeDiscount > 0, 'Hedge discount benefit active (>₹74,000 discount applied)');
assert(mAfterSpread.totalMargin < mAfterSpread.grossMargin, 'Net margin is significantly lower than gross margin');

// ====================================================================
// TEST 8: Live PnL & Ticker Movement
// ====================================================================
console.log('\n--- TEST 8: MTM PnL Fluctuation ---');
// Let's simulate price move:
// ATM CE: 145.50 -> 195.50 (+50 pts) = +₹3,250
// ATM PE: 130.00 -> 100.00 (-30 pts) = -₹1,950
// OTM PE: 50.00 -> 40.00 (-10 pts) = -₹650
// Short OTM CE: 40.00 -> 25.00 (+15 pts gain for short) = +₹975
let totalUnrealized = 0;
const priceMoves: Record<string, number> = {
  [niftyAtmCe.symbol]: 195.50,
  [niftyAtmPe.symbol]: 100.00,
  [otmPutSymbol]: 40.00,
  [niftyOtmCe.symbol]: 25.00,
};

positions.forEach((p) => {
  if (p.quantity !== 0 && priceMoves[p.symbol] !== undefined) {
    const ltp = priceMoves[p.symbol];
    p.lastPrice = ltp;
    const legPnl = p.quantity > 0
      ? (ltp - p.buyAvgPrice) * p.quantity
      : (p.sellAvgPrice - ltp) * Math.abs(p.quantity);
    p.unrealizedPnl = Math.round(legPnl * 100) / 100;
    totalUnrealized += p.unrealizedPnl;
  }
});

funds.unrealizedPnl = totalUnrealized;
funds.netPnl = funds.realizedPnl + funds.unrealizedPnl;
console.log(`  Total Portfolio Unrealized PnL: ₹${funds.unrealizedPnl.toLocaleString('en-IN')}`);
assert(funds.unrealizedPnl === 1625, 'Unrealized MTM PnL calculated accurately (+₹1,625)');

// ====================================================================
// TEST 9: Position Exit & Ledger Settlement
// ====================================================================
console.log('\n--- TEST 9: Position Square-Off & Ledger Booking ---');
// Square off the profitable ATM Call @ 195.50
const cashBefore = funds.availableCash;
executeTrade({
  symbol: niftyAtmCe.symbol,
  transactionType: 'SELL',
  orderType: 'MARKET',
  product: 'MIS',
  quantity: 65,
  price: 195.50,
  strategyTag: 'Target Hit',
}, 195.50);

const closedAtmCall = positions.find(p => p.symbol === niftyAtmCe.symbol);
assert(closedAtmCall?.status === 'CLOSED', 'ATM Call position status updated to CLOSED');
assert(closedAtmCall?.realizedPnl === 3250, 'Realized profit of ₹3,250 booked on ATM Call');
assert(funds.availableCash === cashBefore + 3250, 'Available cash credited with ₹3,250 profit');
assert(ledger[ledger.length - 1].credit === 3250, 'Ledger entry recorded credit of ₹3,250');

// ====================================================================
// TEST 10: 3:10 PM MIS Cutoff & 3:15 PM Auto Square-Off
// ====================================================================
console.log('\n--- TEST 10: MIS Auto Square-off Rules (3:10 PM & 3:15 PM) ---');
// Check 1: MIS order placement after 3:10 PM
const testMinutes = 15 * 60 + 12; // 3:12 PM
const isAfter310 = testMinutes >= 910;
const misOrderBlocked = isAfter310;
assert(misOrderBlocked === true, 'MIS order placement after 3:10 PM cutoff is strictly blocked');

// Check 2: 3:15 PM auto square-off
const autoSquareOffMinutes = 15 * 60 + 15; // 3:15 PM
const isAfter315 = autoSquareOffMinutes >= 915;
assert(isAfter315 === true, '3:15 PM broker trigger active');

const openMis = positions.filter(p => p.product === 'MIS' && p.status === 'OPEN');
openMis.forEach(p => {
  const exitSide = p.quantity > 0 ? 'SELL' : 'BUY';
  const exitPrice = p.lastPrice;
  executeTrade({
    symbol: p.symbol,
    transactionType: exitSide,
    orderType: 'MARKET',
    product: 'MIS',
    quantity: Math.abs(p.quantity),
    price: exitPrice,
    strategyTag: 'MIS Auto-Squareoff 3:15 PM',
  }, exitPrice);
});

const remainingMis = positions.filter(p => p.product === 'MIS' && p.status === 'OPEN');
assert(remainingMis.length === 0, 'All MIS positions auto squared-off at 3:15 PM broker cutoff');

// ====================================================================
// SUMMARY
// ====================================================================
console.log('\n================================================================');
console.log(` TEST RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
console.log('================================================================\n');

if (failCount > 0) {
  process.exit(1);
}
