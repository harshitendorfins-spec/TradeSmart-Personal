import urllib.request
import urllib.parse
import json

def search(q):
    url = f"http://127.0.0.1:8000/api/instruments/search?q={urllib.parse.quote(q)}&limit=10"
    res = urllib.request.urlopen(url)
    return json.loads(res.read().decode())

def sub(syms):
    req = urllib.request.Request(
        "http://127.0.0.1:8000/api/live/subscribe",
        data=json.dumps({"symbols": syms}).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    return json.loads(urllib.request.urlopen(req).read().decode())

def get_status():
    res = urllib.request.urlopen("http://127.0.0.1:8000/api/live/status")
    return json.loads(res.read().decode())

print("=== 0. Live Status ===")
st = get_status()
print(f"Status: {st}")

print("\n=== 1. Searching NIFTY Options ===")
nifty_res = search("NIFTY")
print(f"Found {nifty_res['total']} results:")
for r in nifty_res["results"][:5]:
    print(f"  Symbol: {r['symbol']} | Type: {r['type']} | Strike: {r['strike']} | Expiry: {r['expiry']} | Lot: {r['lotSize']}")

print("\n=== 2. Searching Strikes (24800, 25000, 22900) ===")
for s in ["24800", "25000", "22900"]:
    res = search(s)
    print(f"Query '{s}' found {res['total']} matches:")
    for r in res["results"][:2]:
        print(f"  {r['symbol']} ({r['name']}) Expiry: {r['expiry']} Strike: {r['strike']}")

print("\n=== 3. Searching Stock F&O (RELIANCE, TCS) ===")
for st in ["RELIANCE", "TCS"]:
    res = search(st)
    print(f"Query '{st}' found {res['total']} matches:")
    for r in res["results"][:2]:
        print(f"  {r['symbol']} ({r['type']}) Strike: {r['strike']} Lot: {r['lotSize']}")

print("\n=== 4. Testing Subscribe for Weekly ATM & OTM ===")
symbols_to_sub = [
    "NIFTY 24850 CE",    # ATM CE
    "NIFTY 24850 PE",    # ATM PE
    "NIFTY 25500 CE",    # OTM CE
    "NIFTY 24000 PE",    # OTM PE
    "BANK NIFTY 52000 CE",
    "BANK NIFTY 51000 PE",
    "RELIANCE 1400 CE",
    "RELIANCE-EQ"
]
sub_res = sub(symbols_to_sub)
print("Subscription response:", sub_res)
assert sub_res.get("unknown") == [], f"Failed to subscribe to symbols: {sub_res.get('unknown')}"
print("ALL SYMBOLS SUBSCRIBED SUCCESSFULLY WITH 0 UNKNOWN!")
