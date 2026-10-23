"""
TradeSmart Pro - Unified Monetization & License Manager (Admin Tool)
Supports both Option A (Desktop Machine-Locked Keys) and Option B (Cloud Web User Accounts).
"""

import sys
import os
import subprocess
from datetime import datetime

PROJ_DIR = os.path.dirname(os.path.abspath(__file__))
if PROJ_DIR not in sys.path:
    sys.path.insert(0, PROJ_DIR)

from license_manager import get_machine_id, generate_license_key
from database import (
    get_all_user_accounts,
    activate_user,
    deactivate_user,
    create_user_manually,
    delete_user_account
)

def copy_to_clipboard(text: str):
    try:
        subprocess.run("clip", input=text.strip().encode("utf-8"), check=True, shell=True)
        print(" [✓] Message automatically copied to your clipboard!\n")
    except Exception:
        pass

def handle_desktop_license():
    print("\n" + "=" * 68)
    print("      [Option A] Generate Desktop License Key (Machine Lock)       ")
    print("=" * 68)
    cust_name = input(" Enter Customer Name (e.g. Rahul Sharma): ").strip() or "Valued Trader"
    cust_machine = input(" Enter Customer Machine ID (e.g. TS-XXXX-YYYY-ZZZZ): ").strip().upper()

    if not cust_machine:
        print("\n [!] No Machine ID provided. Using current PC Machine ID for testing:")
        cust_machine = get_machine_id()
        print(f" Current Machine ID: {cust_machine}")

    print("\n Select License Plan:")
    print("  [1] 1-Month Pro Access   (30 Days  - Price: ₹799)")
    print("  [2] 1-Year Pro Access    (365 Days - Price: ₹3,999)")
    print("  [3] Lifetime Pro Access  (10 Years - Price: ₹9,999)")
    print("  [4] 7-Day Extended Trial (7 Days)")

    choice = input("\n Enter choice [1-4] (Default: 2): ").strip()
    plan_map = {"1": "MONTH", "2": "YEAR", "3": "LIFETIME", "4": "TRIAL"}
    plan = plan_map.get(choice, "YEAR")

    key, exp_str = generate_license_key(cust_machine, plan)

    print("\n" + "=" * 68)
    print(" [✓] DESKTOP LICENSE GENERATED SUCCESSFULLY!")
    print("=" * 68)
    print(f" Customer:     {cust_name}")
    print(f" Machine ID:   {cust_machine}")
    print(f" Plan:         {plan} ACCESS")
    print(f" Expiry Date:  {exp_str}")
    print(f" License Key:  {key}")
    print("=" * 68)
    wa_msg = (
        f"Hi {cust_name},\n"
        f"Thank you for purchasing TradeSmart Pro ({plan} Plan)!\n\n"
        f"Activation Details:\n"
        f"• Machine ID: {cust_machine}\n"
        f"• License Key: {key}\n"
        f"• Valid Until: {exp_str}\n\n"
        f"To activate, open TradeSmart -> Click 'Activate License' -> Paste your key.\n"
        f"Happy Trading!"
    )
    print("\n--- WhatsApp Message ---")
    print(wa_msg)
    print("------------------------\n")
    copy_to_clipboard(wa_msg)

def handle_list_users():
    print("\n" + "=" * 80)
    print("                     Registered Web Cloud User Accounts                          ")
    print("=" * 80)
    users = get_all_user_accounts()
    if not users:
        print(" No users registered yet.")
        print("=" * 80 + "\n")
        return

    header = f" {'USER ID':<15} | {'PASSWORD':<12} | {'STATUS':<9} | {'PLAN':<10} | {'EXPIRES ON':<14} | {'CAPITAL'}"
    print(header)
    print("-" * 80)
    for u in users:
        uname = u.get("username", "")
        pwd = u.get("password", "******")
        status = u.get("status") or ("ACTIVE" if u.get("is_subscription_active", 1) else "BLOCKED")
        plan = u.get("plan") or "TRIAL"
        exp = u.get("subscription_expires_at") or ("Never" if uname == "TRADER1" else "Expired")
        cap = (u.get("starting_capital") or 10000000.0) / 10000000.0
        status_disp = f"[ACTIVE]" if status == "ACTIVE" else f"!BLOCKED!"
        print(f" {uname:<15} | {pwd:<12} | {status_disp:<9} | {plan:<10} | {exp:<14} | ₹{cap:.2f} Cr")
    print("=" * 80 + "\n")

