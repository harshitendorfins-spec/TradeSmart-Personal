import { MarketQuote, MarketDepth } from '../types/trading';

// Empty base = same origin (Vite dev proxy / Render serves both). Set VITE_API_URL if the backend is elsewhere.
const BASE: string = (import.meta as any).env?.VITE_API_URL || '';

export interface LiveSnapshot {
  connected: boolean;
  broker?: 'angelone' | 'fyers';
  error: string | null;
  last_update: number;
  age_seconds: number | null;
  market_open: Record<string, boolean>;
  quotes: MarketQuote[];
  depth: Record<string, MarketDepth>;
}

export interface BrokerConfigResponse {
  active_broker: 'angelone' | 'fyers';
  angelone: {
    api_key: string;
    masked_api_key: string;
    client_id: string;
    mpin: string;
    totp_secret: string;
    has_api_key: boolean;
    has_client_id: boolean;
    has_mpin: boolean;
    has_totp: boolean;
  };
  fyers: {
    app_id: string;
    access_token: string;
    masked_access_token: string;
    secret_key: string;
    has_app_id: boolean;
    has_access_token: boolean;
    has_secret_key: boolean;
  };
}

export function getActiveUser(): string {
  try {
    return localStorage.getItem('tradesmart_username') || 'TRADER1';
  } catch {
    return 'TRADER1';
  }
}

export async function getBrokerConfig(username?: string): Promise<BrokerConfigResponse> {
  const u = username || getActiveUser();
  const r = await fetch(`${BASE}/api/broker/config?username=${encodeURIComponent(u)}`);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `HTTP ${r.status}`);
  return r.json();
}

export async function saveBrokerConfig(data: Partial<BrokerConfigResponse['angelone'] & BrokerConfigResponse['fyers']> & { broker: string; set_active?: boolean; username?: string }): Promise<void> {
  const u = data.username || getActiveUser();
  const r = await fetch(`${BASE}/api/broker/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, username: u }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `HTTP ${r.status}`);
}

export async function connectBroker(broker: 'angelone' | 'fyers', creds?: Record<string, string>, username?: string): Promise<{ instruments: number; broker: string }> {
  const u = username || getActiveUser();
  const r = await fetch(`${BASE}/api/broker/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ broker, username: u, ...(creds || {}) }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `HTTP ${r.status}`);
  return r.json();
}

export async function disconnectBroker(username?: string): Promise<void> {
  const u = username || getActiveUser();
  await fetch(`${BASE}/api/broker/disconnect?username=${encodeURIComponent(u)}`, { method: 'POST' }).catch(() => undefined);
}

export async function liveConnect(broker?: 'angelone' | 'fyers', username?: string): Promise<{ instruments: number; broker?: string }> {
  const u = username || getActiveUser();
  const r = await fetch(`${BASE}/api/live/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ broker, username: u }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `HTTP ${r.status}`);
  return r.json();
}

export async function liveQuotes(username?: string): Promise<LiveSnapshot> {
  const u = username || getActiveUser();
  const r = await fetch(`${BASE}/api/live/quotes?username=${encodeURIComponent(u)}`);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `HTTP ${r.status}`);
  return r.json();
}

export async function liveSubscribe(symbols: string[], username?: string): Promise<void> {
  const u = username || getActiveUser();
  await fetch(`${BASE}/api/live/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbols, username: u }),
  }).catch(() => undefined);
}

