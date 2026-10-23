import os
import sys
import time
import socket
import subprocess
import webbrowser
import urllib.request

PROJ_DIR = os.path.dirname(os.path.abspath(__file__))
PORT = 8000
HOST = "127.0.0.1"
URL = f"http://{HOST}:{PORT}"

DETACHED_PROCESS = 0x00000008
CREATE_NO_WINDOW = 0x08000000

CHROME_PATHS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]

def get_python_exe(gui=False):
    """Finds the real standalone python.exe / pythonw.exe avoiding WindowsApps sandboxed aliases."""
    target = "pythonw.exe" if gui else "python.exe"
    local_app = os.environ.get("LOCALAPPDATA", "")
    py_dir = os.path.join(local_app, "Python")
    if os.path.isdir(py_dir):
        for sub in sorted(os.listdir(py_dir), reverse=True):
            cand = os.path.join(py_dir, sub, target)
            if os.path.isfile(cand):
                return cand

    if hasattr(sys, "base_prefix"):
        cand = os.path.join(sys.base_prefix, target)
        if os.path.isfile(cand):
            return cand

    parent = os.path.dirname(sys.executable)
    cand = os.path.join(parent, target)
    if os.path.isfile(cand):
        return cand

    return sys.executable

def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((HOST, port)) == 0

def kill_port(port: int):
    """Frees up port 8000 if an old TradeSmart or zombie process is holding it."""
    try:
        cmd = f'cmd /c "for /f \\"tokens=5\\" %a in (\'netstat -aon ^| findstr /r \\":{port}.*LISTENING\\"\' ) do taskkill /f /pid %a >nul 2>&1"'
        subprocess.run(cmd, shell=True, capture_output=True, creationflags=CREATE_NO_WINDOW)
        time.sleep(1)
    except Exception:
        pass

def wait_for_server(timeout_sec: float = 12.0) -> bool:
    start = time.time()
    while time.time() - start < timeout_sec:
        try:
            with urllib.request.urlopen(f"{URL}/api/live/status", timeout=1) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.4)
    return False

def sync_browser_profile(profile_dir: str):
    """Syncs existing trade localStorage from Chrome profiles into DesktopProfile."""
    try:
        import shutil
        local_app = os.environ.get("LOCALAPPDATA", "")
        chrome_user_data = os.path.join(local_app, "Google", "Chrome", "User Data")
        target_ls = os.path.join(profile_dir, "Default", "Local Storage", "leveldb")
        for prof in ["Profile 1", "Default", "Profile 2"]:
            src_ls = os.path.join(chrome_user_data, prof, "Local Storage", "leveldb")
            if os.path.isdir(src_ls):
                os.makedirs(target_ls, exist_ok=True)
                for fname in os.listdir(src_ls):
                    if fname.endswith(".ldb") or fname.endswith(".log") or fname in ("CURRENT", "MANIFEST-000001"):
                        try:
                            shutil.copy2(os.path.join(src_ls, fname), os.path.join(target_ls, fname))
                        except Exception:
                            pass
                break
    except Exception:
        pass

def open_desktop_window():
    # Try Chrome or Edge in App Mode (frameless native window look)
    profile_dir = os.path.expandvars(r"%LOCALAPPDATA%\TradeSmart\DesktopProfile")
    os.makedirs(profile_dir, exist_ok=True)
    sync_browser_profile(profile_dir)

    for p in CHROME_PATHS:
        if os.path.isfile(p):
            try:
                subprocess.Popen([
                    p,
                    f"--app={URL}",
                    f"--user-data-dir={profile_dir}",
                    "--no-first-run",
                    "--disable-default-apps"
                ])
                return "Dedicated App Window"
            except Exception:
                pass
    # Fallback to default browser
    webbrowser.open(URL)
    return "Default Web Browser"

def start_backend_detached():
    """Starts app.py silently in the background with zero console windows."""
    os.chdir(PROJ_DIR)

    # Check if already running and healthy
    if is_port_in_use(PORT) and wait_for_server(timeout_sec=1.5):
        return True

    # Build frontend if dist is missing
    dist_index = os.path.join(PROJ_DIR, "dist", "index.html")
    if not os.path.isfile(dist_index):
        subprocess.run(["npm.cmd", "run", "build"], cwd=PROJ_DIR, shell=True, creationflags=CREATE_NO_WINDOW)

    # Clean port if occupied by an unresponsive process
    if is_port_in_use(PORT):
        kill_port(PORT)

    # Real python binary and environment
    real_py = get_python_exe(gui=True)
    py_bin_dir = os.path.dirname(real_py)
    env = os.environ.copy()
    if py_bin_dir not in env.get("PATH", ""):
        env["PATH"] = py_bin_dir + os.pathsep + env.get("PATH", "")

    # Node path
    node_dir = os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.20.0-win-x64")
    if os.path.isdir(node_dir) and node_dir not in env.get("PATH", ""):
        env["PATH"] = node_dir + os.pathsep + env.get("PATH", "")

    logs_dir = os.path.join(PROJ_DIR, "logs")
    os.makedirs(logs_dir, exist_ok=True)
    log_fp = open(os.path.join(logs_dir, "server.log"), "a", encoding="utf-8")

    subprocess.Popen(
        [real_py, "app.py"],
        cwd=PROJ_DIR,
        stdout=log_fp,
        stderr=log_fp,
        env=env,
        creationflags=DETACHED_PROCESS | CREATE_NO_WINDOW
    )

    return wait_for_server(timeout_sec=12.0)

def run_app_mode():
    """Launches backend in background if needed, opens UI window, and exits immediately (0 black windows)."""
    ok = start_backend_detached()
    if ok:
        open_desktop_window()
    else:
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(
                0,
                "TradeSmart backend failed to start. Please check logs/server.log.",
                "TradeSmart",
                0x10
            )
        except Exception:
            pass
    sys.exit(0)

def run_background_service():
    """Starts backend silently in background for Windows boot / autostart."""
    start_backend_detached()
    sys.exit(0)

def main():
    os.chdir(PROJ_DIR)

    # Handle silent app modes
    if "--app-mode" in sys.argv:
        run_app_mode()
        return

    if "--background" in sys.argv:
        run_background_service()
        return

    # Console Mode (Default if run via batch file)
    print("=" * 66)
    print("        TradeSmart - Virtual Futures and Options Terminal        ")
    print("=" * 66)
    print(" Initializing environment and services...")

    # Start backend
    if not start_backend_detached():
        print(" [ERROR] Failed to start TradeSmart server. Please check logs.")
        input(" Press Enter to exit...")
        return

    # Open UI window
    mode_str = open_desktop_window()

    print("\n" + "=" * 66)
    print(f" [✓] Status:           ACTIVE AND RUNNING IN BACKGROUND")
    print(f" [✓] Terminal URL:     {URL}")
    print(f" [✓] Window Mode:      {mode_str}")
    print(f" [✓] Default PIN:      123456")
    print(f" [✓] Default Capital:  ₹1,00,00,000 (1 Crore INR)")
    print(f" [✓] MIS Cutoff:       03:10 PM IST")
    print(f" [✓] Auto Square-Off:  03:15 PM IST")
    print("=" * 66)
    print(" TradeSmart background service is active.")
    print(" You can close this window at any time; the service stays running.")
    print(" To completely stop TradeSmart, run Stop_TradeSmart.bat.")
    print("=" * 66 + "\n")
    time.sleep(3)

if __name__ == "__main__":
    main()
