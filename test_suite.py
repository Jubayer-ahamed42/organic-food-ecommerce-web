import os
import glob
import re
import json
import http.server
import socketserver
import threading
import subprocess
import time
import sys

sys.stdout.reconfigure(encoding='utf-8')

PORT = 8895
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
        "--virtual-time-budget=3000",
        "--disable-gpu",
        url
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8', errors='ignore')
    return res.stdout

def main():
    print("=" * 70)
    print("   ORGANIC FOOD E-COMMERCE COMPREHENSIVE VERIFICATION SUITE")
    print("=" * 70)

    # 1. FILE INTEGRITY ASSERTIONS
    print("\n--- 1. STATIC CODE & LINK INTEGRITY AUDIT ---")
    html_files = glob.glob('*.html')
    assert len(html_files) >= 6, "Missing HTML pages!"

    total_malformed = 0
    total_demo11 = 0
    total_bare_pd = 0

    for hf in html_files:
        content = open(hf, encoding='utf-8').read()
        demo_matches = re.findall(r'demo11\.itservicelab\.com', content)
        malformed_matches = re.findall(r'[a-zA-Z0-9_\-\.]+\.html[a-zA-Z0-9_\-\/]+', content)
        bare_pd_matches = re.findall(r'href=[\'"]product-detail\.html[\'"]', content)
        
        # in product-detail.html, link rel="canonical" or alternate is allowed, but not a href
        a_bare_pd = re.findall(r'<a[^>]+href=[\'"]product-detail\.html[\'"]', content)

        total_demo11 += len(demo_matches)
        total_malformed += len(malformed_matches)
        total_bare_pd += len(a_bare_pd)

        print(f"[{hf}] demo11={len(demo_matches)}, malformed={len(malformed_matches)}, bare_pd_anchors={len(a_bare_pd)}")

    assert total_demo11 == 0, f"Found {total_demo11} remote demo11 links!"
    assert total_malformed == 0, f"Found {total_malformed} malformed html links!"
    assert total_bare_pd == 0, f"Found {total_bare_pd} bare product-detail.html anchors without ?id=!"
    print(">>> STATIC LINK INTEGRITY: ALL PASSED (0 ERRORS)")

    # 2. CATEGORIES.JSON & PRODUCTS.JSON CONSISTENCY
    print("\n--- 2. CATALOG & CATEGORIES INTEGRITY AUDIT ---")
    prods = json.load(open('data/products.json', encoding='utf-8'))
    cats = json.load(open('data/categories.json', encoding='utf-8'))
    
    assert len(prods) == 29, f"Expected 29 products, found {len(prods)}"
    assert len(cats) == 8, f"Expected 8 categories, found {len(cats)}"

    cat_slug_counts = {}
    for p in prods:
        for s in p.get('category_slugs', []):
            cat_slug_counts[s] = cat_slug_counts.get(s, 0) + 1

    for c in cats:
        expected_cnt = cat_slug_counts.get(c['slug'], 0)
        assert c['count'] == expected_cnt, f"Category {c['name']} ({c['slug']}) count mismatch: {c['count']} vs {expected_cnt}"
        print(f"Category: {c['name']} ({c['slug']}) -> {c['count']} products (CONFIRMED)")

    print(">>> CATALOG DATA CONSISTENCY: ALL PASSED")

    # 3. REAL HEADLESS CHROME E2E VERIFICATION
    print("\n--- 3. HEADLESS CHROME REAL DOM RENDERING AUDIT ---")
    httpd = socketserver.TCPServer(("", PORT), QuietHandler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    time.sleep(0.5)

    try:
        # A. Home Page
        print("\nTesting index.html in Chrome...")
        home_dom = run_chrome(f"http://localhost:{PORT}/index.html")
        assert "localBridgeStyles" in home_dom, "localBridgeStyles not injected in index.html"
        assert 'shop.html?category=ghee' in home_dom, "Ghee category link missing in index.html"
        assert 'product-detail.html?id=83' in home_dom, "Product 83 link missing in index.html"
        print("  - local-bridge injected: OK")
        print("  - category links present: OK")
        print("  - product card IDs present: OK")

        # B. Shop Page All 8 Categories
        print("\nTesting shop.html URL category filters in Chrome...")
        categories_to_test = {
            'ghee': 9,
            'oil': 8,
            'honey': 2,
            'dates': 2,
            'nuts': 3,
            'herbs': 3,
            'spices': 1,
            'wellness': 1
        }
        for slug, expected_visible in categories_to_test.items():
            shop_dom = run_chrome(f"http://localhost:{PORT}/shop.html?category={slug}")
            all_cards = re.findall(r'<div[^>]*class="[^"]*product-grid-item[^"]*"([^>]*)>', shop_dom)
            visible = sum(1 for a in all_cards if 'display: none' not in a)
            assert visible == expected_visible, f"Filter {slug} expected {expected_visible} visible, got {visible}"
            print(f"  - shop.html?category={slug}: {visible} cards visible -> PASS")

        # C. Search in Shop Page
        print("\nTesting shop.html search in Chrome...")
        search_dom = run_chrome(f"http://localhost:{PORT}/shop.html?search=%E0%A6%98%E0%A6%BF")
        all_cards = re.findall(r'<div[^>]*class="[^"]*product-grid-item[^"]*"([^>]*)>', search_dom)
        visible = sum(1 for a in all_cards if 'display: none' not in a)
        assert visible == 9, f"Search 'ঘি' expected 9 cards, got {visible}"
        print(f"  - shop.html?search=ঘি: {visible} cards visible -> PASS")

        # D. Product Detail Dynamic Population
        print("\nTesting product-detail.html in Chrome...")
        pd_dom = run_chrome(f"http://localhost:{PORT}/product-detail.html?id=83")
        assert "ACME প্রিমিয়াম বিশুদ্ধ ঘি" in pd_dom, "Product title not populated in product-detail.html"
        assert "woocommerce-breadcrumb" in pd_dom, "Breadcrumb missing in product-detail.html"
        assert 'type="button" class="minus btn"' in pd_dom, "Quantity minus button missing type=button"
        assert 'type="button" class="plus btn"' in pd_dom, "Quantity plus button missing type=button"
        assert 'data-product_id="83"' in pd_dom, "data-product_id missing on buttons"
        assert 'singleProductDirectOrderBtn' not in pd_dom, "Duplicate buy now button found!"
        print("  - Title populated dynamically: OK")
        print("  - Breadcrumbs injected: OK")
        print("  - Quantity buttons type=button: OK")
        print("  - Single Buy Now button: OK")

        # E. Cart, Checkout, My Account
        print("\nTesting cart.html, checkout.html, my-account.html in Chrome...")
        for page in ['cart.html', 'checkout.html', 'my-account.html']:
            page_dom = run_chrome(f"http://localhost:{PORT}/{page}")
            assert "localBridgeStyles" in page_dom, f"localBridgeStyles missing on {page}"
            print(f"  - {page} loaded and initialized: OK")

    finally:
        httpd.shutdown()

    print("\n" + "=" * 70)
    print("   ALL TESTS PASSED WITH 100% SUCCESS!")
    print("=" * 70)

if __name__ == '__main__':
    main()
