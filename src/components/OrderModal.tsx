import React, { useState, useMemo } from 'react';
import { MarketQuote, TransactionType, OrderType, ProductType, PositionItem, SetupItem } from '../types/trading';
import { X, CheckCircle2, TrendingUp, TrendingDown, Info, Plus, Clock, AlertTriangle } from 'lucide-react';

interface OrderModalProps {
  quote: MarketQuote | null;
  initialSide: TransactionType;
  availableCash: number;
  positions: PositionItem[];
  setups: SetupItem[];
  isAfter310: boolean;
  onCreateQuickSetup: (name: string) => void;
  onClose: () => void;
  onSubmitOrder: (order: {
    symbol: string;
    transactionType: TransactionType;
    orderType: OrderType;
    product: ProductType;
    quantity: number;
    price: number;
    stopLoss?: number;
    strategyTag: string;
  }) => void;
}

export const OrderModal: React.FC<OrderModalProps> = ({
  quote,
  initialSide,
  availableCash,
  positions,
  setups,
  isAfter310,
  onCreateQuickSetup,
  onClose,
  onSubmitOrder,
}) => {
  if (!quote) return null;

  const lotSize = quote.lotSize;
  const [side, setSide] = useState<TransactionType>(initialSide);
  // Default to NRML if after 3:10 PM, otherwise MIS
  const [product, setProduct] = useState<ProductType>(isAfter310 ? 'NRML' : 'MIS');
  const [orderType, setOrderType] = useState<OrderType>('MARKET');
  const [lots, setLots] = useState<number>(1);
  const [limitPrice, setLimitPrice] = useState<number>(quote.ltp);
  const [stopLoss, setStopLoss] = useState<number>(0);
  const [selectedSetup, setSelectedSetup] = useState<string>(setups[0]?.name || 'Breakout Momentum');
  const [isAddingNewSetup, setIsAddingNewSetup] = useState<boolean>(false);
  const [newSetupInput, setNewSetupInput] = useState<string>('');

  const quantity = lots * lotSize;
  const executionPrice = orderType === 'MARKET' ? quote.ltp : limitPrice;

  // Margin calculation with authentic spread hedging benefit
  const marginCalculation = useMemo(() => {
    const isOptionBuy = quote.type !== 'FUT' && quote.type !== 'COMMODITY' && side === 'BUY';
    const baseSpanPerLot = quote.underlying === 'NIFTY 50'
      ? 115000
      : (quote.underlying === 'BANK NIFTY' ? 125000 : (quote.underlying === 'RELIANCE' ? 140000 : 95000));

    let requiredMargin = 0;
    let hedgeBenefit = 0;

    if (isOptionBuy) {
      // Option buying requires 100% premium
      requiredMargin = executionPrice * quantity;
    } else {
      // Option selling, Futures, or Commodities
      const grossSpan = baseSpanPerLot * lots;
      
      // Check if offsetting hedge exists on the same underlying (e.g. Long Put for Long Future, or Spreads)
      const hasOffsettingPosition = positions.some(
        (p) => p.underlying === quote.underlying && p.quantity > 0
      );

      if (hasOffsettingPosition) {
        // Generous margin benefit (up to 70% reduction) as in real broker SPAN engines
        hedgeBenefit = Math.round(grossSpan * 0.70);
        requiredMargin = grossSpan - hedgeBenefit;
      } else {
        requiredMargin = grossSpan;
      }
    }

    return {
      requiredMargin: Math.round(requiredMargin),
      hedgeBenefit: Math.round(hedgeBenefit),
      isOptionBuy,
    };
  }, [quote, side, lots, quantity, executionPrice, positions]);

  // Is MIS blocked due to 3:10 PM cutoff?
  const isMisBlocked = isAfter310 && product === 'MIS';
  const hasSufficientMargin = availableCash >= marginCalculation.requiredMargin;

  const isBuy = side === 'BUY';
  const primaryBg = isBuy ? 'bg-[#0284c7]' : 'bg-[#ea580c]';
  const primaryHoverBg = isBuy ? 'hover:bg-[#0369a1]' : 'hover:bg-[#c2410c]';
  const primaryTextColor = isBuy ? 'text-[#0284c7]' : 'text-[#ea580c]';

  const handleSaveQuickSetup = () => {
    if (newSetupInput.trim()) {
      onCreateQuickSetup(newSetupInput.trim());
      setSelectedSetup(newSetupInput.trim());
      setNewSetupInput('');
      setIsAddingNewSetup(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isMisBlocked) return;
    onSubmitOrder({
      symbol: quote.symbol,
      transactionType: side,
      orderType,
      product,
      quantity,
      price: executionPrice,
      stopLoss: stopLoss > 0 ? stopLoss : undefined,
      strategyTag: selectedSetup,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 select-none">
      <div className="bg-white rounded shadow-2xl border border-[#cbd5e1] w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Top Header */}
        <div className={`flex items-center justify-between px-4 py-3 text-white ${primaryBg} transition-colors`}>
          <div className="flex items-center gap-3">
            <span className="font-bold text-sm tracking-wide">{side}</span>
            <span className="text-sm font-semibold">{quote.symbol}</span>
            <span className="text-[11px] opacity-90 px-1.5 py-0.5 rounded bg-black/15">
              {quote.exchange} · ₹{quote.ltp.toFixed(2)}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Toggle Buy/Sell */}
            <div className="flex items-center bg-black/20 rounded p-0.5">
              <button
                type="button"
                onClick={() => setSide('BUY')}
                className={`px-2 py-0.5 text-xs font-bold rounded transition-colors ${
                  isBuy ? 'bg-white text-[#0284c7]' : 'text-white/80 hover:text-white'
                }`}
              >
                BUY
              </button>
              <button
                type="button"
                onClick={() => setSide('SELL')}
                className={`px-2 py-0.5 text-xs font-bold rounded transition-colors ${
                  !isBuy ? 'bg-white text-[#ea580c]' : 'text-white/80 hover:text-white'
                }`}
              >
                SELL
              </button>
            </div>

            <button
              onClick={onClose}
              className="text-white/80 hover:text-white p-1 rounded hover:bg-black/15 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 text-xs">
          
          {/* Setup / Strategy Selection Row */}
          <div className="p-2.5 bg-[#f8fafc] border border-[#e2e8f0] rounded space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[#334155] font-bold text-xs">
                Strategy / Setup Group *
              </label>
              {!isAddingNewSetup && (
                <button
                  type="button"
                  onClick={() => setIsAddingNewSetup(true)}
                  className="text-[11px] text-[#0284c7] hover:underline font-semibold flex items-center gap-0.5"
                >
                  <Plus className="w-3 h-3" />
                  <span>New Setup</span>
                </button>
              )}
            </div>

            {isAddingNewSetup ? (
              <div className="flex gap-1.5 pt-1">
                <input
                  type="text"
                  placeholder="e.g. Reliance Protective Put, 9:20 Straddle"
                  value={newSetupInput}
                  onChange={(e) => setNewSetupInput(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 border border-[#cbd5e1] rounded text-xs outline-none focus:border-[#0284c7]"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSaveQuickSetup}
                  className="px-3 py-1.5 bg-[#0284c7] text-white rounded font-semibold text-xs"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddingNewSetup(false)}
                  className="px-2 py-1.5 text-[#64748b] hover:bg-[#e2e8f0] rounded text-xs"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <select
                value={selectedSetup}
                onChange={(e) => setSelectedSetup(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-[#cbd5e1] rounded text-xs bg-white outline-none focus:border-[#0284c7] font-semibold text-[#0f172a]"
              >
                {setups.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Product Type Segmented Switcher (MIS vs NRML with 3:10 PM rule) */}
          <div className="flex items-center justify-between pb-2 border-b border-[#f1f5f9]">
            <div>
              <span className="text-[#64748b] font-medium block">Product</span>
              {isAfter310 && (
                <span className="text-[10px] text-[#ea580c] font-semibold">
                  MIS cutoff passed (Post 03:10 PM)
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded cursor-pointer border transition-colors ${
                  isAfter310 ? 'opacity-50 cursor-not-allowed bg-[#f1f5f9] text-[#94a3b8]' :
                  product === 'MIS'
                    ? 'border-[#0284c7] bg-[#f0f9ff] text-[#0284c7] font-semibold'
                    : 'border-[#cbd5e1] hover:border-[#94a3b8] text-[#475569]'
                }`}
              >
                <input
                  type="radio"
                  name="product"
                  value="MIS"
                  disabled={isAfter310}
                  checked={product === 'MIS'}
                  onChange={() => setProduct('MIS')}
                  className="hidden"
                />
                <span>Intraday (MIS)</span>
              </label>

              <label
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded cursor-pointer border transition-colors ${
                  product === 'NRML'
                    ? 'border-[#0284c7] bg-[#f0f9ff] text-[#0284c7] font-semibold'
                    : 'border-[#cbd5e1] hover:border-[#94a3b8] text-[#475569]'
                }`}
              >
                <input
                  type="radio"
                  name="product"
                  value="NRML"
                  checked={product === 'NRML'}
                  onChange={() => setProduct('NRML')}
                  className="hidden"
                />
                <span>Overnight (NRML)</span>
              </label>
            </div>
          </div>

          {/* MIS 3:10 PM Blockage Banner (Requirement 2) */}
          {isMisBlocked && (
            <div className="p-2.5 bg-orange-50 border border-orange-200 text-orange-800 rounded flex items-start gap-2 text-[11px]">
              <Clock className="w-4 h-4 shrink-0 text-orange-600 mt-0.5" />
              <div>
                <p className="font-bold">MIS Orders Blocked After 03:10 PM</p>
                <p className="text-orange-700 mt-0.5">
                  As per exchange and broker auto square-off rules, new Intraday (MIS) orders are disabled after 03:10 PM. Please switch to <b>NRML (Overnight)</b>.
                </p>
              </div>
            </div>
          )}

          {/* Lots & Quantity Stepper */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[#64748b] font-medium">Lots ({lotSize} Qty/Lot)</label>
                <span className="text-[11px] text-[#64748b]">Qty: {quantity}</span>
              </div>
              <div className="flex items-center border border-[#cbd5e1] rounded overflow-hidden">
                <button
                  type="button"
                  onClick={() => setLots(Math.max(1, lots - 1))}
                  className="px-3 py-2 bg-[#f8fafc] hover:bg-[#f1f5f9] text-[#334155] font-bold text-sm transition-colors border-r border-[#cbd5e1]"
                >
                  -
                </button>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={lots}
                  onChange={(e) => setLots(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full text-center py-2 text-xs font-semibold tabular-nums outline-none"
                />
                <button
                  type="button"
                  onClick={() => setLots(lots + 1)}
                  className="px-3 py-2 bg-[#f8fafc] hover:bg-[#f1f5f9] text-[#334155] font-bold text-sm transition-colors border-l border-[#cbd5e1]"
                >
                  +
                </button>
              </div>
            </div>

            {/* Price & Order Type */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[#64748b] font-medium">Order Type</label>
                <div className="flex gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setOrderType('MARKET')}
                    className={`font-semibold ${orderType === 'MARKET' ? primaryTextColor : 'text-[#94a3b8]'}`}
                  >
                    Market
                  </button>
                  <span className="text-[#cbd5e1]">|</span>
                  <button
                    type="button"
                    onClick={() => setOrderType('LIMIT')}
                    className={`font-semibold ${orderType === 'LIMIT' ? primaryTextColor : 'text-[#94a3b8]'}`}
                  >
                    Limit
                  </button>
                </div>
              </div>
              <input
                type="number"
                step="0.05"
                disabled={orderType === 'MARKET'}
                value={orderType === 'MARKET' ? quote.ltp : limitPrice}
                onChange={(e) => setLimitPrice(parseFloat(e.target.value) || quote.ltp)}
                className={`w-full px-3 py-2 border rounded text-xs tabular-nums font-semibold outline-none transition-colors ${
                  orderType === 'MARKET'
                    ? 'bg-[#f8fafc] text-[#94a3b8] border-[#e2e8f0]'
                    : 'bg-white text-[#0f172a] border-[#0284c7]'
                }`}
              />
            </div>
          </div>

          {/* Stop-Loss (Optional) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[#64748b] font-medium">Stop-Loss Price</label>
              <span className="text-[10px] text-[#94a3b8]">Optional protective trigger</span>
            </div>
            <input
              type="number"
              step="0.05"
              placeholder={side === 'BUY' ? 'Trigger price below entry' : 'Trigger price above entry'}
              value={stopLoss || ''}
              onChange={(e) => setStopLoss(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-[#cbd5e1] focus:border-[#0284c7] rounded text-xs tabular-nums outline-none"
            />
          </div>

          {/* Margin & Hedge Benefits Breakdown Box */}
          <div className="p-3 bg-[#f8fafc] border border-[#e2e8f0] rounded space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#64748b]">Margin Required:</span>
              <span className="tabular-nums font-bold text-[#0f172a]">
                ₹{marginCalculation.requiredMargin.toLocaleString('en-IN')}
              </span>
            </div>

            {marginCalculation.hedgeBenefit > 0 && (
              <div className="flex items-center justify-between text-[11px] text-[#16a34a]">
                <span className="flex items-center gap-1 font-medium">
                  <CheckCircle2 className="w-3 h-3" />
                  Portfolio Hedge Margin Benefit:
                </span>
                <span className="tabular-nums font-bold">
                  -₹{marginCalculation.hedgeBenefit.toLocaleString('en-IN')}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#64748b]">Available Margin:</span>
              <span
                className={`tabular-nums font-semibold ${
                  hasSufficientMargin ? 'text-[#16a34a]' : 'text-[#dc2626]'
                }`}
              >
                ₹{availableCash.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {!hasSufficientMargin && (
            <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded text-[11px]">
              Insufficient Margin: Required ₹{marginCalculation.requiredMargin.toLocaleString('en-IN')}, available ₹{availableCash.toLocaleString('en-IN')}.
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-[#f1f5f9]">
            <div className="text-[11px] text-[#94a3b8]">
              Setup: <span className="font-semibold text-[#0f172a]">{selectedSetup}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 text-xs font-medium text-[#64748b] hover:bg-[#f1f5f9] rounded transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!hasSufficientMargin || isMisBlocked}
                className={`px-5 py-2 text-xs font-semibold text-white rounded shadow-xs transition-colors ${
                  !hasSufficientMargin || isMisBlocked
                    ? 'bg-[#94a3b8] cursor-not-allowed'
                    : `${primaryBg} ${primaryHoverBg}`
                }`}
              >
                {side} ({quantity} Qty)
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
