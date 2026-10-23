import React from 'react';
import { MarketQuote, MarketDepth } from '../types/trading';
import { X, TrendingUp, TrendingDown } from 'lucide-react';

interface MarketDepthModalProps {
  quote: MarketQuote | null;
  depth: MarketDepth | null;
  onClose: () => void;
  onOpenOrderModal: (quote: MarketQuote, side: 'BUY' | 'SELL') => void;
}

export const MarketDepthModal: React.FC<MarketDepthModalProps> = ({
  quote,
  depth,
  onClose,
  onOpenOrderModal,
}) => {
  if (!quote || !depth) return null;

  const totalBuy = depth.totalBuyQty || 1;
  const totalSell = depth.totalSellQty || 1;
  const buyRatio = Math.round((totalBuy / (totalBuy + totalSell)) * 100);
  const sellRatio = 100 - buyRatio;

  const isPositive = quote.change >= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 select-none">
      <div className="bg-white rounded shadow-2xl border border-[#d0d0d0] w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e5e5] bg-[#fafafa]">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-[#333]">{quote.symbol}</span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#eee] text-[#666]">
              {quote.type} · Lot {quote.lotSize}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <span
                className={`tabular-nums text-sm font-bold ${
                  isPositive ? 'text-[#4caf50]' : 'text-[#df514c]'
                }`}
              >
                ₹{quote.ltp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
              <span
                className={`tabular-nums text-xs ml-1.5 ${
                  isPositive ? 'text-[#4caf50]' : 'text-[#df514c]'
                }`}
              >
                {isPositive ? '+' : ''}
                {quote.change.toFixed(2)} ({isPositive ? '+' : ''}
                {quote.pchange.toFixed(2)}%)
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-[#888] hover:text-[#333] hover:bg-[#eaeaea] rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 5-Level Market Depth Grid (Level 2 Order Book) */}
        <div className="p-4">
          <div className="grid grid-cols-2 gap-3 text-xs">
            {/* Bid Side (Buyers - Blue tint) */}
            <div className="border border-[#e0e9f5] rounded overflow-hidden">
              <div className="grid grid-cols-3 bg-[#f0f6ff] px-2.5 py-1.5 text-[11px] font-semibold text-[#387ed1] border-b border-[#e0e9f5]">
                <span>Orders</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Bid (₹)</span>
              </div>
              <div className="divide-y divide-[#f5f8fc]">
                {depth.bids.map((bid, i) => (
                  <div key={i} className="grid grid-cols-3 px-2.5 py-1 text-[11px] hover:bg-[#f6faff]">
                    <span className="tabular-nums text-[#666]">{bid.orders}</span>
                    <span className="tabular-nums text-[#444] text-right">{bid.quantity}</span>
                    <span className="tabular-nums font-semibold text-[#387ed1] text-right">
                      {bid.price.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between px-2.5 py-1.5 bg-[#f0f6ff] text-[11px] font-semibold border-t border-[#e0e9f5]">
                <span className="text-[#387ed1]">Total</span>
                <span className="tabular-nums text-[#387ed1]">{totalBuy.toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* Ask Side (Sellers - Red/Orange tint) */}
            <div className="border border-[#fae6e4] rounded overflow-hidden">
              <div className="grid grid-cols-3 bg-[#fff2f0] px-2.5 py-1.5 text-[11px] font-semibold text-[#ff5722] border-b border-[#fae6e4]">
                <span>Offer (₹)</span>
                <span className="text-right">Orders</span>
                <span className="text-right">Qty</span>
              </div>
              <div className="divide-y divide-[#fff7f6]">
                {depth.asks.map((ask, i) => (
                  <div key={i} className="grid grid-cols-3 px-2.5 py-1 text-[11px] hover:bg-[#fff9f8]">
                    <span className="tabular-nums font-semibold text-[#ff5722]">
                      {ask.price.toFixed(2)}
                    </span>
                    <span className="tabular-nums text-[#666] text-right">{ask.orders}</span>
                    <span className="tabular-nums text-[#444] text-right">{ask.quantity}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between px-2.5 py-1.5 bg-[#fff2f0] text-[11px] font-semibold border-t border-[#fae6e4]">
                <span className="text-[#ff5722]">Total</span>
                <span className="tabular-nums text-[#ff5722]">{totalSell.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          {/* Buyers vs Sellers Volume Distribution Bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-[11px] text-[#666] mb-1">
              <span className="text-[#387ed1] font-semibold">{buyRatio}% Buyers</span>
              <span className="text-[#ff5722] font-semibold">{sellRatio}% Sellers</span>
            </div>
            <div className="w-full h-1.5 bg-[#eee] rounded-full overflow-hidden flex">
              <div style={{ width: `${buyRatio}%` }} className="bg-[#387ed1]" />
              <div style={{ width: `${sellRatio}%` }} className="bg-[#ff5722]" />
            </div>
          </div>

          {/* OHLC & Volume Stats Box */}
          <div className="grid grid-cols-4 gap-2 mt-4 p-3 bg-[#fbfbfb] border border-[#eee] rounded text-[11px]">
            <div>
              <span className="text-[#888] block">Open</span>
              <span className="tabular-nums font-semibold text-[#333]">
                ₹{quote.open.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-[#888] block">High</span>
              <span className="tabular-nums font-semibold text-[#387ed1]">
                ₹{quote.high.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-[#888] block">Low</span>
              <span className="tabular-nums font-semibold text-[#df514c]">
                ₹{quote.low.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-[#888] block">Prev. Close</span>
              <span className="tabular-nums font-semibold text-[#333]">
                ₹{quote.prevClose.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-[#888] block">Volume</span>
              <span className="tabular-nums font-semibold text-[#333]">
                {quote.volume.toLocaleString('en-IN')}
              </span>
            </div>
            <div>
              <span className="text-[#888] block">Lower Circuit</span>
              <span className="tabular-nums font-semibold text-[#df514c]">
                ₹{Math.max(0.05, quote.prevClose * 0.8).toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-[#888] block">Upper Circuit</span>
              <span className="tabular-nums font-semibold text-[#4caf50]">
                ₹{(quote.prevClose * 1.2).toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-[#888] block">Lot Size</span>
              <span className="tabular-nums font-semibold text-[#333]">{quote.lotSize}</span>
            </div>
          </div>

          {/* Quick Action Footer Buttons */}
          <div className="flex items-center justify-end gap-2.5 mt-4 pt-3 border-t border-[#eee]">
            <button
              onClick={() => {
                onClose();
                onOpenOrderModal(quote, 'BUY');
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#387ed1] hover:bg-[#2e6bb5] rounded shadow-xs transition-colors"
            >
              Buy ({quote.symbol})
            </button>
            <button
              onClick={() => {
                onClose();
                onOpenOrderModal(quote, 'SELL');
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#ff5722] hover:bg-[#e64a19] rounded shadow-xs transition-colors"
            >
              Sell ({quote.symbol})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
