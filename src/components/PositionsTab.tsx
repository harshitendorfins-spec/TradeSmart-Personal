import React, { useState, useMemo } from 'react';
import { PositionItem, MarketQuote, PositionGroup, OrderItem } from '../types/trading';
import {
  Layers,
  LogOut,
  CheckCircle2,
  LayoutGrid,
  List,
  Check,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Activity,
  DollarSign,
  Target,
  ShieldAlert,
  SlidersHorizontal,
  X,
  Edit2
} from 'lucide-react';
import { isTodayIST } from '../utils/fnoStocks';

interface PositionsTabProps {
  positions: PositionItem[];
  quotesMap: Record<string, MarketQuote>;
  onExitPosition: (positionId: string, percentageOrQty: number, isDirectQty?: boolean) => void;
  onExitAllPositions: () => void;
  onExitGroupPositions: (positionIds: string[]) => void;
  unrealizedPnl: number;
  todayRealizedPnl?: number;
  totalRealizedPnl: number;
  totalNetPnl: number;
  onSettleClosedPositions?: () => void;
  onSetSlTarget?: (position: PositionItem, slPrice: number | null, targetPrice: number | null) => void;
  orders?: OrderItem[];
  availableCash?: number;
  usedMargin?: number;
}

export const PositionsTab: React.FC<PositionsTabProps> = ({
  positions,
  quotesMap,
  onExitPosition,
  onExitAllPositions,
  onExitGroupPositions,
  unrealizedPnl,
  todayRealizedPnl,
  totalRealizedPnl,
  totalNetPnl,
  onSettleClosedPositions,
  onSetSlTarget,
  orders = [],
  availableCash = 0,
  usedMargin = 0,
}) => {
  const [selectedTag, setSelectedTag] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');
  const [partialExitTarget, setPartialExitTarget] = useState<PositionItem | null>(null);
  const [selectedPercent, setSelectedPercent] = useState<number>(100);
  const [exitLotsInput, setExitLotsInput] = useState<number>(1);

  // Stop Loss & Target Modal state
  const [slTargetModalPos, setSlTargetModalPos] = useState<PositionItem | null>(null);
  const [inputSlPrice, setInputSlPrice] = useState<string>('');
  const [inputTargetPrice, setInputTargetPrice] = useState<string>('');

  // 1. Separate Active & Today's Positions from Previous Day Settled Positions
  const visiblePositions = useMemo(() => {
    return positions.filter((p) => {
      const isOpen = p.quantity !== 0 && p.status !== 'CLOSED';
      if (isOpen) return true;
      return isTodayIST(p.closedAt || p.updatedAt);
    });
  }, [positions]);

  // Available setup tags from visible positions
  const tags = Array.from(new Set(visiblePositions.map((p) => p.strategyTag || 'General')));

  // Filter positions by Setup Tag AND by Status (Open / Closed / All)
  const filteredPositions = useMemo(() => {
    return visiblePositions.filter((p) => {
      const matchesTag = selectedTag === 'ALL' || (p.strategyTag || 'General') === selectedTag;
      const isClosed = p.quantity === 0 || p.status === 'CLOSED';
      if (!matchesTag) return false;
      if (statusFilter === 'OPEN') return !isClosed;
      if (statusFilter === 'CLOSED') return isClosed;
      return true;
    });
  }, [visiblePositions, selectedTag, statusFilter]);

  const openCount = useMemo(
    () => visiblePositions.filter((p) => p.quantity !== 0 && p.status !== 'CLOSED').length,
    [visiblePositions]
  );
  const closedCount = useMemo(
    () => visiblePositions.filter((p) => p.quantity === 0 || p.status === 'CLOSED').length,
    [visiblePositions]
  );

  // Today's Booked Profit (Realized P&L from trades closed today)
  const computedTodayRealized = useMemo(() => {
    if (todayRealizedPnl !== undefined) return todayRealizedPnl;
    return visiblePositions
      .filter((p) => p.quantity === 0 || p.status === 'CLOSED')
      .reduce((acc, p) => acc + (p.realizedPnl || 0), 0);
  }, [todayRealizedPnl, visiblePositions]);

  // Lookup map of active pending SL and Target orders per position
  const activePositionOrdersMap = useMemo(() => {
    const map: Record<string, { slOrder?: OrderItem; targetOrder?: OrderItem }> = {};
    const openOrders = orders.filter((o) => o.status === 'OPEN');
    openOrders.forEach((ord) => {
      if (ord.parentPositionId) {
        if (!map[ord.parentPositionId]) map[ord.parentPositionId] = {};
        if (ord.isStopLoss || ord.id.includes('-SL-') || (ord.stopLoss && ord.stopLoss > 0)) {
          map[ord.parentPositionId].slOrder = ord;
        } else if (ord.isTarget || ord.id.includes('-TGT-')) {
          map[ord.parentPositionId].targetOrder = ord;
        }
      }
    });
    return map;
  }, [orders]);

  // Group positions by Underlying + Setup (e.g. RELIANCE + Protective Put)
  const groupedPositions = useMemo(() => {
    const groupsMap: Record<string, PositionGroup> = {};

    filteredPositions.forEach((pos) => {
      const quote = quotesMap[pos.symbol];
      const ltp = quote ? quote.ltp : pos.lastPrice;
      const isClosed = pos.quantity === 0 || pos.status === 'CLOSED';
      const isLong = pos.quantity > 0;
      const entryPrice = isLong ? pos.buyAvgPrice : (pos.sellAvgPrice || pos.buyAvgPrice);

      const legPnl = isClosed
        ? 0
        : isLong
        ? (ltp - entryPrice) * pos.quantity
        : (entryPrice - ltp) * Math.abs(pos.quantity);

      const groupKey = `${pos.underlying}_${pos.strategyTag || 'General'}`;

      if (!groupsMap[groupKey]) {
        groupsMap[groupKey] = {
          key: groupKey,
          title: `${pos.underlying} · ${pos.strategyTag || 'General'}`,
          underlying: pos.underlying,
          strategyTag: pos.strategyTag || 'General',
          positions: [],
          totalUnrealizedPnl: 0,
          totalRealizedPnl: 0,
          standaloneMargin: 0,
          hedgedMargin: 0,
          marginBenefit: 0,
          netQty: 0,
        };
      }

      groupsMap[groupKey].positions.push(pos);
      groupsMap[groupKey].totalUnrealizedPnl += legPnl;
      groupsMap[groupKey].totalRealizedPnl += pos.realizedPnl || 0;
      groupsMap[groupKey].netQty += pos.quantity;

      // Standalone margin per open leg only
      if (!isClosed) {
        const baseSpan = pos.underlying === 'NIFTY 50' ? 115000 : (pos.underlying === 'BANK NIFTY' ? 125000 : 140000);
        const isOptionBuy = (pos.symbol.includes('CE') || pos.symbol.includes('PE')) && pos.quantity > 0;
        const legMargin = isOptionBuy ? (pos.buyAvgPrice * pos.quantity) : (baseSpan * (Math.abs(pos.quantity) / (pos.lotSize || 25)));
        groupsMap[groupKey].standaloneMargin += legMargin;
      }
    });

    // Compute Hedge Margin Benefit for each group
    Object.values(groupsMap).forEach((grp) => {
      const openLegs = grp.positions.filter((p) => p.quantity !== 0 && p.status !== 'CLOSED');
      if (openLegs.length <= 1) {
        grp.hedgedMargin = grp.standaloneMargin;
        grp.marginBenefit = 0;
        return;
      }

      const hasFutures = openLegs.some((p) => p.symbol.includes('FUT'));
      const hasPuts = openLegs.some((p) => p.symbol.includes('PE') && p.quantity > 0);
      const hasCalls = openLegs.some((p) => p.symbol.includes('CE') && p.quantity > 0);
      const hasShortOptions = openLegs.some((p) => p.quantity < 0);

      let discountRatio = 0;
      if (hasFutures && hasPuts) {
        discountRatio = 0.70;
      } else if (hasCalls && hasShortOptions) {
        discountRatio = 0.65;
      } else if (hasPuts && hasShortOptions) {
        discountRatio = 0.65;
      } else if (openLegs.length > 1) {
        discountRatio = 0.50;
      }

      grp.marginBenefit = Math.round(grp.standaloneMargin * discountRatio);
      grp.hedgedMargin = Math.round(grp.standaloneMargin - grp.marginBenefit);
    });

    return Object.values(groupsMap);
  }, [filteredPositions, quotesMap]);

  // Open SL & Target Modal handler
  const handleOpenSlTargetModal = (pos: PositionItem) => {
    const activeOrders = activePositionOrdersMap[pos.id];
    setSlTargetModalPos(pos);
    const existingSl = activeOrders?.slOrder?.price || pos.slPrice;
    const existingTgt = activeOrders?.targetOrder?.price || pos.targetPrice;
    setInputSlPrice(existingSl ? existingSl.toString() : '');
    setInputTargetPrice(existingTgt ? existingTgt.toString() : '');
  };

  const handleSaveSlTarget = (e: React.FormEvent) => {
    e.preventDefault();
    if (!slTargetModalPos) return;

    const parsedSl = parseFloat(inputSlPrice);
    const parsedTgt = parseFloat(inputTargetPrice);

    const slVal = !isNaN(parsedSl) && parsedSl > 0 ? parsedSl : null;
    const tgtVal = !isNaN(parsedTgt) && parsedTgt > 0 ? parsedTgt : null;

    if (onSetSlTarget) {
      onSetSlTarget(slTargetModalPos, slVal, tgtVal);
    }

    setSlTargetModalPos(null);
  };

  const handleClearSlTarget = () => {
    if (slTargetModalPos && onSetSlTarget) {
      onSetSlTarget(slTargetModalPos, null, null);
    }
    setSlTargetModalPos(null);
  };

  return (
    <div className="flex flex-col h-full bg-white select-none">
      
      {/* 1. Top Metric Cards: Open MTM / Booked Profit / Total Day Net P&L / Margin Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 border-b border-[#e2e8f0] bg-[#f8fafc]">
        
        {/* Card 1: Unrealized Open MTM (High Visibility) */}
        <div className={`bg-white border rounded-lg p-3.5 shadow-2xs flex items-center justify-between transition-all ${
          unrealizedPnl > 0 ? 'border-emerald-300 bg-emerald-50/20' : unrealizedPnl < 0 ? 'border-red-300 bg-red-50/20' : 'border-[#e2e8f0]'
        }`}>
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#64748b]">
              <span className={`w-2 h-2 rounded-full ${unrealizedPnl >= 0 ? 'bg-[#16a34a] animate-pulse' : 'bg-[#dc2626] animate-pulse'}`} />
              <span className="font-bold text-[#334155]">Open Positions MTM</span>
            </div>
            <div className={`text-xl font-black tabular-nums mt-1 tracking-tight ${unrealizedPnl >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
              {unrealizedPnl >= 0 ? '+' : ''}₹{unrealizedPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[10.5px] text-[#64748b] font-medium block mt-0.5">
              {openCount} active open position{openCount === 1 ? '' : 's'} live
            </span>
          </div>
          <div className={`p-2.5 rounded-full ${unrealizedPnl >= 0 ? 'bg-emerald-100 text-[#16a34a]' : 'bg-red-100 text-[#dc2626]'}`}>
            {unrealizedPnl >= 0 ? <ArrowUpRight className="w-5 h-5 stroke-[2.5]" /> : <ArrowDownRight className="w-5 h-5 stroke-[2.5]" />}
          </div>
        </div>

        {/* Card 2: Booked Profit (Today's Realized) */}
        <div className="bg-white border border-[#e2e8f0] rounded-lg p-3.5 shadow-2xs flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#64748b]">
              <CheckCircle2 className="w-4 h-4 text-[#16a34a]" />
              <span>Booked Profit (Today)</span>
            </div>
            <div className={`text-xl font-bold tabular-nums mt-1 ${computedTodayRealized >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
              {computedTodayRealized >= 0 ? '+' : ''}₹{computedTodayRealized.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[10.5px] text-[#94a3b8] block mt-0.5">
              {closedCount > 0
                ? `${closedCount} trade${closedCount === 1 ? '' : 's'} closed today`
                : (totalRealizedPnl !== 0
                    ? `₹0.00 today · Lifetime ₹${totalRealizedPnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                    : 'No closed trades today')}
            </span>
          </div>
          <div className={`p-2.5 rounded-full ${computedTodayRealized >= 0 ? 'bg-green-50 text-[#16a34a]' : 'bg-red-50 text-[#dc2626]'}`}>
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Today's Combined Net P&L */}
        <div className="bg-white border border-[#e2e8f0] rounded-lg p-3.5 shadow-2xs flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#64748b]">
              <Wallet className="w-4 h-4 text-[#7c3aed]" />
              <span>Today's Total Net P&L</span>
            </div>
            <div className={`text-xl font-black tabular-nums mt-1 ${(computedTodayRealized + unrealizedPnl) >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
              {(computedTodayRealized + unrealizedPnl) >= 0 ? '+' : ''}₹{(computedTodayRealized + unrealizedPnl).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[10.5px] text-[#94a3b8] block mt-0.5">
              Realized Booked + Live MTM
            </span>
          </div>
          <div className={`p-2.5 rounded-full ${(computedTodayRealized + unrealizedPnl) >= 0 ? 'bg-purple-50 text-[#7c3aed]' : 'bg-red-50 text-[#dc2626]'}`}>
            <Activity className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: Available Cash & Margin Deployed */}
        <div className="bg-white border border-[#e2e8f0] rounded-lg p-3.5 shadow-2xs flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#64748b]">
              <Layers className="w-4 h-4 text-[#0284c7]" />
              <span>Available Cash / Margin</span>
            </div>
            <div className="text-xl font-bold tabular-nums text-[#0f172a] mt-1">
              ₹{(availableCash || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </div>
            <span className="text-[10.5px] text-[#0284c7] font-medium block mt-0.5">
              Deployed: ₹{(usedMargin || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </span>
          </div>
          <div className="p-2.5 rounded-full bg-sky-50 text-[#0284c7]">
            <Wallet className="w-5 h-5" />
          </div>
        </div>

      </div>

      {/* 2. Subheader Toolbar: Status Filter, Strategy Filter, View Switcher & Global Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-[#e2e8f0] bg-[#f8fafc]">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 bg-[#e2e8f0] rounded p-0.5 text-xs font-semibold">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1 rounded transition-colors ${
              statusFilter === 'ALL' ? 'bg-white text-[#0f172a] shadow-xs' : 'text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            All ({visiblePositions.length})
          </button>
          <button
            onClick={() => setStatusFilter('OPEN')}
            className={`px-3 py-1 rounded transition-colors flex items-center gap-1.5 ${
              statusFilter === 'OPEN' ? 'bg-white text-[#0284c7] shadow-xs' : 'text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#0284c7] animate-pulse" />
            <span>Open ({openCount})</span>
          </button>
          <button
            onClick={() => setStatusFilter('CLOSED')}
            className={`px-3 py-1 rounded transition-colors flex items-center gap-1.5 ${
              statusFilter === 'CLOSED' ? 'bg-white text-[#16a34a] shadow-xs' : 'text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#16a34a]" />
            <span>Closed / Booked ({closedCount})</span>
          </button>
        </div>

        {/* Setups Tag Filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="text-xs font-semibold text-[#64748b] flex items-center gap-1 shrink-0">
            <Layers className="w-3.5 h-3.5 text-[#0284c7]" />
            Setup:
          </span>
          <button
            onClick={() => setSelectedTag('ALL')}
            className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors shrink-0 ${
              selectedTag === 'ALL'
                ? 'bg-[#0284c7] text-white shadow-2xs font-bold'
                : 'bg-white text-[#475569] hover:bg-[#f1f5f9] border border-[#cbd5e1]'
            }`}
          >
            All
          </button>
          {tags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag)}
              className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors shrink-0 ${
                selectedTag === tag
                  ? 'bg-[#0284c7] text-white shadow-2xs font-bold'
                  : 'bg-white text-[#475569] hover:bg-[#f1f5f9] border border-[#cbd5e1]'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>

        {/* Right Toolbar Actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#e2e8f0] rounded p-0.5 text-xs">
            <button
              onClick={() => setViewMode('grouped')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded transition-colors font-semibold ${
                viewMode === 'grouped' ? 'bg-white text-[#0284c7] shadow-xs' : 'text-[#64748b]'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Grouped Spreads</span>
            </button>
            <button
              onClick={() => setViewMode('flat')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded transition-colors font-semibold ${
                viewMode === 'flat' ? 'bg-white text-[#0284c7] shadow-xs' : 'text-[#64748b]'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Flat Table</span>
            </button>
          </div>



          {openCount > 0 && (
            <button
              onClick={onExitAllPositions}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[#dc2626] hover:bg-[#b91c1c] rounded shadow-2xs transition-colors shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Exit All ({openCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. Main Positions Viewport */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {filteredPositions.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-[#94a3b8]">
            <Layers className="w-12 h-12 text-[#cbd5e1] mb-2 stroke-1" />
            <p className="text-sm font-semibold text-[#475569]">
              {statusFilter === 'CLOSED' ? 'No closed positions booked today' : 'No open positions'}
            </p>
            <p className="text-xs text-[#64748b] mt-1 max-w-sm">
              {statusFilter === 'CLOSED'
                ? 'When you exit a position today, its booked profit will appear here.'
                : 'Click BUY or SELL on any instrument in the Watchlist to place an order.'}
            </p>
          </div>
        ) : viewMode === 'grouped' ? (
          /* Grouped Spreads View */
          <div className="space-y-4">
            {groupedPositions.map((group) => {
              const isGroupProfit = group.totalUnrealizedPnl >= 0;
              const hasOpenPositions = group.positions.some((p) => p.quantity !== 0 && p.status !== 'CLOSED');

              return (
                <div
                  key={group.key}
                  className="border border-[#cbd5e1] rounded-lg overflow-hidden bg-white shadow-xs hover:border-[#94a3b8] transition-colors"
                >
                  {/* Group Header Card */}
                  <div className="px-4 py-3 bg-[#f8fafc] border-b border-[#e2e8f0] flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full ${hasOpenPositions ? 'bg-[#0284c7] animate-pulse' : 'bg-[#16a34a]'}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-extrabold text-sm text-[#0f172a]">{group.underlying}</h3>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-[#e0f2fe] text-[#0284c7] border border-[#bae6fd]">
                            {group.strategyTag}
                          </span>
                          <span className="text-[11px] text-[#64748b] font-medium">
                            · {group.positions.length} Legs ({hasOpenPositions ? 'Active Open' : 'Closed'})
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Margin Benefit Saved Badge */}
                      {group.marginBenefit > 0 && hasOpenPositions && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 border border-green-200 rounded text-xs text-[#166534]">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#16a34a]" />
                          <span className="font-medium">Margin Saved:</span>
                          <span className="font-bold tabular-nums">
                            ₹{group.marginBenefit.toLocaleString('en-IN')}
                          </span>
                        </div>
                      )}

                      {/* Group Realized Booked P&L */}
                      {group.totalRealizedPnl !== 0 && (
                        <div className="text-right">
                          <span className="text-[10px] text-[#64748b] block font-medium">Booked Profit</span>
                          <span
                            className={`tabular-nums text-xs font-bold ${
                              group.totalRealizedPnl >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'
                            }`}
                          >
                            {group.totalRealizedPnl >= 0 ? '+' : ''}
                            ₹{group.totalRealizedPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}

                      {/* Group Net Open MTM */}
                      {hasOpenPositions && (
                        <div className="text-right pl-2 border-l border-[#cbd5e1]">
                          <span className="text-[10px] text-[#64748b] block font-bold uppercase tracking-wider">Group Open MTM</span>
                          <span
                            className={`tabular-nums text-base font-black ${
                              isGroupProfit ? 'text-[#16a34a]' : 'text-[#dc2626]'
                            }`}
                          >
                            {isGroupProfit ? '+' : ''}
                            ₹{group.totalUnrealizedPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}

                      {/* Exit Entire Group Button */}
                      {hasOpenPositions && (
                        <button
                          onClick={() => onExitGroupPositions(group.positions.filter((p) => p.quantity !== 0 && p.status !== 'CLOSED').map((p) => p.id))}
                          className="px-3 py-1.5 text-xs font-bold text-white bg-[#dc2626] hover:bg-[#b91c1c] rounded shadow-xs transition-colors shrink-0 cursor-pointer"
                        >
                          Square Off Spread
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Individual Legs Table inside Group */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="text-[#64748b] font-semibold border-b border-[#e2e8f0] text-[11px] bg-[#fdfdfe]">
                          <th className="py-2.5 px-4">Instrument Leg</th>
                          <th className="py-2.5 px-3">Product</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3">Qty & Side</th>
                          <th className="py-2.5 px-3 text-right">Avg Entry</th>
                          <th className="py-2.5 px-3 text-right">Exit / LTP</th>
                          <th className="py-2.5 px-3 text-center">SL & Target</th>
                          <th className="py-2.5 px-3 text-right">Booked P&L</th>
                          <th className="py-2.5 px-3 text-right font-bold text-[#0f172a]">Live Open MTM</th>
                          <th className="py-2.5 px-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f1f5f9]">
                        {group.positions.map((pos) => {
                          const quote = quotesMap[pos.symbol];
                          const ltp = quote ? quote.ltp : pos.lastPrice;
                          const isClosed = pos.quantity === 0 || pos.status === 'CLOSED';
                          const isLong = pos.quantity > 0;
                          const entryPrice = isLong ? pos.buyAvgPrice : (pos.sellAvgPrice || pos.buyAvgPrice);
                          const legPnl = isClosed
                            ? 0
                            : isLong
                            ? (ltp - entryPrice) * pos.quantity
                            : (entryPrice - ltp) * Math.abs(pos.quantity);

                          const pctReturn = entryPrice > 0 ? (legPnl / (entryPrice * Math.abs(pos.quantity))) * 100 : 0;
                          const activeOrders = activePositionOrdersMap[pos.id];
                          const activeSl = activeOrders?.slOrder?.price || pos.slPrice;
                          const activeTgt = activeOrders?.targetOrder?.price || pos.targetPrice;

                          return (
                            <tr key={pos.id} className={`hover:bg-[#f8fafc] transition-colors ${isClosed ? 'bg-[#fafafa]' : 'bg-white'}`}>
                              <td className="py-3 px-4 font-bold text-[#0f172a]">
                                <div>{pos.symbol}</div>
                                <span className="text-[10px] text-[#94a3b8] font-normal">{pos.strategyTag || 'General'}</span>
                              </td>

                              <td className="py-3 px-3">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#e2e8f0] text-[#334155]">
                                  {pos.product}
                                </span>
                              </td>

                              <td className="py-3 px-3">
                                {isClosed ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-[#475569] border border-slate-300">
                                    CLOSED
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-[#166534] border border-emerald-300 flex items-center gap-1 w-max">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#16a34a] animate-pulse" />
                                    OPEN
                                  </span>
                                )}
                              </td>

                              <td className="py-3 px-3">
                                {isClosed ? (
                                  <span className="tabular-nums font-medium text-[#94a3b8]">0 Qty</span>
                                ) : (
                                  <span
                                    className={`tabular-nums font-bold px-1.5 py-0.5 rounded text-[11px] ${
                                      isLong ? 'bg-sky-50 text-[#0284c7] border border-sky-200' : 'bg-orange-50 text-[#ea580c] border border-orange-200'
                                    }`}
                                  >
                                    {isLong ? `BUY +${pos.quantity}` : `SELL ${pos.quantity}`}
                                  </span>
                                )}
                              </td>

                              <td className="py-3 px-3 text-right tabular-nums text-[#475569] font-medium">
                                ₹{entryPrice.toFixed(2)}
                              </td>

                              <td className="py-3 px-3 text-right tabular-nums font-bold text-[#0f172a]">
                                ₹{(isClosed ? (pos.exitPrice || pos.lastPrice) : ltp).toFixed(2)}
                              </td>

                              {/* Stop Loss & Target Column */}
                              <td className="py-3 px-3 text-center">
                                {!isClosed ? (
                                  <div className="flex flex-col items-center gap-1">
                                    {(activeSl || activeTgt) ? (
                                      <div
                                        onClick={() => handleOpenSlTargetModal(pos)}
                                        className="flex items-center gap-1 cursor-pointer hover:opacity-80"
                                        title="Click to edit SL / Target"
                                      >
                                        {activeSl && (
                                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-50 text-[#dc2626] border border-red-200">
                                            SL: ₹{activeSl.toFixed(1)}
                                          </span>
                                        )}
                                        {activeTgt && (
                                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-[#16a34a] border border-emerald-200">
                                            Tgt: ₹{activeTgt.toFixed(1)}
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => handleOpenSlTargetModal(pos)}
                                        className="px-2 py-0.5 text-[10px] font-semibold text-[#0284c7] hover:bg-sky-50 border border-sky-200 rounded transition-colors cursor-pointer"
                                      >
                                        + Set SL / Tgt
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[#94a3b8] text-[10px]">—</span>
                                )}
                              </td>

                              {/* Booked Profit Column */}
                              <td className="py-3 px-3 text-right">
                                {(pos.realizedPnl || 0) !== 0 ? (
                                  <span
                                    className={`tabular-nums font-bold ${
                                      pos.realizedPnl >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'
                                    }`}
                                  >
                                    {pos.realizedPnl >= 0 ? '+' : ''}
                                    ₹{pos.realizedPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                ) : (
                                  <span className="text-[#94a3b8] tabular-nums">₹0.00</span>
                                )}
                              </td>

                              {/* High-Visibility Live Open MTM Column */}
                              <td className="py-3 px-3 text-right">
                                {!isClosed ? (
                                  <div className="flex flex-col items-end">
                                    <span
                                      className={`tabular-nums font-extrabold text-sm px-2 py-0.5 rounded ${
                                        legPnl >= 0
                                          ? 'bg-emerald-50 text-[#16a34a] border border-emerald-200'
                                          : 'bg-red-50 text-[#dc2626] border border-red-200'
                                      }`}
                                    >
                                      {legPnl >= 0 ? '+' : ''}
                                      ₹{legPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    <span className={`text-[10px] tabular-nums font-semibold mt-0.5 ${legPnl >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                                      {pctReturn >= 0 ? '+' : ''}{pctReturn.toFixed(1)}%
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-[#94a3b8] tabular-nums">—</span>
                                )}
                              </td>

                              {/* Action Column */}
                              <td className="py-3 px-4 text-right">
                                {!isClosed ? (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      onClick={() => handleOpenSlTargetModal(pos)}
                                      title="Set / Modify SL & Target"
                                      className="p-1 text-[#64748b] hover:text-[#0284c7] hover:bg-sky-50 rounded border border-[#cbd5e1] transition-colors cursor-pointer"
                                    >
                                      <Target className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => {
                                        setPartialExitTarget(pos);
                                        const totLots = Math.max(1, Math.round(Math.abs(pos.quantity) / (pos.lotSize || 1)));
                                        setExitLotsInput(totLots);
                                        setSelectedPercent(100);
                                      }}
                                      className="px-2.5 py-1 text-[11px] font-bold text-[#dc2626] hover:bg-red-600 hover:text-white border border-red-300 rounded transition-colors cursor-pointer"
                                    >
                                      Exit
                                    </button>
                                  </div>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#16a34a]">
                                    <Check className="w-3.5 h-3.5" /> Booked
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Flat Table View */
          <div className="border border-[#cbd5e1] rounded-lg overflow-hidden bg-white shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#f8fafc] text-[#64748b] font-semibold border-b border-[#e2e8f0] text-[11px]">
                  <th className="py-3 px-4">Instrument</th>
                  <th className="py-3 px-3">Product</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Qty & Side</th>
                  <th className="py-3 px-3 text-right">Avg. Entry (₹)</th>
                  <th className="py-3 px-3 text-right">Exit / LTP (₹)</th>
                  <th className="py-3 px-3 text-center">SL & Target</th>
                  <th className="py-3 px-3 text-right">Booked P&L (₹)</th>
                  <th className="py-3 px-3 text-right font-bold text-[#0f172a]">Live Open MTM (₹)</th>
                  <th className="py-3 px-3">Setup</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {filteredPositions.map((pos) => {
                  const quote = quotesMap[pos.symbol];
                  const ltp = quote ? quote.ltp : pos.lastPrice;
                  const isClosed = pos.quantity === 0 || pos.status === 'CLOSED';
                  const isLong = pos.quantity > 0;
                  const entryPrice = isLong ? pos.buyAvgPrice : (pos.sellAvgPrice || pos.buyAvgPrice);
                  const mtmPnl = isClosed
                    ? 0
                    : isLong
                    ? (ltp - entryPrice) * pos.quantity
                    : (entryPrice - ltp) * Math.abs(pos.quantity);

                  const pctReturn = entryPrice > 0 ? (mtmPnl / (entryPrice * Math.abs(pos.quantity))) * 100 : 0;
                  const activeOrders = activePositionOrdersMap[pos.id];
                  const activeSl = activeOrders?.slOrder?.price || pos.slPrice;
                  const activeTgt = activeOrders?.targetOrder?.price || pos.targetPrice;

                  return (
                    <tr key={pos.id} className={`hover:bg-[#f8fafc] transition-colors ${isClosed ? 'bg-[#fafafa]' : 'bg-white'}`}>
                      <td className="py-3 px-4 font-bold text-[#0f172a]">{pos.symbol}</td>
                      <td className="py-3 px-3">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#e2e8f0] text-[#334155]">
                          {pos.product}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        {isClosed ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-[#475569] border border-slate-300">
                            CLOSED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-[#166534] border border-emerald-300 flex items-center gap-1 w-max">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#16a34a] animate-pulse" />
                            OPEN
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {isClosed ? (
                          <span className="tabular-nums font-medium text-[#94a3b8]">0</span>
                        ) : (
                          <span className={`tabular-nums font-bold px-1.5 py-0.5 rounded text-[11px] ${isLong ? 'bg-sky-50 text-[#0284c7] border border-sky-200' : 'bg-orange-50 text-[#ea580c] border border-orange-200'}`}>
                            {isLong ? `BUY +${pos.quantity}` : `SELL ${pos.quantity}`}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-[#475569] font-medium">{entryPrice.toFixed(2)}</td>
                      <td className="py-3 px-3 text-right tabular-nums font-bold text-[#0f172a]">
                        {(isClosed ? (pos.exitPrice || pos.lastPrice) : ltp).toFixed(2)}
                      </td>

                      {/* SL & Target Column */}
                      <td className="py-3 px-3 text-center">
                        {!isClosed ? (
                          <div className="flex flex-col items-center gap-1">
                            {(activeSl || activeTgt) ? (
                              <div
                                onClick={() => handleOpenSlTargetModal(pos)}
                                className="flex items-center gap-1 cursor-pointer hover:opacity-80"
                                title="Click to edit SL / Target"
                              >
                                {activeSl && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-50 text-[#dc2626] border border-red-200">
                                    SL: ₹{activeSl.toFixed(1)}
                                  </span>
                                )}
                                {activeTgt && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-[#16a34a] border border-emerald-200">
                                    Tgt: ₹{activeTgt.toFixed(1)}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <button
                                onClick={() => handleOpenSlTargetModal(pos)}
                                className="px-2 py-0.5 text-[10px] font-semibold text-[#0284c7] hover:bg-sky-50 border border-sky-200 rounded transition-colors cursor-pointer"
                              >
                                + Set SL / Tgt
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-[#94a3b8] text-[10px]">—</span>
                        )}
                      </td>

                      {/* Booked Profit */}
                      <td className="py-3 px-3 text-right">
                        {(pos.realizedPnl || 0) !== 0 ? (
                          <span className={`tabular-nums font-bold ${pos.realizedPnl >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                            {pos.realizedPnl >= 0 ? '+' : ''}₹{pos.realizedPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-[#94a3b8] tabular-nums">₹0.00</span>
                        )}
                      </td>

                      {/* High-Visibility Live Open MTM */}
                      <td className="py-3 px-3 text-right">
                        {!isClosed ? (
                          <div className="flex flex-col items-end">
                            <span
                              className={`tabular-nums font-extrabold text-sm px-2 py-0.5 rounded ${
                                mtmPnl >= 0
                                  ? 'bg-emerald-50 text-[#16a34a] border border-emerald-200'
                                  : 'bg-red-50 text-[#dc2626] border border-red-200'
                              }`}
                            >
                              {mtmPnl >= 0 ? '+' : ''}₹{mtmPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className={`text-[10px] tabular-nums font-semibold mt-0.5 ${mtmPnl >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                              {pctReturn >= 0 ? '+' : ''}{pctReturn.toFixed(1)}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-[#94a3b8] tabular-nums">—</span>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        <span className="text-[11px] px-2 py-0.5 rounded bg-[#f1f5f9] text-[#475569] font-medium border border-[#e2e8f0]">
                          {pos.strategyTag || 'General'}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        {!isClosed ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenSlTargetModal(pos)}
                              title="Set / Modify SL & Target"
                              className="p-1 text-[#64748b] hover:text-[#0284c7] hover:bg-sky-50 rounded border border-[#cbd5e1] transition-colors cursor-pointer"
                            >
                              <Target className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setPartialExitTarget(pos);
                                const totLots = Math.max(1, Math.round(Math.abs(pos.quantity) / (pos.lotSize || 1)));
                                setExitLotsInput(totLots);
                                setSelectedPercent(100);
                              }}
                              className="px-2.5 py-1 text-[11px] font-bold text-[#dc2626] hover:bg-red-600 hover:text-white border border-red-300 rounded transition-colors cursor-pointer"
                            >
                              Exit
                            </button>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#16a34a]">
                            <Check className="w-3.5 h-3.5" /> Booked
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Positions Bottom Total Summary Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-3 border-t border-[#e2e8f0] bg-[#f8fafc]">
        <div className="flex items-center gap-6 text-xs">
          <div>
            <span className="text-[#64748b] block text-[11px] font-medium">Open Positions</span>
            <span className="font-extrabold text-[#0284c7] text-sm">{openCount} Active</span>
          </div>
          <div>
            <span className="text-[#64748b] block text-[11px] font-medium">Closed Today</span>
            <span className="font-bold text-[#16a34a]">{closedCount}</span>
          </div>
          <div>
            <span className="text-[#64748b] block text-[11px] font-medium">Active Spreads</span>
            <span className="font-bold text-[#0f172a]">{groupedPositions.length}</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div>
            <span className="text-[11px] text-[#64748b] block text-right font-medium">Booked Realized (Today)</span>
            <span className={`tabular-nums text-sm font-bold ${computedTodayRealized >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
              {computedTodayRealized >= 0 ? '+' : ''}₹{computedTodayRealized.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div>
            <span className="text-[11px] text-[#64748b] block text-right font-bold uppercase tracking-wider">Total Open MTM</span>
            <span className={`tabular-nums text-base font-black ${unrealizedPnl >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
              {unrealizedPnl >= 0 ? '+' : ''}₹{unrealizedPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="border-l pl-4 border-[#cbd5e1]">
            <span className="text-[11px] font-bold text-[#475569] block text-right">Today's Net Day P&L:</span>
            <span className={`tabular-nums text-lg font-black ${(computedTodayRealized + unrealizedPnl) >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
              {(computedTodayRealized + unrealizedPnl) >= 0 ? '+' : ''}₹{(computedTodayRealized + unrealizedPnl).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {/* 5. Set Stop Loss (SL) & Target Modal */}
      {slTargetModalPos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-2xl border border-[#cbd5e1] w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-[#0284c7]" />
                  <h3 className="font-extrabold text-sm text-[#0f172a]">Set Stop Loss & Target</h3>
                </div>
                <span className="text-xs font-bold text-[#0284c7] mt-0.5 block">{slTargetModalPos.symbol}</span>
              </div>
              <button
                onClick={() => setSlTargetModalPos(null)}
                className="text-[#94a3b8] hover:text-[#0f172a] p-1 rounded hover:bg-[#e2e8f0] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSlTarget} className="p-5 space-y-4">
              {/* Position Snapshot Banner */}
              {(() => {
                const quote = quotesMap[slTargetModalPos.symbol];
                const ltp = quote ? quote.ltp : slTargetModalPos.lastPrice;
                const isLong = slTargetModalPos.quantity > 0;
                const entry = isLong ? slTargetModalPos.buyAvgPrice : (slTargetModalPos.sellAvgPrice || slTargetModalPos.buyAvgPrice);

                const parsedSl = parseFloat(inputSlPrice);
                const parsedTgt = parseFloat(inputTargetPrice);

                const estLoss = !isNaN(parsedSl) && parsedSl > 0
                  ? (isLong ? (parsedSl - entry) : (entry - parsedSl)) * Math.abs(slTargetModalPos.quantity)
                  : null;

                const estProfit = !isNaN(parsedTgt) && parsedTgt > 0
                  ? (isLong ? (parsedTgt - entry) : (entry - parsedTgt)) * Math.abs(slTargetModalPos.quantity)
                  : null;

                return (
                  <>
                    <div className="grid grid-cols-3 gap-2 p-2.5 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg text-xs">
                      <div>
                        <span className="text-[10px] text-[#64748b] block font-medium">Position Qty</span>
                        <span className="font-bold text-[#0f172a]">
                          {isLong ? `BUY +${slTargetModalPos.quantity}` : `SELL ${slTargetModalPos.quantity}`}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#64748b] block font-medium">Avg Entry</span>
                        <span className="font-bold text-[#0f172a]">₹{entry.toFixed(2)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-[#64748b] block font-medium">Current LTP</span>
                        <span className="font-extrabold text-[#0284c7]">₹{ltp.toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Stop Loss (SL) Input */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <label className="font-bold text-[#dc2626] flex items-center gap-1">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          Stop Loss (SL) Price (₹)
                        </label>
                        {estLoss !== null && (
                          <span className={`text-[11px] font-bold tabular-nums ${estLoss <= 0 ? 'text-[#dc2626]' : 'text-[#16a34a]'}`}>
                            Est. P&L: {estLoss >= 0 ? '+' : ''}₹{estLoss.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                          </span>
                        )}
                      </div>
                      <input
                        type="number"
                        step="0.05"
                        placeholder={isLong ? `e.g. ${(entry * 0.85).toFixed(1)}` : `e.g. ${(entry * 1.15).toFixed(1)}`}
                        value={inputSlPrice}
                        onChange={(e) => setInputSlPrice(e.target.value)}
                        className="w-full px-3 py-2 border border-[#cbd5e1] focus:border-[#dc2626] rounded-lg outline-none text-xs font-bold tabular-nums"
                      />
                      {/* Quick SL Pills */}
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <span className="text-[10px] text-[#64748b]">Quick:</span>
                        {[10, 20, 30].map((pct) => {
                          const targetSl = isLong ? entry * (1 - pct / 100) : entry * (1 + pct / 100);
                          return (
                            <button
                              key={pct}
                              type="button"
                              onClick={() => setInputSlPrice(targetSl.toFixed(1))}
                              className="px-2 py-0.5 text-[10px] font-semibold rounded bg-red-50 hover:bg-red-100 text-[#dc2626] border border-red-200 transition-colors cursor-pointer"
                            >
                              -{pct}% (₹{targetSl.toFixed(1)})
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Target Price Input */}
                    <div className="space-y-1.5 pt-2 border-t border-[#f1f5f9]">
                      <div className="flex items-center justify-between text-xs">
                        <label className="font-bold text-[#16a34a] flex items-center gap-1">
                          <Target className="w-3.5 h-3.5" />
                          Target Limit Price (₹)
                        </label>
                        {estProfit !== null && (
                          <span className={`text-[11px] font-bold tabular-nums ${estProfit >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                            Est. Profit: +₹{estProfit.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                          </span>
                        )}
                      </div>
                      <input
                        type="number"
                        step="0.05"
                        placeholder={isLong ? `e.g. ${(entry * 1.30).toFixed(1)}` : `e.g. ${(entry * 0.70).toFixed(1)}`}
                        value={inputTargetPrice}
                        onChange={(e) => setInputTargetPrice(e.target.value)}
                        className="w-full px-3 py-2 border border-[#cbd5e1] focus:border-[#16a34a] rounded-lg outline-none text-xs font-bold tabular-nums"
                      />
                      {/* Quick Target Pills */}
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <span className="text-[10px] text-[#64748b]">Quick:</span>
                        {[20, 40, 60].map((pct) => {
                          const targetVal = isLong ? entry * (1 + pct / 100) : entry * (1 - pct / 100);
                          return (
                            <button
                              key={pct}
                              type="button"
                              onClick={() => setInputTargetPrice(targetVal.toFixed(1))}
                              className="px-2 py-0.5 text-[10px] font-semibold rounded bg-emerald-50 hover:bg-emerald-100 text-[#16a34a] border border-emerald-200 transition-colors cursor-pointer"
                            >
                              +{pct}% (₹{targetVal.toFixed(1)})
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Note on Pending Order creation */}
                    <div className="p-2.5 bg-sky-50 border border-sky-200 rounded text-[11px] text-[#0369a1] leading-relaxed">
                      💡 <strong>Live Execution Note:</strong> Setting SL and Target automatically places pending limit/trigger orders in your <strong>Orders Tab</strong>. You can modify them anytime from either page.
                    </div>
                  </>
                );
              })()}

              {/* Form Action Buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-[#e2e8f0]">
                <button
                  type="button"
                  onClick={handleClearSlTarget}
                  className="px-3 py-1.5 text-xs font-semibold text-[#dc2626] hover:bg-red-50 rounded transition-colors cursor-pointer"
                >
                  Clear SL & Target
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSlTargetModalPos(null)}
                    className="px-3.5 py-1.5 text-xs text-[#64748b] hover:bg-[#f1f5f9] rounded font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-bold text-white bg-[#0284c7] hover:bg-[#0369a1] rounded-lg shadow-sm transition-all cursor-pointer"
                  >
                    Set Pending Orders
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Partial Lots & Quantity Exit Modal */}
      {partialExitTarget && (() => {
        const lotSize = partialExitTarget.lotSize || 1;
        const totalQty = Math.abs(partialExitTarget.quantity);
        const totalLots = Math.max(1, Math.round(totalQty / lotSize));
        const activeLots = Math.min(totalLots, Math.max(1, exitLotsInput));
        const closingQty = activeLots * lotSize;
        const remainingLots = totalLots - activeLots;
        const remainingQty = remainingLots * lotSize;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
            <div className="bg-white rounded-xl shadow-2xl border border-[#cbd5e1] w-full max-w-sm p-5 space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <div>
                  <h3 className="font-extrabold text-sm text-[#0f172a]">Square Off Position</h3>
                  <span className="text-xs font-bold text-[#0284c7]">{partialExitTarget.symbol}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPartialExitTarget(null)}
                  className="text-[#94a3b8] hover:text-[#0f172a] text-base leading-none p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Total Position Stats */}
              <div className="flex items-center justify-between text-xs bg-[#f8fafc] border border-[#e2e8f0] px-3 py-2 rounded-lg">
                <span className="text-[#64748b]">Holding Position:</span>
                <span className="font-bold text-[#0f172a] font-mono">
                  {totalLots} Lot{totalLots > 1 ? 's' : ''} ({totalQty} Qty · {lotSize}/lot)
                </span>
              </div>

              {/* Lot Stepper & Direct Lots Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#334155]">
                  Lots to Exit:
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setExitLotsInput((prev) => Math.max(1, prev - 1))}
                    className="w-10 h-10 rounded-lg border border-[#cbd5e1] bg-[#f8fafc] hover:bg-[#e2e8f0] font-black text-lg text-[#0f172a] flex items-center justify-center transition cursor-pointer"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min="1"
                    max={totalLots}
                    value={activeLots}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 1;
                      setExitLotsInput(Math.min(totalLots, Math.max(1, val)));
                    }}
                    className="flex-1 text-center font-black font-mono py-2 bg-white border border-[#0284c7] rounded-lg text-base text-[#0f172a] focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setExitLotsInput((prev) => Math.min(totalLots, prev + 1))}
                    className="w-10 h-10 rounded-lg border border-[#cbd5e1] bg-[#f8fafc] hover:bg-[#e2e8f0] font-black text-lg text-[#0f172a] flex items-center justify-center transition cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Quick Percentage Presets */}
              <div className="grid grid-cols-4 gap-2">
                {[25, 50, 75, 100].map((pct) => {
                  const targetLots = Math.max(1, Math.round(totalLots * (pct / 100)));
                  const isSelected = activeLots === targetLots;
                  return (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => {
                        setSelectedPercent(pct);
                        setExitLotsInput(targetLots);
                      }}
                      className={`py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#0284c7] text-white border-[#0284c7] shadow-xs'
                          : 'bg-[#f8fafc] text-[#475569] border-[#cbd5e1] hover:bg-[#f1f5f9]'
                      }`}
                    >
                      {pct}%
                    </button>
                  );
                })}
              </div>

              {/* Live Preview: Exit Qty vs Remaining */}
              <div className="text-xs bg-[#f0fdf4] border border-[#bbf7d0] p-3 rounded-lg space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[#166534]">Closing Qty:</span>
                  <span className="font-black text-sm text-[#15803d] font-mono">
                    {closingQty} Qty ({activeLots} Lot{activeLots > 1 ? 's' : ''})
                  </span>
                </div>
                {remainingLots > 0 && (
                  <div className="flex items-center justify-between text-[11px] text-[#15803d]/80 pt-1 border-t border-[#bbf7d0]/60">
                    <span>Remaining Position:</span>
                    <span className="font-semibold font-mono">{remainingLots} Lot(s) ({remainingQty} Qty)</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setPartialExitTarget(null)}
                  className="px-3.5 py-2 text-xs font-semibold text-[#64748b] hover:bg-[#f1f5f9] rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onExitPosition(partialExitTarget.id, closingQty, true);
                    setPartialExitTarget(null);
                  }}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#dc2626] hover:bg-[#b91c1c] rounded-lg shadow-sm cursor-pointer"
                >
                  Confirm Exit ({activeLots} Lot{activeLots > 1 ? 's' : ''})
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
