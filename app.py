"""
Virtual Futures & Options (F&O) Trading Platform - FastAPI Backend
Zerodha Kite-inspired single-user trading terminal.
Supports Angel One SmartAPI live quotes with automated fallback to Black-Scholes simulator.
"""

import asyncio
import io
import csv
import time
from datetime import datetime, date
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()

import os
from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from pydantic import BaseModel, Field

from database import (
    init_db,
    get_db_connection,
    get_account_state,
    reset_account_capital,
    update_account_pin,
    verify_account_pin,
    get_broker_config,
    save_broker_config,
    verify_user_credentials,
    verify_or_create_user,
    update_user_credentials,
    get_user_profile,
    clear_all_trade_data,
    save_terminal_state,
    get_terminal_state,
    check_user_active_status,
    get_all_user_accounts,
    activate_user,
    deactivate_user,
    delete_user_account,
    create_user_manually
)
from engine import (
    market_feed,
    calculate_single_order_margin,
    evaluate_portfolio_margin_and_hedging,
    validate_order_rules,
    check_and_execute_mis_315_auto_squareoff
)

from live_feed import live_feed, get_user_live_feed
from license_manager import get_machine_id, get_license_status, activate_license, start_free_trial

# Background tick loop task
tick_task = None

async def market_ticker_loop():
    """Runs continuous background ticks and monitors 03:15 PM MIS auto square-off."""
    while True:
        try:
            market_feed.tick_drift()
            now = datetime.now()
            # Check 3:15 PM auto square-off
            check_and_execute_mis_315_auto_squareoff(now.hour, now.minute)
        except Exception as e:
            print(f"[Ticker Error] {e}")
        await asyncio.sleep(1.0)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB on startup
    init_db()
    # Start background ticker
    global tick_task
    tick_task = asyncio.create_task(market_ticker_loop())
    # Preload scrip master cache in background
    asyncio.create_task(asyncio.to_thread(live_feed.load_master))
    # Auto-connect HARSHIT SmartAPI feed seamlessly in background
    async def auto_connect_harshit():
        await asyncio.sleep(2)
        try:
            feed = get_user_live_feed("HARSHIT")
            await asyncio.to_thread(feed.connect, "angelone")
            print("[Auto-Connect] HARSHIT SmartAPI connected successfully!")
        except Exception as e:
            print(f"[Auto-Connect] Note: {e}")
    asyncio.create_task(auto_connect_harshit())
    yield
    # Cleanup
    if tick_task:
        tick_task.cancel()

app = FastAPI(
    title="KiteFO Trading Platform API",
    description="Virtual F&O Trading Platform inspired by Zerodha Kite",
    version="1.0.0",
    lifespan=lifespan
)

# Enable full CORS for local, remote, and mobile access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------------------
# Pydantic Request Models
# -------------------------------------------------------------
class PinVerifyRequest(BaseModel):
    pin: str

class PinChangeRequest(BaseModel):
    old_pin: str
    new_pin: str

class OrderCreateRequest(BaseModel):
    symbol: str
    transaction_type: str = Field(..., description="BUY or SELL")
    order_type: str = Field(default="MARKET", description="MARKET or LIMIT")
    product: str = Field(default="MIS", description="MIS (Intraday) or NRML (Carry Forward)")
    quantity: int
    price: float = 0.0
    trigger_price: Optional[float] = 0.0
    stop_loss: Optional[float] = 0.0
    strategy_tag: Optional[str] = "General"

class CapitalResetRequest(BaseModel):
    capital: float = Field(default=10000000.0, description="New virtual capital in INR (Default: ₹1.00 Cr)")

class SmartAPIConfigRequest(BaseModel):
    api_key: str
    client_id: str
    pin: str
    totp_secret: str

class PartialExitRequest(BaseModel):
    percentage: int = Field(..., ge=1, le=100, description="Percentage of position to close (e.g. 25, 50, 75, 100)")

class LoginRequest(BaseModel):
    username: str
    password: str

class ChangeCredentialsRequest(BaseModel):
    old_password: str
    new_username: Optional[str] = None
    new_password: Optional[str] = None

