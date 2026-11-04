import os
import http.server
import socketserver
import threading
import subprocess
import time
import sys
import json
import re

sys.stdout.reconfigure(encoding='utf-8')

PORT = 8901
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    def log_message(self, format, *args):
        pass

def run_chrome(url):
    chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    cmd = [
        chrome_path,
        "--headless=new",
        "--dump-dom",
        "--virtual-time-budget=4000",
        "--disable-gpu",
        url
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8', errors='ignore')
    return res.stdout

def main():
    print("=" * 70)
    print("   COMPREHENSIVE PRODUCT DETAIL & NAVIGATION VERIFICATION")
    print("=" * 70)

    products = json.load(open('data/products.json', encoding='utf-8'))
    print(f"Total products in catalog: {len(products)}")

    # 1. Start Server for HTTP tests
    httpd = socketserver.TCPServer(("", PORT), QuietHandler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    time.sleep(0.5)

    try:
        # A. Test Multiple Distinct Products via ?id=
        test_ids = [83, 1058, 62, 31, 101, 1271, 1053, 111, 80]
        print(f"\n--- A. Testing {len(test_ids)} distinct products via http://localhost:{PORT}/product-detail.html?id=<id> ---")
        
        for pid in test_ids:
            p = next(x for x in products if str(x['id']) == str(pid))
            url = f"http://localhost:{PORT}/product-detail.html?id={pid}"
            dom = run_chrome(url)

            # Assert Title
            assert p['name'] in dom, f"Failed: {p['name']} not found in DOM for id={pid}"
            
            # Assert Price
            assert str(p['price']) in dom, f"Failed: price {p['price']} not found in DOM for id={pid}"
            
            # Assert Image
            expected_img = p['thumbnail'] or p['images'][0]
            assert expected_img in dom, f"Failed: image {expected_img} not found in DOM for id={pid}"
            
            # Assert Breadcrumb
            assert "woocommerce-breadcrumb" in dom, f"Failed: breadcrumb missing for id={pid}"
            
            # If not tea, ensure no tea image appears
            if pid != 1271:
                assert "Masala-Chai" not in dom, f"Tea image incorrectly found in DOM for product id={pid} ({p['name']})!"

            print(f"  [PASS] id={pid} -> '{p['name']}' | Price: ৳{p['price']} | Image: {expected_img}")

        # B. Test Alternative Query Parameter Formats (?product_id=, ?productId=, ?p=)
        print(f"\n--- B. Testing alternative URL parameter formats ---")
        param_tests = [
            (f"product-detail.html?product_id=1058", "পাবনা ডেইরি বিশুদ্ধ ঘি"),
            (f"product-detail.html?productId=62", "অর্গানিক ফ্রেশ কালমি খেজুর"),
            (f"product-detail.html?p=31", "ডাবর বিশুদ্ধ প্রাকৃতিক মধু"),
            (f"product-detail.html#id=101", "ফ্রেশ ফোর্টিফাইড সয়াবিন তেল")
        ]
        for rel_url, expected_title in param_tests:
            dom = run_chrome(f"http://localhost:{PORT}/{rel_url}")
            assert expected_title in dom, f"Failed param test: {rel_url} did not render '{expected_title}'"
            print(f"  [PASS] {rel_url} -> '{expected_title}' rendered correctly")

        # C. Test file:/// Protocol (Offline Local Double-Click Simulation)
        print(f"\n--- C. Testing file:/// protocol (offline local browser without server) ---")
        abs_path = os.path.abspath('product-detail.html').replace(os.sep, '/')
        for pid in [1058, 62, 83]:
            p = next(x for x in products if str(x['id']) == str(pid))
            file_url = f"file:///{abs_path}?id={pid}"
            dom_file = run_chrome(file_url)
            assert p['name'] in dom_file, f"file:// failed for id={pid}: '{p['name']}' not in DOM!"
            if pid != 1271:
                assert "Masala-Chai" not in dom_file, f"file:// tea image leak for id={pid}!"
            print(f"  [PASS] file:///{abs_path}?id={pid} -> '{p['name']}' loaded offline!")

        # D. Test default behavior when no ID is provided (should default to ACME Ghee, NOT Tea Cup)
        print(f"\n--- D. Testing default product-detail.html without parameters ---")
        default_dom = run_chrome(f"http://localhost:{PORT}/product-detail.html")
        assert "ACME প্রিমিয়াম বিশুদ্ধ ঘি" in default_dom, "Default product-detail.html should show ACME Ghee!"
        assert "Masala-Chai" not in default_dom, "Tea cup should NOT be the default product!"
        print("  [PASS] Default product-detail.html renders ACME Ghee with zero tea cup!")

    finally:
        httpd.shutdown()

    print("\n" + "=" * 70)
    print("   ALL COMPREHENSIVE PRODUCT TESTS PASSED WITH 100% SUCCESS!")
    print("=" * 70)

if __name__ == '__main__':
    main()
