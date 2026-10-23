"""
Virtual F&O Trading Platform - Database Layer
SQLite with WAL mode for fast concurrent reads and ACID transactional integrity.
"""
import sqlite3
import os
import json
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple

DB_FILE = os.getenv("DB_PATH", "personal_trading.db")

def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # Enable WAL mode for high performance
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA busy_timeout=5000;")
    return conn

def init_db(default_capital: float = 10000000.0, default_pin: str = "123456"):
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Accounts Table (Single-User Personal Account)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS account (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        username TEXT DEFAULT 'TRADER1',
        password TEXT DEFAULT 'trade123',
        pin TEXT NOT NULL DEFAULT '123456',
        starting_capital REAL NOT NULL,
        available_cash REAL NOT NULL,
        used_margin REAL NOT NULL DEFAULT 0.0,
        realized_pnl REAL NOT NULL DEFAULT 0.0,
        is_circuit_locked INTEGER NOT NULL DEFAULT 0,
        circuit_reason TEXT DEFAULT '',
        circuit_locked_at TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    """)

    # Ensure username and password columns exist if table was previously created
    try:
        cursor.execute("ALTER TABLE account ADD COLUMN username TEXT DEFAULT 'TRADER1'")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE account ADD COLUMN password TEXT DEFAULT 'trade123'")
    except Exception:
        pass

    # 2. Orders Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        exchange TEXT NOT NULL DEFAULT 'NFO',
        transaction_type TEXT NOT NULL, /* BUY or SELL */
        order_type TEXT NOT NULL,       /* MARKET or LIMIT */
        product TEXT NOT NULL,          /* MIS or NRML */
        quantity INTEGER NOT NULL,
        price REAL NOT NULL,
        trigger_price REAL DEFAULT 0.0,
        stop_loss REAL DEFAULT 0.0,
        average_price REAL DEFAULT 0.0,
        status TEXT NOT NULL,           /* COMPLETE, REJECTED, OPEN, CANCELLED */
        status_message TEXT DEFAULT '',
        strategy_tag TEXT DEFAULT 'General',
        placed_at TEXT NOT NULL,
        completed_at TEXT DEFAULT ''
    );
    """)

    # 3. Open Positions Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS positions (
        id TEXT PRIMARY KEY,            /* e.g., NIFTY24800CE_MIS */
        symbol TEXT NOT NULL,
        exchange TEXT NOT NULL DEFAULT 'NFO',
        product TEXT NOT NULL,          /* MIS or NRML */
        quantity INTEGER NOT NULL,      /* Positive for Long, Negative for Short */
        buy_avg_price REAL NOT NULL DEFAULT 0.0,
        sell_avg_price REAL NOT NULL DEFAULT 0.0,
        last_price REAL NOT NULL DEFAULT 0.0,
        unrealized_pnl REAL NOT NULL DEFAULT 0.0,
        realized_pnl REAL NOT NULL DEFAULT 0.0,
        strategy_tag TEXT DEFAULT 'General',
        lot_size INTEGER NOT NULL DEFAULT 25,
        updated_at TEXT NOT NULL
    );
    """)

    # 4. Financial Ledger (Zerodha Console Style)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        particulars TEXT NOT NULL,
        voucher_type TEXT NOT NULL,     /* DEPOSIT, TRADE_EXPENSE, TRADE_CREDIT, REALIZED_PNL, CHARGES */
        debit REAL NOT NULL DEFAULT 0.0,
        credit REAL NOT NULL DEFAULT 0.0,
        running_balance REAL NOT NULL,
        reference_id TEXT DEFAULT ''
    );
    """)

    # 5. SmartAPI Credentials Storage
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS smartapi_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        api_key TEXT DEFAULT '',
        client_id TEXT DEFAULT '',
        pin TEXT DEFAULT '',
        totp_secret TEXT DEFAULT '',
        is_active INTEGER DEFAULT 0,
        last_connected_at TEXT DEFAULT ''
    );
    """)

    # 6. Unified Broker Config (Angel One & Fyers)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS broker_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        active_broker TEXT DEFAULT 'angelone',
        angel_api_key TEXT DEFAULT '',
        angel_client_id TEXT DEFAULT '',
        angel_mpin TEXT DEFAULT '',
        angel_totp_secret TEXT DEFAULT '',
        fyers_app_id TEXT DEFAULT '',
        fyers_access_token TEXT DEFAULT '',
        fyers_secret_key TEXT DEFAULT '',
        is_active INTEGER DEFAULT 0,
        last_connected_at TEXT DEFAULT ''
    );
    """)

    # 7. Terminal State Persistence (Shared across browser profiles and desktop windows)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS terminal_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    """)

    # 8. Multi-Tenant User Accounts (Isolated ₹1 Cr Virtual Capital per user)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_accounts (
        username TEXT PRIMARY KEY,
        password TEXT NOT NULL DEFAULT 'trade123',
        pin TEXT NOT NULL DEFAULT '123456',
        starting_capital REAL NOT NULL DEFAULT 10000000.0,
        available_cash REAL NOT NULL DEFAULT 10000000.0,
        used_margin REAL NOT NULL DEFAULT 0.0,
        realized_pnl REAL NOT NULL DEFAULT 0.0,
        is_circuit_locked INTEGER NOT NULL DEFAULT 0,
        circuit_reason TEXT DEFAULT '',
        circuit_locked_at TEXT DEFAULT '',
        plan TEXT DEFAULT 'TRIAL',
        subscription_expires_at TEXT DEFAULT '',
        is_subscription_active INTEGER DEFAULT 1,
        status TEXT DEFAULT 'ACTIVE',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    """)

    # Ensure all subscription/auth columns exist on legacy tables
    for col_name, col_sql in [
        ("plan", "TEXT DEFAULT 'TRIAL'"),
        ("subscription_expires_at", "TEXT DEFAULT ''"),
        ("is_subscription_active", "INTEGER DEFAULT 1"),
        ("status", "TEXT DEFAULT 'ACTIVE'"),
    ]:
        try:
            cursor.execute(f"ALTER TABLE user_accounts ADD COLUMN {col_name} {col_sql}")
        except Exception:
            pass

    # Ensure default passwords for any unpopulated legacy accounts
    try:
        cursor.execute("UPDATE user_accounts SET password = 'trade123' WHERE password IS NULL OR password = ''")
    except Exception:
        pass

    # 9. Multi-Tenant User Broker Config (Separate Angel One / Fyers credentials per user)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_broker_config (
        username TEXT PRIMARY KEY,
        active_broker TEXT DEFAULT 'angelone',
        angel_api_key TEXT DEFAULT '',
        angel_client_id TEXT DEFAULT '',
        angel_mpin TEXT DEFAULT '',
        angel_totp_secret TEXT DEFAULT '',
        fyers_app_id TEXT DEFAULT '',
        fyers_access_token TEXT DEFAULT '',
        fyers_secret_key TEXT DEFAULT '',
        is_active INTEGER DEFAULT 0,
        last_connected_at TEXT DEFAULT ''
    );
    """)

    # 10. Multi-Tenant Terminal State V2 (Separate positions, watchlist, funds, orders per user)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS terminal_state_v2 (
        username TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (username, key)
    );
    """)

    now_iso = datetime.utcnow().isoformat()

    # Seed / Migrate initial account for TRADER1
    cursor.execute("SELECT * FROM account WHERE id = 1")
    legacy_acc = cursor.fetchone()

    if not legacy_acc:
        cursor.execute("""
        INSERT INTO account (id, username, password, pin, starting_capital, available_cash, used_margin, realized_pnl, is_circuit_locked, created_at, updated_at)
        VALUES (1, 'TRADER1', 'trade123', ?, ?, ?, 0.0, 0.0, 0, ?, ?)
        """, (default_pin, default_capital, default_capital, now_iso, now_iso))

        # Initial capital credit into Ledger
        cursor.execute("""
        INSERT INTO ledger (timestamp, particulars, voucher_type, debit, credit, running_balance, reference_id)
        VALUES (?, 'Opening Virtual Capital Allocation', 'DEPOSIT', 0.0, ?, ?, 'INIT-VIRTUAL')
        """, (now_iso, default_capital, default_capital))
        cursor.execute("SELECT * FROM account WHERE id = 1")
        legacy_acc = cursor.fetchone()

    # Auto-migrate TRADER1 into user_accounts if not exists
    cursor.execute("SELECT username FROM user_accounts WHERE username = 'TRADER1'")
    if not cursor.fetchone() and legacy_acc:
        cursor.execute("""
        INSERT INTO user_accounts (
            username, password, pin, starting_capital, available_cash,
            used_margin, realized_pnl, is_circuit_locked, circuit_reason,
            circuit_locked_at, created_at, updated_at
        ) VALUES ('TRADER1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            legacy_acc["password"] or "trade123",
            legacy_acc["pin"] or "123456",
            legacy_acc["starting_capital"],
            legacy_acc["available_cash"],
            legacy_acc["used_margin"],
            legacy_acc["realized_pnl"],
            legacy_acc["is_circuit_locked"],
            legacy_acc["circuit_reason"] or "",
            legacy_acc["circuit_locked_at"] or "",
            legacy_acc["created_at"] or now_iso,
            legacy_acc["updated_at"] or now_iso
        ))

    # Auto-migrate legacy broker_config into user_broker_config for TRADER1
    cursor.execute("SELECT * FROM broker_config WHERE id = 1")
    legacy_broker = cursor.fetchone()
    if legacy_broker:
        cursor.execute("SELECT username FROM user_broker_config WHERE username = 'TRADER1'")
        if not cursor.fetchone():
            cursor.execute("""
            INSERT INTO user_broker_config (
                username, active_broker, angel_api_key, angel_client_id, angel_mpin, angel_totp_secret,
                fyers_app_id, fyers_access_token, fyers_secret_key, is_active, last_connected_at
            ) VALUES ('TRADER1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                legacy_broker["active_broker"] or "angelone",
                legacy_broker["angel_api_key"] or "",
                legacy_broker["angel_client_id"] or "",
                legacy_broker["angel_mpin"] or "",
                legacy_broker["angel_totp_secret"] or "",
                legacy_broker["fyers_app_id"] or "",
                legacy_broker["fyers_access_token"] or "",
                legacy_broker["fyers_secret_key"] or "",
                legacy_broker["is_active"] or 0,
                legacy_broker["last_connected_at"] or now_iso
            ))

    # Auto-migrate legacy terminal_state into terminal_state_v2 for TRADER1
    cursor.execute("SELECT key, value, updated_at FROM terminal_state")
    for row in cursor.fetchall():
        cursor.execute("""
        INSERT OR IGNORE INTO terminal_state_v2 (username, key, value, updated_at)
        VALUES ('TRADER1', ?, ?, ?)
        """, (row["key"], row["value"], row["updated_at"]))

    cursor.execute("SELECT id FROM smartapi_config WHERE id = 1")
    if not cursor.fetchone():
        cursor.execute("""
        INSERT INTO smartapi_config (id, api_key, client_id, pin, totp_secret, is_active)
        VALUES (1, '', '', '', '', 0)
        """)

    cursor.execute("SELECT id FROM broker_config WHERE id = 1")
    if not cursor.fetchone():
        cursor.execute("""
        INSERT INTO broker_config (id, active_broker, angel_api_key, angel_client_id, angel_mpin, angel_totp_secret, fyers_app_id, fyers_access_token, fyers_secret_key, is_active)
        VALUES (1, 'angelone', 'PEe8Kyfq', 'H186582', '8841', 'FVES4ZL52QW5LHF73I4OXSOHHE', '', '', '', 1)
        """)

    # Seed / Update permanent account for HARSHIT with pre-configured Angel One credentials
    harshit_pwd = "@Harshit1234"
    harshit_pin = "8841"
    harshit_api_key = "PEe8Kyfq"
    harshit_client_id = "H186582"
    harshit_totp = "FVES4ZL52QW5LHF73I4OXSOHHE"
    harshit_mpin = "8841"

    cursor.execute("""
    INSERT INTO user_accounts (
        username, password, pin, starting_capital, available_cash,
        used_margin, realized_pnl, is_circuit_locked, circuit_reason,
        circuit_locked_at, created_at, updated_at, plan, subscription_expires_at, is_subscription_active, status
    ) VALUES ('HARSHIT', ?, ?, 10000000.0, 10000000.0, 0.0, 0.0, 0, '', '', ?, ?, 'LIFETIME', '31-Dec-2099', 1, 'ACTIVE')
    ON CONFLICT(username) DO UPDATE SET
        password = excluded.password,
        pin = excluded.pin,
        plan = 'LIFETIME',
        subscription_expires_at = '31-Dec-2099',
        is_subscription_active = 1,
        status = 'ACTIVE',
        updated_at = excluded.updated_at
    """, (harshit_pwd, harshit_pin, now_iso, now_iso))

    cursor.execute("""
    INSERT INTO user_broker_config (
        username, active_broker, angel_api_key, angel_client_id, angel_mpin, angel_totp_secret,
        fyers_app_id, fyers_access_token, fyers_secret_key, is_active, last_connected_at
    ) VALUES ('HARSHIT', 'angelone', ?, ?, ?, ?, '', '', '', 1, ?)
    ON CONFLICT(username) DO UPDATE SET
        active_broker = 'angelone',
        angel_api_key = excluded.angel_api_key,
        angel_client_id = excluded.angel_client_id,
        angel_mpin = excluded.angel_mpin,
        angel_totp_secret = excluded.angel_totp_secret,
        is_active = 1,
        last_connected_at = excluded.last_connected_at
    """, (harshit_api_key, harshit_client_id, harshit_mpin, harshit_totp, now_iso))

    conn.commit()
    conn.close()

def get_account_state(username: str = "TRADER1") -> Dict[str, Any]:
    u = (username or "TRADER1").strip().upper()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM user_accounts WHERE username = ?", (u,))
    row = cursor.fetchone()
    if not row:
        cursor.execute("SELECT * FROM account WHERE id = 1")
        row = cursor.fetchone()
    acc = dict(row or {})
    conn.close()
    return acc

def reset_account_capital(username: str = "TRADER1", new_capital: float = 10000000.0) -> Dict[str, Any]:
    u = (username or "TRADER1").strip().upper()
    conn = get_db_connection()
    cursor = conn.cursor()
    now_iso = datetime.utcnow().isoformat()
    cursor.execute("""
    UPDATE user_accounts
    SET starting_capital = ?,
        available_cash = ?,
        used_margin = 0.0,
        realized_pnl = 0.0,
        is_circuit_locked = 0,
        circuit_reason = '',
        updated_at = ?
    WHERE username = ?
    """, (new_capital, new_capital, now_iso, u))

    # Also clear user's terminal state positions & orders
    cursor.execute("DELETE FROM terminal_state_v2 WHERE username = ? AND key IN ('positions', 'orders')", (u,))

    conn.commit()
    conn.close()
    return get_account_state(u)

def update_account_pin(username: str = "TRADER1", new_pin: str = "123456") -> bool:
    u = (username or "TRADER1").strip().upper()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE user_accounts SET pin = ?, updated_at = ? WHERE username = ?", (new_pin, datetime.utcnow().isoformat(), u))
    conn.commit()
    conn.close()
    return True

def verify_account_pin(username: str = "TRADER1", input_pin: str = "123456") -> bool:
    acc = get_account_state(username)
    return acc.get("pin") == str(input_pin)

def verify_user_credentials(username: str, password: str) -> bool:
    res = verify_or_create_user(username, password)
    return res is not None

def verify_or_create_user(username: str, password: str) -> Optional[Dict[str, Any]]:
    u = (username or "TRADER1").strip().upper()
    p = (password or "").strip()
    if not u or not p:
        return None
    conn = get_db_connection()
    cursor = conn.cursor()

    # Ensure subscription columns exist
    for col_def in [
        ("plan", "TEXT DEFAULT 'TRIAL'"),
        ("subscription_expires_at", "TEXT DEFAULT ''"),
        ("is_subscription_active", "INTEGER DEFAULT 1"),
        ("status", "TEXT DEFAULT 'ACTIVE'"),
    ]:
        try:
            cursor.execute(f"ALTER TABLE user_accounts ADD COLUMN {col_def[0]} {col_def[1]}")
        except Exception:
            pass

    cursor.execute("SELECT * FROM user_accounts WHERE username = ?", (u,))
    row = cursor.fetchone()
    from datetime import date, timedelta
    now = datetime.utcnow()
    now_iso = now.isoformat()

    if row:
        acc = dict(row)

        # Check if Admin has deactivated/blocked this user
        if acc.get("status") == "BLOCKED" or acc.get("is_subscription_active") == 0:
            conn.close()
            return {
                "blocked": True,
                "message": "Account Deactivated: Your access has been suspended by Admin. Please contact Admin on WhatsApp to reactivate."
            }

        # Check if subscription has expired (except for owner TRADER1)
        if u != "TRADER1":
            exp_str = acc.get("subscription_expires_at")
            if exp_str:
                try:
                    exp_date = datetime.strptime(exp_str, "%d-%b-%Y").date()
                    if date.today() > exp_date:
                        conn.close()
                        return {
                            "blocked": True,
                            "message": f"Subscription Expired on {exp_str}. Please contact Admin to renew your access."
                        }
                except Exception:
                    pass

        if (acc.get("password") or "").strip() == p:
            conn.close()
            return {
                "username": u,
                "name": f"Trader ({u})",
                "capital": acc.get("starting_capital", 10000000.0),
                "plan": acc.get("plan", "TRIAL"),
                "status": acc.get("status", "ACTIVE"),
                "is_new": False
            }
        conn.close()
        return None  # Mismatched password

    # If user doesn't exist yet, auto-create their private account with 7-Day Free Trial
    default_cap = 10000000.0
    trial_exp = (now + timedelta(days=7)).strftime("%d-%b-%Y")
    cursor.execute("""
    INSERT INTO user_accounts (
        username, password, pin, starting_capital, available_cash,
        used_margin, realized_pnl, is_circuit_locked, created_at, updated_at,
        plan, subscription_expires_at, is_subscription_active, status
    ) VALUES (?, ?, '123456', ?, ?, 0.0, 0.0, 0, ?, ?, 'TRIAL', ?, 1, 'ACTIVE')
    """, (u, p, default_cap, default_cap, now_iso, now_iso, trial_exp))

    # Initialize private broker config for this user
    cursor.execute("""
    INSERT OR IGNORE INTO user_broker_config (username, active_broker, is_active, last_connected_at)
    VALUES (?, 'angelone', 0, ?)
    """, (u, now_iso))

    conn.commit()
    conn.close()
    return {
        "username": u,
        "name": f"Trader ({u})",
        "capital": default_cap,
        "plan": "TRIAL",
        "status": "ACTIVE",
        "is_new": True
    }

def update_user_credentials(username: str, old_password: str, new_username: Optional[str], new_password: Optional[str]) -> bool:
    u = (username or "TRADER1").strip().upper()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT password FROM user_accounts WHERE username = ?", (u,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return False
    current_pass = (row["password"] or "trade123").strip()
    if old_password.strip() != current_pass:
        conn.close()
        return False

    now_iso = datetime.utcnow().isoformat()
    target_user = new_username.strip().upper() if new_username else u

    if new_username and target_user != u:
        cursor.execute("UPDATE user_accounts SET username = ?, password = ?, updated_at = ? WHERE username = ?",
                       (target_user, new_password.strip() if new_password else current_pass, now_iso, u))
        cursor.execute("UPDATE user_broker_config SET username = ? WHERE username = ?", (target_user, u))
        cursor.execute("UPDATE terminal_state_v2 SET username = ? WHERE username = ?", (target_user, u))
    elif new_password:
        cursor.execute("UPDATE user_accounts SET password = ?, updated_at = ? WHERE username = ?",
                       (new_password.strip(), now_iso, u))

    conn.commit()
    conn.close()
    return True

def get_user_profile(username: str = "TRADER1") -> Dict[str, Any]:
    u = (username or "TRADER1").strip().upper()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT username, starting_capital, available_cash FROM user_accounts WHERE username = ?", (u,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return {
            "username": row["username"],
            "name": f"Trader ({row['username']})",
            "capital": row["starting_capital"]
        }
    return {
        "username": u,
        "name": f"Trader ({u})",
        "capital": 10000000.0
    }

def check_user_active_status(username: str) -> Tuple[bool, str]:
    """Returns (is_active, message). Checks if account is blocked or expired."""
    u = (username or "TRADER1").strip().upper()
    if u in ["TRADER1", "HARSHIT"]:
        return True, "Owner Access"

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT status, is_subscription_active, subscription_expires_at FROM user_accounts WHERE username = ?", (u,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return True, "Active"

    acc = dict(row)
    if acc.get("status") == "BLOCKED" or acc.get("is_subscription_active") == 0:
        return False, "Account Deactivated: Your access has been suspended by Admin. Please contact Admin on WhatsApp."

    exp_str = acc.get("subscription_expires_at")
    if exp_str:
        try:
            exp_date = datetime.strptime(exp_str, "%d-%b-%Y").date()
            if date.today() > exp_date:
                return False, f"Subscription Expired on {exp_str}. Please contact Admin on WhatsApp to renew your access."
        except Exception:
            pass

    return True, "Active"

def deactivate_user(username: str) -> bool:
    """Instantly blocks/deactivates a user account."""
    u = (username or "").strip().upper()
    if not u or u in ["TRADER1", "HARSHIT"]:
        return False
    conn = get_db_connection()
    cursor = conn.cursor()
    now_iso = datetime.utcnow().isoformat()
    cursor.execute("""
    UPDATE user_accounts
    SET status = 'BLOCKED', is_subscription_active = 0, updated_at = ?
    WHERE username = ?
    """, (now_iso, u))
    changed = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return changed

def activate_user(username: str, plan: str = "YEAR", days: int = 365) -> bool:
    """Activates or unblocks a user account and sets new subscription expiration."""
    from datetime import timedelta
    u = (username or "").strip().upper()
    if not u:
        return False
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.utcnow()
    exp = (now + timedelta(days=days)).strftime("%d-%b-%Y")
    cursor.execute("""
    UPDATE user_accounts
    SET status = 'ACTIVE', is_subscription_active = 1, plan = ?, subscription_expires_at = ?, updated_at = ?
    WHERE username = ?
    """, (plan.upper(), exp, now.isoformat(), u))
    changed = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return changed

def create_user_manually(username: str, password: str, pin: str = "123456", plan: str = "YEAR", days: int = 365, starting_capital: float = 10000000.0) -> Dict[str, Any]:
    """Admin pre-creates a user account with custom credentials and subscription."""
    from datetime import timedelta
    u = (username or "").strip().upper()
    p = (password or "").strip()
    if not u or not p:
        return {"status": "error", "message": "Username and password cannot be empty."}

    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.utcnow()
    now_iso = now.isoformat()
    exp = (now + timedelta(days=days)).strftime("%d-%b-%Y")

    cursor.execute("SELECT username FROM user_accounts WHERE username = ?", (u,))
    if cursor.fetchone():
        cursor.execute("""
        UPDATE user_accounts
        SET password = ?, pin = ?, plan = ?, subscription_expires_at = ?, is_subscription_active = 1, status = 'ACTIVE', updated_at = ?
        WHERE username = ?
        """, (p, pin, plan.upper(), exp, now_iso, u))
        conn.commit()
        conn.close()
        return {"status": "updated", "message": f"User '{u}' credentials and {plan.upper()} plan updated until {exp}."}

    cursor.execute("""
    INSERT INTO user_accounts (
        username, password, pin, starting_capital, available_cash,
        used_margin, realized_pnl, is_circuit_locked, created_at, updated_at,
        plan, subscription_expires_at, is_subscription_active, status
    ) VALUES (?, ?, ?, ?, ?, 0.0, 0.0, 0, ?, ?, ?, ?, 1, 'ACTIVE')
    """, (u, p, pin, starting_capital, starting_capital, now_iso, now_iso, plan.upper(), exp))

    cursor.execute("""
    INSERT OR IGNORE INTO user_broker_config (username, active_broker, is_active, last_connected_at)
    VALUES (?, 'angelone', 0, ?)
    """, (u, now_iso))

    conn.commit()
    conn.close()
    return {"status": "created", "message": f"User '{u}' created successfully with {plan.upper()} access until {exp}."}

def delete_user_account(username: str) -> bool:
    """Completely removes a user account, their broker config, and terminal state."""
    u = (username or "").strip().upper()
    if not u or u in ["TRADER1", "HARSHIT"]:
        return False
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM user_accounts WHERE username = ?", (u,))
    cursor.execute("DELETE FROM terminal_state_v2 WHERE username = ?", (u,))
    cursor.execute("DELETE FROM user_broker_config WHERE username = ?", (u,))
    conn.commit()
    conn.close()
    return True

def update_user_subscription(username: str, plan: str = "YEAR", days: int = 365) -> bool:
    """Updates subscription plan and expiration for web cloud user account."""
    return activate_user(username, plan, days)

def get_all_user_accounts() -> List[Dict[str, Any]]:
    """Lists all registered web accounts with their subscription status."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
        SELECT username, password, status, plan, is_subscription_active, subscription_expires_at,
               starting_capital, available_cash, created_at
        FROM user_accounts
        ORDER BY created_at DESC
        """)
        rows = [dict(r) for r in cursor.fetchall()]
    except Exception:
        cursor.execute("SELECT username, starting_capital, available_cash, created_at FROM user_accounts ORDER BY created_at DESC")
        rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def clear_all_trade_data(username: str = "TRADER1", capital: float = 10000000.0) -> Dict[str, Any]:
    """Wipes all positions, orders, and ledger for a specific user to start completely clean."""
    u = (username or "TRADER1").strip().upper()
    conn = get_db_connection()
    cursor = conn.cursor()
    now_iso = datetime.utcnow().isoformat()
    cursor.execute("DELETE FROM terminal_state_v2 WHERE username = ?", (u,))
    cursor.execute("""
    UPDATE user_accounts
    SET starting_capital = ?,
        available_cash = ?,
        used_margin = 0.0,
        realized_pnl = 0.0,
        is_circuit_locked = 0,
        circuit_reason = '',
        updated_at = ?
    WHERE username = ?
    """, (capital, capital, now_iso, u))
    conn.commit()
    conn.close()
    return {"status": "success", "message": f"All trades, positions, and orders wiped clean for {u}."}

def get_broker_config(username: str = "TRADER1") -> Dict[str, Any]:
    u = (username or "TRADER1").strip().upper()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM user_broker_config WHERE username = ?", (u,))
    row = cursor.fetchone()
    if not row:
        now_iso = datetime.utcnow().isoformat()
        cursor.execute("""
        INSERT OR IGNORE INTO user_broker_config (username, active_broker, is_active, last_connected_at)
        VALUES (?, 'angelone', 0, ?)
        """, (u, now_iso))
        conn.commit()
        cursor.execute("SELECT * FROM user_broker_config WHERE username = ?", (u,))
        row = cursor.fetchone()
    res = dict(row or {})
    conn.close()
    return res

def update_env_file(key_vals: Dict[str, str], env_path: str = ".env"):
    """Persists credentials into local .env file so they reload on next launch."""
    lines = []
    if os.path.isfile(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

    existing_keys = set()
    new_lines = []
    for line in lines:
        stripped = line.strip()
        if "=" in stripped and not stripped.startswith("#"):
            k = stripped.split("=", 1)[0].strip()
            existing_keys.add(k)
            if k in key_vals:
                new_lines.append(f"{k}={key_vals[k]}\n")
            else:
                new_lines.append(line)
        else:
            new_lines.append(line)

    for k, v in key_vals.items():
        if k not in existing_keys:
            new_lines.append(f"{k}={v}\n")

    with open(env_path, "w", encoding="utf-8") as f:
        f.writelines(new_lines)

    for k, v in key_vals.items():
        os.environ[k] = str(v)

def save_broker_config(
    username: str = "TRADER1",
    active_broker: Optional[str] = None,
    angel_api_key: Optional[str] = None,
    angel_client_id: Optional[str] = None,
    angel_mpin: Optional[str] = None,
    angel_totp_secret: Optional[str] = None,
    fyers_app_id: Optional[str] = None,
    fyers_access_token: Optional[str] = None,
    fyers_secret_key: Optional[str] = None,
    is_active: Optional[int] = None
) -> Dict[str, Any]:
    u = (username or "TRADER1").strip().upper()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM user_broker_config WHERE username = ?", (u,))
    row = cursor.fetchone()
    current = dict(row or {})

    updated = {
        "username": u,
        "active_broker": active_broker if active_broker is not None else current.get("active_broker", "angelone"),
        "angel_api_key": angel_api_key if angel_api_key is not None else current.get("angel_api_key", ""),
        "angel_client_id": angel_client_id if angel_client_id is not None else current.get("angel_client_id", ""),
        "angel_mpin": angel_mpin if angel_mpin is not None else current.get("angel_mpin", ""),
        "angel_totp_secret": angel_totp_secret if angel_totp_secret is not None else current.get("angel_totp_secret", ""),
        "fyers_app_id": fyers_app_id if fyers_app_id is not None else current.get("fyers_app_id", ""),
        "fyers_access_token": fyers_access_token if fyers_access_token is not None else current.get("fyers_access_token", ""),
        "fyers_secret_key": fyers_secret_key if fyers_secret_key is not None else current.get("fyers_secret_key", ""),
        "is_active": is_active if is_active is not None else current.get("is_active", 0),
        "last_connected_at": datetime.utcnow().isoformat()
    }

    cursor.execute("""
    INSERT INTO user_broker_config (
        username, active_broker, angel_api_key, angel_client_id, angel_mpin, angel_totp_secret,
        fyers_app_id, fyers_access_token, fyers_secret_key, is_active, last_connected_at
    ) VALUES (:username, :active_broker, :angel_api_key, :angel_client_id, :angel_mpin, :angel_totp_secret,
              :fyers_app_id, :fyers_access_token, :fyers_secret_key, :is_active, :last_connected_at)
    ON CONFLICT(username) DO UPDATE SET
        active_broker = excluded.active_broker,
        angel_api_key = excluded.angel_api_key,
        angel_client_id = excluded.angel_client_id,
        angel_mpin = excluded.angel_mpin,
        angel_totp_secret = excluded.angel_totp_secret,
        fyers_app_id = excluded.fyers_app_id,
        fyers_access_token = excluded.fyers_access_token,
        fyers_secret_key = excluded.fyers_secret_key,
        is_active = excluded.is_active,
        last_connected_at = excluded.last_connected_at;
    """, updated)

    if u in ["TRADER1", "HARSHIT"]:
        # Keep legacy tables in sync for TRADER1
        cursor.execute("""
        UPDATE broker_config
        SET active_broker = :active_broker,
            angel_api_key = :angel_api_key,
            angel_client_id = :angel_client_id,
            angel_mpin = :angel_mpin,
            angel_totp_secret = :angel_totp_secret,
            fyers_app_id = :fyers_app_id,
            fyers_access_token = :fyers_access_token,
            fyers_secret_key = :fyers_secret_key,
            is_active = :is_active,
            last_connected_at = :last_connected_at
        WHERE id = 1
        """, updated)

        cursor.execute("""
        UPDATE smartapi_config
        SET api_key = ?, client_id = ?, pin = ?, totp_secret = ?, is_active = ?, last_connected_at = ?
        WHERE id = 1
        """, (
            updated["angel_api_key"],
            updated["angel_client_id"],
            updated["angel_mpin"],
            updated["angel_totp_secret"],
            updated["is_active"],
            updated["last_connected_at"]
        ))

    conn.commit()
    conn.close()

    # Sync to .env for TRADER1
    if u in ["TRADER1", "HARSHIT"]:
        env_vars = {}
        if updated["angel_api_key"]: env_vars["ANGEL_API_KEY"] = updated["angel_api_key"]
        if updated["angel_client_id"]: env_vars["ANGEL_CLIENT_ID"] = updated["angel_client_id"]
        if updated["angel_mpin"]: env_vars["ANGEL_MPIN"] = updated["angel_mpin"]
        if updated["angel_totp_secret"]: env_vars["ANGEL_TOTP_SECRET"] = updated["angel_totp_secret"]
        if updated["fyers_app_id"]: env_vars["FYERS_APP_ID"] = updated["fyers_app_id"]
        if updated["fyers_access_token"]: env_vars["FYERS_ACCESS_TOKEN"] = updated["fyers_access_token"]
        if updated["fyers_secret_key"]: env_vars["FYERS_SECRET_KEY"] = updated["fyers_secret_key"]
        if updated["active_broker"]: env_vars["ACTIVE_BROKER"] = updated["active_broker"]

        if env_vars:
            try:
                update_env_file(env_vars)
            except Exception:
                pass

    return updated

def save_terminal_state(state: Dict[str, Any], username: str = "TRADER1"):
    """Saves terminal state (watchlist, positions, funds, orders, setups) into SQLite per user."""
    u = (state.get("username") or username or "TRADER1").strip().upper() if isinstance(state, dict) else (username or "TRADER1").strip().upper()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS terminal_state_v2 (
        username TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (username, key)
    );
    """)
    now_iso = datetime.utcnow().isoformat()
    for k, v in state.items():
        if k == "username":
            continue
        val_str = json.dumps(v)
        cursor.execute("""
        INSERT INTO terminal_state_v2 (username, key, value, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(username, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        """, (u, k, val_str, now_iso))

        if u in ["TRADER1", "HARSHIT"]:
            # Keep legacy single-user table updated for TRADER1
            cursor.execute("""
            INSERT INTO terminal_state (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
            """, (k, val_str, now_iso))

    conn.commit()
    conn.close()

def get_terminal_state(username: str = "TRADER1") -> Dict[str, Any]:
    """Retrieves full synchronized terminal state for user from SQLite."""
    u = (username or "TRADER1").strip().upper()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS terminal_state_v2 (
        username TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (username, key)
    );
    """)
    cursor.execute("SELECT key, value FROM terminal_state_v2 WHERE username = ?", (u,))
    rows = cursor.fetchall()

    if not rows and u == "TRADER1":
        cursor.execute("SELECT key, value FROM terminal_state")
        rows = cursor.fetchall()

    conn.close()
    result = {}
    for r in rows:
        try:
            result[r["key"]] = json.loads(r["value"])
        except Exception:
            result[r["key"]] = r["value"]
    return result

def clear_terminal_state(username: str = "TRADER1"):
    """Wipes terminal state from SQLite for specific user."""
    u = (username or "TRADER1").strip().upper()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM terminal_state_v2 WHERE username = ?", (u,))
    if u in ["TRADER1", "HARSHIT"]:
        cursor.execute("DELETE FROM terminal_state")
    conn.commit()
    conn.close()