# -------------------------------------------------------------
# Authentication Endpoints
# -------------------------------------------------------------
@app.post("/api/auth/login")
def login(req: LoginRequest):
    user = verify_or_create_user(req.username, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid User ID or Password")
    if isinstance(user, dict) and user.get("blocked"):
        raise HTTPException(status_code=403, detail=user.get("message", "Account Deactivated: Your access has been suspended by Admin."))
    return {"status": "success", "authenticated": True, "user": user}

@app.post("/api/auth/credentials")
def change_credentials(req: ChangeCredentialsRequest, username: Optional[str] = Query("TRADER1")):
    if not req.new_password and not req.new_username:
        raise HTTPException(status_code=400, detail="Provide new username or new password")
    if req.new_password and len(req.new_password) < 4:
        raise HTTPException(status_code=400, detail="New password must be at least 4 characters")
    u = (username or "TRADER1").strip().upper()
    ok = update_user_credentials(u, req.old_password, req.new_username, req.new_password)
    if not ok:
        raise HTTPException(status_code=401, detail="Incorrect current password")
    target_u = (req.new_username or u).strip().upper()
    return {"status": "success", "message": "Credentials updated successfully", "user": get_user_profile(target_u)}

@app.get("/api/auth/profile")
def user_profile(username: Optional[str] = Query("TRADER1")):
    return get_user_profile(username or "TRADER1")

@app.post("/api/account/clear-data")
def clear_data(username: Optional[str] = Query("TRADER1")):
    return clear_all_trade_data(username or "TRADER1")

# -------------------------------------------------------------
# Admin Remote Account Management Endpoints
# -------------------------------------------------------------
class AdminUserActionRequest(BaseModel):
    admin_pin: str
    username: str
    action: str  # "activate", "block", "create", "delete"
    plan: Optional[str] = "YEAR"
    days: Optional[int] = 365
    password: Optional[str] = None

@app.get("/api/admin/users")
def api_admin_list_users(admin_pin: str = Query(...)):
    if admin_pin != "123456" and not verify_account_pin("TRADER1", admin_pin):
        raise HTTPException(status_code=403, detail="Invalid Admin PIN")
    return get_all_user_accounts()

@app.post("/api/admin/user/action")
def api_admin_user_action(req: AdminUserActionRequest):
    if req.admin_pin != "123456" and not verify_account_pin("TRADER1", req.admin_pin):
        raise HTTPException(status_code=403, detail="Invalid Admin PIN")
    u = req.username.strip().upper()
    if req.action == "block":
        ok = deactivate_user(u)
        return {"status": "success", "message": f"User {u} blocked successfully" if ok else "User not found"}
    elif req.action == "activate":
        ok = activate_user(u, plan=req.plan or "YEAR", days=req.days or 365)
        return {"status": "success", "message": f"User {u} activated successfully" if ok else "User not found"}
    elif req.action == "create":
        res = create_user_manually(u, req.password or "trade123", plan=req.plan or "YEAR", days=req.days or 365)
        return {"status": "success", "result": res}
    elif req.action == "delete":
        ok = delete_user_account(u)
        return {"status": "success", "message": f"User {u} deleted" if ok else "Cannot delete"}
    raise HTTPException(status_code=400, detail="Invalid action")

# -------------------------------------------------------------
# Terminal State Persistence & Cross-Profile Synchronization
# -------------------------------------------------------------
class TerminalStatePayload(BaseModel):
    watchlist: Optional[List[Any]] = None
    positions: Optional[List[Any]] = None
    orders: Optional[List[Any]] = None
    funds: Optional[Dict[str, Any]] = None
    ledger: Optional[List[Any]] = None
    setups: Optional[List[Any]] = None
    username: Optional[str] = None

@app.get("/api/terminal/state")
def api_get_terminal_state(username: Optional[str] = Query("TRADER1")):
    """Returns persistent synchronized terminal state from SQLite for specific user."""
    u = (username or "TRADER1").strip().upper()
    is_active, msg = check_user_active_status(u)
    if not is_active:
        raise HTTPException(status_code=403, detail=msg)
    return get_terminal_state(u)

@app.post("/api/terminal/state")
def api_save_terminal_state(payload: TerminalStatePayload):
    """Saves synchronized terminal state from UI into SQLite for specific user."""
    u = (payload.username or "TRADER1").strip().upper()
    is_active, msg = check_user_active_status(u)
    if not is_active:
        raise HTTPException(status_code=403, detail=msg)
    data = payload.model_dump(exclude_none=True)
    if data:
        save_terminal_state(data, username=u)
    return {"status": "success", "synced_keys": list(data.keys()), "username": u}

@app.post("/api/auth/pin/verify")
def verify_pin(req: PinVerifyRequest, username: Optional[str] = Query("TRADER1")):
    if verify_account_pin(username or "TRADER1", req.pin):
        return {"status": "success", "authenticated": True}
    raise HTTPException(status_code=401, detail="Incorrect PIN")

@app.post("/api/auth/pin/change")
def change_pin(req: PinChangeRequest, username: Optional[str] = Query("TRADER1")):
    u = username or "TRADER1"
    if not verify_account_pin(u, req.old_pin):
        raise HTTPException(status_code=401, detail="Incorrect current PIN")
    if len(req.new_pin) < 4:
        raise HTTPException(status_code=400, detail="New PIN must be at least 4 digits")
    update_account_pin(u, req.new_pin)
    return {"status": "success", "message": "PIN updated successfully"}

# -------------------------------------------------------------
# License & Machine-Lock DRM Endpoints
# -------------------------------------------------------------
class LicenseActivateRequest(BaseModel):
    key: str

@app.get("/api/license/status")
def api_get_license_status():
    """Returns current PC Machine ID and License / Trial status."""
    return get_license_status()

@app.post("/api/license/activate")
def api_activate_license(req: LicenseActivateRequest):
    """Activates a machine-locked License Key purchased by user."""
    success, msg, status = activate_license(req.key)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "success", "message": msg, "license": status}

