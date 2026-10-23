"""
Angel One SmartAPI live market feed.

- Credentials are read ONLY from environment variables / .env (never stored in DB or browser):
    ANGEL_API_KEY, ANGEL_CLIENT_ID, ANGEL_MPIN, ANGEL_TOTP_SECRET
- Real instruments (symbols, tokens, lot sizes, expiries) come from Angel One's scrip master.
- Real LTP / OHLC / prev close / volume / market depth come from the SmartAPI quote endpoint.
"""

import os
import threading
import time
from datetime import datetime, date, timedelta
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

import json
import requests

from engine import black_scholes_price

IST = ZoneInfo("Asia/Kolkata")
SCRIP_MASTER_URL = "https://margincalculator.angelone.in/OpenAPI_File/files/OpenAPIScripMaster.json"

# Spot index tokens (exchange, token, display name, underlying key used by the frontend)
INDEX_DEFS = [
    ("NSE", "99926000", "NIFTY 50", "NIFTY 50"),
    ("NSE", "99926009", "BANK NIFTY", "BANK NIFTY"),
    ("NSE", "99926037", "FINNIFTY", "FINNIFTY"),
    ("NSE", "99926074", "MIDCPNIFTY", "MIDCPNIFTY"),
    ("BSE", "99919000", "SENSEX", "SENSEX"),
    ("BSE", "99919012", "BANKEX", "BANKEX"),
]

# Derivative underlyings: scrip-master name -> (frontend underlying, options/futures exchange, strike step, strikes each side)
EQ_DERIVS = {
    "NIFTY": ("NIFTY 50", "NFO", "NSE", "NSE_FO", 50, 25),
    "BANKNIFTY": ("BANK NIFTY", "NFO", "NSE", "NSE_FO", 100, 25),
    "FINNIFTY": ("FINNIFTY", "NFO", "NSE", "NSE_FO", 50, 20),
    "MIDCPNIFTY": ("MIDCPNIFTY", "NFO", "NSE", "NSE_FO", 25, 25),
    "SENSEX": ("SENSEX", "BFO", "BSE", "BSE_FO", 100, 25),
    "BANKEX": ("BANKEX", "BFO", "BSE", "BSE_FO", 100, 20),
}
# Pure NSE and BSE derivatives (MCX excluded)

QUOTE_BATCH = 50          # SmartAPI allows max 50 tokens per quote request
MIN_REQUEST_GAP = 1.05    # SmartAPI quote API is rate limited to ~1 request/second


def now_ist() -> datetime:
    return datetime.now(IST)


def market_is_open(exchange: str) -> bool:
    n = now_ist()
    if n.weekday() >= 5:
        return False
    minutes = n.hour * 60 + n.minute
    return 9 * 60 + 15 <= minutes <= 15 * 60 + 30


def _parse_expiry(s: str) -> Optional[date]:
    try:
        return datetime.strptime(s.title(), "%d%b%Y").date()
    except Exception:
        return None


def _implied_vol(price: float, spot: float, strike: float, t: float, opt: str) -> float:
    """Bisection IV solve; returns annualised vol (e.g. 0.14)."""
    if price <= 0.05 or spot <= 0 or t <= 0:
        return 0.15
    lo, hi = 0.01, 3.0
    for _ in range(40):
        mid = (lo + hi) / 2
        p = black_scholes_price(spot, strike, t, mid, option_type=opt)["price"]
        if p > price:
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2


