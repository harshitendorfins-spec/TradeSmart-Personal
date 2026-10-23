import React, { useState, useMemo, useEffect, useRef } from 'react';
import { MarketQuote, MarketSegment } from '../types/trading';
import { Search, Plus, Trash2, BarChart2, TrendingUp, TrendingDown, X, Filter } from 'lucide-react';
import { parseCustomFnoQueries } from '../utils/fnoStocks';

interface WatchlistProps {
  quotes: MarketQuote[];
  onOpenOrderModal: (quote: MarketQuote, side: 'BUY' | 'SELL') => void;
  onOpenDepthModal: (quote: MarketQuote) => void;
  onAddToWatchlist: (instrument: Omit<MarketQuote, 'ltp' | 'change' | 'pchange' | 'open' | 'high' | 'low' | 'close' | 'volume'>) => void;
  onRemoveFromWatchlist: (symbol: string) => void;
  allAvailableInstruments: Omit<MarketQuote, 'ltp' | 'change' | 'pchange' | 'open' | 'high' | 'low' | 'close' | 'volume'>[];
}

export const Watchlist: React.FC<WatchlistProps> = ({
  quotes,
  onOpenOrderModal,
  onOpenDepthModal,
  onAddToWatchlist,
  onRemoveFromWatchlist,
  allAvailableInstruments,
}) => {
  const [activeSegmentFilter, setActiveSegmentFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showSearchResults, setShowSearchResults] = useState<boolean>(false);
  const [backendResults, setBackendResults] = useState<any[]>([]);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Close search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Asynchronously query live Angel One scrip master (78,000+ real F&O contracts and cash equities)
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setBackendResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/instruments/search?q=${encodeURIComponent(q)}&limit=35`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.results)) {
            setBackendResults(data.results);
          }
        }
      } catch {
        // Fallback to local
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Search filter prioritizing real Angel One scrip master contracts (81,000+ real F&O contracts)
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toUpperCase().trim();
    const combined: any[] = [];

    // 1. PRIMARY: Real Angel One master contracts from backend search (sorted nearest expiry first e.g. 19OCT!)
    backendResults.forEach((b) => {
      combined.push({
        symbol: b.symbol,
        rawSymbol: b.rawSymbol || b.symbol,
        name: b.name || b.symbol,
        lotSize: b.lotSize || 1,
        type: b.type || 'FUT',
        exchange: b.exchange || 'NSE',
        segment: b.segment || 'NSE_FO',
        underlying: b.underlying || b.name,
        strike: b.strike,
        expiry: b.expiry,
        prevClose: b.prevClose || 1000.0,
      });
    });

    // 2. Custom parser matches (fallback or supplements)
    const customMatches = parseCustomFnoQueries(searchQuery);
    customMatches.forEach((m) => {
      if (!combined.some((c) => c.symbol === m.symbol || (m.rawSymbol && c.rawSymbol === m.rawSymbol))) {
        combined.push(m);
      }
    });

    // 3. Local matches
    const localMatches = allAvailableInstruments
      .filter((inst) =>
        inst.symbol.toUpperCase().includes(q) ||
        (inst.name && inst.name.toUpperCase().includes(q)) ||
        inst.underlying.toUpperCase().includes(q)
      )
      .slice(0, 30);

    localMatches.forEach((m) => {
      if (!combined.some((c) => c.symbol === m.symbol)) {
        combined.push(m);
      }
    });

    return combined.slice(0, 50);
  }, [searchQuery, allAvailableInstruments, backendResults]);

  const indexNames = useMemo(
    () => ['NIFTY 50', 'BANK NIFTY', 'SENSEX', 'FINNIFTY', 'MIDCPNIFTY', 'BANKEX', 'NIFTY', 'BANKNIFTY'],
    []
  );

  // Segment filtering
  const filteredQuotes = useMemo(() => {
    if (activeSegmentFilter === 'ALL') return quotes;
    if (activeSegmentFilter === 'STOCKS') {
      return quotes.filter((q) => q.exchange === 'NSE' && !indexNames.includes(q.underlying) && q.type !== 'COMMODITY');
    }
    if (activeSegmentFilter === 'INDICES') {
      return quotes.filter((q) => indexNames.includes(q.underlying) || q.type === 'INDEX');
    }
    return quotes;
  }, [quotes, activeSegmentFilter, indexNames]);

  // Existing symbols set with whitespace & rawSymbol normalization
  const currentSymbols = useMemo(() => {
    const set = new Set<string>();
    quotes.forEach((q) => {
      set.add(q.symbol);
      set.add(q.symbol.replace(/\s+/g, ''));
      if ((q as any).rawSymbol) set.add((q as any).rawSymbol);
    });
    return set;
  }, [quotes]);

  const handleSelectItem = (e: React.MouseEvent, item: any) => {
    e.preventDefault();
    e.stopPropagation();
    onAddToWatchlist(item);
    setSearchQuery('');
    setShowSearchResults(false);
  };

  return (
    <div className="flex flex-col h-full bg-white border-r border-[#e2e8f0] select-none w-full md:w-[370px] lg:w-[410px] shrink-0">
      
      {/* Search Input Bar */}
      <div className="p-3 border-b border-[#f1f5f9] relative" ref={searchContainerRef}>
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-[#94a3b8] absolute left-3 pointer-events-none" />
          <input
            type="text"
            placeholder="Search NIFTY, BANKNIFTY, Options, 210+ Stocks (e.g. 23150 CE, RELIANCE, TCS)..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowSearchResults(true);
            }}
            onFocus={() => setShowSearchResults(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchResults.length > 0) {
                e.preventDefault();
                onAddToWatchlist(searchResults[0]);
                setSearchQuery('');
                setShowSearchResults(false);
              } else if (e.key === 'Escape') {
                setShowSearchResults(false);
              }
            }}
            className="w-full pl-9 pr-8 py-2 text-xs bg-[#f8fafc] hover:bg-[#f1f5f9] focus:bg-white border border-[#cbd5e1] focus:border-[#0284c7] rounded outline-none transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setShowSearchResults(false);
              }}
              className="absolute right-2.5 text-[#94a3b8] hover:text-[#475569]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Autocomplete Dropdown */}
        {showSearchResults && searchResults.length > 0 && (
          <div className="absolute left-3 right-3 top-13 bg-white border border-[#cbd5e1] shadow-2xl rounded z-50 max-h-80 overflow-y-auto divide-y divide-[#f1f5f9]">
            {searchResults.map((item) => {
              const stripped = item.symbol.replace(/\s+/g, '');
              const alreadyAdded =
                currentSymbols.has(item.symbol) ||
                currentSymbols.has(stripped) ||
                (item.rawSymbol && currentSymbols.has(item.rawSymbol));
              const typeColor =
                item.type === 'FUT' ? 'bg-blue-50 text-[#0284c7] border-blue-200' :
                item.type === 'CE' ? 'bg-emerald-50 text-[#16a34a] border-emerald-200' :
                item.type === 'PE' ? 'bg-amber-50 text-[#d97706] border-amber-200' :
                'bg-purple-50 text-[#7c3aed] border-purple-200';

              return (
                <div
                  key={item.symbol}
                  onClick={(e) => handleSelectItem(e, item)}
                  className="flex items-center justify-between p-2.5 hover:bg-[#f1f5f9] transition-colors cursor-pointer group"
                >
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-[#0f172a] group-hover:text-[#0284c7] transition-colors">{item.symbol}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${typeColor}`}>
                        {item.type}
                      </span>
                      <span className="text-[9px] font-bold px-1 rounded bg-[#e2e8f0] text-[#475569]">
                        {item.exchange}
                      </span>
                    </div>
                    <span className="text-[10px] text-[#64748b]">
                      {item.name || item.underlying} · Lot: {item.lotSize}
                    </span>
                  </div>
                  {alreadyAdded ? (
                    <span className="text-[10px] text-[#16a34a] font-bold px-2 py-0.5 bg-emerald-50 rounded border border-emerald-200">Added</span>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => handleSelectItem(e, item)}
                      className="px-2.5 py-1 text-[11px] font-bold text-white bg-[#0284c7] hover:bg-[#0369a1] rounded flex items-center gap-1 active:scale-95 transition-all cursor-pointer shadow-2xs"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Segment Filter Strip (MCX Removed - Pure Equity Derivatives) */}
      <div className="flex items-center gap-1 px-3 py-1.5 bg-[#f8fafc] border-b border-[#e2e8f0] overflow-x-auto text-xs">
        {[
          { key: 'ALL', label: 'All Contracts' },
          { key: 'INDICES', label: 'Indices (Nifty, BankNifty...)' },
          { key: 'STOCKS', label: 'F&O Stocks (210+)' },
        ].map((seg) => (
          <button
            key={seg.key}
            onClick={() => setActiveSegmentFilter(seg.key)}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded whitespace-nowrap transition-colors cursor-pointer ${
              activeSegmentFilter === seg.key
                ? 'bg-[#0284c7] text-white shadow-2xs'
                : 'text-[#64748b] hover:text-[#0f172a] hover:bg-[#e2e8f0]'
            }`}
          >
            {seg.label}
          </button>
        ))}
      </div>

      {/* Watchlist Instrument Rows */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#f1f5f9]">
        {quotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-[#64748b] h-64">
            <div className="w-10 h-10 rounded-full bg-blue-50 text-[#0284c7] flex items-center justify-center mb-2">
              <Search className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-[#0f172a]">Your Watchlist is empty</p>
            <p className="text-[11px] text-[#64748b] mt-1 max-w-[220px]">
              Search any of 210+ F&O stocks (TCS, INFY, TATAMOTORS) or Index strikes (NIFTY, BANK NIFTY, FINNIFTY) above to add contracts.
            </p>
          </div>
        ) : filteredQuotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-[#64748b] h-48">
            <p className="text-xs font-semibold text-[#0f172a]">No contracts in this view</p>
            <p className="text-[11px] text-[#94a3b8] mt-1">Switch to "All Contracts" or search above to add</p>
          </div>
        ) : (
          filteredQuotes.map((quote) => {
            const isPositive = quote.change >= 0;
            return (
              <div
                key={quote.symbol}
                className={`group relative flex items-center justify-between px-3.5 py-2.5 hover:bg-[#f8fafc] transition-colors ${
                  quote.flash === 'up' ? 'flash-up' : quote.flash === 'down' ? 'flash-down' : ''
                }`}
              >
                {/* Left: Contract symbol & exchange badge */}
                <div className="flex flex-col min-w-0 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-[#0f172a] truncate">{quote.symbol}</span>
                    <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-[#e2e8f0] text-[#475569]">
                      {quote.exchange}
                    </span>
                  </div>
                  <span className="text-[10px] text-[#64748b] truncate">
                    Lot: {quote.lotSize} · {quote.type}
                  </span>
                </div>

                {/* Right: LTP & Change */}
                <div className="flex flex-col items-end shrink-0 group-hover:opacity-0 transition-opacity">
                  <span
                    className={`tabular-nums text-xs font-bold ${
                      isPositive ? 'text-[#16a34a]' : 'text-[#dc2626]'
                    }`}
                  >
                    ₹{quote.ltp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                  <div className="flex items-center gap-1">
                    <span
                      className={`tabular-nums text-[10px] font-medium ${
                        isPositive ? 'text-[#16a34a]' : 'text-[#dc2626]'
                      }`}
                    >
                      {isPositive ? '+' : ''}
                      {quote.change.toFixed(2)} ({isPositive ? '+' : ''}
                      {quote.pchange.toFixed(2)}%)
                    </span>
                  </div>
                </div>

                {/* Quick Action Hover Buttons */}
                <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1.5 bg-white/95 px-1 py-0.5 rounded shadow-xs border border-[#cbd5e1]">
                  {/* Buy Button */}
                  <button
                    onClick={() => onOpenOrderModal(quote, 'BUY')}
                    title="Buy"
                    className="w-7 h-6 flex items-center justify-center text-[11px] font-bold text-white bg-[#0284c7] hover:bg-[#0369a1] rounded shadow-2xs transition-colors"
                  >
                    B
                  </button>

                  {/* Sell Button */}
                  <button
                    onClick={() => onOpenOrderModal(quote, 'SELL')}
                    title="Sell"
                    className="w-7 h-6 flex items-center justify-center text-[11px] font-bold text-white bg-[#ea580c] hover:bg-[#c2410c] rounded shadow-2xs transition-colors"
                  >
                    S
                  </button>

                  {/* Market Depth Button */}
                  <button
                    onClick={() => onOpenDepthModal(quote)}
                    title="Market Depth"
                    className="w-6 h-6 flex items-center justify-center text-[#64748b] hover:text-[#0f172a] hover:bg-[#f1f5f9] rounded transition-colors"
                  >
                    <BarChart2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Delete Button */}
                  <button
                    onClick={() => onRemoveFromWatchlist(quote.symbol)}
                    title="Delete"
                    className="w-6 h-6 flex items-center justify-center text-[#94a3b8] hover:text-[#dc2626] hover:bg-red-50 rounded transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Watchlist Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-[#e2e8f0] bg-[#f8fafc] text-xs">
        <span className="text-[11px] text-[#64748b] font-medium">Watchlist</span>
        <span className="text-[11px] text-[#0284c7] font-semibold">{quotes.length} Items</span>
      </div>
    </div>
  );
};