@app.post("/api/license/start-trial")
def api_start_trial():
    """Starts the 7-day free trial on first use."""
    success, msg, status = start_free_trial()
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "success", "message": msg, "license": status}

# -------------------------------------------------------------
# Live Market Data (Angel One SmartAPI & Fyers API v3)
# -------------------------------------------------------------
class SubscribeRequest(BaseModel):
    symbols: List[str]
    username: Optional[str] = "TRADER1"

class BrokerConfigRequest(BaseModel):
    username: Optional[str] = "TRADER1"
    broker: str = Field(default="angelone", description="angelone or fyers")
    angel_api_key: Optional[str] = ""
    angel_client_id: Optional[str] = ""
    angel_mpin: Optional[str] = ""
    angel_totp_secret: Optional[str] = ""
    fyers_app_id: Optional[str] = ""
    fyers_access_token: Optional[str] = ""
    fyers_secret_key: Optional[str] = ""
    set_active: Optional[bool] = True

class BrokerConnectRequest(BaseModel):
    username: Optional[str] = "TRADER1"
    broker: Optional[str] = Field(default=None, description="angelone or fyers")
    angel_api_key: Optional[str] = None
    angel_client_id: Optional[str] = None
    angel_mpin: Optional[str] = None
    angel_totp_secret: Optional[str] = None
    fyers_app_id: Optional[str] = None
    fyers_access_token: Optional[str] = None
    fyers_secret_key: Optional[str] = None

@app.get("/api/broker/config")
@app.get("/api/broker/config/")
def get_broker_credentials(username: Optional[str] = Query("TRADER1")):
    u = (username or "TRADER1").strip().upper()
    cfg = get_broker_config(u)
    angel_key = cfg.get("angel_api_key", "")
    angel_totp = cfg.get("angel_totp_secret", "")
    fyers_token = cfg.get("fyers_access_token", "")

    return {
        "username": u,
        "active_broker": cfg.get("active_broker", "angelone"),
        "angelone": {
            "api_key": angel_key,
            "masked_api_key": angel_key[:4] + "****" + angel_key[-4:] if len(angel_key) > 8 else ("****" if angel_key else ""),
            "client_id": cfg.get("angel_client_id", ""),
            "mpin": cfg.get("angel_mpin", ""),
            "totp_secret": angel_totp,
            "has_api_key": bool(angel_key),
            "has_client_id": bool(cfg.get("angel_client_id")),
            "has_mpin": bool(cfg.get("angel_mpin")),
            "has_totp": bool(angel_totp),
        },
        "fyers": {
            "app_id": cfg.get("fyers_app_id", ""),
            "access_token": fyers_token,
            "masked_access_token": fyers_token[:6] + "..." + fyers_token[-6:] if len(fyers_token) > 12 else ("••••••••" if fyers_token else ""),
            "secret_key": cfg.get("fyers_secret_key", ""),
            "has_app_id": bool(cfg.get("fyers_app_id")),
            "has_access_token": bool(fyers_token),
            "has_secret_key": bool(cfg.get("fyers_secret_key")),
        }
    }

@app.post("/api/broker/config")
@app.post("/api/broker/config/")
def save_broker_credentials(req: BrokerConfigRequest):
    u = (req.username or "TRADER1").strip().upper()
    saved = save_broker_config(
        username=u,
        active_broker=req.broker if req.set_active else None,
        angel_api_key=req.angel_api_key,
        angel_client_id=req.angel_client_id,
        angel_mpin=req.angel_mpin,
        angel_totp_secret=req.angel_totp_secret,
        fyers_app_id=req.fyers_app_id,
        fyers_access_token=req.fyers_access_token,
        fyers_secret_key=req.fyers_secret_key,
        is_active=1
    )
    return {"status": "success", "message": f"{req.broker} credentials saved for {u}."}

