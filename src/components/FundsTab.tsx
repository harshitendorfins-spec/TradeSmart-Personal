import React from 'react';
import { AccountFunds } from '../types/trading';
import { Wallet, ShieldCheck, CheckCircle2, Clock, Landmark } from 'lucide-react';

interface FundsTabProps {
  funds: AccountFunds;
}

export const FundsTab: React.FC<FundsTabProps> = ({ funds }) => {
  const isNetPositive = funds.netPnl >= 0;

  return (
    <div className="flex flex-col h-full bg-slate-50 select-none overflow-y-auto p-4 lg:p-6 space-y-6">
      
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white border border-slate-200 rounded-xl shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-sky-50 flex items-center justify-center text-[#0284c7]">
            <Landmark className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Trading Capital & Margin Account (₹{(funds.startingCapital / 10000000).toFixed(2)} Cr Account)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live multi-exchange SPAN & Exposure margin engine for NSE F&O, BSE, and MCX.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Verified Capital Active
          </span>
        </div>
      </div>

      {/* Main Funds Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Available Margin Card */}
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
          <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <span className="font-bold text-xs text-slate-800 uppercase tracking-wider">Trading Margins & Live Balance</span>
            <span className="text-[11px] font-bold text-[#0284c7]">NSE · BSE · MCX</span>
          </div>

          <div className="p-5 space-y-3.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 font-medium">Available Cash Margin</span>
              <span className="tabular-nums text-lg font-black text-slate-900">
                ₹{funds.availableCash.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-slate-600 font-medium">Used Margin (Hedged Net)</span>
              <span className="tabular-nums font-bold text-rose-600">
                ₹{funds.usedMargin.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="flex items-center justify-between pl-3 text-[11px] text-slate-500">
              <span>Gross Standalone Margin</span>
              <span className="tabular-nums font-semibold">
                ₹{funds.grossMargin.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            {funds.hedgeDiscount > 0 && (
              <div className="flex items-center justify-between pl-3 text-[11px] text-emerald-600">
                <span className="flex items-center gap-1 font-semibold">
                  <CheckCircle2 className="w-3 h-3" />
                  Portfolio Hedge Margin Benefit
                </span>
                <span className="tabular-nums font-bold">
                  -₹{funds.hedgeDiscount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-slate-600 font-medium">Realized P&L</span>
              <span
                className={`tabular-nums font-bold ${
                  funds.realizedPnl >= 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {funds.realizedPnl >= 0 ? '+' : ''}
                ₹{funds.realizedPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-600 font-medium">Unrealized MTM P&L</span>
              <span
                className={`tabular-nums font-bold ${
                  funds.unrealizedPnl >= 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {funds.unrealizedPnl >= 0 ? '+' : ''}
                ₹{funds.unrealizedPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="flex items-center justify-between pt-3.5 border-t border-slate-200 font-black text-sm">
              <span className="text-slate-900">Total Net P&L</span>
              <span
                className={`tabular-nums text-base ${
                  isNetPositive ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {isNetPositive ? '+' : ''}
                ₹{funds.netPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Capital Allocation & Risk Rules */}
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
          <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200">
            <span className="font-bold text-xs text-slate-800 uppercase tracking-wider">Account Allocation & Exchange Rules</span>
          </div>

          <div className="p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 font-medium">Starting Account Capital</span>
              <span className="tabular-nums font-black text-slate-900 text-sm">
                ₹{funds.startingCapital.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="flex items-center justify-between pt-2.5 border-t border-slate-100">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-orange-500" />
                <span className="text-slate-800 font-semibold">MIS Order Placement Cutoff</span>
              </div>
              <span className="tabular-nums font-bold text-orange-600">
                03:10 PM IST
              </span>
            </div>

            <div className="flex items-center justify-between pt-2.5 border-t border-slate-100">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-rose-500" />
                <span className="text-slate-800 font-semibold">Broker MIS Auto Square-Off</span>
              </div>
              <span className="tabular-nums font-bold text-rose-600">
                03:15 PM IST
              </span>
            </div>

            <div className="pt-3 border-t border-slate-200 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 text-slate-800 font-bold mb-1">
                <ShieldCheck className="w-4 h-4 text-[#0284c7]" />
                Capital Protection Active
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Trading capital is strictly protected and locked against accidental reset. All trades, margins, and setup metrics are preserved across sessions and synced in realtime.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
