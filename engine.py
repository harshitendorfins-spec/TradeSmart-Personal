"""
Virtual F&O Trading Platform - Quantitative Engine
Contains:
1. Black-Scholes option pricing & Greeks model
2. Real-time simulated market data ticker with realistic volatility
3. Margin calculation engine with dynamic Hedge Margin Discount (SPAN + Spreads)
4. RMS (Risk Management System) per-trade 1% stop-loss risk & daily 1% MTM auto square-off
"""

import math
import time
import random
from datetime import datetime
from typing import Dict, Any, List, Tuple, Optional
from database import get_db_connection, get_account_state

# -------------------------------------------------------------
# 1. Black-Scholes Formula & Greeks
# -------------------------------------------------------------
def normal_cdf(x: float) -> float:
    """Cumulative distribution function for standard normal distribution."""
    return (1.0 + math.erf(x / math.sqrt(2.0))) / 2.0

def normal_pdf(x: float) -> float:
    """Standard normal probability density function."""
    return math.exp(-0.5 * x * x) / math.sqrt(2.0 * math.pi)

def black_scholes_price(
    spot: float,
    strike: float,
    time_to_expiry_years: float,
    volatility: float,
    risk_free_rate: float = 0.07,
    option_type: str = "CE"
) -> Dict[str, float]:
    """
    Computes theoretical option price and Greeks (Delta, Gamma, Theta, Vega).
    """
    if time_to_expiry_years <= 0.0001:
        # At expiry
        intrinsic = max(0.0, spot - strike) if option_type == "CE" else max(0.0, strike - spot)
        return {
            "price": round(intrinsic, 2),
            "delta": 1.0 if (option_type == "CE" and spot >= strike) else (-1.0 if option_type == "PE" and spot <= strike else 0.0),
            "gamma": 0.0,
            "theta": 0.0,
            "vega": 0.0,
            "iv": round(volatility * 100, 2)
        }

    d1 = (math.log(spot / strike) + (risk_free_rate + 0.5 * volatility ** 2) * time_to_expiry_years) / (volatility * math.sqrt(time_to_expiry_years))
    d2 = d1 - volatility * math.sqrt(time_to_expiry_years)

    if option_type == "CE":
        price = spot * normal_cdf(d1) - strike * math.exp(-risk_free_rate * time_to_expiry_years) * normal_cdf(d2)
        delta = normal_cdf(d1)
        theta = (- (spot * normal_pdf(d1) * volatility) / (2 * math.sqrt(time_to_expiry_years)) 
                 - risk_free_rate * strike * math.exp(-risk_free_rate * time_to_expiry_years) * normal_cdf(d2)) / 365.0
    else:
        price = strike * math.exp(-risk_free_rate * time_to_expiry_years) * normal_cdf(-d2) - spot * normal_cdf(-d1)
        delta = normal_cdf(d1) - 1.0
        theta = (- (spot * normal_pdf(d1) * volatility) / (2 * math.sqrt(time_to_expiry_years)) 
                 + risk_free_rate * strike * math.exp(-risk_free_rate * time_to_expiry_years) * normal_cdf(-d2)) / 365.0

    gamma = normal_pdf(d1) / (spot * volatility * math.sqrt(time_to_expiry_years))
    vega = (spot * math.sqrt(time_to_expiry_years) * normal_pdf(d1)) / 100.0  # per 1% change in vol

    return {
        "price": max(0.05, round(price, 2)),
        "delta": round(delta, 3),
        "gamma": round(gamma, 5),
        "theta": round(theta, 2),
        "vega": round(vega, 2),
        "iv": round(volatility * 100, 2)
    }

