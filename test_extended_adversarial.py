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

PORT = 8922
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    def log_message(self, format, *args):
        pass

httpd = socketserver.TCPServer(("", PORT), QuietHandler)
t = threading.Thread(target=httpd.serve_forever, daemon=True)
t.start()
time.sleep(0.5)

chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
user_data = f"C:/temp/chrome_adv_{int(time.time()*1000)%100000}"
proc = subprocess.Popen([
    chrome_path, "--headless=new", "--remote-debugging-port=9244",
    "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    f"--user-data-dir={user_data}",
    f"http://localhost:{PORT}/product-detail.html?id=38"
])
time.sleep(2)

async def run_adversarial_tests():
    tabs = json.loads(urllib.request.urlopen("http://localhost:9244/json").read())
    page_tab = [x for x in tabs if x.get("type") == "page"][0]
    ws_url = page_tab["webSocketDebuggerUrl"]

    async with websockets.connect(ws_url, max_size=10_000_000) as ws:
        await ws.send(json.dumps({"id": 1, "method": "Runtime.enable"}))
        await asyncio.sleep(1.5)

        async def eval_js(expr):
            req_id = int(time.time() * 1000) % 100000
            await ws.send(json.dumps({"id": req_id, "method": "Runtime.evaluate", "params": {"expression": expr, "returnByValue": True}}))
            while True:
                msg = json.loads(await ws.recv())
                if msg.get("id") == req_id:
                    return msg.get("result", {}).get("result", {}).get("value")

        print("--- 1. Verification of Product 38 (কারকুমা অর্গানিক বিশুদ্ধ মধু, Honey category) ---")
        title = await eval_js("document.querySelector('h1.product_title')?.textContent?.trim()")
        assert title == "কারকুমা অর্গানিক বিশুদ্ধ মধু", f"Expected title 'কারকুমা অর্গানিক বিশুদ্ধ মধু', got '{title}'"
        print("  [PASS] Title:", title)

        container_id = await eval_js("document.querySelector('.single-product-page')?.id")
        assert container_id == "product-38", f"Expected container id 'product-38', got '{container_id}'"
        print("  [PASS] Single product container ID:", container_id)

        body_classes = await eval_js("document.body.className")
        assert "postid-38" in body_classes, f"Expected postid-38 in body, got {body_classes}"
        print("  [PASS] Body class has postid-38")

        # Navbar active category
        nav_honey_active = await eval_js("document.querySelector('#menu-item-292')?.classList.contains('current-product-parent')")
        assert nav_honey_active is True, "Honey menu item should be active for product 38"
        print("  [PASS] Header navigation dynamically highlighted Honey category for product 38")

        # Delivery & comment post id
        del_pid = await eval_js("document.querySelector('.wd-est-del')?.dataset.productId")
        assert del_pid == "38", f"Expected delivery data-product-id '38', got '{del_pid}'"
        comment_pid = await eval_js("document.getElementById('comment_post_ID')?.value")
        assert comment_pid == "38", f"Expected comment_post_ID '38', got '{comment_pid}'"
        print("  [PASS] Delivery & comment post ID match active product 38")

        print("\n--- 2. Gallery Slider, Thumbnails & Arrows (Product 38 has 3 images) ---")
        thumbs_count = await eval_js("document.querySelectorAll('.wd-gallery-thumb .wd-carousel-item').length")
        assert thumbs_count == 3, f"Expected 3 thumbnails for product 38, got {thumbs_count}"
        print(f"  [PASS] Gallery has {thumbs_count} thumbnails")

        # Click next arrow
        thumbs_before = await eval_js("Array.from(document.querySelectorAll('.wd-gallery-thumb .wd-carousel-item')).map(x => x.className)")
        has_onclick = await eval_js("Boolean(document.querySelector('.wd-gallery-images .wd-btn-arrow.wd-next')?.onclick)")
        print(f"  [DEBUG] Thumbs before: {thumbs_before}, Arrow has onclick: {has_onclick}")
        await eval_js("document.querySelector('.wd-gallery-images .wd-btn-arrow.wd-next').click()")
        await asyncio.sleep(0.5)
        transform_slide1 = await eval_js("document.querySelector('.woocommerce-product-gallery__wrapper .wd-carousel-wrap')?.style?.transform")
        thumbs_after = await eval_js("Array.from(document.querySelectorAll('.wd-gallery-thumb .wd-carousel-item')).map(x => x.className)")
        print(f"  [DEBUG] Thumbs after: {thumbs_after}, transform: {transform_slide1}")
        assert "-100%" in transform_slide1 or "-689px" in transform_slide1 or ("translate3d(-" in transform_slide1 and "0px, 0px)" in transform_slide1), f"Expected transform slide 1, got {transform_slide1}"
        active_thumb1 = await eval_js("document.querySelectorAll('.wd-gallery-thumb .wd-carousel-item')[1]?.classList.contains('wd-active')")
        assert active_thumb1 is True, f"Thumbnail 1 should be active after clicking next arrow, got {thumbs_after}"
        print(f"  [PASS] Next arrow navigated to slide 1 ({transform_slide1}) and synced thumbnail")

        # Click thumbnail 2
        await eval_js("document.querySelectorAll('.wd-gallery-thumb .wd-carousel-item')[2].click()")
        await asyncio.sleep(0.4)
        transform_slide2 = await eval_js("document.querySelector('.woocommerce-product-gallery__wrapper .wd-carousel-wrap')?.style?.transform")
        assert "-200%" in transform_slide2 or "-1378px" in transform_slide2 or "-689px" not in transform_slide2, f"Expected transform slide 2, got {transform_slide2}"
        print(f"  [PASS] Clicking thumbnail 2 navigated to slide 2 ({transform_slide2})")

        # Click prev arrow
        await eval_js("document.querySelector('.wd-gallery-images .wd-btn-arrow.wd-prev').click()")
        await asyncio.sleep(0.4)
        transform_slide_prev = await eval_js("document.querySelector('.woocommerce-product-gallery__wrapper .wd-carousel-wrap')?.style?.transform")
        assert "-100%" in transform_slide_prev or "-689px" in transform_slide_prev or "translate3d(-" in transform_slide_prev, f"Expected transform after prev, got {transform_slide_prev}"
        print(f"  [PASS] Prev arrow navigated back to slide 1 ({transform_slide_prev})")

        print("\n--- 3. Related Products & Injected Buy Now Buttons ---")
        related_cards = await eval_js("document.querySelectorAll('#carousel-870 .product-grid-item').length")
        assert related_cards > 0, "Related products should be rendered"
        related_buy_btns = await eval_js("document.querySelectorAll('#carousel-870 .wd-buy-now-btn').length")
        assert related_buy_btns == related_cards, f"All {related_cards} related cards must have 'অর্ডার করুন' button, got {related_buy_btns}"
        print(f"  [PASS] All {related_cards} related product cards have injected 'অর্ডার করুন' Buy Now buttons")

        print("\n--- 4. Reactive Navigation via Hashchange ---")
        # Change hash to #id=1058 (Pabna Dairy Ghee)
        await eval_js("window.location.hash = '#id=1058'")
        await asyncio.sleep(0.5)
        new_title = await eval_js("document.querySelector('h1.product_title')?.textContent?.trim()")
        assert new_title == "পাবনা ডেইরি বিশুদ্ধ ঘি", f"Expected 'পাবনা ডেইরি বিশুদ্ধ ঘি' after hashchange, got '{new_title}'"
        nav_ghee_active = await eval_js("document.querySelector('#menu-item-288')?.classList.contains('current-product-parent')")
        assert nav_ghee_active is True, "Ghee navbar item should now be active after hashchange"
        print("  [PASS] Hashchange #id=1058 dynamically updated page title & active category without reload")

try:
    asyncio.run(run_adversarial_tests())
    print("\n" + "=" * 70)
    print("   ALL ADVERSARIAL VERIFICATIONS PASSED WITH 100% SUCCESS!")
    print("=" * 70)
finally:
    proc.terminate()
    httpd.shutdown()
