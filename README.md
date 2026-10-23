# TradeSmart - Professional Virtual F&O Trading Terminal

A production-grade, single-user virtual Futures & Options trading terminal inspired by institutional broker platforms (Zerodha Kite & Angel One Trade). Features 100% real exchange data streaming via Angel One SmartAPI across 81,000+ contracts, dynamic SPAN hedge margin benefits, authentic Kite audio chimes, strict 03:10 PM MIS order cutoffs, 03:15 PM broker auto square-offs, and realistic pending limit order execution.

---

## ⚡ Quick Start (1-Click Run)

The terminal is pre-configured for seamless single-click desktop operation on Windows:

1. **Launch**:
   - Double-click **`TradeSmart.bat`** (or the **`TradeSmart Terminal.lnk`** shortcut on your Desktop).
   - This starts the unified backend server and opens `http://127.0.0.1:8000` in your default browser.
   - **Default Login**: User ID `TRADER1` · Password / PIN: `123456`
   - **Starting Capital**: ₹1,00,00,000 (₹1.00 Crore INR)

2. **Stop**:
   - Double-click **`Stop_TradeSmart.bat`** or press `Ctrl + C` in the launcher console window.

---

## 🛠️ Local Development Setup

### Prerequisites
- **Python**: 3.10 or higher
- **Node.js**: v18+ or v24+ LTS (available at `%LOCALAPPDATA%\Microsoft\WinGet\Packages\...`)
- **Angel One SmartAPI Account**: Free API key from [smartapi.angelone.in](https://smartapi.angelone.in)

### 1. Installation
Open PowerShell or Command Prompt in the project root (`C:\Users\TRADERDESK12E\Desktop\TradeSmart`):

```bash
# 1. Install Python dependencies
pip install -r requirements.txt

# 2. Install Frontend Node modules
npm install
```

---

## 🖥️ Running Modes

### Mode A: Full Development Mode (Hot-Reload)
Best when developing UI components or editing frontend files with instant hot-module-replacement (HMR):

- Run the convenient batch file:
  ```bash
  run_dev.bat
  ```
- Or run manually in two terminals:
  * **Terminal 1 (Backend API)**:
    ```bash
    python -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload
    ```
  * **Terminal 2 (Vite Frontend)**:
    ```bash
    npm run dev
    ```
- Open `http://localhost:3000` (Vite dev server auto-proxies all `/api/*` calls to port 8000).

### Mode B: Single Production Terminal Mode (Recommended)
FastAPI serves both the high-speed REST APIs and the compiled production React SPA from `dist/`:

```bash
# Step 1: Compile the frontend
npm run build
# (or double-click build_frontend.bat)

# Step 2: Start the unified server
python -m uvicorn app:app --host 127.0.0.1 --port 8000
# (or double-click TradeSmart.bat)
```
Open `http://127.0.0.1:8000` in your browser.

---

## 🧪 Testing & Verification Guide

### 1. Automated API & Live Feed Verification
Run the automated test script to verify scrip master loading, multi-token searches, and live contract subscription:

```bash
python test_api.py
```

Expected output:
```text
=== 0. Live Status ===
Status: {'connected': True, 'broker': 'angelone', 'instruments': 81299, 'active_universe': 27}

=== 1. Searching NIFTY Options ===
Found 10 results:
  Symbol: NIFTY 19OCT 20050 CE | Type: CE | Strike: 20050.0 | Expiry: 2026-10-19 | Lot: 65
  ...

=== 2. Searching Strikes (24800, 25000, 22900) ===
Query '22900' found 10 matches:
  NIFTY 19OCT 22900 CE (NIFTY 19OCT 22900 CE) Expiry: 2026-10-19 Strike: 22900.0
  NIFTY 19OCT 22900 PE (NIFTY 19OCT 22900 PE) Expiry: 2026-10-19 Strike: 22900.0

=== 3. Searching Stock F&O (RELIANCE, TCS) ===
Query 'RELIANCE' found 10 matches:
  RELIANCE-EQ (STOCK) Strike: None Lot: 1
  RELIANCE 27OCT 1000 CE (CE) Strike: 1000.0 Lot: 500

=== 4. Testing Subscribe for Weekly ATM & OTM ===
Subscription response: {'unknown': []}
ALL SYMBOLS SUBSCRIBED SUCCESSFULLY WITH 0 UNKNOWN!
```

---

### 2. Manual End-to-End Testing Checklist

| # | Feature / Test Case | Verification Steps | Expected Result |
|---|---------------------|-------------------|-----------------|
| 1 | **Watchlist Search** | Type `nifty 23150`, `nifty 19oct`, `22900 pe`, or `reliance` in the search box. | Real contracts from 81,000+ scrip master appear instantly with the **nearest weekly expiry (`19OCT`) at the top** and exact lot sizes (65 for Nifty). |
| 2 | **0ms Script Addition** | Click anywhere on the search result row, click `+ Add`, or press `Enter`. | Script appears in Watchlist immediately (0ms), search box clears, dropdown closes, and live ticks start streaming. |
| 3 | **Realistic Limit Order Execution** | With option LTP at ₹100, place a **BUY Limit Order at ₹85**. | Order stays **OPEN / PENDING** in the Orders tab with `Limit Pending @ ₹85.00 (LTP: ₹100.00)`. Does **not** execute prematurely until real market tick hits ₹85 or lower. |
| 4 | **Market Order & Option Entry Price** | Place a BUY Market order on an option (e.g. `NIFTY 19OCT 22950 PE`). | Executes at real market LTP (e.g. ₹42.35). Entry price is verified to be the option premium, never the 5-digit strike price (₹22,950). |
| 5 | **03:10 PM MIS Cutoff** | Try placing an MIS order after 03:10 PM IST exchange time. | Order is rejected with message: `MIS orders disabled after 03:10 PM cutoff as per exchange rules. Please use NRML.` |
| 6 | **03:15 PM MIS Auto Square-off** | Hold an open MIS position past 03:15 PM IST. | Position auto-exits at market LTP and books realized P&L. |
| 7 | **SPAN Spread Hedge Margin** | Buy `NIFTY 23200 CE` and Sell `NIFTY 23400 CE` (Bull Call Spread). | SPAN margin engine applies dynamic hedge discount (saving up to ₹98,000+ margin). |

---

## 🔐 Broker API Configuration

### Method 1: In-App UI (Recommended)
1. Click the **Angel One · Live** button in the terminal header.
2. Enter your:
   - **API Key**
   - **Client ID** (e.g. `A123456`)
   - **MPIN**
   - **TOTP Secret Key** (from Angel One SmartAPI security page)
3. Click **Save & Connect**. Credentials are automatically encrypted and saved to `.env`.

### Method 2: `.env` File
Create or edit `.env` in the project root:
```ini
ACTIVE_BROKER=angelone
ANGEL_API_KEY=your_smartapi_key
ANGEL_CLIENT_ID=your_client_id
ANGEL_MPIN=your_4_digit_mpin
ANGEL_TOTP_SECRET=your_base32_totp_secret
```

---

## 📁 Project Architecture & Key Files

```text
TradeSmart/
├── app.py                   # FastAPI backend: REST API, Scrip Master Search, SPA Static File Server
├── live_feed.py             # Angel One SmartAPI connection, live polling loop, universal quote broadcast
├── database.py              # SQLite storage for orders, positions, trade ledger, and PIN security
├── requirements.txt         # Python package dependencies
├── package.json             # Frontend React/Vite dependencies
├── dist/                    # Compiled SPA production bundle (served at http://127.0.0.1:8000)
├── test_api.py              # Automated test suite for search, quotes, and subscriptions
├── TradeSmart.bat           # 1-Click launcher for single-user desktop terminal
├── run_dev.bat              # Hot-reload development mode launcher
├── build_frontend.bat       # Rebuilds Vite frontend production bundle
└── src/
    ├── App.tsx              # Main state, limit order matching engine, live MTM updater
    ├── components/
    │   ├── Header.tsx       # Real broker status pill, exchange clock, account profile dropdown
    │   ├── Watchlist.tsx    # Multi-token search with 19OCT expiry priority, 0ms addition
    │   ├── OrderModal.tsx   # Buy/Sell order modal with margin requirement & hedge discount
    │   ├── PositionsTab.tsx # Grouped spreads, real-time MTM, and 1-click square-off
    │   ├── OrdersTab.tsx    # Real pending limit orders, execution log, and cancellation
    │   ├── FundsTab.tsx     # Cash balance, used margin, and SPAN hedge benefit tracker
    │   └── SmartAPIModal.tsx# Broker credential setup and feed status monitor
    └── utils/
        ├── fnoStocks.ts     # Universal contract key mapping (getContractKey)
        ├── audio.ts         # Authentic Zerodha Kite audio chimes via Web Audio API
        └── liveApi.ts       # Backend REST API client
```

---

## 💡 Key Design Decisions & Commitments

1. **Zero Simulation**: All prices, OHLC, volume, and depth are 100% real exchange ticks direct from Angel One SmartAPI.
2. **Universal Contract Key Mapping (`getContractKey`)**: Normalizes Angel One raw symbols (e.g. `NIFTY19OCT2622950PE`) and UI display names (`NIFTY 19OCT 22950 PE`) to guarantee 0ms synchronization without any symbol format discrepancies.
3. **Robust Option Pricing**: Option positions and orders always execute at actual premium prices (₹20–₹200), strictly preventing strike prices from ever being used as price fallbacks.
