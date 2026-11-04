import os
import http.server
import socketserver
import threading
import subprocess
import time
import sys
import json
import urllib.request
import asyncio
import websockets

sys.stdout.reconfigure(encoding='utf-8')

PORT = 8899
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    def log_message(self, format, *args):
        pass
    def do_POST(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(b'{"success": true, "data": []}')

async def inspect_url(ws_url, page_name):
    console_errors = []
    network_errors = []
    
    async with websockets.connect(ws_url, max_size=10_000_000) as ws:
        # Enable Log, Runtime, Network
        await ws.send(json.dumps({"id": 1, "method": "Runtime.enable"}))
        await ws.send(json.dumps({"id": 2, "method": "Log.enable"}))
        await ws.send(json.dumps({"id": 3, "method": "Network.enable"}))
        
        start_time = time.time()
        while time.time() - start_time < 3.5:
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=0.5)
                data = json.loads(msg)
                method = data.get("method", "")
                
                if method == "Runtime.exceptionThrown":
                    details = data["params"]["exceptionDetails"]
                    text = details.get("text", "")
                    exc = details.get("exception", {}).get("description", "")
                    console_errors.append(f"EXCEPTION: {text} - {exc}")
                    
                elif method == "Log.entryAdded":
                    entry = data["params"]["entry"]
                    if entry.get("level") in ("error", "warning"):
                        console_errors.append(f"LOG [{entry.get('level')}]: {entry.get('text')} ({entry.get('url', '')})")
                        
                elif method == "Network.responseReceived":
                    resp = data["params"]["response"]
                    status = resp.get("status", 200)
                    url = resp.get("url", "")
                    if status >= 400:
                        network_errors.append(f"HTTP {status}: {url}")
                        
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                break
                
    return console_errors, network_errors

def audit_pages():
    chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    cdp_port = 9222
    
    # Start HTTP server
    httpd = socketserver.TCPServer(("", PORT), QuietHandler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    time.sleep(0.5)

    pages = [
        "index.html",
        "shop.html",
        "product-detail.html?id=83",
        "cart.html",
        "checkout.html",
        "my-account.html"
    ]

    print("=================================================================")
    print("   HEADLESS CHROME CDP CONSOLE & NETWORK AUDIT")
    print("=================================================================")

    results = {}

    for page in pages:
        url = f"http://localhost:{PORT}/{page}"
        profile_dir = os.path.join(DIRECTORY, f".chrome_prof_{int(time.time()*1000)%100000}")
        proc = subprocess.Popen([
            chrome_path,
            "--headless=new",
            f"--remote-debugging-port={cdp_port}",
            "--disable-gpu",
            "--no-first-run",
            f"--user-data-dir={profile_dir}",
            url
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        time.sleep(1.8)
        
        try:
            req = urllib.request.urlopen(f"http://127.0.0.1:{cdp_port}/json/list")
            targets = json.loads(req.read().decode('utf-8'))
            page_target = next((t for t in targets if t.get('type') == 'page'), None)
            
            if page_target and 'webSocketDebuggerUrl' in page_target:
                ws_url = page_target['webSocketDebuggerUrl']
                c_errs, n_errs = asyncio.run(inspect_url(ws_url, page))
                results[page] = {'console': c_errs, 'network': n_errs}
            else:
                results[page] = {'error': 'Could not attach to CDP page target'}
        except Exception as e:
            results[page] = {'error': str(e)}
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=2)
            except Exception:
                proc.kill()
            # clean profile dir
            try:
                subprocess.run(["cmd", "/c", "rmdir", "/s", "/q", profile_dir], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except Exception:
                pass
            time.sleep(0.5)

    httpd.shutdown()

    # Print summary
    total_exceptions = 0
    total_404s = 0

    for page, res in results.items():
        print(f"\n--- [{page}] ---")
        if 'error' in res:
            print(f"  ATTACH ERROR: {res['error']}")
            continue
        c_errs = res['console']
        n_errs = res['network']
        print(f"  Console issues: {len(c_errs)}")
        for ce in c_errs[:10]:
            print(f"    * {ce}")
        if len(c_errs) > 10:
            print(f"    ... and {len(c_errs) - 10} more")
            
        print(f"  Network 400+ errors: {len(n_errs)}")
        for ne in n_errs:
            print(f"    ! {ne}")
            
        total_exceptions += len(c_errs)
        total_404s += len(n_errs)

    print("\n" + "=" * 65)
    print(f"TOTAL CONSOLE ISSUES: {total_exceptions}")
    print(f"TOTAL HTTP 400+ ERRORS: {total_404s}")
    print("=" * 65)

if __name__ == '__main__':
    audit_pages()