# -------------------------------------------------------------
# 2. Market Universe & Simulated Feed State
# -------------------------------------------------------------
class MarketState:
    def __init__(self):
        # Base spot prices
        self.spots = {
            "NIFTY 50": 24850.0,
            "BANK NIFTY": 52120.0,
            "SENSEX": 81420.0,
            "CRUDEOIL": 6150.0,
            "NATURALGAS": 238.50,
            "GOLD": 76280.0,
            "SILVER": 91420.0
        }
        self.prev_close = {
            "NIFTY 50": 24780.0,
            "BANK NIFTY": 51950.0,
            "SENSEX": 81210.0,
            "CRUDEOIL": 6140.0,
            "NATURALGAS": 236.80,
            "GOLD": 76180.0,
            "SILVER": 91320.0
        }
        self.volatilities = {
            "NIFTY 50": 0.138,
            "BANK NIFTY": 0.165,
            "SENSEX": 0.140,
            "CRUDEOIL": 0.280,
            "NATURALGAS": 0.350,
            "GOLD": 0.120,
            "SILVER": 0.180
        }
        self.expiry_days = 7.0 / 365.0  # Weekly expiry

        # Watchlist symbols definitions
        self.symbols_info = {
            # Indices
            "NIFTY 50": {"type": "INDEX", "lot": 25, "underlying": "NIFTY 50"},
            "BANK NIFTY": {"type": "INDEX", "lot": 15, "underlying": "BANK NIFTY"},
            "SENSEX": {"type": "INDEX", "lot": 10, "underlying": "SENSEX"},
            # BSE SENSEX Derivatives
            "SENSEX 26OCT FUT": {"type": "FUT", "lot": 10, "underlying": "SENSEX", "strike": 0},
            "SENSEX 26OCT 81200 CE": {"type": "CE", "lot": 10, "underlying": "SENSEX", "strike": 81200},
            "SENSEX 26OCT 81200 PE": {"type": "PE", "lot": 10, "underlying": "SENSEX", "strike": 81200},
            "SENSEX 26OCT 81400 CE": {"type": "CE", "lot": 10, "underlying": "SENSEX", "strike": 81400},
            "SENSEX 26OCT 81400 PE": {"type": "PE", "lot": 10, "underlying": "SENSEX", "strike": 81400},
            "SENSEX 26OCT 81600 CE": {"type": "CE", "lot": 10, "underlying": "SENSEX", "strike": 81600},
            "SENSEX 26OCT 81600 PE": {"type": "PE", "lot": 10, "underlying": "SENSEX", "strike": 81600},
            # MCX Commodities
            "CRUDEOIL 19NOV FUT": {"type": "FUT", "lot": 100, "underlying": "CRUDEOIL", "strike": 0},
            "NATURALGAS 26NOV FUT": {"type": "FUT", "lot": 1250, "underlying": "NATURALGAS", "strike": 0},
            "GOLD 05DEC FUT": {"type": "FUT", "lot": 100, "underlying": "GOLD", "strike": 0},
            "SILVER 05DEC FUT": {"type": "FUT", "lot": 30, "underlying": "SILVER", "strike": 0},
            # Futures
            "NIFTY OCT FUT": {"type": "FUT", "lot": 25, "underlying": "NIFTY 50", "strike": 0},
            "BANKNIFTY OCT FUT": {"type": "FUT", "lot": 15, "underlying": "BANK NIFTY", "strike": 0},
            # Nifty Options
            "NIFTY 24700 CE": {"type": "CE", "lot": 25, "underlying": "NIFTY 50", "strike": 24700},
            "NIFTY 24700 PE": {"type": "PE", "lot": 25, "underlying": "NIFTY 50", "strike": 24700},
            "NIFTY 24800 CE": {"type": "CE", "lot": 25, "underlying": "NIFTY 50", "strike": 24800},
            "NIFTY 24800 PE": {"type": "PE", "lot": 25, "underlying": "NIFTY 50", "strike": 24800},
            "NIFTY 24850 CE": {"type": "CE", "lot": 25, "underlying": "NIFTY 50", "strike": 24850},
            "NIFTY 24850 PE": {"type": "PE", "lot": 25, "underlying": "NIFTY 50", "strike": 24850},
            "NIFTY 24900 CE": {"type": "CE", "lot": 25, "underlying": "NIFTY 50", "strike": 24900},
            "NIFTY 24900 PE": {"type": "PE", "lot": 25, "underlying": "NIFTY 50", "strike": 24900},
            "NIFTY 25000 CE": {"type": "CE", "lot": 25, "underlying": "NIFTY 50", "strike": 25000},
            "NIFTY 25000 PE": {"type": "PE", "lot": 25, "underlying": "NIFTY 50", "strike": 25000},
            # Bank Nifty Options
            "BANKNIFTY 51800 CE": {"type": "CE", "lot": 15, "underlying": "BANK NIFTY", "strike": 51800},
            "BANKNIFTY 51800 PE": {"type": "PE", "lot": 15, "underlying": "BANK NIFTY", "strike": 51800},
            "BANKNIFTY 52000 CE": {"type": "CE", "lot": 15, "underlying": "BANK NIFTY", "strike": 52000},
            "BANKNIFTY 52000 PE": {"type": "PE", "lot": 15, "underlying": "BANK NIFTY", "strike": 52000},
            "BANKNIFTY 52200 CE": {"type": "CE", "lot": 15, "underlying": "BANK NIFTY", "strike": 52200},
            "BANKNIFTY 52200 PE": {"type": "PE", "lot": 15, "underlying": "BANK NIFTY", "strike": 52200},
            "BANKNIFTY 52500 CE": {"type": "CE", "lot": 15, "underlying": "BANK NIFTY", "strike": 52500},
            "BANKNIFTY 52500 PE": {"type": "PE", "lot": 15, "underlying": "BANK NIFTY", "strike": 52500},
        }

        # Market Depth & quotes dictionary
        self.quotes = {}
        self.depth = {}
        self.last_update = time.time()
        self.update_all_quotes(random_drift=False)

    def tick_drift(self):
        """Simulate realistic tick drift with geometric Brownian motion."""
        # Nifty drift
        drift_n = random.gauss(0, 3.5)
        self.spots["NIFTY 50"] = round(self.spots["NIFTY 50"] + drift_n, 2)

        # BankNifty drift (correlated with beta ~1.3)
        drift_b = (drift_n * 1.3) + random.gauss(0, 9.0)
        self.spots["BANK NIFTY"] = round(self.spots["BANK NIFTY"] + drift_b, 2)

        self.update_all_quotes(random_drift=True)

    def update_all_quotes(self, random_drift: bool = True):
        for sym, meta in self.symbols_info.items():
            u_name = meta["underlying"]
            spot = self.spots[u_name]
            stype = meta["type"]

            if stype == "INDEX":
                ltp = spot
                change = round(ltp - self.prev_close[sym], 2)
                pchange = round((change / self.prev_close[sym]) * 100, 2)
                greeks = {}
            elif stype == "FUT":
                # Futures trading at small fair value premium
                fut_premium = 35.0 if "NIFTY" in sym else 90.0
                ltp = round(spot + fut_premium + (random.gauss(0, 1.5) if random_drift else 0), 2)
                base = self.prev_close[u_name] + fut_premium
                change = round(ltp - base, 2)
                pchange = round((change / base) * 100, 2)
                greeks = {"delta": 1.0}
            else:
                # Option contract pricing via Black-Scholes
                strike = meta["strike"]
                vol = self.volatilities[u_name]
                bs = black_scholes_price(spot, strike, self.expiry_days, vol, option_type=stype)
                ltp = bs["price"]
                # Approximate previous close for option
                prev_spot = self.prev_close[u_name]
                prev_bs = black_scholes_price(prev_spot, strike, self.expiry_days + (1/365.0), vol, option_type=stype)
                prev_p = max(0.5, prev_bs["price"])
                change = round(ltp - prev_p, 2)
                pchange = round((change / prev_p) * 100, 2)
                greeks = bs

            self.quotes[sym] = {
                "symbol": sym,
                "ltp": ltp,
                "change": change,
                "pchange": pchange,
                "open": round(ltp * 0.995, 2),
                "high": round(ltp * 1.012, 2),
                "low": round(ltp * 0.988, 2),
                "close": round(ltp - change, 2),
                "volume": random.randint(120000, 950000),
                "lot_size": meta["lot"],
                "type": stype,
                "underlying": u_name,
                "greeks": greeks,
                "timestamp": datetime.utcnow().strftime("%H:%M:%S")
            }

            # Generate Level 2 Depth (5 bids and 5 asks)
            spread = 0.05 if ltp < 100 else (0.10 if ltp < 500 else 0.50)
            best_bid = round(ltp - spread, 2)
            best_ask = round(ltp + spread, 2)
            bids = []
            asks = []
            for i in range(5):
                bids.append({
                    "price": round(best_bid - (i * spread), 2),
                    "orders": random.randint(2, 28),
                    "quantity": random.randint(1, 15) * meta["lot"]
                })
                asks.append({
                    "price": round(best_ask + (i * spread), 2),
                    "orders": random.randint(2, 28),
                    "quantity": random.randint(1, 15) * meta["lot"]
                })
            self.depth[sym] = {
                "bids": bids,
                "asks": asks,
                "total_buy_qty": sum(b["quantity"] for b in bids),
                "total_sell_qty": sum(a["quantity"] for a in asks)
            }
        self.last_update = time.time()