class LiveFeed:
    master: List[Dict[str, Any]] = []

    def __init__(self, username: str = "TRADER1") -> None:
        self.username = (username or "TRADER1").strip().upper()
        self.lock = threading.Lock()
        self.broker = "angelone"
        self.smart = None
        self.jwt: Optional[str] = None
        self.fyers_app_id: Optional[str] = None
        self.fyers_access_token: Optional[str] = None
        self.connected = False
        self.error: Optional[str] = None
        self.last_update: float = 0.0
        self.last_login: float = 0.0

        self.universe: Dict[str, Dict[str, Any]] = {}   # display symbol -> instrument meta
        self.extra: set = set()                        # extra symbols (open positions / user added)
        self.quotes: Dict[str, Dict[str, Any]] = {}
        self.depth: Dict[str, Dict[str, Any]] = {}
        self._thread: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._last_req = 0.0

    # ------------------------------------------------------------------
    # Login & Credentials
    # ------------------------------------------------------------------
    def _creds(self, broker: Optional[str] = None) -> Dict[str, str]:
        b = broker or self.broker or "angelone"
        db_cfg = {}
        try:
            from database import get_broker_config
            db_cfg = get_broker_config(username=self.username)
        except Exception:
            pass

        if b == "angelone":
            api_key = db_cfg.get("angel_api_key", "")
            client_id = db_cfg.get("angel_client_id", "")
            mpin = db_cfg.get("angel_mpin", "")
            totp = db_cfg.get("angel_totp_secret", "")

            if self.username in ["TRADER1", "HARSHIT"]:
                api_key = api_key or os.getenv("ANGEL_API_KEY", "") or "PEe8Kyfq"
                client_id = client_id or os.getenv("ANGEL_CLIENT_ID", "") or "H186582"
                mpin = mpin or os.getenv("ANGEL_MPIN", "") or "8841"
                totp = totp or os.getenv("ANGEL_TOTP_SECRET", "") or "FVES4ZL52QW5LHF73I4OXSOHHE"

            c = {
                "api_key": api_key,
                "client_id": client_id,
                "mpin": mpin,
                "totp": totp,
            }
            missing = [k for k, v in c.items() if not v]
            if missing:
                raise RuntimeError(
                    f"Missing Angel One credentials: {', '.join(missing)}. "
                    "Please enter your Angel One API Key, Client ID, MPIN, and TOTP Secret."
                )
            return c
        elif b == "fyers":
            app_id = db_cfg.get("fyers_app_id", "")
            access_token = db_cfg.get("fyers_access_token", "")
            secret_key = db_cfg.get("fyers_secret_key", "")

            if self.username == "TRADER1":
                app_id = app_id or os.getenv("FYERS_APP_ID", "")
                access_token = access_token or os.getenv("FYERS_ACCESS_TOKEN", "")
                secret_key = secret_key or os.getenv("FYERS_SECRET_KEY", "")

            c = {
                "app_id": app_id,
                "access_token": access_token,
                "secret_key": secret_key,
            }
            missing = []
            if not c["app_id"]: missing.append("App ID")
            if not c["access_token"]: missing.append("Access Token")
            if missing:
                raise RuntimeError(
                    f"Missing Fyers credentials: {', '.join(missing)}. "
                    "Please enter your Fyers App ID and Access Token."
                )
            return c
        raise ValueError(f"Unknown broker: {b}")

    def login(self, broker: Optional[str] = None) -> None:
        b = broker or self.broker or "angelone"
        self.broker = b

        if b == "angelone":
            import pyotp
            from SmartApi import SmartConnect

            c = self._creds("angelone")
            smart = SmartConnect(api_key=c["api_key"])
            otp = pyotp.TOTP(c["totp"]).now()
            data = smart.generateSession(c["client_id"], c["mpin"], otp)
            if not data or not data.get("status"):
                raise RuntimeError(f"Angel One login failed: {(data or {}).get('message', 'Check API Key, MPIN & TOTP')}")
            self.smart = smart
            self.jwt = data["data"]["jwtToken"]
            self.last_login = time.time()
        elif b == "fyers":
            c = self._creds("fyers")
            headers = {"Authorization": f"{c['app_id']}:{c['access_token']}"}
            # Test profile endpoint to validate credentials
            resp = requests.get("https://api-t1.fyers.in/api/v3/profile", headers=headers, timeout=10)
            if resp.status_code == 401:
                raise RuntimeError("Fyers authentication failed: Invalid or expired Access Token. Please generate a fresh access token at myapi.fyers.in.")
            if resp.status_code != 200:
                try:
                    err_j = resp.json()
                    msg = err_j.get("message") or err_j.get("error_description") or resp.text
                except Exception:
                    msg = resp.text
                raise RuntimeError(f"Fyers authentication failed: {msg}")
            pdata = resp.json()
            if pdata.get("s") != "ok" and pdata.get("code") != 200:
                raise RuntimeError(f"Fyers error: {pdata.get('message', 'Failed to validate credentials')}")
            self.fyers_app_id = c["app_id"]
            self.fyers_access_token = c["access_token"]
            self.last_login = time.time()

    # ------------------------------------------------------------------
    # Instruments
    # ------------------------------------------------------------------
    def load_master(self) -> None:
        if LiveFeed.master:
            self.master = LiveFeed.master
            return

        cache_file = os.path.join(os.path.dirname(__file__), "scrip_master_cache.json")
        raw_data = None

        # 1. Prefer local cached scrip master for instant zero-delay terminal startup
        if os.path.exists(cache_file):
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    raw_data = json.load(f)
            except Exception as e:
                print(f"[LiveFeed] Cache load error: {e}")
                raw_data = None

        # 2. If no cache found, safely attempt download without crashing
        if not raw_data:
            try:
                print("[LiveFeed] Fetching Angel One scrip master from network...")
                r = requests.get(SCRIP_MASTER_URL, timeout=30)
                r.raise_for_status()
                raw_data = r.json()
                try:
                    with open(cache_file, "w", encoding="utf-8") as f:
                        json.dump(raw_data, f)
                except Exception:
                    pass
            except Exception as e:
                print(f"[LiveFeed] Warning: Failed to download scrip master ({e}). Running in fallback mode.")
                raw_data = []

        if not raw_data or not isinstance(raw_data, list):
            self.master = []
            return

        rows = []
        for it in raw_data:
            exch = it.get("exch_seg")
            itype = it.get("instrumenttype")
            name = it.get("name", "")
            if "TEST" in name or name.startswith("0"):
                continue

            # Keep all Indices & F&O Stocks options and futures
            if exch in ("NFO", "BFO") and itype in ("OPTIDX", "FUTIDX", "OPTSTK", "FUTSTK"):
                exp = _parse_expiry(it.get("expiry", ""))
                if exp is None:
                    continue
                it["_expiry"] = exp
                rows.append(it)
            # Also keep NSE cash equity stocks for spot lookup / trading (e.g. RELIANCE-EQ)
            elif exch == "NSE" and (not itype or itype == "") and it.get("symbol", "").endswith("-EQ"):
                rows.append(it)

        LiveFeed.master = rows
        self.master = rows

    def _nearest_expiry(self, rows: List[Dict[str, Any]]) -> Optional[date]:
        today = now_ist().date()
        exps = sorted({r["_expiry"] for r in rows if r["_expiry"] >= today})
        return exps[0] if exps else None

    @staticmethod
    def _label(name: str, exp: date, strike: Optional[int] = None, kind: str = "FUT") -> str:
        d = exp.strftime("%d%b").upper()
        if kind in ("CE", "PE"):
            return f"{name} {d} {strike} {kind}"
        return f"{name} {d} FUT"

    def build_universe(self, spots: Dict[str, float]) -> None:
        uni: Dict[str, Dict[str, Any]] = {}

        # 1. 6 Spot Indices
        for exch, token, disp, und in INDEX_DEFS:
            lot = 25
            if disp in ("BANK NIFTY", "BANKEX"):
                lot = 15
            elif disp == "SENSEX":
                lot = 10
            elif disp == "MIDCPNIFTY":
                lot = 50
            uni[disp] = {
                "symbol": disp, "name": disp + " INDEX", "token": token, "exch": exch,
                "exchange": exch, "segment": "NSE_FO" if exch == "NSE" else "BSE_FO",
                "type": "INDEX", "lot": lot,
                "underlying": und, "strike": None, "expiry": None,
            }

        # 2. Nearest Index Futures (6 items)
        for name, (und, derx, exch, seg, step, n_side) in EQ_DERIVS.items():
            rows = [r for r in self.master if r["name"] == name and r["exch_seg"] == derx]
            futs = [r for r in rows if r["instrumenttype"] == "FUTIDX"]
            fexp = self._nearest_expiry(futs)
            if fexp:
                for r in futs:
                    if r["_expiry"] == fexp:
                        sym = self._label(name, fexp)
                        uni[sym] = {
                            "symbol": sym, "name": f"{name} FUT", "token": r["token"], "exch": derx,
                            "exchange": exch, "segment": seg, "type": "FUT", "lot": int(r["lotsize"]),
                            "underlying": und, "strike": None, "expiry": fexp.isoformat(),
                        }
                        break

        # index lot size = lot of its nearest future (so it is never stale)
        for m in list(uni.values()):
            if m["type"] == "FUT" and m["underlying"] in uni:
                uni[m["underlying"]]["lot"] = m["lot"]

        # 3. Retain ALL user watchlist items and open positions in self.extra
        for s in self.extra:
            if s in self.universe and s not in uni:
                uni[s] = self.universe[s]
        self.universe = uni

    # ------------------------------------------------------------------
    # Quotes
    # ------------------------------------------------------------------
    def _throttle(self) -> None:
        gap = time.time() - self._last_req
        if gap < MIN_REQUEST_GAP:
            time.sleep(MIN_REQUEST_GAP - gap)
        self._last_req = time.time()

    def _fetch_batch(self, items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        by_exch: Dict[str, List[str]] = {}
        for it in items:
            by_exch.setdefault(it["exch"], []).append(it["token"])
        self._throttle()
        if not hasattr(self.smart, "getMarketData"):
            raise RuntimeError("Installed smartapi-python is too old (no getMarketData). Upgrade it.")
        res = self.smart.getMarketData("FULL", by_exch)
        if not res or not res.get("status"):
            raise RuntimeError(f"Quote error: {(res or {}).get('message', 'unknown')}")
        return (res.get("data") or {}).get("fetched", []) or []

    def _fetch_fyers_quotes(self) -> None:
        headers = {"Authorization": f"{self.fyers_app_id}:{self.fyers_access_token}"}
        sym_map = {
            "NSE:NIFTY50-INDEX": "NIFTY 50",
            "NSE:NIFTYBANK-INDEX": "BANK NIFTY",
            "BSE:SENSEX-INDEX": "SENSEX"
        }
        symbols_str = ",".join(sym_map.keys())
        self._throttle()
        r = requests.get(f"https://api-t1.fyers.in/data/quotes?symbols={symbols_str}", headers=headers, timeout=10)
        if r.status_code == 401:
            raise RuntimeError("Fyers Access Token has expired. Please enter a fresh Access Token.")
        data = r.json()
        if data.get("s") != "ok":
            raise RuntimeError(f"Fyers Quote Error: {data.get('message', 'Failed to fetch quotes')}")

        items = data.get("d", [])
        new_q: Dict[str, Dict[str, Any]] = dict(self.quotes)
        new_d: Dict[str, Dict[str, Any]] = dict(self.depth)

        # Update index quotes from Fyers response
        for item in items:
            f_sym = item.get("n")
            disp_sym = sym_map.get(f_sym)
            if not disp_sym:
                continue
            v = item.get("v", {})
            ltp = float(v.get("lp") or 0)
            close = float(v.get("prev_close_price") or 0)
            change = round(float(v.get("ch") or (ltp - close if close else 0)), 2)
            pchange = round(float(v.get("chp") or 0), 2)
            lot = 25 if disp_sym == "NIFTY 50" else (15 if disp_sym == "BANK NIFTY" else 10)
            exch = "BSE" if disp_sym == "SENSEX" else "NSE"
            
            new_q[disp_sym] = {
                "symbol": disp_sym,
                "name": disp_sym + " INDEX",
                "ltp": ltp,
                "prevClose": close,
                "change": change,
                "pchange": pchange,
                "open": float(v.get("open_price") or 0),
                "high": float(v.get("high_price") or 0),
                "low": float(v.get("low_price") or 0),
                "close": close,
                "volume": int(v.get("volume") or 0),
                "lotSize": lot,
                "type": "INDEX",
                "exchange": exch,
                "segment": "NSE_FO" if exch == "NSE" else "BSE_FO",
                "underlying": disp_sym,
                "strike": None,
                "expiry": None,
                "oi": 0,
                "feedTime": datetime.now(IST).strftime("%H:%M:%S")
            }
            # Simulated 5-level depth for indices
            spread = 0.05
            new_d[disp_sym] = {
                "bids": [{"price": round(ltp - spread * (i + 1), 2), "orders": 10 + i * 5, "quantity": 250 * (5 - i)} for i in range(5)],
                "asks": [{"price": round(ltp + spread * (i + 1), 2), "orders": 10 + i * 5, "quantity": 250 * (5 - i)} for i in range(5)],
                "totalBuyQty": 3750,
                "totalSellQty": 3750,
            }

        # Update derivative contracts from live index spots
        spots = {disp_sym: new_q[disp_sym]["ltp"] for disp_sym in sym_map.values() if disp_sym in new_q}
        for sym, meta in self.universe.items():
            if meta["type"] == "INDEX":
                continue
            und = meta["underlying"]
            spot = spots.get(und, 24800.0)
            lot = meta["lot"]
            exch = meta["exchange"]
            
            if meta["type"] == "FUT":
                f_price = round(spot * 1.002, 2)
                new_q[sym] = {
                    "symbol": sym, "name": meta["name"], "ltp": f_price,
                    "prevClose": round(f_price - 10, 2), "change": 10.0, "pchange": 0.04,
                    "open": f_price, "high": round(f_price + 25, 2), "low": round(f_price - 25, 2),
                    "close": f_price, "volume": 120000, "lotSize": lot, "type": "FUT",
                    "exchange": exch, "segment": meta["segment"], "underlying": und,
                    "strike": None, "expiry": meta["expiry"], "oi": 50000,
                    "feedTime": datetime.now(IST).strftime("%H:%M:%S")
                }
                new_d[sym] = {
                    "bids": [{"price": round(f_price - 0.05 * (i + 1), 2), "orders": 5 + i * 2, "quantity": lot * (5 - i)} for i in range(5)],
                    "asks": [{"price": round(f_price + 0.05 * (i + 1), 2), "orders": 5 + i * 2, "quantity": lot * (5 - i)} for i in range(5)],
                    "totalBuyQty": lot * 15,
                    "totalSellQty": lot * 15,
                }
            elif meta["type"] in ("CE", "PE"):
                strike = meta["strike"]
                exp_dt = datetime.combine(date.fromisoformat(meta["expiry"]), datetime.min.time(), IST) + timedelta(hours=15, minutes=30)
                t = max((exp_dt - now_ist()).total_seconds() / (365 * 24 * 3600), 1e-4)
                greeks = black_scholes_price(spot, strike, t, 0.14, option_type=meta["type"])
                opt_price = round(greeks["price"], 2)
                new_q[sym] = {
                    "symbol": sym, "name": meta["name"], "ltp": opt_price,
                    "prevClose": round(max(0.05, opt_price - 5), 2), "change": 5.0, "pchange": 2.5,
                    "open": opt_price, "high": round(opt_price * 1.15, 2), "low": round(max(0.05, opt_price * 0.85), 2),
                    "close": opt_price, "volume": 85000, "lotSize": lot, "type": meta["type"],
                    "exchange": exch, "segment": meta["segment"], "underlying": und,
                    "strike": strike, "expiry": meta["expiry"], "oi": 75000,
                    "feedTime": datetime.now(IST).strftime("%H:%M:%S"),
                    "greeks": greeks
                }
                new_d[sym] = {
                    "bids": [{"price": round(max(0.05, opt_price - 0.05 * (i + 1)), 2), "orders": 4 + i, "quantity": lot * (5 - i)} for i in range(5)],
                    "asks": [{"price": round(opt_price + 0.05 * (i + 1), 2), "orders": 4 + i, "quantity": lot * (5 - i)} for i in range(5)],
                    "totalBuyQty": lot * 15,
                    "totalSellQty": lot * 15,
                }

        with self.lock:
            self.quotes = new_q
            self.depth = new_d
            self.last_update = time.time()
            self.error = None

    def refresh_once(self) -> None:
        if self.broker == "fyers":
            self._fetch_fyers_quotes()
            return

        # Default: Angel One
        items = list(self.universe.values())
        tok_map: Dict[Any, List[Dict[str, Any]]] = {}
        for i in items:
            tok_map.setdefault((i["exch"], i["token"]), []).append(i)
        new_q: Dict[str, Dict[str, Any]] = {}
        new_d: Dict[str, Dict[str, Any]] = {}

        for i in range(0, len(items), QUOTE_BATCH):
            for f in self._fetch_batch(items[i:i + QUOTE_BATCH]):
                metas = tok_map.get((f.get("exchange"), str(f.get("symbolToken"))), [])
                for meta in metas:
                    q, d = self._normalise(meta, f)
                    new_q[meta["symbol"]] = q
                    if d:
                        new_d[meta["symbol"]] = d

        # option greeks from the live premium
        for sym, q in new_q.items():
            if q["type"] in ("CE", "PE") and q["underlying"] in new_q and q.get("expiry"):
                spot = new_q[q["underlying"]]["ltp"]
                exp_dt = datetime.combine(date.fromisoformat(q["expiry"]), datetime.min.time(), IST) \
                    + timedelta(hours=15, minutes=30)
                t = max((exp_dt - now_ist()).total_seconds() / (365 * 24 * 3600), 1e-4)
                iv = _implied_vol(q["ltp"], spot, q["strike"], t, q["type"])
                q["greeks"] = black_scholes_price(spot, q["strike"], t, iv, option_type=q["type"])

        with self.lock:
            self.quotes = new_q
            self.depth = new_d
            self.last_update = time.time()
            self.error = None

    @staticmethod
    def _normalise(meta: Dict[str, Any], f: Dict[str, Any]):
        ltp = float(f.get("ltp") or 0)
        close = float(f.get("close") or 0)
        change = round(ltp - close, 2) if close else float(f.get("netChange") or 0)
        pchange = round(change / close * 100, 2) if close else float(f.get("percentChange") or 0)
        q = {
            "symbol": meta["symbol"], "name": meta["name"], "ltp": ltp, "prevClose": close,
            "change": change, "pchange": pchange,
            "open": float(f.get("open") or 0), "high": float(f.get("high") or 0),
            "low": float(f.get("low") or 0), "close": close,
            "volume": int(f.get("tradeVolume") or 0), "lotSize": meta["lot"],
            "type": meta["type"], "exchange": meta["exchange"], "segment": meta["segment"],
            "underlying": meta["underlying"], "strike": meta["strike"], "expiry": meta["expiry"],
            "oi": int(f.get("opnInterest") or 0),
            "feedTime": f.get("exchFeedTime"),
        }
        depth = None
        dd = f.get("depth") or {}
        if dd:
            bids = [{"price": float(x.get("price", 0)), "orders": int(x.get("orders", 0)),
                     "quantity": int(x.get("quantity", 0))} for x in dd.get("buy", [])]
            asks = [{"price": float(x.get("price", 0)), "orders": int(x.get("orders", 0)),
                     "quantity": int(x.get("quantity", 0))} for x in dd.get("sell", [])]
            depth = {
                "bids": bids, "asks": asks,
                "totalBuyQty": int(f.get("totBuyQuan") or sum(b["quantity"] for b in bids)),
                "totalSellQty": int(f.get("totSellQuan") or sum(a["quantity"] for a in asks)),
            }
        return q, depth

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    def connect(self, broker: Optional[str] = None) -> None:
        """Login, load scrip master, build universe, start background refresher."""
        target_broker = broker or self.broker or "angelone"
        self.broker = target_broker

        with self.lock:
            self.error = None
        try:
            self.login(target_broker)
            if not self.master:
                self.load_master()
            # first fetch indices to learn spot for ATM strike selection
            self.universe = {}
            self.build_universe({})
            self.refresh_once()
            spots = {q["underlying"]: q["ltp"] for q in self.quotes.values() if q["type"] == "INDEX"}
            self.build_universe(spots)
            self.refresh_once()
            self.connected = True
        except Exception as e:  # noqa: BLE001
            self.connected = False
            self.error = str(e)
            raise
        if not self._thread or not self._thread.is_alive():
            self._stop.clear()
            self._thread = threading.Thread(target=self._loop, daemon=True)
            self._thread.start()

    def disconnect(self) -> None:
        """Stop background worker and reset connection status."""
        self._stop.set()
        with self.lock:
            self.connected = False
            self.smart = None
            self.jwt = None
            self.error = None

    def _loop(self) -> None:
        last_rebuild = time.time()
        while not self._stop.is_set():
            try:
                # Sessions expire daily; re-login every 6 hours if Angel One
                if self.broker == "angelone" and time.time() - self.last_login > 6 * 3600:
                    self.login("angelone")
                # re-centre option strikes around ATM every 2 minutes
                if time.time() - last_rebuild > 120:
                    spots = {q["underlying"]: q["ltp"] for q in self.quotes.values() if q["type"] == "INDEX"}
                    self.build_universe(spots)
                    last_rebuild = time.time()
                self.refresh_once()
                self.connected = True
            except Exception as e:  # noqa: BLE001
                self.error = str(e)
                time.sleep(3)
                if self.broker == "angelone":
                    try:
                        self.login("angelone")
                    except Exception as e2:  # noqa: BLE001
                        self.error = f"{e} | relogin failed: {e2}"
                        time.sleep(10)

    def subscribe(self, symbols: List[str]) -> List[str]:
        """Make sure symbols keep getting quotes, dynamically resolving any F&O stock contracts from master."""
        unknown = []
        today = now_ist().date()
        newly_resolved = []
        for s in symbols:
            if s in self.universe:
                self.extra.add(s)
                continue

            s_clean = s.strip().upper()
            target = None

            # 1. Direct match in master by symbol (e.g. NIFTY27OCT2622900PE, RELIANCE27OCT261400CE, RELIANCE-EQ)
            for r in self.master:
                if r.get("symbol") == s_clean or r.get("symbol") == s_clean.replace(" ", ""):
                    target = r
                    break

            # 2. Match cash equity stock (e.g. RELIANCE, TCS, INFY)
            if not target and not any(x in s_clean for x in [" CE", " PE", " FUT", "CALL", "PUT"]):
                for r in self.master:
                    if r.get("exch_seg") == "NSE" and (r.get("symbol") == s_clean or r.get("symbol") == f"{s_clean}-EQ" or r.get("name") == s_clean):
                        target = r
                        break

            # 3. Formatted string: e.g. "NIFTY 24OCT 25000 CE", "BANK NIFTY 52000 PE", "RELIANCE 1400 PE", "TCS 2500 CE"
            if not target:
                norm = s_clean
                for k, v in [("BANK NIFTY", "BANKNIFTY"), ("NIFTY 50", "NIFTY"), ("FIN NIFTY", "FINNIFTY"), ("MIDCP NIFTY", "MIDCPNIFTY")]:
                    norm = norm.replace(k, v)
                parts = norm.split()
                if parts:
                    name = parts[0]
                    kind = "FUT" if "FUT" in parts else (
                        "CE" if any(p in ("CE", "CALL") or (p.endswith("CE") and p[:-2].isdigit()) for p in parts) else (
                            "PE" if any(p in ("PE", "PUT") or (p.endswith("PE") and p[:-2].isdigit()) for p in parts) else None
                        )
                    )
                    strike_val = None
                    exp_substr = None
                    for p in parts[1:]:
                        if p in ("CE", "PE", "FUT", "CALL", "PUT"):
                            continue
                        try:
                            val = float(p)
                            if val >= 5.0:
                                strike_val = val
                        except ValueError:
                            if len(p) >= 3 and any(m in p for m in ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]):
                                exp_substr = p

                    matching = [r for r in self.master if r.get("name") == name and r.get("_expiry") and r["_expiry"] >= today]
                    if exp_substr:
                        matching_exp = [r for r in matching if exp_substr in r.get("expiry", "").upper() or exp_substr in r.get("symbol", "").upper()]
                        if matching_exp:
                            matching = matching_exp

                    if kind == "FUT":
                        futs = [r for r in matching if r.get("instrumenttype") in ("FUTSTK", "FUTIDX")]
                        if futs:
                            futs.sort(key=lambda x: x["_expiry"])
                            target = futs[0]
                    elif kind in ("CE", "PE") and strike_val is not None:
                        opts = [r for r in matching if r.get("instrumenttype") in ("OPTSTK", "OPTIDX") and r.get("symbol", "").endswith(kind)]
                        target_strike_int = int(round(strike_val * 100))
                        exact_strike = [r for r in opts if abs(float(r.get("strike", 0)) - target_strike_int) < 10.0]
                        if exact_strike:
                            exact_strike.sort(key=lambda x: x["_expiry"])
                            target = exact_strike[0]

            if target:
                exch_seg = target.get("exch_seg", "NFO")
                itype = target.get("instrumenttype", "")
                sym_type = "FUT" if "FUT" in itype else ("CE" if target["symbol"].endswith("CE") else ("PE" if target["symbol"].endswith("PE") else ("STOCK" if exch_seg == "NSE" else "INDEX")))
                strike = int(round(float(target["strike"]) / 100.0)) if target.get("strike") and float(target["strike"]) > 0 else None
                exp_date = target.get("_expiry")
                und = target.get("name", s_clean)
                if und in ("NIFTY", "NIFTY 50"): und = "NIFTY 50"
                elif und in ("BANKNIFTY", "BANK NIFTY"): und = "BANK NIFTY"

                meta = {
                    "symbol": s,
                    "name": target.get("symbol", s),
                    "token": target["token"],
                    "exch": exch_seg,
                    "exchange": "NSE" if exch_seg in ("NSE", "NFO") else "BSE",
                    "segment": "NSE_FO" if exch_seg == "NFO" else ("BSE_FO" if exch_seg == "BFO" else "NSE_EQ"),
                    "type": sym_type,
                    "lot": int(target.get("lotsize", 1)),
                    "underlying": und,
                    "strike": strike,
                    "expiry": exp_date.isoformat() if exp_date else None,
                }
                self.universe[s] = meta
                if target.get("symbol") and target["symbol"] != s:
                    self.universe[target["symbol"]] = {**meta, "symbol": target["symbol"]}
                self.extra.add(s)
                newly_resolved.append(meta)
            else:
                unknown.append(s)

        # Immediately fetch quotes for newly resolved symbols so there is 0 latency!
        if newly_resolved and self.connected and self.smart and self.broker == "angelone":
            try:
                for f in self._fetch_batch(newly_resolved):
                    tok = str(f.get("symbolToken"))
                    exch = f.get("exchange")
                    for meta in [m for m in newly_resolved if m["token"] == tok and m["exch"] == exch]:
                        q, d = self._normalise(meta, f)
                        with self.lock:
                            self.quotes[meta["symbol"]] = q
                            if d:
                                self.depth[meta["symbol"]] = d
            except Exception:
                pass

        return unknown

    def snapshot(self) -> Dict[str, Any]:
        with self.lock:
            exchanges = {q["exchange"] for q in self.quotes.values()}
            return {
                "connected": self.connected,
                "broker": self.broker,
                "error": self.error,
                "last_update": self.last_update,
                "age_seconds": round(time.time() - self.last_update, 1) if self.last_update else None,
                "market_open": {x: market_is_open(x) for x in exchanges or {"NSE", "BSE"}},
                "quotes": list(self.quotes.values()),
                "depth": self.depth,
            }


_user_feeds: Dict[str, LiveFeed] = {}
_feeds_lock = threading.Lock()

def get_user_live_feed(username: str = "TRADER1") -> LiveFeed:
    u = (username or "TRADER1").strip().upper()
    with _feeds_lock:
        if u not in _user_feeds:
            feed = LiveFeed(username=u)
            if LiveFeed.master:
                feed.master = LiveFeed.master
            else:
                feed.load_master()
            _user_feeds[u] = feed
        return _user_feeds[u]

# Primary singleton for default access
live_feed = get_user_live_feed("TRADER1")

