import os
import sys
import time
import subprocess
import re
import urllib.request

CLOUDFLARED_PATHS = [
    r"C:\Program Files (x86)\cloudflared\cloudflared.exe",
    r"C:\Program Files\cloudflared\cloudflared.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\cloudflared\cloudflared.exe"),
]

def find_cloudflared():
    for p in CLOUDFLARED_PATHS:
        if os.path.isfile(p):
            return p
    return None

def copy_to_clipboard(text: str):
    try:
        cmd = f'cmd /c "echo {text.strip()}| clip"'
        subprocess.run(cmd, shell=True)
    except Exception:
        pass

def main():
    print("=" * 70)
    print("            TradeSmart - Live Shareable Public Link                   ")
    print("=" * 70)
    print("\n [*] Checking TradeSmart local server (http://127.0.0.1:8000)...")
    
    server_running = False
    try:
        with urllib.request.urlopen("http://127.0.0.1:8000/api/live/status", timeout=1) as resp:
            if resp.status == 200:
                server_running = True
    except Exception:
        pass

    server_process = None
    if not server_running:
        print(" [*] TradeSmart server is not active. Starting local backend engine...")
        server_process = subprocess.Popen([sys.executable, "app.py"], cwd=os.path.dirname(os.path.abspath(__file__)))
        time.sleep(3)

    cf_bin = find_cloudflared()
    if not cf_bin:
        print("\n [!] Cloudflare tunnel executable not found.")
        print("     Installing via winget...")
        subprocess.run(["winget", "install", "--id", "Cloudflare.cloudflared", "--silent", "--accept-package-agreements", "--accept-source-agreements"])
        cf_bin = find_cloudflared()
        if not cf_bin:
            print("\n [ERROR] Could not find cloudflared.exe. Please install Cloudflare Tunnel.")
            input(" Press Enter to exit...")
            return

    print(" [*] Creating secure public HTTPS tunnel via Cloudflare...")
    tunnel_cmd = [cf_bin, "tunnel", "--url", "http://127.0.0.1:8000"]
    tunnel_proc = subprocess.Popen(tunnel_cmd, stderr=subprocess.PIPE, stdout=subprocess.PIPE, text=True)

    public_url = None
    start = time.time()
    while time.time() - start < 20:
        line = tunnel_proc.stderr.readline()
        if not line:
            continue
        m = re.search(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", line)
        if m:
            public_url = m.group(0)
            break

    if not public_url:
        print("\n [ERROR] Failed to obtain public tunnel URL. Please check internet connection.")
        tunnel_proc.terminate()
        if server_process: server_process.terminate()
        input(" Press Enter to exit...")
        return

    copy_to_clipboard(public_url)

    print("\n" + "=" * 70)
    print(" [✓] PUBLIC LINK READY & COPIED TO CLIPBOARD!")
    print("=" * 70)
    print(f"\n   🌐 Link: {public_url}\n")
    print("   📋 This link has been copied to your Windows Clipboard.")
    print("   👉 Just open WhatsApp / Telegram and press Ctrl + V to send!")
    print("\n   Features for your friend:")
    print("   • No download or installation required.")
    print("   • Works on Phone (Android/iPhone), Tablet, Laptop, or Mac.")
    print("   • Real-time Angel One live market quotes & virtual F&O trading.")
    print("=" * 70)
    print(" Keep this window OPEN while your friend is trading.")
    print(" To stop sharing, press Ctrl+C or close this window.")
    print("=" * 70 + "\n")

    try:
        while True:
            time.sleep(1)
            if tunnel_proc.poll() is not None:
                print(" Tunnel disconnected.")
                break
    except KeyboardInterrupt:
        print("\n Stopping public tunnel...")
    finally:
        tunnel_proc.terminate()
        if server_process:
            server_process.terminate()
        print(" [✓] Live share stopped cleanly. Goodbye!\n")

if __name__ == "__main__":
    main()