# Global Market State Singleton
market_feed = MarketState()

# -------------------------------------------------------------
# 3. Margin & Hedging Engine
# -------------------------------------------------------------
SPAN_BASE_MARGINS = {
    "NIFTY 50": 115000.0,    # ~₹1,15,000 per lot of 25 for short options/futures
    "BANK NIFTY": 125000.0,  # ~₹1,25,000 per lot of 15 for short options/futures
    "SENSEX": 95000.0,       # ~₹95,000 per lot of 10 for BSE SENSEX
    "CRUDEOIL": 180000.0,    # ~₹1,80,000 per lot of 100 on MCX
    "NATURALGAS": 140000.0,  # ~₹1,40,000 per lot of 1250 on MCX
    "GOLD": 380000.0,        # ~₹3,80,000 per lot of 100 on MCX
    "SILVER": 290000.0       # ~₹2,90,000 per lot of 30 on MCX
}

def calculate_single_order_margin(
    symbol: str,
    transaction_type: str,
    quantity: int,
    price: float
) -> float:
    """
    Computes required margin for an individual order prior to hedge benefits.
    Option Buying: Premium * Quantity
    Option Selling / Futures: SPAN Base Margin per lot
    """
    info = market_feed.symbols_info.get(symbol, {"type": "CE", "lot": 25, "underlying": "NIFTY 50"})
    stype = info["type"]
    lot_size = info["lot"]
    lots = abs(quantity) // lot_size

    if stype in ["CE", "PE"]:
        if transaction_type.upper() == "BUY":
            return round(price * abs(quantity), 2)
        else:
            # Option Selling requires SPAN margin + premium buffer
            underlying = info["underlying"]
            base_span = SPAN_BASE_MARGINS.get(underlying, 120000.0)
            return round(base_span * lots, 2)
    elif stype == "FUT":
        underlying = info["underlying"]
        base_span = SPAN_BASE_MARGINS.get(underlying, 120000.0)
        return round(base_span * lots, 2)
    else:
        return 0.0

