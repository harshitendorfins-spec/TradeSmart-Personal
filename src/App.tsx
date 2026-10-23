import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  MarketQuote,
  MarketDepth,
  OrderItem,
  PositionItem,
  LedgerItem,
  AccountFunds,
  SetupItem,
  TransactionType,
  OrderType,
  ProductType,
  LicenseInfo
} from './types/trading';
import {
  generateMarketDepth,
  INITIAL_WATCHLIST_INSTRUMENTS,
  ALL_MASTER_INSTRUMENTS
} from './utils/blackScholes';
import { FNO_STOCKS_MAP, INDICES_META, getContractKey, isTodayIST } from './utils/fnoStocks';
import { soundManager } from './utils/audio';
import { liveConnect, liveQuotes, liveSubscribe, connectBroker, disconnectBroker } from './utils/liveApi';
import { Header } from './components/Header';
import { Watchlist } from './components/Watchlist';
import { MarketDepthModal } from './components/MarketDepthModal';
import { OrderModal } from './components/OrderModal';
import { PositionsTab } from './components/PositionsTab';
import { OrdersTab } from './components/OrdersTab';
import { FundsTab } from './components/FundsTab';
import { LedgerTab } from './components/LedgerTab';
import { AnalyticsTab } from './components/AnalyticsTab';
import { SmartAPIModal } from './components/SmartAPIModal';
import { LoginModal } from './components/LoginModal';
import { ChangeCredentialsModal } from './components/ChangeCredentialsModal';
import { LicenseModal } from './components/LicenseModal';

const DEFAULT_CAPITAL = 10000000; // ₹1,00,00,000 (1 Crore INR)

const DEFAULT_SETUPS: SetupItem[] = [];