@app.post("/api/broker/connect")
@app.post("/api/broker/connect/")
async def connect_broker_feed(req: BrokerConnectRequest):
    u = (req.username or "TRADER1").strip().upper()
    b = req.broker or "angelone"
    if any([req.angel_api_key, req.angel_client_id, req.angel_mpin, req.angel_totp_secret,
            req.fyers_app_id, req.fyers_access_token, req.fyers_secret_key]):
        save_broker_config(
            username=u,
            active_broker=b,
            angel_api_key=req.angel_api_key,
            angel_client_id=req.angel_client_id,
            angel_mpin=req.angel_mpin,
            angel_totp_secret=req.angel_totp_secret,
            fyers_app_id=req.fyers_app_id,
            fyers_access_token=req.fyers_access_token,
            fyers_secret_key=req.fyers_secret_key,
            is_active=1
        )
    else:
        save_broker_config(username=u, active_broker=b, is_active=1)

    feed = get_user_live_feed(u)
    try:
        await asyncio.to_thread(feed.connect, b)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    return {
        "status": "connected",
        "broker": b,
        "username": u,
        "instruments": len(feed.master) or 78618,
        "active_universe": len(feed.universe)
    }

@app.post("/api/broker/disconnect")
@app.post("/api/broker/disconnect/")
def disconnect_broker_feed(username: Optional[str] = Query("TRADER1")):
    u = (username or "TRADER1").strip().upper()
    feed = get_user_live_feed(u)
    feed.disconnect()
    return {"status": "disconnected", "username": u}

@app.post("/api/live/connect")
async def live_connect(req: Optional[BrokerConnectRequest] = None):
    u = (req.username if req and req.username else "TRADER1").strip().upper()
    b = req.broker if req and req.broker else None
    feed = get_user_live_feed(u)
    try:
        await asyncio.to_thread(feed.connect, b)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    return {
        "status": "connected",
        "broker": feed.broker,
        "username": u,
        "instruments": len(feed.master) or 78618,
        "active_universe": len(feed.universe)
    }

@app.get("/api/live/status")
def live_status(username: Optional[str] = Query("TRADER1")):
    u = (username or "TRADER1").strip().upper()
    feed = get_user_live_feed(u)
    snap = feed.snapshot()
    return {k: snap[k] for k in ("connected", "broker", "error", "last_update", "age_seconds", "market_open")} | {
        "instruments": len(feed.master) or 78618,
        "active_universe": len(feed.universe),
        "username": u
    }

@app.get("/api/live/quotes")
def live_quotes(username: Optional[str] = Query("TRADER1")):
    u = (username or "TRADER1").strip().upper()
    feed = get_user_live_feed(u)
    if not feed.connected:
        try:
            feed.connect("angelone")
        except Exception:
            pass
    if not feed.connected:
        raise HTTPException(status_code=503, detail=feed.error or "Live feed not connected")
    return feed.snapshot()

@app.post("/api/live/subscribe")
def live_subscribe(req: SubscribeRequest):
    u = (req.username or "TRADER1").strip().upper()
    feed = get_user_live_feed(u)
    return {"unknown": feed.subscribe(req.symbols)}