def handle_activate_user():
    print("\n" + "=" * 68)
    print("      [Option B] Activate / Extend Web Cloud User Account       ")
    print("=" * 68)
    username = input(" Enter User ID to Activate/Renew (e.g. VIKRAM): ").strip().upper()
    if not username:
        print(" [!] Username cannot be empty.")
        return

    print("\n Select Subscription Plan:")
    print("  [1] 1-Month Pro   (30 Days  - Price: ₹799)")
    print("  [2] 1-Year Pro    (365 Days - Price: ₹3,999)")
    print("  [3] Lifetime Pro  (10 Years - Price: ₹9,999)")
    print("  [4] 7-Day Trial   (7 Days)")
    print("  [5] Custom Days")

    choice = input("\n Enter choice [1-5] (Default: 2): ").strip()
    if choice == "1":
        days, plan_name = 30, "MONTH"
    elif choice == "3":
        days, plan_name = 3650, "LIFETIME"
    elif choice == "4":
        days, plan_name = 7, "TRIAL"
    elif choice == "5":
        try:
            days = int(input(" Enter number of days (e.g. 60): ").strip())
            plan_name = f"{days}-DAY"
        except ValueError:
            days, plan_name = 30, "CUSTOM"
    else:
        days, plan_name = 365, "YEAR"

    success = activate_user(username, plan=plan_name, days=days)
    if success:
        print(f"\n [✓] Web user '{username}' has been ACTIVATED with {plan_name} plan for {days} days!")
        wa_msg = (
            f"Hi {username},\n"
            f"Your TradeSmart Cloud Web Pro subscription ({plan_name} Plan) has been activated!\n"
            f"You can now log in at your TradeSmart web link and trade with all live features enabled.\n"
            f"Happy Trading!"
        )
        print("\n--- WhatsApp Message ---")
        print(wa_msg)
        print("------------------------\n")
        copy_to_clipboard(wa_msg)
    else:
        print(f"\n [!] User '{username}' not found in database.")
        print(f" Hint: Use Option [5] in main menu to pre-create their account manually, or have them log in once.")

def handle_deactivate_user():
    print("\n" + "=" * 68)
    print("     [Option B] Deactivate / Block User Account (Instant Lock)    ")
    print("=" * 68)
    username = input(" Enter User ID to Deactivate/Block: ").strip().upper()
    if not username:
        print(" [!] Username cannot be empty.")
        return
    if username == "TRADER1":
        print(" [!] Cannot block primary admin account TRADER1.")
        return

    confirm = input(f" Are you sure you want to instantly BLOCK '{username}'? (y/n): ").strip().lower()
    if confirm != "y":
        print(" Operation cancelled.")
        return

    success = deactivate_user(username)
    if success:
        print(f"\n [✓] USER '{username}' HAS BEEN BLOCKED IMMEDIATELY!")
        print(f"     • Next time they try to log in, access is denied.")
        print(f"     • If they are currently active, their session will be locked out.")
        print(f"     • To unblock later, simply choose Option [3] (Activate/Extend).")
    else:
        print(f"\n [!] User '{username}' was not found in the database.")