export default function App() {
  // -------------------------------------------------------------
  // 1. User ID & Password Security State (Kite-style)
  // -------------------------------------------------------------
  const [username, setUsername] = useState<string>(() => {
    return localStorage.getItem('tradesmart_username') || 'HARSHIT';
  });
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('tradesmart_authenticated') === '1';
  });
  const [isChangeCredsOpen, setIsChangeCredsOpen] = useState<boolean>(false);

  // -------------------------------------------------------------
  // 1b. Desktop License & DRM State
  // -------------------------------------------------------------
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [isLicenseModalOpen, setIsLicenseModalOpen] = useState<boolean>(false);

  const fetchLicenseStatus = async () => {
    try {
      const res = await fetch('/api/license/status');
      if (res.ok) {
        const data: LicenseInfo = await res.json();
        setLicense(data);
        if (!data.is_active) {
          setIsLicenseModalOpen(true);
        }
      }
    } catch (e) {
      console.error('License check error:', e);
    }
  };

  useEffect(() => {
    fetchLicenseStatus();
  }, []);

  const handleActivateLicense = async (key: string) => {
    try {
      const res = await fetch('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      if (res.ok) {
        setLicense(data.license);
        return { success: true, message: data.message };
      }
      return { success: false, message: data.detail || 'Activation failed.' };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Network error.' };
    }
  };

  const handleStartTrial = async () => {
    try {
      const res = await fetch('/api/license/start-trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok) {
        setLicense(data.license);
        return { success: true, message: data.message };
      }
      return { success: false, message: data.detail || 'Could not start trial.' };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Network error.' };
    }
  };

  // -------------------------------------------------------------
  // 2. Sound & SmartAPI State
  // -------------------------------------------------------------
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isSmartApiModalOpen, setIsSmartApiModalOpen] = useState<boolean>(false);
  // Live broker feed is always enabled for genuine exchange trading
  const [liveEnabled, setLiveEnabled] = useState<boolean>(true);
  const [liveStatus, setLiveStatus] = useState<{ connected: boolean; broker?: 'angelone' | 'fyers'; error: string | null; marketOpen: boolean; ageSeconds: number | null }>({
    connected: false, broker: 'angelone', error: null, marketOpen: false, ageSeconds: null,
  });
  const [liveAll, setLiveAll] = useState<MarketQuote[]>([]);
  const liveDepthRef = useRef<Record<string, MarketDepth>>({});
  const lastAutoConnectRef = useRef<number>(0);
  const liveActive = liveEnabled && liveStatus.connected;

  // Remove credentials that older versions stored in the browser
  useEffect(() => { localStorage.removeItem('tradesmart_smartapi_config'); }, []);

  // -------------------------------------------------------------
  // 3. Navigation Tab
  // -------------------------------------------------------------
  const [activeTab, setActiveTab] = useState<'positions' | 'orders' | 'funds' | 'ledger' | 'setups'>('positions');

  // -------------------------------------------------------------
  // 4. Market Clock & Simulated Time (Requirements 2 & 3)
  // -------------------------------------------------------------
  // Default to 11:30 AM IST; user can toggle or test 3:10 PM / 3:15 PM jumps
  const [simulatedMinutes, setSimulatedMinutes] = useState<number>(11 * 60 + 30); // 11:30 AM
  const [isTimeSimulated, setIsTimeSimulated] = useState<boolean>(false);

  const currentMinutes = useMemo(() => {
    if (isTimeSimulated) return simulatedMinutes;
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }, [isTimeSimulated, simulatedMinutes]);

  // Is after 3:10 PM (15:10 = 910 minutes)
  const isAfter310 = currentMinutes >= 910;
  // Is after 3:15 PM (15:15 = 915 minutes)
  const isAfter315 = currentMinutes >= 915;

  const simulatedTimeStr = useMemo(() => {
    const hours = Math.floor(currentMinutes / 60);
    const mins = currentMinutes % 60;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMins = mins < 10 ? `0${mins}` : mins;
    return `${displayHours}:${displayMins} ${ampm} IST`;
  }, [currentMinutes]);

  const handleSimulateTimeJump = (target: 'normal' | '3:09' | '3:10' | '3:15') => {
    if (target === 'normal') {
      setIsTimeSimulated(false);
    } else if (target === '3:09') {
      setIsTimeSimulated(true);
      setSimulatedMinutes(15 * 60 + 9);
    } else if (target === '3:10') {
      setIsTimeSimulated(true);
      setSimulatedMinutes(15 * 60 + 10);
    } else if (target === '3:15') {
      setIsTimeSimulated(true);
      setSimulatedMinutes(15 * 60 + 15);
    }
  };

  // -------------------------------------------------------------
  // 5. Strategy Setups State
  // -------------------------------------------------------------
  const [setups, setSetups] = useState<SetupItem[]>(() => {
    const saved = localStorage.getItem('tradesmart_setups');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return DEFAULT_SETUPS;
  });

  useEffect(() => {
    localStorage.setItem('tradesmart_setups', JSON.stringify(setups));
  }, [setups]);

  // -------------------------------------------------------------
  // 6. Market Spots Universe (Pure NSE/BSE Equity & Index Derivatives)
  // -------------------------------------------------------------
  const spotsRef = useRef<Record<string, number>>({
    'NIFTY 50': 24850.0,
    'BANK NIFTY': 52120.0,
    'FINNIFTY': 23850.0,
    'MIDCPNIFTY': 12820.0,
    'SENSEX': 81420.0,
    'BANKEX': 58240.0,
    'RELIANCE': 1240.0,
  });

  const [watchlistInstruments, setWatchlistInstruments] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('tradesmart_user_watchlist');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  useEffect(() => {
    localStorage.setItem('tradesmart_user_watchlist', JSON.stringify(watchlistInstruments));
  }, [watchlistInstruments]);

  const [quotes, setQuotes] = useState<MarketQuote[]>([]);
  const prevPricesRef = useRef<Record<string, number>>({});

  // -------------------------------------------------------------
  // 7. Account Funds (₹1 Crore Starting Capital, NO RMS limits)
  // -------------------------------------------------------------
  const [funds, setFunds] = useState<AccountFunds>(() => {
    const saved = localStorage.getItem('tradesmart_funds_v3');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return {
      startingCapital: DEFAULT_CAPITAL,
      availableCash: DEFAULT_CAPITAL,
      usedMargin: 0,
      grossMargin: 0,
      hedgeDiscount: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      netPnl: 0,
    };
  });

  // -------------------------------------------------------------
  // 8. Orders & Positions & Ledger State
  // -------------------------------------------------------------
  const [orders, setOrders] = useState<OrderItem[]>(() => {
    const saved = localStorage.getItem('tradesmart_orders_v3');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return [];
  });

  const [positions, setPositions] = useState<PositionItem[]>(() => {
    const saved = localStorage.getItem('tradesmart_positions_v3');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // EOD Rollover: Closed positions from previous days are settled into Funds/Ledger
          return parsed.filter((p: PositionItem) => {
            const isOpen = p.quantity !== 0 && p.status !== 'CLOSED';
            if (isOpen) return true;
            return isTodayIST(p.closedAt || p.updatedAt);
          });
        }
      } catch {}
    }
    return [];
  });

  const [ledger, setLedger] = useState<LedgerItem[]>(() => {
    const saved = localStorage.getItem('tradesmart_ledger_v3');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return [
      {
        id: 1,
        timestamp: new Date().toISOString(),
        particulars: 'Initial Virtual Trading Capital Allocation (₹1.00 Cr)',
        voucherType: 'DEPOSIT',
        debit: 0,
        credit: DEFAULT_CAPITAL,
        runningBalance: DEFAULT_CAPITAL,
        referenceId: 'VIRTUAL-INIT-1CR',
      },
    ];
  });

  // -------------------------------------------------------------
  // 9. Modals State
  // -------------------------------------------------------------
  const [selectedDepthQuote, setSelectedDepthQuote] = useState<MarketQuote | null>(null);
  const [selectedDepthData, setSelectedDepthData] = useState<MarketDepth | null>(null);
  const [orderModalData, setOrderModalData] = useState<{
    quote: MarketQuote;
    side: TransactionType;
  } | null>(null);

  // Sync state to local storage
  useEffect(() => {
    localStorage.setItem('tradesmart_funds_v3', JSON.stringify(funds));
  }, [funds]);

  useEffect(() => {
    localStorage.setItem('tradesmart_orders_v3', JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    localStorage.setItem('tradesmart_positions_v3', JSON.stringify(positions));
  }, [positions]);

  useEffect(() => {
    localStorage.setItem('tradesmart_ledger_v3', JSON.stringify(ledger));
  }, [ledger]);

  // Synchronous refs for real-time ticker & pending order evaluation
  const ordersRef = useRef<OrderItem[]>(orders);
  ordersRef.current = orders;

  const positionsRef = useRef<PositionItem[]>(positions);
  positionsRef.current = positions;

  const fundsRef = useRef<AccountFunds>(funds);
  fundsRef.current = funds;

  const setupsRef = useRef<SetupItem[]>(setups);
  setupsRef.current = setups;

  const ledgerRef = useRef<LedgerItem[]>(ledger);
  ledgerRef.current = ledger;

  const watchlistInstrumentsRef = useRef<any[]>(watchlistInstruments);
  watchlistInstrumentsRef.current = watchlistInstruments;

  // -------------------------------------------------------------
  // Terminal Backend/SQLite State Synchronization
  // -------------------------------------------------------------
  const isSyncInitialLoadedRef = useRef<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    const syncWithBackend = async () => {
      try {
        const res = await fetch(`/api/terminal/state?username=${encodeURIComponent(username)}`);
        if (!res.ok) return;
        const remote = await res.json();
        if (!isMounted) return;

        const localPositions = positionsRef.current;
        const localWatchlist = watchlistInstrumentsRef.current;
        const hasLocalData =
          (localPositions && localPositions.length > 0) ||
          (localWatchlist && localWatchlist.length > 0);

        if (!hasLocalData && remote && Object.keys(remote).length > 0) {
          // Restore from remote if local is empty (e.g. desktop window / new browser profile)
          if (remote.positions && Array.isArray(remote.positions) && remote.positions.length > 0) {
            // EOD Rollover: Prune closed positions from previous days so positions tab starts fresh
            const cleanPositions = remote.positions.filter((p: any) => {
              const isOpen = p.quantity !== 0 && p.status !== 'CLOSED';
              if (isOpen) return true;
              return isTodayIST(p.closedAt || p.updatedAt);
            });
            setPositions(cleanPositions);
            localStorage.setItem('tradesmart_positions_v3', JSON.stringify(cleanPositions));
          }
          if (remote.watchlist && Array.isArray(remote.watchlist) && remote.watchlist.length > 0) {
            setWatchlistInstruments(remote.watchlist);
            localStorage.setItem('tradesmart_user_watchlist', JSON.stringify(remote.watchlist));
            const syms: string[] = [];
            remote.watchlist.forEach((w: any) => {
              if (w.symbol) syms.push(w.symbol);
              if (w.rawSymbol && w.rawSymbol !== w.symbol) syms.push(w.rawSymbol);
            });
            if (syms.length > 0) liveSubscribe(syms, username);
          }
          if (remote.funds && typeof remote.funds === 'object' && Object.keys(remote.funds).length > 0) {
            setFunds(remote.funds);
            localStorage.setItem('tradesmart_funds_v3', JSON.stringify(remote.funds));
          }
          if (remote.orders && Array.isArray(remote.orders) && remote.orders.length > 0) {
            setOrders(remote.orders);
            localStorage.setItem('tradesmart_orders_v3', JSON.stringify(remote.orders));
          }
          if (remote.ledger && Array.isArray(remote.ledger) && remote.ledger.length > 0) {
            setLedger(remote.ledger);
            localStorage.setItem('tradesmart_ledger_v3', JSON.stringify(remote.ledger));
          }
          if (remote.setups && Array.isArray(remote.setups) && remote.setups.length > 0) {
            setSetups(remote.setups);
            localStorage.setItem('tradesmart_setups', JSON.stringify(remote.setups));
          }
        } else if (hasLocalData) {
          // Push current state to server so server is always synchronized
          await fetch('/api/terminal/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              positions: positionsRef.current,
              watchlist: watchlistInstrumentsRef.current,
              funds: fundsRef.current,
              orders: ordersRef.current,
              ledger: ledgerRef.current,
              setups: setupsRef.current,
              username,
            }),
          });
        }
      } catch (e) {
        console.error('State sync error:', e);
      } finally {
        if (isMounted) isSyncInitialLoadedRef.current = true;
      }
    };

    syncWithBackend();
    return () => {
      isMounted = false;
    };
  }, [username]);

  // Debounced auto-save to server on state modifications
  useEffect(() => {
    if (!isSyncInitialLoadedRef.current) return;
    const timer = setTimeout(() => {
      fetch('/api/terminal/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positions,
          watchlist: watchlistInstruments,
          funds,
          orders,
          ledger,
          setups,
          username,
        }),
      }).catch(() => {});
    }, 1000);
    return () => clearTimeout(timer);
  }, [positions, watchlistInstruments, funds, orders, ledger, setups, username]);

  // Fast lookup map of live quotes with whitespace normalization
  // Fast lookup map of live quotes with whitespace and contract-key normalization
  const liveQuotesMap = useMemo(() => {
    const map: Record<string, MarketQuote> = {};
    liveAll.forEach((q) => {
      map[q.symbol] = q;
      map[q.symbol.replace(/\s+/g, '')] = q;
      const k = getContractKey(q.symbol);
      if (k) map[k] = q;
    });
    return map;
  }, [liveAll]);

  // Unified Quotes lookup map for portfolio & order checks
  const quotesMap = useMemo(() => {
    const map: Record<string, MarketQuote> = {};
    liveAll.forEach((q) => {
      map[q.symbol] = q;
      map[q.symbol.replace(/\s+/g, '')] = q;
      const k = getContractKey(q.symbol);
      if (k) map[k] = q;
    });
    watchlistInstruments.forEach((inst) => {
      const stripped = inst.symbol.replace(/\s+/g, '');
      const k = getContractKey(inst.symbol);
      const rawK = inst.rawSymbol ? getContractKey(inst.rawSymbol) : '';

      if (!map[inst.symbol]) {
        if (map[k]) {
          map[inst.symbol] = map[k];
        } else if (rawK && map[rawK]) {
          map[inst.symbol] = map[rawK];
        } else if (map[stripped]) {
          map[inst.symbol] = map[stripped];
        } else {
          const isOption = inst.type === 'CE' || inst.type === 'PE' || inst.symbol.endsWith('CE') || inst.symbol.endsWith('PE');
          const basePrice =
            inst.ltp && inst.ltp > 0
              ? inst.ltp
              : (isOption
                  ? (inst.prevClose && inst.prevClose < 5000 ? inst.prevClose : 50.0)
                  : (inst.prevClose || 1000.0));
          map[inst.symbol] = {
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
        }
      }
    });
    return map;
  }, [liveAll, watchlistInstruments]);

  // Pinned quotes
  const niftyQuote = quotesMap['NIFTY 50'];
  const bankNiftyQuote = quotesMap['BANK NIFTY'];
  const sensexQuote = quotesMap['SENSEX'];

  // -------------------------------------------------------------
  // 10. Margin & Hedging Calculation Engine
  // -------------------------------------------------------------
  const recomputePortfolioMarginAndHedging = (currPositions: PositionItem[]) => {
    // Only calculate margin for active open positions (closed positions release all margin)
    const openPositions = currPositions.filter((p) => p.quantity !== 0 && p.status !== 'CLOSED');
    if (openPositions.length === 0) {
      return { totalMargin: 0, grossMargin: 0, hedgeDiscount: 0 };
    }

    let gross = 0;
    const underlyingGroups: Record<string, PositionItem[]> = {};

    openPositions.forEach((pos) => {
      const u = pos.underlying || 'NIFTY 50';
      if (!underlyingGroups[u]) underlyingGroups[u] = [];
      underlyingGroups[u].push(pos);

      const isLong = pos.quantity > 0;
      const isOption = pos.symbol.includes('CE') || pos.symbol.includes('PE');
      const spot = spotsRef.current[u] || pos.lastPrice || 1000.0;
      const baseSpan =
        u === 'NIFTY 50' ? 115000 :
        u === 'BANK NIFTY' ? 125000 :
        u === 'SENSEX' ? 140000 :
        u === 'RELIANCE' ? 140000 :
        Math.max(25000, Math.round(spot * (pos.lotSize || 250) * 0.20));
      const lots = Math.abs(pos.quantity) / (pos.lotSize || 25);

      if (isLong && isOption) {
        gross += pos.buyAvgPrice * pos.quantity;
      } else {
        gross += baseSpan * lots;
      }
    });

    let discount = 0;
    Object.entries(underlyingGroups).forEach(([u, group]) => {
      const hasFutures = group.some((p) => p.symbol.includes('FUT'));
      const hasLongPuts = group.some((p) => p.symbol.includes('PE') && p.quantity > 0);
      const hasLongCalls = group.some((p) => p.symbol.includes('CE') && p.quantity > 0);
      const hasShortOptions = group.some((p) => p.quantity < 0);

      const spot = spotsRef.current[u] || 1000.0;
      const baseSpan =
        u === 'NIFTY 50' ? 115000 :
        u === 'BANK NIFTY' ? 125000 :
        u === 'SENSEX' ? 140000 :
        u === 'RELIANCE' ? 140000 :
        Math.max(25000, Math.round(spot * (group[0]?.lotSize || 250) * 0.20));

      if (hasFutures && hasLongPuts) {
        // High hedge benefit for protective put (e.g. Long Stock/Fut + Long Put)
        discount += baseSpan * 0.70;
      } else if (hasLongCalls && hasShortOptions) {
        discount += baseSpan * 0.65;
      } else if (hasLongPuts && hasShortOptions) {
        discount += baseSpan * 0.65;
      } else if (group.length > 1) {
        discount += baseSpan * 0.50;
      }
    });

    const net = Math.max(0, Math.round(gross - discount));
    return {
      totalMargin: net,
      grossMargin: Math.round(gross),
      hedgeDiscount: Math.round(discount),
    };
  };

  // -------------------------------------------------------------
  // 11. 3:15 PM MIS Auto Square-Off Check (Requirement 3)
  // -------------------------------------------------------------
  useEffect(() => {
    if (isAfter315 && positions.some((p) => p.product === 'MIS')) {
      // Auto square off all MIS positions at 3:15 PM!
      soundManager.playOrderSuccess();
      const nowIso = new Date().toISOString();
      const misPositions = positions.filter((p) => p.product === 'MIS');
      let totalSquareOffRealized = 0;

      const autoOrders: OrderItem[] = misPositions.map((p) => {
        const q = quotesMap[p.symbol];
        const ltp = q ? q.ltp : p.lastPrice;
        const side: TransactionType = p.quantity > 0 ? 'SELL' : 'BUY';
        const legPnl = p.quantity > 0
          ? (ltp - p.buyAvgPrice) * p.quantity
          : (p.sellAvgPrice - ltp) * Math.abs(p.quantity);
        totalSquareOffRealized += legPnl;

        return {
          id: `AUTO-SQ-315-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          symbol: p.symbol,
          exchange: p.exchange,
          transactionType: side,
          orderType: 'MARKET',
          product: 'MIS',
          quantity: Math.abs(p.quantity),
          price: ltp,
          averagePrice: ltp,
          status: 'COMPLETE',
          statusMessage: 'Auto Square-Off (MIS 3:15 PM Broker Cutoff)',
          strategyTag: p.strategyTag || 'Intraday-SquareOff',
          placedAt: nowIso,
          completedAt: nowIso,
        };
      });

      setOrders((prev) => [...autoOrders, ...prev]);

      setLedger((prev) => [
        {
          id: prev.length + 1,
          timestamp: nowIso,
          particulars: `Broker 03:15 PM Auto Square-Off: Closed ${misPositions.length} Intraday (MIS) positions`,
          voucherType: 'SQUARE_OFF',
          debit: totalSquareOffRealized < 0 ? Math.abs(totalSquareOffRealized) : 0,
          credit: totalSquareOffRealized > 0 ? totalSquareOffRealized : 0,
          runningBalance: funds.availableCash + totalSquareOffRealized,
          referenceId: 'MIS-315-CUTOFF',
        },
        ...prev,
      ]);

      // Remove MIS positions, keep NRML intact
      setPositions((prev) => prev.filter((p) => p.product !== 'MIS'));
      setFunds((prev) => ({
        ...prev,
        realizedPnl: Math.round((prev.realizedPnl + totalSquareOffRealized) * 100) / 100,
        availableCash: Math.round((prev.availableCash + totalSquareOffRealized) * 100) / 100,
      }));
    }
  }, [isAfter315, positions, quotesMap]);

  // Mark-to-market all positions against a set of quotes (shared by simulator and live feed)
  const applyQuotesToPositions = (nextQuotes: MarketQuote[]) => {
    setPositions((prevPositions) => {
      if (prevPositions.length === 0) return prevPositions;

      const quoteLookup: Record<string, MarketQuote> = {};
      nextQuotes.forEach((nq) => {
        quoteLookup[nq.symbol] = nq;
        quoteLookup[nq.symbol.replace(/\s+/g, '')] = nq;
        const k = getContractKey(nq.symbol);
        if (k) quoteLookup[k] = nq;
      });

      let totalUnrealized = 0;
      const updated = prevPositions.map((pos) => {
        // Closed positions do not calculate MTM - keep unrealizedPnl at 0
        if (pos.quantity === 0 || pos.status === 'CLOSED') {
          return pos;
        }

        const k = getContractKey(pos.symbol);
        const q = quoteLookup[pos.symbol] || (k && quoteLookup[k]) || quoteLookup[pos.symbol.replace(/\s+/g, '')];
        const currentLtp = q && q.ltp > 0 ? q.ltp : pos.lastPrice;

        // Auto-correct any corrupted entry price where strike (e.g. 22950) was wrongly saved instead of premium
        let buyAvg = pos.buyAvgPrice;
        let sellAvg = pos.sellAvgPrice;
        const isOption = pos.symbol.endsWith('CE') || pos.symbol.endsWith('PE');
        if (isOption && buyAvg >= 1000 && currentLtp > 0 && currentLtp < 1000) {
          buyAvg = currentLtp;
        }
        if (isOption && sellAvg >= 1000 && currentLtp > 0 && currentLtp < 1000) {
          sellAvg = currentLtp;
        }

        const isLong = pos.quantity > 0;
        const entry = isLong ? buyAvg : (sellAvg || buyAvg);
        const mtm = isLong
          ? (currentLtp - entry) * pos.quantity
          : (entry - currentLtp) * Math.abs(pos.quantity);

        totalUnrealized += mtm;

        return {
          ...pos,
          buyAvgPrice: buyAvg,
          sellAvgPrice: sellAvg,
          lastPrice: currentLtp,
          unrealizedPnl: Math.round(mtm * 100) / 100,
        };
      });

      try {
        localStorage.setItem('tradesmart_positions_v3', JSON.stringify(updated));
      } catch {}

      // Update funds margin & PnL (NO RMS circuit limit)
      setFunds((prevFunds) => {
        const marginDetails = recomputePortfolioMarginAndHedging(updated);
        const net = Math.round((prevFunds.realizedPnl + totalUnrealized) * 100) / 100;
        const availCash = Math.round(
          (prevFunds.startingCapital + prevFunds.realizedPnl - marginDetails.totalMargin) * 100
        ) / 100;

        return {
          ...prevFunds,
          unrealizedPnl: Math.round(totalUnrealized * 100) / 100,
          netPnl: net,
          usedMargin: marginDetails.totalMargin,
          grossMargin: marginDetails.grossMargin,
          hedgeDiscount: marginDetails.hedgeDiscount,
          availableCash: Math.max(0, availCash),
        };
      });

      return updated;
    });
  };

  // -------------------------------------------------------------
  // Order Fill Execution Engine (Shared by Market, Limit, and Triggers)
  // -------------------------------------------------------------
  const executeOrderTrade = (
    orderData: {
      id: string;
      symbol: string;
      exchange: string;
      transactionType: TransactionType;
      orderType: OrderType;
      product: ProductType;
      quantity: number;
      price: number;
      stopLoss?: number;
      strategyTag: string;
      placedAt?: string;
    },
    fillPrice: number,
    isPendingLimitTrigger: boolean = false
  ) => {
    const nowIso = new Date().toISOString();
    const orderId = orderData.id;
    const targetQuote = quotesMap[orderData.symbol];
    const exchange = orderData.exchange || (targetQuote ? targetQuote.exchange : 'NSE');
    const posId = `${orderData.symbol}_${orderData.product}`;
    const signedQty = orderData.transactionType === 'BUY' ? orderData.quantity : -orderData.quantity;

    // 1. Calculate Realized PnL Delta against current positions
    const currPositions = positionsRef.current;
    const existingPos = currPositions.find((p) => p.id === posId);
    let realizedDelta = 0;
    if (existingPos && existingPos.quantity !== 0 && existingPos.status !== 'CLOSED') {
      const currQty = existingPos.quantity;
      if (currQty > 0 && signedQty < 0) {
        const closedQty = Math.min(currQty, Math.abs(signedQty));
        realizedDelta = (fillPrice - existingPos.buyAvgPrice) * closedQty;
      } else if (currQty < 0 && signedQty > 0) {
        const closedQty = Math.min(Math.abs(currQty), signedQty);
        realizedDelta = (existingPos.sellAvgPrice - fillPrice) * closedQty;
      }
    }
    realizedDelta = Math.round(realizedDelta * 100) / 100;

    // 2. Update Positions
    let updatedPositions: PositionItem[] = [];
    const lotSize = targetQuote?.lotSize || 25;
    const underlying = targetQuote?.underlying || (orderData.symbol.split(' ')[0] || 'NIFTY 50');

    if (!existingPos) {
      const newPos: PositionItem = {
        id: posId,
        symbol: orderData.symbol,
        exchange,
        product: orderData.product,
        quantity: signedQty,
        buyAvgPrice: signedQty > 0 ? fillPrice : 0,
        sellAvgPrice: signedQty < 0 ? fillPrice : 0,
        lastPrice: fillPrice,
        unrealizedPnl: 0,
        realizedPnl: 0,
        strategyTag: orderData.strategyTag,
        lotSize,
        underlying,
        updatedAt: nowIso,
        status: 'OPEN',
      };
      updatedPositions = [newPos, ...currPositions];
    } else {
      const currQty = existingPos.quantity;
      const newQty = currQty + signedQty;
      const prevRealized = existingPos.realizedPnl || 0;
      const totalPositionRealized = Math.round((prevRealized + realizedDelta) * 100) / 100;

      if (newQty === 0) {
        updatedPositions = currPositions.map((p) =>
          p.id === posId
            ? {
                ...p,
                quantity: 0,
                status: 'CLOSED' as const,
                exitPrice: fillPrice,
                lastPrice: fillPrice,
                unrealizedPnl: 0,
                realizedPnl: totalPositionRealized,
                updatedAt: nowIso,
                closedAt: nowIso,
              }
            : p
        );
      } else {
        let buyAvg = existingPos.buyAvgPrice;
        let sellAvg = existingPos.sellAvgPrice;

        if (currQty > 0 && signedQty > 0) {
          buyAvg = Math.round(((buyAvg * currQty + fillPrice * signedQty) / newQty) * 100) / 100;
        } else if (currQty < 0 && signedQty < 0) {
          sellAvg = Math.round(((sellAvg * Math.abs(currQty) + fillPrice * Math.abs(signedQty)) / Math.abs(newQty)) * 100) / 100;
        } else if (currQty === 0) {
          buyAvg = signedQty > 0 ? fillPrice : 0;
          sellAvg = signedQty < 0 ? fillPrice : 0;
        }

        updatedPositions = currPositions.map((p) =>
          p.id === posId
            ? {
                ...p,
                quantity: newQty,
                status: 'OPEN' as const,
                buyAvgPrice: buyAvg,
                sellAvgPrice: sellAvg,
                lastPrice: fillPrice,
                realizedPnl: totalPositionRealized,
                strategyTag: orderData.strategyTag,
                updatedAt: nowIso,
              }
            : p
        );
      }
    }

    positionsRef.current = updatedPositions;
    setPositions(updatedPositions);

    // 3. Update Orders list
    const completedOrder: OrderItem = {
      id: orderId,
      symbol: orderData.symbol,
      exchange,
      transactionType: orderData.transactionType,
      orderType: orderData.orderType,
      product: orderData.product,
      quantity: orderData.quantity,
      price: orderData.price,
      stopLoss: orderData.stopLoss,
      averagePrice: fillPrice,
      status: 'COMPLETE',
      statusMessage: isPendingLimitTrigger
        ? `Limit Executed @ ₹${fillPrice.toFixed(2)} (${orderData.strategyTag})`
        : `Executed @ Market ₹${fillPrice.toFixed(2)} (${orderData.strategyTag})`,
      strategyTag: orderData.strategyTag,
      placedAt: orderData.placedAt || nowIso,
      completedAt: nowIso,
    };

    if (isPendingLimitTrigger) {
      setOrders((prev) => {
        const next = prev.map((o) => (o.id === orderId ? completedOrder : o));
        ordersRef.current = next;
        return next;
      });
    } else {
      setOrders((prev) => {
        const next = [completedOrder, ...prev];
        ordersRef.current = next;
        return next;
      });
    }

    // 4. Update Funds if realizedDelta !== 0
    if (realizedDelta !== 0) {
      setFunds((prevFunds) => {
        const nextRealized = Math.round((prevFunds.realizedPnl + realizedDelta) * 100) / 100;
        const nextNet = Math.round((nextRealized + prevFunds.unrealizedPnl) * 100) / 100;
        const nextCash = Math.round((prevFunds.availableCash + realizedDelta) * 100) / 100;
        const updatedFunds = {
          ...prevFunds,
          realizedPnl: nextRealized,
          netPnl: nextNet,
          availableCash: Math.max(0, nextCash),
        };
        fundsRef.current = updatedFunds;
        return updatedFunds;
      });

      // Update Setups
      setSetups((prevSetups) => {
        const nextSetups = prevSetups.map((s) => {
          if (s.name.toLowerCase() === (orderData.strategyTag || '').toLowerCase()) {
            const nextRealized = Math.round((s.realizedPnl + realizedDelta) * 100) / 100;
            const isWin = realizedDelta > 0;
            const isLoss = realizedDelta < 0;
            const winCount = s.winCount + (isWin ? 1 : 0);
            const lossCount = s.lossCount + (isLoss ? 1 : 0);
            const tradesCount = s.tradesCount + 1;
            const winRate = tradesCount > 0 ? Math.round((winCount / tradesCount) * 100) : 0;
            return {
              ...s,
              tradesCount,
              winCount,
              lossCount,
              realizedPnl: nextRealized,
              totalPnl: nextRealized,
              winRate,
            };
          }
          return s;
        });
        setupsRef.current = nextSetups;
        return nextSetups;
      });

      // Record Booked PnL in Ledger
      setLedger((prevLedger) => [
        {
          id: prevLedger.length + 2,
          timestamp: nowIso,
          particulars: `Booked ${realizedDelta >= 0 ? 'Profit' : 'Loss'} [${orderData.strategyTag}]: ${orderData.symbol} (${realizedDelta >= 0 ? '+' : ''}₹${realizedDelta.toFixed(2)})`,
          voucherType: 'REALIZED_PNL',
          debit: realizedDelta < 0 ? Math.abs(realizedDelta) : 0,
          credit: realizedDelta > 0 ? realizedDelta : 0,
          runningBalance: fundsRef.current.availableCash + realizedDelta,
          referenceId: `PNL-${orderId}`,
        },
        ...prevLedger,
      ]);
    }

    // Record Trade in Ledger
    setLedger((prevLedger) => [
      {
        id: prevLedger.length + 1,
        timestamp: nowIso,
        particulars: `Trade [${orderData.strategyTag}]: ${orderData.symbol} (${orderData.transactionType} ${orderData.quantity} @ ₹${fillPrice.toFixed(2)})`,
        voucherType: 'TRADE',
        debit: orderData.transactionType === 'BUY' ? fillPrice * orderData.quantity : 0,
        credit: orderData.transactionType === 'SELL' ? fillPrice * orderData.quantity : 0,
        runningBalance: fundsRef.current.availableCash,
        referenceId: orderId,
      },
      ...prevLedger,
    ]);

    soundManager.playOrderSuccess();
  };

  // -------------------------------------------------------------
  // Pending Limit Order & Stop Loss / Target Matching Engine (Runs on every price tick)
  // -------------------------------------------------------------
  const checkAndTriggerPendingOrders = (currentQuotes: MarketQuote[]) => {
    const currentOrders = ordersRef.current;
    const openOrders = currentOrders.filter((o) => o.status === 'OPEN' && o.orderType === 'LIMIT');
    if (openOrders.length === 0) return;

    const quoteLookup: Record<string, MarketQuote> = {};
    currentQuotes.forEach((q) => {
      quoteLookup[q.symbol] = q;
      quoteLookup[q.symbol.replace(/\s+/g, '')] = q;
    });

    openOrders.forEach((ord) => {
      const stripped = ord.symbol.replace(/\s+/g, '');
      const q = quoteLookup[ord.symbol] || quoteLookup[stripped];
      if (!q || !q.ltp) return;

      let shouldTrigger = false;
      if (ord.isStopLoss) {
        // Stop Loss: If SELL order (protecting Long position), trigger when price falls <= SL
        if (ord.transactionType === 'SELL' && q.ltp <= ord.price) {
          shouldTrigger = true;
        }
        // Stop Loss: If BUY order (protecting Short position), trigger when price rises >= SL
        else if (ord.transactionType === 'BUY' && q.ltp >= ord.price) {
          shouldTrigger = true;
        }
      } else if (ord.isTarget) {
        // Target: If SELL order (closing Long position), trigger when price rises >= Target
        if (ord.transactionType === 'SELL' && q.ltp >= ord.price) {
          shouldTrigger = true;
        }
        // Target: If BUY order (closing Short position), trigger when price falls <= Target
        else if (ord.transactionType === 'BUY' && q.ltp <= ord.price) {
          shouldTrigger = true;
        }
      } else {
        // Standard Limit order
        if (ord.transactionType === 'BUY' && q.ltp <= ord.price) {
          shouldTrigger = true;
        } else if (ord.transactionType === 'SELL' && q.ltp >= ord.price) {
          shouldTrigger = true;
        }
      }

      if (shouldTrigger) {
        executeOrderTrade(ord, ord.price, true);

        // OCO (One-Cancels-the-Other): If an SL or Target order executed, cancel its counterpart!
        if (ord.parentPositionId) {
          const parentId = ord.parentPositionId;
          const wasSl = ord.isStopLoss;
          setOrders((prev) => {
            const next = prev.map((o) => {
              if (o.parentPositionId === parentId && o.id !== ord.id && o.status === 'OPEN') {
                return {
                  ...o,
                  status: 'CANCELLED' as const,
                  statusMessage: `Cancelled by OCO (${wasSl ? 'Stop Loss' : 'Target'} triggered)`,
                  completedAt: new Date().toISOString(),
                };
              }
              return o;
            });
            ordersRef.current = next;
            return next;
          });

          // Clear SL/Tgt fields on the position
          setPositions((prev) => {
            const next = prev.map((p) => {
              if (p.id === parentId) {
                return {
                  ...p,
                  slPrice: undefined,
                  targetPrice: undefined,
                  slOrderId: undefined,
                  targetOrderId: undefined,
                };
              }
              return p;
            });
            positionsRef.current = next;
            return next;
          });
        }
      }
    });
  };

  // -------------------------------------------------------------
  // 12. Real Broker Portal Feed (Angel One SmartAPI)
  // -------------------------------------------------------------

  // -------------------------------------------------------------
  // 12b. Live Market Feed (Angel One SmartAPI through backend)
  // -------------------------------------------------------------
  useEffect(() => {
    localStorage.setItem('tradesmart_live_enabled', liveEnabled ? '1' : '0');
    if (!liveEnabled) {
      setLiveStatus({ connected: false, error: null, marketOpen: false, ageSeconds: null });
      setLiveAll([]);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const snap = await liveQuotes();
        if (cancelled) return;
        const withFlash: MarketQuote[] = snap.quotes.map((q) => {
          const prev = prevPricesRef.current[q.symbol];
          prevPricesRef.current[q.symbol] = q.ltp;
          const flash: 'up' | 'down' | null = prev === undefined ? null : q.ltp > prev ? 'up' : q.ltp < prev ? 'down' : null;
          return { ...q, flash };
        });
        liveDepthRef.current = snap.depth || {};
        setLiveAll(withFlash);
        checkAndTriggerPendingOrders(withFlash);
        setLiveStatus({
          connected: true,
          broker: snap.broker || 'angelone',
          error: snap.error,
          marketOpen: Object.values(snap.market_open || {}).some(Boolean),
          ageSeconds: snap.age_seconds,
        });
        applyQuotesToPositions(withFlash);
      } catch (e: any) {
        if (cancelled) return;
        setLiveStatus((st) => ({ ...st, connected: false, error: e?.message || 'Live feed unavailable' }));
        // backend restarted / not logged in yet: try to (re)connect at most every 30s
        if (Date.now() - lastAutoConnectRef.current > 30000) {
          lastAutoConnectRef.current = Date.now();
          liveConnect().catch((err) => setLiveStatus((st) => ({ ...st, error: err?.message || st.error })));
        }
      }
    };
    poll();
    const id = setInterval(poll, 1500);
    return () => { cancelled = true; clearInterval(id); };
  }, [liveEnabled]);

  // Keep all active watchlist items, open positions, and pending orders subscribed on the backend
  const activeSymbolsKey = useMemo(() => {
    const syms = new Set<string>();
    watchlistInstruments.forEach((w) => {
      syms.add(w.symbol);
      if (w.rawSymbol) syms.add(w.rawSymbol);
    });
    positions.forEach((p) => syms.add(p.symbol));
    orders.filter((o) => o.status === 'OPEN').forEach((o) => syms.add(o.symbol));
    return Array.from(syms).sort().join('|');
  }, [watchlistInstruments, positions, orders]);

  useEffect(() => {
    if (liveActive && activeSymbolsKey) {
      liveSubscribe(activeSymbolsKey.split('|'));
    }
  }, [liveActive, activeSymbolsKey]);

  // Unified Watchlist quotes: ALWAYS derived strictly from user's watchlistInstruments
  // If watchlistInstruments is empty -> displayedWatchlistQuotes is [] (completely blank!)
  // If user adds an instrument -> instantly displayed (0ms) and streamed with real Angel One live quotes!
  const displayedWatchlistQuotes = useMemo(() => {
    return watchlistInstruments.map((inst) => {
      const stripped = inst.symbol.replace(/\s+/g, '');
      const k = getContractKey(inst.symbol);
      const raw = inst.rawSymbol ? inst.rawSymbol.replace(/\s+/g, '') : stripped;
      const rawK = inst.rawSymbol ? getContractKey(inst.rawSymbol) : '';
      const live =
        liveQuotesMap[inst.symbol] ||
        (k && liveQuotesMap[k]) ||
        liveQuotesMap[stripped] ||
        (inst.rawSymbol && liveQuotesMap[inst.rawSymbol]) ||
        (rawK && liveQuotesMap[rawK]) ||
        liveQuotesMap[raw];
      if (live) {
        return { ...live, symbol: inst.symbol, rawSymbol: inst.rawSymbol };
      }
      const isOption = inst.type === 'CE' || inst.type === 'PE' || inst.symbol.endsWith('CE') || inst.symbol.endsWith('PE');
      const basePrice =
        inst.ltp && inst.ltp > 0
          ? inst.ltp
          : (isOption
              ? (inst.prevClose && inst.prevClose < 5000 ? inst.prevClose : 50.0)
              : (inst.prevClose || 1000.0));
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
  }, [watchlistInstruments, liveQuotesMap]);

  // Keep an open depth modal in sync with the real order book
  useEffect(() => {
    if (!liveActive || !selectedDepthQuote) return;
    const q = liveAll.find((x) => x.symbol === selectedDepthQuote.symbol);
    if (!q) return;
    setSelectedDepthData(liveDepthRef.current[q.symbol] || { bids: [], asks: [], totalBuyQty: 0, totalSellQty: 0 });
    if (q.ltp !== selectedDepthQuote.ltp) setSelectedDepthQuote(q);
  }, [liveAll, liveActive, selectedDepthQuote]);

  // -------------------------------------------------------------
  // 13. Order Placement Handler (Strict 3:10 PM MIS check, NO RMS limits)
  // -------------------------------------------------------------
  const handlePlaceOrder = (newOrderReq: {
    symbol: string;
    transactionType: TransactionType;
    orderType: OrderType;
    product: ProductType;
    quantity: number;
    price: number;
    stopLoss?: number;
    strategyTag: string;
  }) => {
    // License Enforcement: Trading is blocked if license is inactive / expired
    if (license && !license.is_active) {
      setIsLicenseModalOpen(true);
      soundManager.playOrderReject();
      return;
    }

    const nowIso = new Date().toISOString();
    const orderId = `ORD-${Date.now()}`;
    const strippedSymbol = newOrderReq.symbol.replace(/\s+/g, '');
    const contractKey = getContractKey(newOrderReq.symbol);
    const targetQuote =
      quotesMap[newOrderReq.symbol] ||
      (contractKey && quotesMap[contractKey]) ||
      quotesMap[strippedSymbol] ||
      liveQuotesMap[newOrderReq.symbol] ||
      (contractKey && liveQuotesMap[contractKey]) ||
      liveQuotesMap[strippedSymbol] ||
      (orderModalData?.quote.symbol === newOrderReq.symbol ? orderModalData.quote : undefined);
    const exchange = targetQuote ? targetQuote.exchange : 'NSE';
    const isOption = newOrderReq.symbol.endsWith('CE') || newOrderReq.symbol.endsWith('PE');
    let currentLtp =
      targetQuote && targetQuote.ltp > 0
        ? targetQuote.ltp
        : (orderModalData?.quote && orderModalData.quote.symbol === newOrderReq.symbol && orderModalData.quote.ltp > 0
            ? orderModalData.quote.ltp
            : newOrderReq.price);

    // Safeguard: options should never execute at a 5-digit strike price!
    if (isOption && currentLtp >= 1000) {
      if (newOrderReq.price > 0 && newOrderReq.price < 1000) {
        currentLtp = newOrderReq.price;
      } else if (targetQuote && targetQuote.prevClose && targetQuote.prevClose < 1000) {
        currentLtp = targetQuote.prevClose;
      } else {
        currentLtp = 50.0;
      }
    }

    // Requirement 2: 3:10 PM MIS Blockage
    if (newOrderReq.product === 'MIS' && isAfter310) {
      soundManager.playOrderReject();
      const rejectedOrder: OrderItem = {
        id: orderId,
        symbol: newOrderReq.symbol,
        exchange,
        transactionType: newOrderReq.transactionType,
        orderType: newOrderReq.orderType,
        product: newOrderReq.product,
        quantity: newOrderReq.quantity,
        price: newOrderReq.price,
        averagePrice: 0,
        status: 'REJECTED',
        statusMessage: 'Rejected: MIS orders disabled after 03:10 PM cutoff as per exchange auto square-off rules. Please use NRML.',
        strategyTag: newOrderReq.strategyTag,
        placedAt: nowIso,
      };
      setOrders((prev) => {
        const next = [rejectedOrder, ...prev];
        ordersRef.current = next;
        return next;
      });
      setOrderModalData(null);
      return;
    }

    // Limit Order Matching Logic
    // If BUY and price < currentLtp OR SELL and price > currentLtp, order remains OPEN / PENDING!
    if (newOrderReq.orderType === 'LIMIT') {
      const isPendingBuy = newOrderReq.transactionType === 'BUY' && newOrderReq.price < currentLtp;
      const isPendingSell = newOrderReq.transactionType === 'SELL' && newOrderReq.price > currentLtp;

      if (isPendingBuy || isPendingSell) {
        soundManager.play('order_placed');
        const pendingOrder: OrderItem = {
          id: orderId,
          symbol: newOrderReq.symbol,
          exchange,
          transactionType: newOrderReq.transactionType,
          orderType: newOrderReq.orderType,
          product: newOrderReq.product,
          quantity: newOrderReq.quantity,
          price: newOrderReq.price,
          stopLoss: newOrderReq.stopLoss,
          averagePrice: 0,
          status: 'OPEN',
          statusMessage: `Limit Pending @ ₹${newOrderReq.price.toFixed(2)} (LTP: ₹${currentLtp.toFixed(2)})`,
          strategyTag: newOrderReq.strategyTag,
          placedAt: nowIso,
        };
        setOrders((prev) => {
          const next = [pendingOrder, ...prev];
          ordersRef.current = next;
          return next;
        });
        liveSubscribe([newOrderReq.symbol]);
        setOrderModalData(null);
        return;
      }
    }

    // Marketable order: Execute immediately!
    const execPrice = newOrderReq.orderType === 'MARKET' ? currentLtp : newOrderReq.price;
    executeOrderTrade(
      {
        id: orderId,
        symbol: newOrderReq.symbol,
        exchange,
        transactionType: newOrderReq.transactionType,
        orderType: newOrderReq.orderType,
        product: newOrderReq.product,
        quantity: newOrderReq.quantity,
        price: newOrderReq.price,
        stopLoss: newOrderReq.stopLoss,
        strategyTag: newOrderReq.strategyTag,
        placedAt: nowIso,
      },
      execPrice,
      false
    );

    setOrderModalData(null);
  };

  const handleCancelOrder = (orderId: string) => {
    const nowIso = new Date().toISOString();
    const cancelledOrder = ordersRef.current.find((o) => o.id === orderId);

    setOrders((prev) => {
      const next = prev.map((o) =>
        o.id === orderId && o.status === 'OPEN'
          ? {
              ...o,
              status: 'CANCELLED' as const,
              statusMessage: 'Cancelled by User',
              completedAt: nowIso,
            }
          : o
      );
      ordersRef.current = next;
      return next;
    });

    // If it was SL or Target order for a position, clear it from position
    if (cancelledOrder && cancelledOrder.parentPositionId) {
      setPositions((prev) => {
        const next = prev.map((p) => {
          if (p.id === cancelledOrder.parentPositionId) {
            return {
              ...p,
              slPrice: cancelledOrder.isStopLoss ? undefined : p.slPrice,
              slOrderId: cancelledOrder.isStopLoss ? undefined : p.slOrderId,
              targetPrice: cancelledOrder.isTarget ? undefined : p.targetPrice,
              targetOrderId: cancelledOrder.isTarget ? undefined : p.targetOrderId,
            };
          }
          return p;
        });
        positionsRef.current = next;
        return next;
      });
    }

    soundManager.play('order_cancelled');
  };

  const handleModifyOrder = (orderId: string, newPrice: number, newQuantity: number) => {
    let parentPosId: string | undefined;
    let isSl = false;
    let isTgt = false;

    setOrders((prev) => {
      const next = prev.map((o) => {
        if (o.id === orderId && o.status === 'OPEN') {
          parentPosId = o.parentPositionId;
          isSl = !!o.isStopLoss;
          isTgt = !!o.isTarget;
          return {
            ...o,
            price: newPrice,
            quantity: newQuantity,
            statusMessage: `Modified @ ₹${newPrice.toFixed(2)} (Qty: ${newQuantity})`,
          };
        }
        return o;
      });
      ordersRef.current = next;
      return next;
    });

    if (parentPosId) {
      setPositions((prev) => {
        const next = prev.map((p) => {
          if (p.id === parentPosId) {
            return {
              ...p,
              slPrice: isSl ? newPrice : p.slPrice,
              targetPrice: isTgt ? newPrice : p.targetPrice,
            };
          }
          return p;
        });
        positionsRef.current = next;
        return next;
      });
    }

    try {
      soundManager.play('order_placed');
    } catch {}
  };

  const handleSetSlTarget = (
    position: PositionItem,
    slPrice: number | null,
    targetPrice: number | null
  ) => {
    const nowIso = new Date().toISOString();
    const posId = position.id;
    const isLong = position.quantity > 0;
    const exitSide: TransactionType = isLong ? 'SELL' : 'BUY';
    const qty = Math.abs(position.quantity);

    let newSlOrderId: string | undefined = position.slOrderId;
    let newTargetOrderId: string | undefined = position.targetOrderId;

    setOrders((prev) => {
      let updated = [...prev];

      // Handle Stop Loss
      if (slPrice !== null && slPrice > 0) {
        if (position.slOrderId) {
          updated = updated.map((o) =>
            o.id === position.slOrderId && o.status === 'OPEN'
              ? { ...o, status: 'CANCELLED' as const, statusMessage: 'Replaced by modified SL', completedAt: nowIso }
              : o
          );
        }
        const slId = `SL_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        newSlOrderId = slId;
        const slOrder: OrderItem = {
          id: slId,
          symbol: position.symbol,
          exchange: position.exchange,
          transactionType: exitSide,
          orderType: 'LIMIT',
          product: position.product,
          quantity: qty,
          price: slPrice,
          status: 'OPEN',
          statusMessage: `Stop Loss pending @ ₹${slPrice.toFixed(2)}`,
          placedAt: nowIso,
          strategyTag: position.strategyTag || 'StopLoss',
          parentPositionId: posId,
          isStopLoss: true,
        };
        updated = [slOrder, ...updated];
      } else if (slPrice === null && position.slOrderId) {
        updated = updated.map((o) =>
          o.id === position.slOrderId && o.status === 'OPEN'
            ? { ...o, status: 'CANCELLED' as const, statusMessage: 'SL Cancelled by User', completedAt: nowIso }
            : o
        );
        newSlOrderId = undefined;
      }

      // Handle Target
      if (targetPrice !== null && targetPrice > 0) {
        if (position.targetOrderId) {
          updated = updated.map((o) =>
            o.id === position.targetOrderId && o.status === 'OPEN'
              ? { ...o, status: 'CANCELLED' as const, statusMessage: 'Replaced by modified Target', completedAt: nowIso }
              : o
          );
        }
        const tgtId = `TGT_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        newTargetOrderId = tgtId;
        const tgtOrder: OrderItem = {
          id: tgtId,
          symbol: position.symbol,
          exchange: position.exchange,
          transactionType: exitSide,
          orderType: 'LIMIT',
          product: position.product,
          quantity: qty,
          price: targetPrice,
          status: 'OPEN',
          statusMessage: `Target limit pending @ ₹${targetPrice.toFixed(2)}`,
          placedAt: nowIso,
          strategyTag: position.strategyTag || 'Target',
          parentPositionId: posId,
          isTarget: true,
        };
        updated = [tgtOrder, ...updated];
      } else if (targetPrice === null && position.targetOrderId) {
        updated = updated.map((o) =>
          o.id === position.targetOrderId && o.status === 'OPEN'
            ? { ...o, status: 'CANCELLED' as const, statusMessage: 'Target Cancelled by User', completedAt: nowIso }
            : o
        );
        newTargetOrderId = undefined;
      }

      ordersRef.current = updated;
      return updated;
    });

    setPositions((prev) => {
      const updated = prev.map((p) => {
        if (p.id === posId) {
          return {
            ...p,
            slPrice: slPrice !== null && slPrice > 0 ? slPrice : undefined,
            targetPrice: targetPrice !== null && targetPrice > 0 ? targetPrice : undefined,
            slOrderId: slPrice !== null && slPrice > 0 ? newSlOrderId : undefined,
            targetOrderId: targetPrice !== null && targetPrice > 0 ? newTargetOrderId : undefined,
          };
        }
        return p;
      });
      positionsRef.current = updated;
      return updated;
    });

    try {
      soundManager.play('order_placed');
    } catch {}
  };

  // -------------------------------------------------------------
  // 14. Setup Handlers (Capital allocation, No Deletion)
  // -------------------------------------------------------------
  const handleCreateSetup = (newSetup: {
    name: string;
    description: string;
    color: string;
    definedCapital?: number;
  }) => {
    const s: SetupItem = {
      id: `setup-${Date.now()}`,
      name: newSetup.name,
      description: newSetup.description,
      color: newSetup.color,
      definedCapital: newSetup.definedCapital || 2000000,
      createdAt: new Date().toISOString(),
      tradesCount: 0,
      winCount: 0,
      lossCount: 0,
      totalPnl: 0,
      realizedPnl: 0,
      winRate: 0,
      profitFactor: 2.0,
      riskReward: 2.0,
      roi: 0,
      maxDrawdown: 0,
    };
    setSetups((prev) => [s, ...prev]);
  };

  const handleUpdateSetupCapital = (setupId: string, newCapital: number) => {
    setSetups((prev) =>
      prev.map((s) => (s.id === setupId ? { ...s, definedCapital: newCapital } : s))
    );
  };

  const handleCreateQuickSetup = (name: string) => {
    if (!setups.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      handleCreateSetup({
        name,
        description: 'Quick Setup created from Order Modal',
        color: '#0284c7',
        definedCapital: 2000000,
      });
    }
  };

  // -------------------------------------------------------------
  // 15. Exit Handlers (Single Leg, Group Spread, All)
  // -------------------------------------------------------------
  const handleExitPosition = (positionId: string, percentageOrQty: number, isDirectQty: boolean = false) => {
    const pos = positions.find((p) => p.id === positionId);
    if (!pos) return;

    const totalQty = Math.abs(pos.quantity);
    let exitQty = isDirectQty
      ? Math.max(pos.lotSize, Math.min(totalQty, Math.round(percentageOrQty / pos.lotSize) * pos.lotSize))
      : Math.max(pos.lotSize, Math.min(totalQty, Math.round((totalQty * (percentageOrQty / 100)) / pos.lotSize) * pos.lotSize));

    if (percentageOrQty === 100 && !isDirectQty) {
      exitQty = totalQty;
    }

    if (exitQty >= totalQty) {
      exitQty = totalQty;
      // Auto-cancel open SL & Target orders for this position
      setOrders((prev) => {
        const next = prev.map((o) =>
          o.parentPositionId === positionId && o.status === 'OPEN'
            ? {
                ...o,
                status: 'CANCELLED' as const,
                statusMessage: 'Cancelled (Position Closed)',
                completedAt: new Date().toISOString(),
              }
            : o
        );
        ordersRef.current = next;
        return next;
      });
    }

    const quote = quotesMap[pos.symbol];
    const ltp = quote ? quote.ltp : pos.lastPrice;
    const side: TransactionType = pos.quantity > 0 ? 'SELL' : 'BUY';

    handlePlaceOrder({
      symbol: pos.symbol,
      transactionType: side,
      orderType: 'MARKET',
      product: pos.product,
      quantity: exitQty,
      price: ltp,
      strategyTag: pos.strategyTag || 'Square-Off',
    });
  };

  // Exit all legs of a specific group spread
  const handleExitGroupPositions = (positionIds: string[]) => {
    positionIds.forEach((pid) => {
      const pos = positions.find((p) => p.id === pid);
      if (!pos || pos.quantity === 0 || pos.status === 'CLOSED') return;
      const quote = quotesMap[pos.symbol];
      const ltp = quote ? quote.ltp : pos.lastPrice;
      const side: TransactionType = pos.quantity > 0 ? 'SELL' : 'BUY';

      // Auto-cancel open SL & Target orders for this position
      setOrders((prev) => {
        const next = prev.map((o) =>
          o.parentPositionId === pid && o.status === 'OPEN'
            ? {
                ...o,
                status: 'CANCELLED' as const,
                statusMessage: 'Cancelled (Group Exit)',
                completedAt: new Date().toISOString(),
              }
            : o
        );
        ordersRef.current = next;
        return next;
      });

      handlePlaceOrder({
        symbol: pos.symbol,
        transactionType: side,
        orderType: 'MARKET',
        product: pos.product,
        quantity: Math.abs(pos.quantity),
        price: ltp,
        strategyTag: pos.strategyTag || 'Group Exit',
      });
    });
  };

  const handleExitAllPositions = () => {
    // Auto-cancel all open SL & Target orders
    setOrders((prev) => {
      const next = prev.map((o) =>
        o.parentPositionId && o.status === 'OPEN'
          ? {
              ...o,
              status: 'CANCELLED' as const,
              statusMessage: 'Cancelled (Exit All Positions)',
              completedAt: new Date().toISOString(),
            }
          : o
      );
      ordersRef.current = next;
      return next;
    });

    positions
      .filter((pos) => pos.quantity !== 0 && pos.status !== 'CLOSED')
      .forEach((pos) => {
        const quote = quotesMap[pos.symbol];
        const ltp = quote ? quote.ltp : pos.lastPrice;
        const side: TransactionType = pos.quantity > 0 ? 'SELL' : 'BUY';

        handlePlaceOrder({
          symbol: pos.symbol,
          transactionType: side,
          orderType: 'MARKET',
          product: pos.product,
          quantity: Math.abs(pos.quantity),
          price: ltp,
          strategyTag: pos.strategyTag || 'Emergency Exit All',
        });
      });
  };

  // 15b. Settle / Archive closed positions to PnL (EOD rollover / manual settle)
  const handleSettleClosedPositions = () => {
    setPositions((prev) => prev.filter((p) => p.quantity !== 0 && p.status !== 'CLOSED'));
    try {
      soundManager.play('order_placed');
    } catch {}
  };

  // Today's Booked Profit (Realized P&L from trades closed today)
  const todayRealizedPnl = useMemo(() => {
    return positions
      .filter((p) => (p.quantity === 0 || p.status === 'CLOSED') && isTodayIST(p.closedAt || p.updatedAt))
      .reduce((acc, p) => acc + (p.realizedPnl || 0), 0);
  }, [positions]);

  // -------------------------------------------------------------
  // 16. Watchlist Handlers & Scrip Master
  // -------------------------------------------------------------
  const handleAddToWatchlist = (inst: any) => {
    try {
      soundManager.play('order_placed');
    } catch {}

    // 1. Instantly add to watchlistInstruments and save to localStorage
    setWatchlistInstruments((prev) => {
      if (
        prev.some(
          (w) =>
            w.symbol === inst.symbol ||
            (inst.rawSymbol && (w.symbol === inst.rawSymbol || w.rawSymbol === inst.rawSymbol))
        )
      ) {
        return prev;
      }
      const next = [...prev, inst];
      try {
        localStorage.setItem('tradesmart_user_watchlist', JSON.stringify(next));
      } catch {}
      return next;
    });

    // 2. Real Broker Portal: immediately subscribe to Angel One SmartAPI live exchange feed
    const syms = [inst.symbol];
    if (inst.rawSymbol && inst.rawSymbol !== inst.symbol) {
      syms.push(inst.rawSymbol);
    }
    liveSubscribe(syms);
  };

  const handleRemoveFromWatchlist = (symbol: string) => {
    setWatchlistInstruments((prev) => prev.filter((w) => w.symbol !== symbol));
    setQuotes((prev) => prev.filter((q) => q.symbol !== symbol));
  };

  const handleLiveConnect = async (broker: 'angelone' | 'fyers' = 'angelone', creds?: any) => {
    if (creds) {
      await connectBroker(broker, creds);
    } else {
      await liveConnect(broker);
    }
    setLiveEnabled(true);
  };
  const handleLiveDisconnect = async () => {
    await disconnectBroker();
    setLiveEnabled(false);
  };

  const handleClearAllData = async (capital: number = DEFAULT_CAPITAL) => {
    const nowIso = new Date().toISOString();
    // 1. Clear frontend localStorage trade data
    localStorage.removeItem('tradesmart_positions_v3');
    localStorage.removeItem('tradesmart_orders_v3');
    localStorage.removeItem('tradesmart_funds_v3');
    localStorage.removeItem('tradesmart_ledger_v3');
    localStorage.removeItem('tradesmart_setups');
    localStorage.removeItem('tradesmart_user_watchlist');

    // 2. Clear state
    setPositions([]);
    setOrders([]);
    setSetups([]);
    setWatchlistInstruments([]);
    setQuotes([]);
    setFunds({
      startingCapital: capital,
      availableCash: capital,
      usedMargin: 0,
      grossMargin: 0,
      hedgeDiscount: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      netPnl: 0,
    });
    setLedger([
      {
        id: 1,
        timestamp: nowIso,
        particulars: `Trading Capital Clean Start (₹${(capital / 10000000).toFixed(2)} Cr)`,
        voucherType: 'DEPOSIT',
        debit: 0,
        credit: capital,
        runningBalance: capital,
        referenceId: 'CLEAN_START',
      },
    ]);

    // 3. Clear backend DB
    try {
      await fetch('/api/account/clear-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capital })
      });
    } catch {}

    soundManager.play('order_placed');
  };

  const handleResetCapital = (newCapital: number) => {
    handleClearAllData(newCapital);
  };

  // Kite-style User ID & Password Auth Handlers
  const handleLogin = async (user: string, pass: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success' || data.status === 'ok' || data.authenticated) {
          const validUser = data.user?.username || user.toUpperCase();
          setUsername(validUser);
          setIsAuthenticated(true);
          localStorage.setItem('tradesmart_authenticated', '1');
          localStorage.setItem('tradesmart_username', validUser);
          soundManager.play('order_placed');

          // Switch and load this user's persistent terminal state from backend
          try {
            const stateRes = await fetch(`/api/terminal/state?username=${encodeURIComponent(validUser)}`);
            if (stateRes.ok) {
              const remote = await stateRes.json();
              if (remote && Object.keys(remote).length > 0) {
                if (remote.positions && Array.isArray(remote.positions)) {
                  const cleanPositions = remote.positions.filter((p: any) => {
                    const isOpen = p.quantity !== 0 && p.status !== 'CLOSED';
                    if (isOpen) return true;
                    return isTodayIST(p.closedAt || p.updatedAt);
                  });
                  setPositions(cleanPositions);
                  localStorage.setItem('tradesmart_positions_v3', JSON.stringify(cleanPositions));
                } else {
                  setPositions([]);
                  localStorage.setItem('tradesmart_positions_v3', JSON.stringify([]));
                }

                if (remote.watchlist && Array.isArray(remote.watchlist)) {
                  setWatchlistInstruments(remote.watchlist);
                  localStorage.setItem('tradesmart_user_watchlist', JSON.stringify(remote.watchlist));
                  const syms: string[] = [];
                  remote.watchlist.forEach((w: any) => {
                    if (w.symbol) syms.push(w.symbol);
                    if (w.rawSymbol && w.rawSymbol !== w.symbol) syms.push(w.rawSymbol);
                  });
                  if (syms.length > 0) liveSubscribe(syms, validUser);
                }

                if (remote.funds && typeof remote.funds === 'object' && Object.keys(remote.funds).length > 0) {
                  setFunds(remote.funds);
                  localStorage.setItem('tradesmart_funds_v3', JSON.stringify(remote.funds));
                } else {
                  const freshFunds = {
                    startingCapital: DEFAULT_CAPITAL,
                    availableCash: DEFAULT_CAPITAL,
                    usedMargin: 0,
                    grossMargin: 0,
                    hedgeDiscount: 0,
                    realizedPnl: 0,
                    unrealizedPnl: 0,
                    netPnl: 0,
                  };
                  setFunds(freshFunds);
                  localStorage.setItem('tradesmart_funds_v3', JSON.stringify(freshFunds));
                }

                if (remote.orders && Array.isArray(remote.orders)) {
                  setOrders(remote.orders);
                  localStorage.setItem('tradesmart_orders_v3', JSON.stringify(remote.orders));
                } else {
                  setOrders([]);
                  localStorage.setItem('tradesmart_orders_v3', JSON.stringify([]));
                }

                if (remote.ledger && Array.isArray(remote.ledger)) {
                  setLedger(remote.ledger);
                  localStorage.setItem('tradesmart_ledger_v3', JSON.stringify(remote.ledger));
                }

                if (remote.setups && Array.isArray(remote.setups)) {
                  setSetups(remote.setups);
                  localStorage.setItem('tradesmart_setups', JSON.stringify(remote.setups));
                }
              } else {
                // New user - give completely fresh isolated ₹1 Cr account!
                setPositions([]);
                setOrders([]);
                const freshFunds = {
                  startingCapital: DEFAULT_CAPITAL,
                  availableCash: DEFAULT_CAPITAL,
                  usedMargin: 0,
                  grossMargin: 0,
                  hedgeDiscount: 0,
                  realizedPnl: 0,
                  unrealizedPnl: 0,
                  netPnl: 0,
                };
                setFunds(freshFunds);
                const freshLedger = [
                  {
                    id: 1,
                    timestamp: new Date().toISOString(),
                    particulars: 'Initial Virtual Trading Capital Allocation (₹1.00 Cr)',
                    voucherType: 'DEPOSIT',
                    debit: 0,
                    credit: DEFAULT_CAPITAL,
                    runningBalance: DEFAULT_CAPITAL,
                    referenceId: 'VIRTUAL-INIT-1CR',
                  },
                ];
                setLedger(freshLedger);
                setWatchlistInstruments(INITIAL_WATCHLIST_INSTRUMENTS);

                localStorage.setItem('tradesmart_positions_v3', JSON.stringify([]));
                localStorage.setItem('tradesmart_orders_v3', JSON.stringify([]));
                localStorage.setItem('tradesmart_funds_v3', JSON.stringify(freshFunds));
                localStorage.setItem('tradesmart_ledger_v3', JSON.stringify(freshLedger));
                localStorage.setItem('tradesmart_user_watchlist', JSON.stringify(INITIAL_WATCHLIST_INSTRUMENTS));
              }
            }
          } catch (e) {
            console.error('State load error on login:', e);
          }

          // Trigger live feed connect for this user
          liveConnect(undefined, validUser).catch(() => {});

          return true;
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Invalid User ID or Password');
      }
    } catch (err: any) {
      if (err?.message && err.message !== 'Failed to fetch') {
        throw err;
      }
      // Backend offline fallback
    }

    const savedUser = (localStorage.getItem('tradesmart_username') || 'HARSHIT').toUpperCase();
    const savedPass = localStorage.getItem('tradesmart_password') || 'trade123';
    if (user.toUpperCase() === savedUser && pass === savedPass) {
      setUsername(user.toUpperCase());
      setIsAuthenticated(true);
      localStorage.setItem('tradesmart_authenticated', '1');
      localStorage.setItem('tradesmart_username', user.toUpperCase());
      soundManager.play('order_placed');
      return true;
    }
    return false;
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('tradesmart_authenticated');
  };

  const handleUpdateCredentials = async (
    oldPassword: string,
    newUsername?: string,
    newPassword?: string
  ): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          old_password: oldPassword,
          new_username: newUsername,
          new_password: newPassword,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success' || data.status === 'ok') {
          if (newUsername) {
            setUsername(newUsername);
            localStorage.setItem('tradesmart_username', newUsername);
          }
          if (newPassword) {
            localStorage.setItem('tradesmart_password', newPassword);
          }
          return true;
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Invalid User ID or Password');
      }
    } catch (err: any) {
      if (err?.message && err.message !== 'Failed to fetch') {
        throw err;
      }
      // Backend offline fallback
    }

    const currentPass = localStorage.getItem('tradesmart_password') || 'trade123';
    if (oldPassword === currentPass) {
      if (newUsername) {
        setUsername(newUsername);
        localStorage.setItem('tradesmart_username', newUsername);
      }
      if (newPassword) {
        localStorage.setItem('tradesmart_password', newPassword);
      }
      return true;
    }
    return false;
  };

  const openOrdersCount = orders.filter((o) => o.status === 'OPEN').length;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#f8fafc]">
      
      {/* TradeSmart Pinned Header */}
      <Header
        niftyQuote={niftyQuote}
        bankNiftyQuote={bankNiftyQuote}
        sensexQuote={sensexQuote}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        openOrdersCount={openOrdersCount}
        openPositionsCount={positions.length}
        availableCash={funds.availableCash}
        soundEnabled={soundEnabled}
        toggleSound={() => {
          const next = !soundEnabled;
          setSoundEnabled(next);
          soundManager.enabled = next;
        }}
        onLockTerminal={handleLogout}
        onOpenSmartAPI={() => setIsSmartApiModalOpen(true)}
        username={username}
        onOpenChangeCredentials={() => setIsChangeCredsOpen(true)}
        onClearAllData={handleClearAllData}
        smartApiConnected={liveActive}
        feedLabel={
          liveActive
            ? (liveStatus.marketOpen
                ? `${liveStatus.broker === 'fyers' ? 'Fyers' : 'Angel'} Live`
                : `${liveStatus.broker === 'fyers' ? 'Fyers' : 'Angel'} Closed`)
            : (liveEnabled ? 'Sim · offline' : 'Sim')
        }
        simulatedTimeStr={simulatedTimeStr}
        isAfter310={isAfter310}
        isAfter315={isAfter315}
        onSimulateTimeJump={handleSimulateTimeJump}
        license={license}
        onOpenLicense={() => setIsLicenseModalOpen(true)}
      />

      {/* Main Terminal Workspace (Left Watchlist + Right Tabs) */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* Left Watchlist */}
        <Watchlist
          quotes={displayedWatchlistQuotes}
          onOpenOrderModal={(q, side) => setOrderModalData({ quote: q, side })}
          onOpenDepthModal={(q) => {
            setSelectedDepthQuote(q);
            setSelectedDepthData(
              liveActive
                ? liveDepthRef.current[q.symbol] || { bids: [], asks: [], totalBuyQty: 0, totalSellQty: 0 }
                : generateMarketDepth(q.ltp, q.lotSize)
            );
          }}
          onAddToWatchlist={handleAddToWatchlist}
          onRemoveFromWatchlist={handleRemoveFromWatchlist}
          allAvailableInstruments={ALL_MASTER_INSTRUMENTS}
        />

        {/* Right Active Workspace Content */}
        <main className="flex-1 overflow-hidden flex flex-col bg-white">
          {activeTab === 'positions' && (
            <PositionsTab
              positions={positions}
              quotesMap={quotesMap}
              onExitPosition={handleExitPosition}
              onExitAllPositions={handleExitAllPositions}
              onExitGroupPositions={handleExitGroupPositions}
              unrealizedPnl={funds.unrealizedPnl}
              todayRealizedPnl={todayRealizedPnl}
              totalRealizedPnl={funds.realizedPnl}
              totalNetPnl={todayRealizedPnl + funds.unrealizedPnl}
              
              onSetSlTarget={handleSetSlTarget}
              orders={orders}
              availableCash={funds.availableCash}
              usedMargin={funds.usedMargin}
            />
          )}

          {activeTab === 'orders' && (
            <OrdersTab
              orders={orders}
              onCancelOrder={handleCancelOrder}
              onModifyOrder={handleModifyOrder}
            />
          )}

          {activeTab === 'setups' && (
            <AnalyticsTab
              setups={setups}
              positions={positions}
              orders={orders}
              onCreateSetup={handleCreateSetup}
              onUpdateSetupCapital={handleUpdateSetupCapital}
              startingCapital={funds.startingCapital}
            />
          )}

          {activeTab === 'funds' && (
            <FundsTab
              funds={funds}
            />
          )}

          {activeTab === 'ledger' && (
            <LedgerTab ledger={ledger} />
          )}
        </main>
      </div>

      {/* Market Depth Modal */}
      {selectedDepthQuote && selectedDepthData && (
        <MarketDepthModal
          quote={selectedDepthQuote}
          depth={selectedDepthData}
          onClose={() => {
            setSelectedDepthQuote(null);
            setSelectedDepthData(null);
          }}
          onOpenOrderModal={(q, side) => {
            setSelectedDepthQuote(null);
            setOrderModalData({ quote: q, side });
          }}
        />
      )}

      {/* Order Window Modal (Strict 3:10 PM MIS cutoff, NO RMS limits) */}
      {orderModalData && (
        <OrderModal
          quote={orderModalData.quote}
          initialSide={orderModalData.side}
          availableCash={funds.availableCash}
          positions={positions}
          setups={setups}
          isAfter310={isAfter310}
          onCreateQuickSetup={handleCreateQuickSetup}
          onClose={() => setOrderModalData(null)}
          onSubmitOrder={handlePlaceOrder}
        />
      )}

      {/* Broker API Connection Modal (Angel One & Fyers) */}
      <SmartAPIModal
        isOpen={isSmartApiModalOpen}
        onClose={() => setIsSmartApiModalOpen(false)}
        liveEnabled={liveEnabled}
        connected={liveActive}
        marketOpen={liveStatus.marketOpen}
        error={liveStatus.error}
        instrumentCount={78618}
        watchlistCount={watchlistInstruments.length}
        activeBroker={liveStatus.broker || 'angelone'}
        onConnect={handleLiveConnect}
        onDisconnect={handleLiveDisconnect}
      />

      {/* Kite-style User ID & Password Authentication Modal */}
      <LoginModal
        isOpen={!isAuthenticated}
        onLogin={handleLogin}
        currentUsername={username}
      />

      {/* Change User ID & Password Modal */}
      <ChangeCredentialsModal
        isOpen={isChangeCredsOpen}
        onClose={() => setIsChangeCredsOpen(false)}
        currentUsername={username}
        onUpdateCredentials={handleUpdateCredentials}
      />

      {/* Hardware Machine-Locked License & DRM Modal */}
      {isLicenseModalOpen && (
        <LicenseModal
          license={license}
          onClose={() => setIsLicenseModalOpen(false)}
          onActivate={handleActivateLicense}
          onStartTrial={handleStartTrial}
          isBlocking={license ? !license.is_active : false}
        />
      )}
    </div>
  );
}