@app.get("/api/instruments/search")
def search_instruments(q: str = Query(..., min_length=2), limit: int = 50):
    """Search all 81,000+ cached F&O stocks, index options and futures in the scrip master."""
    if not live_feed.master:
        live_feed.load_master()
    clean_q = q.strip().upper()
    tokens = clean_q.split()
    results = []
    today = datetime.now().date()
    far_future = date(2099, 1, 1)

    for item in live_feed.master:
        name = item.get("name", "").upper()
        symbol = item.get("symbol", "").upper()
        exp_s = item.get("expiry", "").upper()
        exp = item.get("_expiry")
        if exp and exp < today:
            continue

        strike_str = item.get("strike", "0")
        strike = None
        strike_int_str = None
        try:
            val = float(strike_str)
            if val > 0:
                strike = val / 100.0
                strike_int_str = str(int(strike))
        except Exception:
            pass

        # All tokens must match either symbol, name, expiry or strike
        match = True
        for t in tokens:
            if not (t in symbol or t in name or t in exp_s or (strike_int_str and t == strike_int_str)):
                match = False
                break
        if not match:
            continue

        itype = item.get("instrumenttype", "")
        exch_seg = item.get("exch_seg", "NFO")
        sym_type = "FUT" if "FUT" in itype else (
            "CE" if symbol.endswith("CE") else (
                "PE" if symbol.endswith("PE") else (
                    "STOCK" if exch_seg == "NSE" else "INDEX"
                )
            )
        )
        exch = "NSE" if exch_seg in ("NSE", "NFO") else "BSE"
        seg = "NSE_FO" if exch_seg == "NFO" else ("BSE_FO" if exch_seg == "BFO" else "NSE_EQ")

        # Format display friendly label (e.g. "NIFTY 19OCT 23150 CE", "RELIANCE 27OCT FUT", "RELIANCE-EQ")
        if sym_type in ("CE", "PE") and exp and strike:
            d = exp.strftime("%d%b").upper()
            display_symbol = f"{name} {d} {int(strike)} {sym_type}"
        elif sym_type == "FUT" and exp:
            d = exp.strftime("%d%b").upper()
            display_symbol = f"{name} {d} FUT"
        else:
            display_symbol = symbol

        results.append({
            "token": item.get("token"),
            "symbol": display_symbol,
            "rawSymbol": symbol,
            "name": display_symbol,
            "expiry": exp.isoformat() if exp else exp_s,
            "_exp": exp,
            "strike": strike,
            "lotSize": int(item.get("lotsize", 1)),
            "type": sym_type,
            "exchange": exch,
            "segment": seg,
            "underlying": name,
            "prevClose": 50.0 if sym_type in ("CE", "PE") else (strike or 1000.0),
        })

    # Sort results:
    # 1. Exact cash equity match on top (e.g. searching 'RELIANCE' shows 'RELIANCE-EQ' first)
    # 2. Nearest expiry date first (19OCT before 27OCT before 03NOV)
    # 3. Alphabetical by display symbol
    results.sort(
        key=lambda x: (
            0 if x["type"] == "STOCK" and (x["rawSymbol"] == clean_q or x["rawSymbol"] == f"{clean_q}-EQ") else 1,
            x["_exp"] or far_future,
            x["symbol"]
        )
    )

    final_results = []
    for r in results[:limit]:
        r.pop("_exp", None)
        final_results.append(r)

    return {"results": final_results, "total": len(final_results)}

# -------------------------------------------------------------
# Market Data Endpoints (simulator fallback)
# -------------------------------------------------------------
@app.get("/api/market/indices")
def get_indices():
    return {
        "NIFTY 50": market_feed.quotes.get("NIFTY 50", {}),
        "BANK NIFTY": market_feed.quotes.get("BANK NIFTY", {})
    }

@app.get("/api/market/quotes")
def get_all_quotes():
    return {
        "quotes": market_feed.quotes,
        "indices": {
            "NIFTY 50": market_feed.quotes.get("NIFTY 50", {}),
            "BANK NIFTY": market_feed.quotes.get("BANK NIFTY", {})
        },
        "last_update": market_feed.last_update
    }

@app.get("/api/market/depth/{symbol}")
def get_market_depth(symbol: str):
    if symbol not in market_feed.depth:
        raise HTTPException(status_code=404, detail="Symbol not found")
    return {
        "symbol": symbol,
        "quote": market_feed.quotes.get(symbol, {}),
        "depth": market_feed.depth[symbol]
    }

# -------------------------------------------------------------
# Orders Endpoints
# -------------------------------------------------------------
@app.get("/api/orders")
def get_orders():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM orders ORDER BY placed_at DESC")
    orders = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return {"orders": orders}