def handle_create_user_manually():
    print("\n" + "=" * 68)
    print("       [Option B] Pre-Create User ID & Password Manually         ")
    print("=" * 68)
    print(" Pre-create account credentials so you can give them directly to a customer.")
    username = input(" Enter New User ID (e.g. VIKRAM_TRADER): ").strip().upper()
    if not username:
        print(" [!] User ID cannot be empty.")
        return
    password = input(" Enter Password (e.g. trade@2026): ").strip()
    if not password:
        password = "trade123"
        print(f" Using default password: {password}")
    pin = input(" Enter Security PIN (Default: 123456): ").strip() or "123456"

    print("\n Select Initial Plan:")
    print("  [1] 1-Month Pro Access   (30 Days)")
    print("  [2] 1-Year Pro Access    (365 Days)")
    print("  [3] Lifetime Pro Access  (10 Years)")
    print("  [4] 7-Day Free Trial     (7 Days)")

    choice = input("\n Enter choice [1-4] (Default: 2): ").strip()
    days_map = {"1": (30, "MONTH"), "2": (365, "YEAR"), "3": (3650, "LIFETIME"), "4": (7, "TRIAL")}
    days, plan_name = days_map.get(choice, (365, "YEAR"))

    res = create_user_manually(username, password, pin=pin, plan=plan_name, days=days)
    print(f"\n [✓] {res.get('message')}")

    wa_msg = (
        f"Hi {username},\n"
        f"Welcome to TradeSmart Pro Virtual Trading Terminal!\n\n"
        f"Your Login Credentials:\n"
        f"• User ID:  {username}\n"
        f"• Password: {password}\n"
        f"• 2FA PIN:  {pin}\n"
        f"• Plan:     {plan_name} PRO\n"
        f"• Capital:  ₹1.00 Crore Virtual Margin\n\n"
        f"Open your TradeSmart web link, log in with these credentials, and configure your Broker API settings under Settings.\n"
        f"Happy Trading!"
    )
    print("\n--- WhatsApp Message ---")
    print(wa_msg)
    print("------------------------\n")
    copy_to_clipboard(wa_msg)

def handle_delete_user():
    print("\n" + "=" * 68)
    print("       [Option B] Permanently Delete Web User Account            ")
    print("=" * 68)
    username = input(" Enter User ID to Delete: ").strip().upper()
    if not username or username == "TRADER1":
        print(" [!] Invalid User ID or cannot delete TRADER1.")
        return

    confirm = input(f" [WARNING] This will permanently wipe '{username}' and all their trade history. Confirm? (yes/no): ").strip().lower()
    if confirm == "yes":
        success = delete_user_account(username)
        if success:
            print(f" [✓] User account '{username}' has been deleted completely.")
        else:
            print(f" [!] User '{username}' not found.")
    else:
        print(" Operation cancelled.")

def main():
    while True:
        print("\n" + "=" * 68)
        print("         TradeSmart Pro - Monetization & Account Manager         ")
        print("=" * 68)
        print("  [1] Generate Desktop License Key     (Option A - Machine Lock)")
        print("  --------------------------------------------------------------")
        print("  [2] View All Registered Web Users    (Option B - Status & Ledger)")
        print("  [3] Activate / Extend Web Account    (Option B - Activate / Renew)")
        print("  [4] Deactivate / Block User Account  (Option B - Instant Lockout)")
        print("  [5] Pre-Create User ID & Password    (Option B - Manual Account)")
        print("  [6] Permanently Delete Web User      (Option B - Wipe Account)")
        print("  --------------------------------------------------------------")
        print("  [7] Exit")
        print("=" * 68)

        choice = input(" Select option [1-7]: ").strip()
        if choice == "1":
            handle_desktop_license()
        elif choice == "2":
            handle_list_users()
        elif choice == "3":
            handle_activate_user()
        elif choice == "4":
            handle_deactivate_user()
        elif choice == "5":
            handle_create_user_manually()
        elif choice == "6":
            handle_delete_user()
        elif choice == "7":
            print("\n Goodbye!")
            break
        else:
            print(" Invalid option. Please enter a number from 1 to 7.")

if __name__ == "__main__":
    main()
