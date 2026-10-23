import React, { useState } from 'react';
import { LicenseInfo } from '../types/trading';
import {
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Copy,
  Check,
  X,
  Sparkles,
  Clock,
  Laptop,
  CheckCircle2,
  ExternalLink,
  MessageCircle,
  Award
} from 'lucide-react';

interface LicenseModalProps {
  license: LicenseInfo | null;
  onClose: () => void;
  onActivate: (key: string) => Promise<{ success: boolean; message: string }>;
  onStartTrial: () => Promise<{ success: boolean; message: string }>;
  isBlocking?: boolean;
}

export const LicenseModal: React.FC<LicenseModalProps> = ({
  license,
  onClose,
  onActivate,
  onStartTrial,
  isBlocking = false,
}) => {
  const [keyInput, setKeyInput] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [trialLoading, setTrialLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const machineId = license?.machine_id || 'TS-XXXX-YYYY-ZZZZ';
  const isActive = license?.is_active || false;
  const status = license?.status || 'UNLICENSED';

  const handleCopyMachineId = () => {
    navigator.clipboard.writeText(machineId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleActivateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput.trim()) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await onActivate(keyInput.trim());
      if (res.success) {
        setFeedback({ type: 'success', message: res.message });
        setKeyInput('');
        setTimeout(() => {
          if (!isBlocking) onClose();
        }, 1500);
      } else {
        setFeedback({ type: 'error', message: res.message });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Activation failed.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartTrialClick = async () => {
    setTrialLoading(true);
    setFeedback(null);
    try {
      const res = await onStartTrial();
      if (res.success) {
        setFeedback({ type: 'success', message: res.message });
      } else {
        setFeedback({ type: 'error', message: res.message });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to start trial.' });
    } finally {
      setTrialLoading(false);
    }
  };

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(
    `Hello, I would like to purchase TradeSmart Pro license key for my Machine ID: ${machineId}`
  )}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-md p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-50 text-[#0284c7] flex items-center justify-center font-bold">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900 leading-tight">
                TradeSmart Pro License
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Hardware Machine-Locked License & DRM
              </p>
            </div>
          </div>

          {!isBlocking && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 p-1 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Current License Status Banner */}
        {isActive ? (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div className="text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-emerald-900">
                  {license?.plan} PLAN ACTIVE
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-200 text-emerald-800">
                  {license?.days_left} Days Left
                </span>
              </div>
              <span className="text-[11px] text-emerald-700 block mt-0.5">
                Valid until {license?.expiry_date} · Unlimited F&O Trading
              </span>
            </div>
          </div>
        ) : status === 'EXPIRED' ? (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
            <div className="text-xs">
              <span className="font-bold text-rose-900 block">License Expired</span>
              <span className="text-[11px] text-rose-700 block mt-0.5">
                Your license expired on {license?.expiry_date}. Enter a new activation key to unlock trading.
              </span>
            </div>
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200 flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-[#0284c7] shrink-0" />
            <div className="text-xs">
              <span className="font-bold text-sky-950 block">TradeSmart Pro Activation Required</span>
              <span className="text-[11px] text-sky-700 block mt-0.5">
                Practice realistic NSE/BSE options trading without risking real capital.
              </span>
            </div>
          </div>
        )}

        {/* Machine ID Box */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
              <Laptop className="w-3.5 h-3.5 text-slate-500" />
              Your PC Machine ID
            </span>
            <button
              onClick={handleCopyMachineId}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg text-slate-700 hover:text-[#0284c7] hover:bg-slate-200 transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy ID</span>
                </>
              )}
            </button>
          </div>
          <div className="font-mono text-sm font-black text-slate-900 tracking-wider bg-white p-2 rounded-lg border border-slate-200 text-center select-all">
            {machineId}
          </div>
          <p className="text-[10px] text-slate-500 text-center">
            Copy and send this Machine ID to purchase your activation key.
          </p>
        </div>

        {/* Enter License Key Form */}
        <form onSubmit={handleActivateSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-bold text-slate-800 block mb-1">
              Enter License Activation Key
            </label>
            <input
              type="text"
              placeholder="e.g. TS-YEAR-20271021-XXXX-YYYY-ZZZZ"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value.toUpperCase())}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-xl font-mono text-xs font-bold text-slate-900 outline-none focus:border-[#0284c7] focus:ring-1 focus:ring-[#0284c7]"
              required
            />
          </div>

          {feedback && (
            <div
              className={`p-2.5 rounded-lg text-xs font-bold ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {feedback.message}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !keyInput.trim()}
            className="w-full py-2.5 text-xs font-bold text-white bg-[#0284c7] hover:bg-[#0369a1] disabled:opacity-50 rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            {submitting ? 'Verifying Key...' : 'Activate TradeSmart Pro'}
          </button>
        </form>

        {/* Start Free Trial (if eligible) */}
        {license?.can_start_trial && !isActive && (
          <div className="pt-2 border-t border-slate-200">
            <button
              onClick={handleStartTrialClick}
              disabled={trialLoading}
              className="w-full py-2.5 text-xs font-bold text-slate-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Clock className="w-4 h-4 text-amber-600" />
              <span>{trialLoading ? 'Starting Trial...' : 'Start 7-Day Free Trial (No Card Required)'}</span>
            </button>
          </div>
        )}

        {/* Pricing / WhatsApp Buy Support */}
        <div className="pt-2 border-t border-slate-200 text-center">
          <span className="text-[11px] text-slate-500 block mb-2">
            Don't have a license key yet? Contact on WhatsApp to purchase:
          </span>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 w-full py-2 text-xs font-bold text-white bg-[#25D366] hover:bg-[#20ba59] rounded-xl transition-colors cursor-pointer shadow-xs"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Buy License via WhatsApp / UPI</span>
          </a>
        </div>
      </div>
    </div>
  );
};