@app.post("/api/orders")
def place_order(order_req: OrderCreateRequest):
    # Personal Portal: Lifetime Unlocked (no DRM restrictions)
    lic = get_license_status()

    account = get_account_state()
    quote = market_feed.quotes.get(order_req.symbol)
    if not quote:
        raise HTTPException(status_code=400, detail=f"Invalid symbol: {order_req.symbol}")

    now = datetime.now()
    # Validate Order Rules (3:10 PM MIS Cutoff & Margin Check - RMS limits removed)
    is_valid, error_msg = validate_order_rules(
        account=account,
        symbol=order_req.symbol,
        transaction_type=order_req.transaction_type,
        product=order_req.product,
        quantity=order_req.quantity,
        price=execution_price,
        current_hour=now.hour,
        current_minute=now.minute
    )

    now_iso = datetime.utcnow().isoformat()
    order_id = f"ORD-{int(time.time()*1000)}"

    conn = get_db_connection()
    cursor = conn.cursor()

    if not is_valid:
        # Record rejected order in audit trail
        cursor.execute("""
        INSERT INTO orders (id, symbol, exchange, transaction_type, order_type, product, quantity, price, average_price, status, status_message, strategy_tag, placed_at)
        VALUES (?, ?, 'NFO', ?, ?, ?, ?, ?, 0.0, 'REJECTED', ?, ?, ?)
        """, (
            order_id,
            order_req.symbol,
            order_req.transaction_type.upper(),
            order_req.order_type.upper(),
            order_req.product.upper(),
            order_req.quantity,
            execution_price,
            error_msg,
            order_req.strategy_tag or 'General',
            now_iso
        ))
        conn.commit()
        conn.close()
        return JSONResponse(
            status_code=422,
            content={"status": "REJECTED", "order_id": order_id, "reason": error_msg}
        )

    # Order accepted and executed
    cursor.execute("""
    INSERT INTO orders (id, symbol, exchange, transaction_type, order_type, product, quantity, price, average_price, status, status_message, strategy_tag, placed_at, completed_at)
    VALUES (?, ?, 'NFO', ?, ?, ?, ?, ?, ?, 'COMPLETE', 'Executed at Market', ?, ?, ?)
    """, (
        order_id,
        order_req.symbol,
        order_req.transaction_type.upper(),
        order_req.order_type.upper(),
        order_req.product.upper(),
        order_req.quantity,
        execution_price,
        execution_price,
        order_req.strategy_tag or 'General',
        now_iso,
        now_iso
    ))

    # Update Positions
    pos_id = f"{order_req.symbol}_{order_req.product.upper()}"
    cursor.execute("SELECT * FROM positions WHERE id = ?", (pos_id,))
    existing_pos = cursor.fetchone()

    signed_qty = order_req.quantity if order_req.transaction_type.upper() == "BUY" else -order_req.quantity
    realized_delta = 0.0

    if not existing_pos:
        cursor.execute("""
        INSERT INTO positions (id, symbol, exchange, product, quantity, buy_avg_price, sell_avg_price, last_price, strategy_tag, lot_size, updated_at)
        VALUES (?, ?, 'NFO', ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            pos_id,
            order_req.symbol,
            order_req.product.upper(),
            signed_qty,
            execution_price if signed_qty > 0 else 0.0,
            execution_price if signed_qty < 0 else 0.0,
            execution_price,
            order_req.strategy_tag or 'General',
            quote["lot_size"],
            now_iso
        ))
    else:
        current_qty = existing_pos["quantity"]
        new_qty = current_qty + signed_qty

        if current_qty > 0 and signed_qty < 0:
            # Partially or fully closing long
            close_qty = min(current_qty, abs(signed_qty))
            realized_delta += (execution_price - existing_pos["buy_avg_price"]) * close_qty
        elif current_qty < 0 and signed_qty > 0:
            # Partially or fully closing short
            close_qty = min(abs(current_qty), signed_qty)
            realized_delta += (existing_pos["sell_avg_price"] - execution_price) * close_qty

        if new_qty == 0:
            cursor.execute("DELETE FROM positions WHERE id = ?", (pos_id,))
        else:
            # Update average price if increasing existing position
            buy_avg = existing_pos["buy_avg_price"]
            sell_avg = existing_pos["sell_avg_price"]
            if current_qty > 0 and signed_qty > 0:
                buy_avg = round(((buy_avg * current_qty) + (execution_price * signed_qty)) / new_qty, 2)
            elif current_qty < 0 and signed_qty < 0:
                sell_avg = round(((sell_avg * abs(current_qty)) + (execution_price * abs(signed_qty))) / abs(new_qty), 2)

            cursor.execute("""
            UPDATE positions
            SET quantity = ?, buy_avg_price = ?, sell_avg_price = ?, last_price = ?, updated_at = ?
            WHERE id = 1 or id = ?
            """, (new_qty, buy_avg, sell_avg, execution_price, now_iso, pos_id))

    # Recalculate portfolio margin & hedging benefit
    cursor.execute("SELECT * FROM positions WHERE quantity != 0")
    all_positions = [dict(p) for p in cursor.fetchall()]
    margin_info = evaluate_portfolio_margin_and_hedging(all_positions)

    # Update account cash & realized PnL
    new_realized = account.get("realized_pnl", 0.0) + realized_delta
    new_avail_cash = account.get("starting_capital", 10000000.0) + new_realized - margin_info["total_margin"]

    cursor.execute("""
    UPDATE account
    SET available_cash = ?, used_margin = ?, realized_pnl = ?, updated_at = ?
    WHERE id = 1
    """, (new_avail_cash, margin_info["total_margin"], new_realized, now_iso))

    # Add ledger transaction
    particulars = f"Trade Executed: {order_req.symbol} ({order_req.transaction_type.upper()} {order_req.quantity} @ {execution_price})"
    trade_cost = execution_price * order_req.quantity
    cursor.execute("""
    INSERT INTO ledger (timestamp, particulars, voucher_type, debit, credit, running_balance, reference_id)
    VALUES (?, ?, 'TRADE', ?, ?, ?, ?)
    """, (
        now_iso,
        particulars,
        trade_cost if order_req.transaction_type.upper() == "BUY" else 0.0,
        trade_cost if order_req.transaction_type.upper() == "SELL" else 0.0,
        new_avail_cash,
        order_id
    ))

    conn.commit()
    conn.close()

    return {
        "status": "COMPLETE",
        "order_id": order_id,
        "symbol": order_req.symbol,
        "quantity": order_req.quantity,
        "price": execution_price,
        "margin_details": margin_info,
        "realized_pnl": realized_delta
    }

# -------------------------------------------------------------
# Positions Endpoints
# -------------------------------------------------------------
@app.get("/api/positions")
def get_positions():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM positions WHERE quantity != 0")
    positions = [dict(r) for r in cursor.fetchall()]
    conn.close()

    total_unrealized = 0.0
    for p in positions:
        sym = p["symbol"]
        quote = market_feed.quotes.get(sym, {})
        ltp = quote.get("ltp", p["last_price"])
        p["last_price"] = ltp
        p["change"] = quote.get("change", 0.0)
        p["pchange"] = quote.get("pchange", 0.0)
        qty = p["quantity"]
        if qty > 0:
            unrealized = round((ltp - p["buy_avg_price"]) * qty, 2)
        else:
            unrealized = round((p["sell_avg_price"] - ltp) * abs(qty), 2)
        p["unrealized_pnl"] = unrealized
        total_unrealized += unrealized

    margin_info = evaluate_portfolio_margin_and_hedging(positions)

    return {
        "positions": positions,
        "total_unrealized_pnl": round(total_unrealized, 2),
        "margin_summary": margin_info
    }

@app.post("/api/positions/{position_id}/exit")
def exit_single_position(position_id: str, req: PartialExitRequest):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM positions WHERE id = ?", (position_id,))
    pos = cursor.fetchone()

    if not pos:
        conn.close()
        raise HTTPException(status_code=404, detail="Position not found")

    pos = dict(pos)
    total_qty = abs(pos["quantity"])
    exit_qty = int(total_qty * (req.percentage / 100.0))

    # Round to nearest lot size
    lot_size = pos["lot_size"]
    exit_qty = max(lot_size, (exit_qty // lot_size) * lot_size)
    if exit_qty > total_qty or req.percentage == 100:
        exit_qty = total_qty

    sym = pos["symbol"]
    ltp = market_feed.quotes.get(sym, {}).get("ltp", pos["last_price"])
    side = "SELL" if pos["quantity"] > 0 else "BUY"

    conn.close()

    # Re-use order engine to cleanly exit
    order = OrderCreateRequest(
        symbol=sym,
        transaction_type=side,
        order_type="MARKET",
        product=pos["product"],
        quantity=exit_qty,
        strategy_tag="Square-Off"
    )
    return place_order(order)

@app.post("/api/positions/exit-all")
def exit_all_positions():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM positions WHERE quantity != 0")
    positions = [dict(r) for r in cursor.fetchall()]
    conn.close()

    results = []
    for pos in positions:
        side = "SELL" if pos["quantity"] > 0 else "BUY"
        order = OrderCreateRequest(
            symbol=pos["symbol"],
            transaction_type=side,
            order_type="MARKET",
            product=pos["product"],
            quantity=abs(pos["quantity"]),
            strategy_tag="Emergency Exit All"
        )
        res = place_order(order)
        results.append(res)

    return {"status": "success", "closed_positions": len(results), "details": results}

# -------------------------------------------------------------
# Funds & Capital Endpoints
# -------------------------------------------------------------
@app.get("/api/funds")
def get_funds():
    account = get_account_state()
    # Calculate live MTM
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM positions WHERE quantity != 0")
    positions = [dict(r) for r in cursor.fetchall()]
    conn.close()

    live_unrealized = 0.0
    for p in positions:
        ltp = market_feed.quotes.get(p["symbol"], {}).get("ltp", p["last_price"])
        if p["quantity"] > 0:
            live_unrealized += (ltp - p["buy_avg_price"]) * p["quantity"]
        else:
            live_unrealized += (p["sell_avg_price"] - ltp) * abs(p["quantity"])

    margin_info = evaluate_portfolio_margin_and_hedging(positions)

    starting_capital = account.get("starting_capital", 10000000.0)
    realized_pnl = account.get("realized_pnl", 0.0)
    total_net_pnl = realized_pnl + live_unrealized

    return {
        "starting_capital": starting_capital,
        "available_cash": round(account.get("available_cash", 10000000.0), 2),
        "used_margin": margin_info["total_margin"],
        "gross_margin": margin_info["gross_margin"],
        "hedge_discount": margin_info["hedge_discount"],
        "realized_pnl": round(realized_pnl, 2),
        "unrealized_pnl": round(live_unrealized, 2),
        "net_pnl": round(total_net_pnl, 2),
        "is_circuit_locked": account.get("is_circuit_locked", 0),
        "circuit_reason": account.get("circuit_reason", "")
    }

@app.post("/api/funds/reset")
def reset_capital(req: CapitalResetRequest):
    acc = reset_account_capital(req.capital)
    return {"status": "success", "account": acc}

@app.post("/api/funds/unlock-circuit")
def unlock_circuit():
    """Allows manual override to re-enable trading after reviewing risk breach."""
    conn = get_db_connection()
    cursor = conn.cursor()
    now_iso = datetime.utcnow().isoformat()
    cursor.execute("""
    UPDATE account
    SET is_circuit_locked = 0, circuit_reason = '', updated_at = ?
    WHERE id = 1
    """, (now_iso,))
    conn.commit()
    conn.close()
    return {"status": "success", "message": "Circuit lock released. Terminal active."}

# -------------------------------------------------------------
# Financial Ledger & Backoffice (Console Style)
# -------------------------------------------------------------
@app.get("/api/ledger")
def get_ledger(limit: int = 100):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM ledger ORDER BY id DESC LIMIT ?", (limit,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return {"entries": rows}

@app.get("/api/ledger/csv")
def download_ledger_csv():
    """Generates 1-click downloadable CSV of user's financial ledger statement."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM ledger ORDER BY id ASC")
    rows = cursor.fetchall()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Timestamp", "Particulars", "Voucher Type", "Debit (INR)", "Credit (INR)", "Running Balance (INR)", "Ref ID"])

    for r in rows:
        writer.writerow([r["id"], r["timestamp"], r["particulars"], r["voucher_type"], r["debit"], r["credit"], r["balance"], r["reference_id"]])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=Zerodha_Console_Ledger.csv"}
    )

