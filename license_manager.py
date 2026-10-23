"""
TradeSmart Desktop Licensing & DRM Engine
Machine-locked cryptographic license generation and verification system.
"""

import os
import sys
import json
try:
    import winreg
except ImportError:
    winreg = None
import hashlib
import hmac
from datetime import datetime, date, timedelta
from typing import Dict, Any, Optional, Tuple

LICENSE_SECRET = "TradeSmart_F&O_DRM_Master_Salt_2026_SecureKey"
LICENSE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tradesmart_license.dat")

def get_machine_id() -> str:
    """Returns a unique, stable hardware fingerprint for this machine."""
    guid = ""
    if winreg is not None:
        try:
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography") as k:
                guid, _ = winreg.QueryValueEx(k, "MachineGuid")
        except Exception:
            pass
    if not guid:
        import uuid
        guid = str(uuid.getnode())

    raw_hash = hashlib.sha256((guid + "TradeSmartHardwareSalt").encode("utf-8")).hexdigest()[:12].upper()
    return f"TS-{raw_hash[:4]}-{raw_hash[4:8]}-{raw_hash[8:12]}"

def _compute_signature(machine_id: str, plan: str, expiry_ymd: str) -> str:
    """Generates 12-char HMAC signature verifying this machine, plan, and expiry."""
    clean_mach = machine_id.strip().upper().replace("-", "")
    clean_plan = plan.strip().upper()
    data = f"{clean_mach}:{clean_plan}:{expiry_ymd}:{LICENSE_SECRET}"
    sig = hashlib.sha256(data.encode("utf-8")).hexdigest()[:12].upper()
    return sig

def generate_license_key(machine_id: str, plan_type: str = "YEAR", custom_days: Optional[int] = None) -> Tuple[str, str]:
    """
    Admin function to generate a machine-locked license key.
    Plans: 'MONTH' (30d), 'YEAR' (365d), 'LIFETIME' (3650d), 'TRIAL' (7d).
    Returns (license_key, expiry_display_str)
    """
    plan = plan_type.strip().upper()
    today = date.today()

    if custom_days:
        days = custom_days
    elif plan == "MONTH":
        days = 30
    elif plan == "YEAR":
        days = 365
    elif plan == "LIFETIME":
        days = 3650  # ~10 years
    elif plan == "TRIAL":
        days = 7
    else:
        days = 365

    expiry_date = today + timedelta(days=days)
    expiry_ymd = expiry_date.strftime("%Y%m%d")
    sig = _compute_signature(machine_id, plan, expiry_ymd)

    key = f"TS-{plan}-{expiry_ymd}-{sig[:4]}-{sig[4:8]}-{sig[8:12]}"
    display_expiry = expiry_date.strftime("%d-%b-%Y")
    return key, display_expiry

def verify_license_key(key: str, machine_id: Optional[str] = None) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """
    Validates a license key against machine ID and expiry.
    Returns (is_valid, message, info_dict)
    """
    if not key or not isinstance(key, str):
        return False, "Invalid license key format.", None

    parts = key.strip().upper().split("-")
    # Expected format: TS-PLAN-YYYYMMDD-XXXX-YYYY-ZZZZ (6 parts)
    if len(parts) != 6 or parts[0] != "TS":
        return False, "Malformed license key structure.", None

    plan = parts[1]
    expiry_ymd = parts[2]
    sig = parts[3] + parts[4] + parts[5]

    curr_mach = machine_id or get_machine_id()
    expected_sig = _compute_signature(curr_mach, plan, expiry_ymd)

    if sig != expected_sig:
        return False, "License key is invalid or not registered for this machine ID.", None

    try:
        exp_year = int(expiry_ymd[:4])
        exp_month = int(expiry_ymd[4:6])
        exp_day = int(expiry_ymd[6:8])
        exp_date = date(exp_year, exp_month, exp_day)
    except Exception:
        return False, "Invalid expiration date in license key.", None

    today = date.today()
    days_left = (exp_date - today).days

    if days_left < 0:
        return False, f"License expired on {exp_date.strftime('%d-%b-%Y')}.", {
            "plan": plan,
            "expiry_date": exp_date.strftime("%d-%b-%Y"),
            "days_left": 0,
            "is_expired": True
        }

    return True, "License valid and verified.", {
        "plan": plan,
        "expiry_date": exp_date.strftime("%d-%b-%Y"),
        "days_left": days_left,
        "is_expired": False
    }

def get_stored_license() -> Optional[Dict[str, Any]]:
    """Reads stored license data from local file."""
    if not os.path.exists(LICENSE_FILE):
        return None
    try:
        with open(LICENSE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data
    except Exception:
        return None

def save_stored_license(data: Dict[str, Any]) -> None:
    """Saves license data locally."""
    try:
        with open(LICENSE_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"[LicenseManager] Save error: {e}")

def get_license_status() -> Dict[str, Any]:
    """TradeSmart Personal Edition: Unlimited Lifetime Access, no DRM/machine lock."""
    return {
        "machine_id": "HARSHIT-PERSONAL",
        "is_active": True,
        "status": "PRO_ACTIVE",
        "plan": "LIFETIME",
        "expiry_date": "31-Dec-2099",
        "days_left": 99999,
        "can_start_trial": False,
        "message": "TradeSmart Personal Edition · Lifetime Unlimited Access"
    }

def activate_license(key: str) -> Tuple[bool, str, Dict[str, Any]]:
    return True, "Personal Edition is already active with Lifetime Unlimited Access.", get_license_status()

def start_free_trial() -> Tuple[bool, str, Dict[str, Any]]:
    return True, "Personal Edition is already active with Lifetime Unlimited Access.", get_license_status()
