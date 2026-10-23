import React, { useState, useEffect } from 'react';
import {
  X,
  Activity,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
  Key,
  Lock,
  Eye,
  EyeOff,
  ExternalLink,
  Save,
  Check
} from 'lucide-react';
import {
  getBrokerConfig,
  saveBrokerConfig,
  connectBroker,
  BrokerConfigResponse
} from '../utils/liveApi';

interface SmartAPIModalProps {
  isOpen: boolean;
  onClose: () => void;
  liveEnabled: boolean;
  connected: boolean;
  marketOpen: boolean;
  error: string | null;
  instrumentCount: number;
  watchlistCount?: number;
  activeBroker?: 'angelone' | 'fyers';
  onConnect: (broker: 'angelone' | 'fyers', creds?: any) => Promise<void>;
  onDisconnect: () => void;
}

export const SmartAPIModal: React.FC<SmartAPIModalProps> = ({
  isOpen,
  onClose,
  liveEnabled,
  connected,
  marketOpen,
  error,
  instrumentCount,
  watchlistCount = 0,
  activeBroker = 'angelone',
  onConnect,
  onDisconnect,
}) => {
  const [selectedBroker, setSelectedBroker] = useState<'angelone' | 'fyers'>('angelone');
  const [busy, setBusy] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Password visibility toggles
  const [showMpin, setShowMpin] = useState(false);
  const [showTotp, setShowTotp] = useState(false);
  const [showFyersToken, setShowFyersToken] = useState(false);
  const [showFyersSecret, setShowFyersSecret] = useState(false);

  // Form states
  const [angelApiKey, setAngelApiKey] = useState('');
  const [angelClientId, setAngelClientId] = useState('');
  const [angelMpin, setAngelMpin] = useState('');
  const [angelTotp, setAngelTotp] = useState('');

  const [fyersAppId, setFyersAppId] = useState('');
  const [fyersAccessToken, setFyersAccessToken] = useState('');
  const [fyersSecretKey, setFyersSecretKey] = useState('');

  // Fetch saved config from backend on modal open
  useEffect(() => {
    if (!isOpen) return;
    setLocalError(null);
    setSaveSuccess(false);

    getBrokerConfig()
      .then((cfg: BrokerConfigResponse) => {
        if (cfg.active_broker) {
          setSelectedBroker(cfg.active_broker);
        }
        if (cfg.angelone) {
          setAngelApiKey(cfg.angelone.api_key || '');
          setAngelClientId(cfg.angelone.client_id || '');
          setAngelMpin(cfg.angelone.mpin || '');
          setAngelTotp(cfg.angelone.totp_secret || '');
        }
        if (cfg.fyers) {
          setFyersAppId(cfg.fyers.app_id || '');
          setFyersAccessToken(cfg.fyers.access_token || '');
          setFyersSecretKey(cfg.fyers.secret_key || '');
        }
      })
      .catch((e) => {
        console.warn('Could not load broker config from backend:', e);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveOnly = async () => {
    setBusy(true);
    setLocalError(null);
    setSaveSuccess(false);
    try {
      if (selectedBroker === 'angelone') {
        await saveBrokerConfig({
          broker: 'angelone',
          angel_api_key: angelApiKey.trim(),
          angel_client_id: angelClientId.trim(),
          angel_mpin: angelMpin.trim(),
          angel_totp_secret: angelTotp.trim(),
          set_active: true,
        });
      } else {
        await saveBrokerConfig({
          broker: 'fyers',
          fyers_app_id: fyersAppId.trim(),
          fyers_access_token: fyersAccessToken.trim(),
          fyers_secret_key: fyersSecretKey.trim(),
          set_active: true,
        });
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e: any) {
      setLocalError(e?.message || 'Failed to save credentials');
    } finally {
      setBusy(false);
    }
  };

  const handleConnect = async () => {
    setBusy(true);
    setLocalError(null);
    setSaveSuccess(false);
    try {
      const creds = selectedBroker === 'angelone'
        ? {
            angel_api_key: angelApiKey.trim(),
            angel_client_id: angelClientId.trim(),
            angel_mpin: angelMpin.trim(),
            angel_totp_secret: angelTotp.trim(),
          }
        : {
            fyers_app_id: fyersAppId.trim(),
            fyers_access_token: fyersAccessToken.trim(),
            fyers_secret_key: fyersSecretKey.trim(),
          };

      await onConnect(selectedBroker, creds);
    } catch (e: any) {
      setLocalError(e?.message || 'Connection failed. Please check your credentials.');
    } finally {
      setBusy(false);
    }
  };

  const shownError = localError || (liveEnabled && !connected ? error : null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 select-none">
      <div className="bg-white rounded shadow-2xl border border-[#cbd5e1] w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#e2e8f0] bg-[#f8fafc]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-[#0284c7]/10 flex items-center justify-center text-[#0284c7]">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#0f172a] leading-none">Broker API & Live Data Setup</h3>
              <p className="text-[11px] text-[#64748b] mt-0.5">Stream real exchange tick data for NSE & BSE F&O</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-[#64748b] hover:text-[#0f172a] hover:bg-[#f1f5f9] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 space-y-4 overflow-y-auto text-xs text-[#334155]">
          
          {/* Broker Selector Tabs */}
          <div>
            <label className="text-[11px] font-bold text-[#475569] uppercase tracking-wider block mb-1.5">
              Select Broker API Feed
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-[#f1f5f9] rounded border border-[#e2e8f0]">
              <button
                type="button"
                onClick={() => { setSelectedBroker('angelone'); setLocalError(null); }}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded font-semibold text-xs transition-all ${
                  selectedBroker === 'angelone'
                    ? 'bg-white text-[#0284c7] shadow-xs border border-[#cbd5e1]'
                    : 'text-[#64748b] hover:text-[#0f172a]'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-[#0284c7]" />
                Angel One (SmartAPI)
              </button>
              <button
                type="button"
                onClick={() => { setSelectedBroker('fyers'); setLocalError(null); }}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded font-semibold text-xs transition-all ${
                  selectedBroker === 'fyers'
                    ? 'bg-white text-[#0284c7] shadow-xs border border-[#cbd5e1]'
                    : 'text-[#64748b] hover:text-[#0f172a]'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-[#16a34a]" />
                Fyers (API v3)
              </button>
            </div>
          </div>

          {/* Form Fields: Angel One */}
          {selectedBroker === 'angelone' && (
            <div className="space-y-3 p-3.5 rounded border border-[#e2e8f0] bg-[#fafafa]">
              <div className="flex items-center justify-between pb-1 border-b border-[#e2e8f0]">
                <span className="font-bold text-xs text-[#0f172a]">Angel One SmartAPI Credentials</span>
                <a
                  href="https://smartapi.angelone.in"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-[11px] text-[#0284c7] hover:underline"
                >
                  <span>smartapi.angelone.in</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#475569] mb-1">
                  API Key <span className="text-[#dc2626]">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={angelApiKey}
                    onChange={(e) => setAngelApiKey(e.target.value)}
                    placeholder="Enter Angel One SmartAPI Key"
                    className="w-full px-3 py-2 bg-white border border-[#cbd5e1] rounded text-xs font-mono outline-none focus:border-[#0284c7]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#475569] mb-1">
                  Client ID / User ID <span className="text-[#dc2626]">*</span>
                </label>
                <input
                  type="text"
                  value={angelClientId}
                  onChange={(e) => setAngelClientId(e.target.value)}
                  placeholder="e.g. A123456"
                  className="w-full px-3 py-2 bg-white border border-[#cbd5e1] rounded text-xs font-mono outline-none focus:border-[#0284c7]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-[#475569] mb-1">
                    MPIN <span className="text-[#dc2626]">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showMpin ? 'text' : 'password'}
                      value={angelMpin}
                      onChange={(e) => setAngelMpin(e.target.value)}
                      placeholder="4-digit MPIN"
                      maxLength={6}
                      className="w-full px-3 py-2 pr-8 bg-white border border-[#cbd5e1] rounded text-xs font-mono outline-none focus:border-[#0284c7]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowMpin(!showMpin)}
                      className="absolute right-2 top-2.5 text-[#94a3b8] hover:text-[#475569]"
                    >
                      {showMpin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#475569] mb-1">
                    TOTP Secret Key <span className="text-[#dc2626]">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showTotp ? 'text' : 'password'}
                      value={angelTotp}
                      onChange={(e) => setAngelTotp(e.target.value)}
                      placeholder="Authenticator Key"
                      className="w-full px-3 py-2 pr-8 bg-white border border-[#cbd5e1] rounded text-xs font-mono outline-none focus:border-[#0284c7]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowTotp(!showTotp)}
                      className="absolute right-2 top-2.5 text-[#94a3b8] hover:text-[#475569]"
                    >
                      {showTotp ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Form Fields: Fyers */}
          {selectedBroker === 'fyers' && (
            <div className="space-y-3 p-3.5 rounded border border-[#e2e8f0] bg-[#fafafa]">
              <div className="flex items-center justify-between pb-1 border-b border-[#e2e8f0]">
                <span className="font-bold text-xs text-[#0f172a]">Fyers API v3 Credentials</span>
                <a
                  href="https://myapi.fyers.in"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-[11px] text-[#0284c7] hover:underline"
                >
                  <span>myapi.fyers.in</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#475569] mb-1">
                  App ID / Client ID <span className="text-[#dc2626]">*</span>
                </label>
                <input
                  type="text"
                  value={fyersAppId}
                  onChange={(e) => setFyersAppId(e.target.value)}
                  placeholder="e.g. XC12345-100"
                  className="w-full px-3 py-2 bg-white border border-[#cbd5e1] rounded text-xs font-mono outline-none focus:border-[#0284c7]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#475569] mb-1">
                  Daily Access Token <span className="text-[#dc2626]">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showFyersToken ? 'text' : 'password'}
                    value={fyersAccessToken}
                    onChange={(e) => setFyersAccessToken(e.target.value)}
                    placeholder="Paste your daily Fyers Access Token (eyJ...)"
                    className="w-full px-3 py-2 pr-8 bg-white border border-[#cbd5e1] rounded text-xs font-mono outline-none focus:border-[#0284c7]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowFyersToken(!showFyersToken)}
                    className="absolute right-2 top-2.5 text-[#94a3b8] hover:text-[#475569]"
                  >
                    {showFyersToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#475569] mb-1">
                  App Secret Key <span className="text-[#94a3b8] font-normal">(Optional)</span>
                </label>
                <div className="relative">
                  <input
                    type={showFyersSecret ? 'text' : 'password'}
                    value={fyersSecretKey}
                    onChange={(e) => setFyersSecretKey(e.target.value)}
                    placeholder="Enter Secret Key if configured"
                    className="w-full px-3 py-2 pr-8 bg-white border border-[#cbd5e1] rounded text-xs font-mono outline-none focus:border-[#0284c7]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowFyersSecret(!showFyersSecret)}
                    className="absolute right-2 top-2.5 text-[#94a3b8] hover:text-[#475569]"
                  >
                    {showFyersSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Connection Status Card */}
          <div className="flex items-center justify-between p-3 rounded border border-[#e2e8f0] bg-[#f8fafc]">
            <div>
              <div className="font-semibold text-xs text-[#0f172a]">
                {connected
                  ? (marketOpen
                      ? `Live Connected (${activeBroker === 'fyers' ? 'Fyers' : 'Angel One'})`
                      : `Connected (${activeBroker === 'fyers' ? 'Fyers' : 'Angel One'}) — Market Closed`)
                  : 'Broker Feed Disconnected'}
              </div>
              {connected && (
                <div className="text-[11px] text-[#64748b] mt-0.5 space-y-0.5">
                  <div className="text-[#0f172a] font-medium">All 210+ F&O Stocks & Indices Active (81,000+ Real Contracts via Angel One)</div>
                  <div className="text-[#0284c7] font-semibold">{watchlistCount} instruments active in your watchlist</div>
                </div>
              )}
            </div>
            {connected ? (
              <CheckCircle2 className="w-5 h-5 text-[#16a34a] shrink-0" />
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#fee2e2] text-[#b91c1c]">
                Offline
              </span>
            )}
          </div>

          {/* Save Confirmation */}
          {saveSuccess && (
            <div className="flex items-center gap-2 p-2.5 rounded bg-[#f0fdf4] border border-[#bbf7d0] text-[#15803d]">
              <Check className="w-4 h-4 shrink-0" />
              <span>Credentials saved successfully to local storage & .env!</span>
            </div>
          )}

          {/* Error Banner */}
          {shownError && (
            <div className="flex items-start gap-2 p-3 rounded bg-[#fef2f2] border border-[#fecaca] text-[#b91c1c]">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="break-words leading-relaxed">{shownError}</p>
            </div>
          )}
        </div>

        {/* Modal Actions Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-[#e2e8f0] bg-[#f8fafc]">
          <div>
            {liveEnabled && (
              <button
                type="button"
                onClick={onDisconnect}
                className="px-3 py-1.5 rounded border border-[#fecaca] text-[#dc2626] hover:bg-[#fef2f2] text-xs font-medium transition-colors"
              >
                Disconnect Feed
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveOnly}
              disabled={busy}
              className="px-3 py-1.5 rounded border border-[#cbd5e1] text-[#334155] hover:bg-white hover:border-[#94a3b8] text-xs font-semibold flex items-center gap-1.5 disabled:opacity-60"
            >
              <Save className="w-3.5 h-3.5" />
              Save Credentials
            </button>

            <button
              type="button"
              onClick={handleConnect}
              disabled={busy}
              className="px-4 py-1.5 rounded bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-60 shadow-xs"
            >
              {busy && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              {connected && activeBroker === selectedBroker ? 'Reconnect' : `Save & Connect to ${selectedBroker === 'fyers' ? 'Fyers' : 'Angel One'}`}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