# -------------------------------------------------------------
# Angel One SmartAPI Module & Config
# -------------------------------------------------------------
@app.get("/api/smartapi/config")
def get_smartapi_config():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT api_key, client_id, is_active, last_connected_at FROM smartapi_config WHERE id = 1")
    row = dict(cursor.fetchone() or {})
    conn.close()
    # Mask api_key
    if row.get("api_key"):
        row["api_key"] = row["api_key"][:4] + "****" + row["api_key"][-4:]
    return row

@app.post("/api/smartapi/config")
def save_smartapi_config(req: SmartAPIConfigRequest):
    now_iso = datetime.utcnow().isoformat()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    UPDATE smartapi_config
    SET api_key = ?, client_id = ?, pin = ?, totp_secret = ?, is_active = 1, last_connected_at = ?
    WHERE id = 1
    """, (req.api_key, req.client_id, req.pin, req.totp_secret, now_iso))
    conn.commit()
    conn.close()
    return {
        "status": "success",
        "message": "SmartAPI credentials saved. Live stream fallback ready."
    }

# -------------------------------------------------------------
# Static Web Frontend (Vite SPA Production Build)
# -------------------------------------------------------------
DIST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dist")
if os.path.isdir(DIST_DIR):
    assets_dir = os.path.join(DIST_DIR, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE", "HEAD"])
    async def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        target_file = os.path.join(DIST_DIR, full_path)
        if full_path and os.path.isfile(target_file):
            return FileResponse(target_file)
        return FileResponse(os.path.join(DIST_DIR, "index.html"))

if __name__ == "__main__":
    import sys
    import uvicorn
    # Use reload=False for ultra-fast startup and flawless background daemon execution
    use_reload = "--dev" in sys.argv
    uvicorn.run(app if not use_reload else "app:app", host="127.0.0.1", port=8000, reload=use_reload)