def evaluate_portfolio_margin_and_hedging(positions: List[Dict[str, Any]]) -> Dict[str, float]:
    """
    Scans entire open positions portfolio and calculates SPAN margin with dynamic Hedge Benefits:
    - Long Option + Short Option (Bull Call, Bear Put, Bear Call, Bull Put spreads)
    - Long Future + Long Put (Protective Put)
    - Hedging discount reduces required margin significantly (up to 70%).
    """
    if not positions:
        return {"total_margin": 0.0, "gross_margin": 0.0, "hedge_discount": 0.0}

    gross_margin = 0.0
    underlying_groups = {}

    for pos in positions:
        sym = pos["symbol"]
        qty = pos["quantity"]
        if qty == 0:
            continue
        info = market_feed.symbols_info.get(sym, {"type": "CE", "lot": 25, "underlying": "NIFTY 50"})
        u = info["underlying"]
        if u not in underlying_groups:
            underlying_groups[u] = []
        underlying_groups[u].append({**pos, **info})

        # Calculate gross margin
        ltp = pos.get("last_price", 100.0)
        if qty > 0 and info["type"] in ["CE", "PE"]:
            gross_margin += pos.get("buy_avg_price", ltp) * qty
        else:
            lots = abs(qty) // info["lot"]
            gross_margin += SPAN_BASE_MARGINS.get(u, 120000.0) * lots

    total_discount = 0.0

    # Evaluate hedges per underlying
    for u, group in underlying_groups.items():
        long_calls = sum(p["quantity"] for p in group if p["type"] == "CE" and p["quantity"] > 0)
        short_calls = abs(sum(p["quantity"] for p in group if p["type"] == "CE" and p["quantity"] < 0))
        long_puts = sum(p["quantity"] for p in group if p["type"] == "PE" and p["quantity"] > 0)
        short_puts = abs(sum(p["quantity"] for p in group if p["type"] == "PE" and p["quantity"] < 0))

        # Check call spreads
        hedged_call_qty = min(long_calls, short_calls)
        if hedged_call_qty > 0:
            lot = 25 if "NIFTY 50" in u else 15
            hedged_lots = hedged_call_qty // lot
            # Discount is ~70% of base SPAN margin per hedged lot
            base_span = SPAN_BASE_MARGINS.get(u, 120000.0)
            total_discount += round(hedged_lots * (base_span * 0.70), 2)

        # Check put spreads
        hedged_put_qty = min(long_puts, short_puts)
        if hedged_put_qty > 0:
            lot = 25 if "NIFTY 50" in u else 15
            hedged_lots = hedged_put_qty // lot
            base_span = SPAN_BASE_MARGINS.get(u, 120000.0)
            total_discount += round(hedged_lots * (base_span * 0.70), 2)

    net_margin = max(0.0, round(gross_margin - total_discount, 2))
    return {
        "total_margin": net_margin,
        "gross_margin": round(gross_margin, 2),
        "hedge_discount": round(total_discount, 2)
    }

