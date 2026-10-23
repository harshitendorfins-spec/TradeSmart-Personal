import React, { useState, useRef, useEffect } from 'react';
import { MarketQuote, LicenseInfo } from '../types/trading';
import { Volume2, VolumeX, Lock, Activity, BarChart3, Clock, FastForward, User, KeyRound, Trash2, LogOut, ChevronDown, ShieldCheck, Sparkles } from 'lucide-react';

interface HeaderProps {
  niftyQuote?: MarketQuote;
  bankNiftyQuote?: MarketQuote;
  sensexQuote?: MarketQuote;
  activeTab: 'positions' | 'orders' | 'funds' | 'ledger' | 'setups';
  setActiveTab: (tab: 'positions' | 'orders' | 'funds' | 'ledger' | 'setups') => void;
  openOrdersCount: number;
  openPositionsCount: number;
  availableCash: number;
  soundEnabled: boolean;
  toggleSound: () => void;
  onLockTerminal: () => void;
  onOpenSmartAPI: () => void;
  smartApiConnected: boolean;
  feedLabel?: string;
  simulatedTimeStr: string;
  isAfter310: boolean;
  isAfter315: boolean;
  onSimulateTimeJump: (target: 'normal' | '3:09' | '3:10' | '3:15') => void;
  username?: string;
  onOpenChangeCredentials?: () => void;
  onClearAllData?: () => void;
  license?: LicenseInfo | null;
  onOpenLicense?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  niftyQuote,
  bankNiftyQuote,
  sensexQuote,
  activeTab,
  setActiveTab,
  openOrdersCount,
  openPositionsCount,
  availableCash,
  soundEnabled,
  toggleSound,
  onLockTerminal,
  onOpenSmartAPI,
  smartApiConnected,
  feedLabel,
  simulatedTimeStr,
  isAfter310,
  isAfter315,
  onSimulateTimeJump,
  username = 'TRADER1',
  onOpenChangeCredentials,
  onClearAllData,
  license,
  onOpenLicense,
}) => {
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // Close profile dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-[#e2e8f0] shadow-xs select-none">
      <div className="flex items-center justify-between h-14 px-3 sm:px-5">
        
        {/* Left: TradeSmart Brand Mark & Pinned Indices */}
        <div className="flex items-center gap-4 lg:gap-6 shrink-0">
          
          {/* TradeSmart Brand Lockup */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#0284c7] rounded flex items-center justify-center shadow-xs text-white">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                <polyline points="16 7 22 7 22 13" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-sm tracking-tight text-[#0f172a] leading-none">
                Trade<span className="text-[#0284c7]">Smart</span>
              </span>
              <span className="text-[9px] text-[#64748b] font-medium leading-none mt-0.5 hidden sm:inline">
                F&O Trading Terminal
              </span>
            </div>
          </div>

          {/* Pinned NIFTY 50 Index (Only on ultra-wide screens to prevent header overflow) */}
          <div className="hidden 2xl:flex items-center gap-1.5 px-2 py-1 rounded bg-[#f8fafc] border border-[#e2e8f0]">
            <span className="text-[11px] font-semibold text-[#64748b]">NIFTY</span>
            <span className="tabular-nums text-xs font-semibold text-[#0f172a]">
              {niftyQuote ? niftyQuote.ltp.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '24,850.00'}
            </span>
            <span
              className={`tabular-nums text-[10px] font-medium ${
                (niftyQuote?.change || 0) >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'
              }`}
            >
              {(niftyQuote?.change || 0) >= 0 ? '+' : ''}
              {niftyQuote?.change?.toFixed(2) || '+65.00'}
            </span>
          </div>

          {/* Pinned BANK NIFTY Index */}
          <div className="hidden 2xl:flex items-center gap-1.5 px-2 py-1 rounded bg-[#f8fafc] border border-[#e2e8f0]">
            <span className="text-[11px] font-semibold text-[#64748b]">BANKNIFTY</span>
            <span className="tabular-nums text-xs font-semibold text-[#0f172a]">
              {bankNiftyQuote ? bankNiftyQuote.ltp.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '52,120.00'}
            </span>
            <span
              className={`tabular-nums text-[10px] font-medium ${
                (bankNiftyQuote?.change || 0) >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'
              }`}
            >
              {(bankNiftyQuote?.change || 0) >= 0 ? '+' : ''}
              {bankNiftyQuote?.change?.toFixed(2) || '+170.00'}
            </span>
          </div>
        </div>

        {/* Center: Main Navigation Tabs + Highlighted Netlify Button */}
        <nav className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto scrollbar-none py-1">
          <button
            onClick={() => setActiveTab('positions')}
            className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'positions'
                ? 'text-[#0284c7] font-semibold bg-[#e0f2fe]'
                : 'text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            Positions
            {openPositionsCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 text-[10px] rounded-full bg-[#0284c7] text-white">
                {openPositionsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('orders')}
            className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'orders'
                ? 'text-[#0284c7] font-semibold bg-[#e0f2fe]'
                : 'text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            Orders
            {openOrdersCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 text-[10px] rounded-full bg-[#0284c7] text-white">
                {openOrdersCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('setups')}
            className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 ${
              activeTab === 'setups'
                ? 'text-[#0284c7] font-semibold bg-[#e0f2fe]'
                : 'text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Setup Analytics</span>
            <span className="sm:hidden">Analytics</span>
          </button>

          <button
            onClick={() => setActiveTab('funds')}
            className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'funds'
                ? 'text-[#0284c7] font-semibold bg-[#e0f2fe]'
                : 'text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            Funds
          </button>

          <button
            onClick={() => setActiveTab('ledger')}
            className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'ledger'
                ? 'text-[#0284c7] font-semibold bg-[#e0f2fe]'
                : 'text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            Ledger
          </button>
        </nav>

        {/* Right: Market Clock, SmartAPI, Sound, Margin & Lock */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          
          {/* Real Exchange Clock */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#f8fafc] border border-[#cbd5e1] rounded text-xs">
            <Clock className="w-3.5 h-3.5 text-[#16a34a]" />
            <span className="tabular-nums font-semibold text-[#0f172a] text-[11px]">
              {simulatedTimeStr}
            </span>
          </div>

          {/* Broker API Live Status */}
          <button
            onClick={onOpenSmartAPI}
            title="Configure Broker API (Angel One / Fyers)"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-[#f8fafc] hover:bg-[#f1f5f9] border border-[#cbd5e1] rounded transition-colors cursor-pointer"
          >
            <span className={`w-2 h-2 rounded-full ${smartApiConnected ? 'bg-[#16a34a] animate-pulse' : 'bg-[#eab308]'}`} />
            <span className="text-[11px] font-bold text-[#0f172a]">
              {smartApiConnected ? 'Angel One · Live' : 'Broker API'}
            </span>
          </button>

          {/* License Status Badge */}
          <button
            onClick={onOpenLicense}
            title={license?.is_active ? `TradeSmart Pro Active (${license?.days_left}d remaining)` : 'Activate TradeSmart Pro'}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors cursor-pointer border ${
              license?.is_active
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                : 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100 animate-pulse'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span className="text-[11px] font-bold">
              {license?.is_active
                ? (license.plan === 'TRIAL' ? `Trial: ${license.days_left}d` : 'Pro Active')
                : 'Activate Pro'}
            </span>
          </button>

          {/* Sound Toggle */}
          <button
            onClick={toggleSound}
            title={soundEnabled ? 'Order sound active' : 'Sound muted'}
            className="p-1.5 text-[#64748b] hover:text-[#0f172a] hover:bg-[#f1f5f9] rounded transition-colors"
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-[#0284c7]" />
            ) : (
              <VolumeX className="w-4 h-4 text-[#94a3b8]" />
            )}
          </button>

          {/* Available Margin */}
          <div className="hidden lg:flex flex-col items-end">
            <span className="text-[9px] text-[#64748b] font-medium leading-none">Margin</span>
            <span className="tabular-nums text-xs font-bold text-[#0f172a] leading-tight">
              ₹{(availableCash / 100000).toLocaleString('en-IN', { maximumFractionDigits: 1 })}L
            </span>
          </div>

          {/* User Profile Dropdown & Lock */}
          <div className="relative" ref={profileMenuRef}>
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-[#0f172a] bg-[#f8fafc] hover:bg-[#f1f5f9] border border-[#cbd5e1] rounded transition-colors cursor-pointer"
            >
              <div className="w-5 h-5 rounded-full bg-[#0284c7] text-white flex items-center justify-center text-[10px] font-bold">
                {username ? username.slice(0, 1).toUpperCase() : 'U'}
              </div>
              <span className="max-w-[70px] truncate">{username}</span>
              <ChevronDown className="w-3 h-3 text-[#64748b]" />
            </button>

            {isProfileOpen && (
              <div className="absolute right-0 top-11 w-56 bg-white border border-[#cbd5e1] rounded-lg shadow-xl py-1 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3.5 py-2 border-b border-[#f1f5f9]">
                  <span className="text-[10px] text-[#64748b] block font-medium">Logged in as</span>
                  <span className="font-bold text-sm text-[#0f172a]">{username}</span>
                  <span className="inline-flex items-center gap-1 text-[10px] text-[#16a34a] font-semibold mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#16a34a]" /> Active Session
                  </span>
                </div>

                <button
                  onClick={() => {
                    setIsProfileOpen(false);
                    onOpenChangeCredentials?.();
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[#334155] hover:bg-[#f8fafc] transition-colors text-left cursor-pointer"
                >
                  <KeyRound className="w-4 h-4 text-[#0284c7]" />
                  <span>Change ID & Password</span>
                </button>

                <button
                  onClick={() => {
                    setIsProfileOpen(false);
                    onOpenLicense?.();
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[#334155] hover:bg-[#f8fafc] transition-colors text-left cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>License & Activation</span>
                </button>

                <div className="border-t border-[#f1f5f9] my-1" />

                <button
                  onClick={() => {
                    setIsProfileOpen(false);
                    onLockTerminal();
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[#dc2626] hover:bg-red-50 transition-colors text-left font-semibold cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout / Lock Terminal</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