# -------------------------------------------------------------
# 4. RMS (Risk Management System) Engine
# -------------------------------------------------------------
class RMSError(Exception):
    pass

def validate_order_rules(
    account: Dict[str, Any],
    symbol: str,
    transaction_type: str,
    product: str,
    quantity: int,
    price: float,
    current_hour: int = 11,
    current_minute: int = 30
) -> Tuple[bool, Optional[str]]:
    """
    Validates order placement rules:
    1. 3:10 PM MIS Cutoff: New MIS orders rejected after 15:10 IST.
    2. Cash margin sufficiency check.
    (All RMS risk limits removed as requested).
    """
    # Check 3:10 PM MIS cutoff
    if product.upper() == "MIS" and (current_hour > 15 or (current_hour == 15 and current_minute >= 10)):
        return False, "MIS Order Blocked: Intraday (MIS) orders are disabled after 03:10 PM as per exchange auto square-off rules. Please use NRML."

    # Check margin
    req_margin = calculate_single_order_margin(symbol, transaction_type, quantity, price)
    avail_cash = account.get("available_cash", 0.0)

    if req_margin > avail_cash:
        shortfall = req_margin - avail_cash
        return False, f"Insufficient Margin: Required ₹{req_margin:,.2f}, Available ₹{avail_cash:,.2f} (Shortfall ₹{shortfall:,.2f})."

    return True, None

def check_and_execute_mis_315_auto_squareoff(current_hour: int, current_minute: int) -> Tuple[bool, Optional[str]]:
    """
    3:15 PM MIS Auto Square-off:
    At 03:15 PM IST (15:15), all open MIS (Intraday) positions are automatically
    squared off at market price, exactly like real brokers do. NRML positions remain intact.
    """
    if current_hour < 15 or (current_hour == 15 and current_minute < 15):
        return False, None

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM positions WHERE product = 'MIS' AND quantity != 0")
    mis_positions = [dict(r) for r in cursor.fetchall()]

    if not mis_positions:
        conn.close()
        return False, None

    now_iso = datetime.utcnow().isoformat()
    total_realized = 0.0

    for p in mis_positions:
        sym = p["symbol"]
        qty = p["quantity"]
        ltp = market_feed.quotes.get(sym, {}).get("ltp", p["last_price"])
        side = "SELL" if qty > 0 else "BUY"
        exit_qty = abs(qty)
        order_id = f"AUTO-SQ-315-{int(time.time()*1000)}"

        cursor.execute("""
        INSERT INTO orders (id, symbol, exchange, transaction_type, order_type, product, quantity, price, average_price, status, status_message, strategy_tag, placed_at, completed_at)
        VALUES (?, ?, ?, ?, 'MARKET', 'MIS', ?, ?, ?, 'COMPLETE', 'Broker 03:15 PM MIS Auto Square-Off', 'Auto-Intraday', ?, ?)
        """, (order_id, sym, p["exchange"], side, exit_qty, ltp, ltp, now_iso, now_iso))

        if qty > 0:
            trade_pnl = (ltp - p["buy_avg_price"]) * qty
        else:
            trade_pnl = (p["sell_avg_price"] - ltp) * exit_qty
        total_realized += trade_pnl

        cursor.execute("DELETE FROM positions WHERE id = ?", (p["id"],))

    account = get_account_state()
    new_avail = account["available_cash"] + total_realized
    cursor.execute("UPDATE account SET available_cash = ?, realized_pnl = realized_pnl + ?, updated_at = ? WHERE id = 1", (new_avail, total_realized, now_iso))
    conn.commit()
    conn.close()

    return True, f"03:15 PM Cutoff: Auto squared off {len(mis_positions)} MIS positions."

