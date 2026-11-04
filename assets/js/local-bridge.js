/**
 * Antigravity Autonomous Local Bridge for WoodMart / WooCommerce E-Commerce
 * 
 * 100% Offline-First Interactive Engine:
 * - Cart state management in localStorage
 * - Seamless WoodMart header cart counters & subtotal sync
 * - Interactive slide-in Cart Drawer with Free Shipping progress bar
 * - 1-Click Cash on Delivery Checkout Modal with WhatsApp confirmation
 * - Quick View Modal for all products
 * - Category filter & pagination engine for shop.html (?category=<slug>)
 * - Dynamic product page populator for product-detail.html (?id=<id>)
 * - Dynamic cart & checkout page renderers for cart.html & checkout.html
 * - Live instant Ajax search dropdown in header
 * - Toast notification system in Bengali
 * - Quantity stepper (+ / -) controls across all pages
 * - Mobile bottom toolbar & mobile drawer navigation support
 * - Injected premium Bangla styling and card hover effects
 * - Mock for local admin-ajax.php requests (100% self-contained, 0 network errors)
 */

(function () {
  'use strict';

  // --- SECURITY & NORMALIZATION HELPERS ---
  function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalizeBengaliDigits(str) {
    if (!str) return '';
    const bnToEn = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
    return String(str).replace(/[০-৯]/g, d => bnToEn[d] || d);
  }

  // --- PRE-REGISTER ELEMENTOR CHUNKS (Prevents unhandled chunk loader exceptions) ---
  window.__elementorChunks = window.__elementorChunks || {};
  class ElementorStubHandler {
    constructor() {}
    getDefaultSettings() { return {}; }
    onInit() {}
    run() {}
    destroy() {}
  }
  [
    'background-slideshow',
    'background-video',
    'section-stretched-section',
    'handles-position',
    'container-shapes',
    'container-grid-container',
    'text-editor',
    'lightbox-lightbox'
  ].forEach(name => {
    if (!window.__elementorChunks[name]) {
      window.__elementorChunks[name] = { default: ElementorStubHandler };
    }
  });

  // --- LOCAL AJAX MOCK (Prevents 404/database errors on WordPress ajax calls) ---
  if (window.fetch) {
    const _origFetch = window.fetch;
    window.fetch = function (url, opts) {
      if (typeof url === 'string' && url.includes('admin-ajax.php')) {
        return Promise.resolve(new Response(JSON.stringify({ success: true, data: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }));
      }
      return _origFetch.apply(this, arguments);
    };
  }

  // Intercept XMLHttpRequest for admin-ajax.php
  if (window.XMLHttpRequest) {
    const _origOpen = XMLHttpRequest.prototype.open;
    const _origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this._interceptUrl = typeof url === 'string' ? url : '';
      return _origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (body) {
      if (this._interceptUrl && this._interceptUrl.includes('admin-ajax.php')) {
        try {
          Object.defineProperty(this, 'readyState', { value: 4, writable: true });
          Object.defineProperty(this, 'status', { value: 200, writable: true });
          Object.defineProperty(this, 'statusText', { value: 'OK', writable: true });
          Object.defineProperty(this, 'responseText', { value: JSON.stringify({ success: true, data: [] }), writable: true });
          Object.defineProperty(this, 'response', { value: JSON.stringify({ success: true, data: [] }), writable: true });
        } catch (e) {}
        setTimeout(() => {
          if (typeof this.onreadystatechange === 'function') this.onreadystatechange();
          if (typeof this.onload === 'function') this.onload();
        }, 10);
        return;
      }
      return _origSend.apply(this, arguments);
    };
  }

  // Intercept jQuery AJAX if present
  function hookJQueryAjax() {
    if (window.jQuery && window.jQuery.ajaxPrefilter) {
      window.jQuery.ajaxPrefilter(function (options, originalOptions, jqXHR) {
        if (options.url && options.url.includes('admin-ajax.php')) {
          options.success = options.success || function () {};
          return 'local_mock_ajax';
        }
      });
      if (window.jQuery.ajaxTransport) {
        window.jQuery.ajaxTransport('local_mock_ajax', function (options, originalOptions, jqXHR) {
          return {
            send: function (headers, completeCallback) {
              completeCallback(200, 'OK', {
                text: JSON.stringify({ success: true, data: [] }),
                json: { success: true, data: [] }
              });
            },
            abort: function () {}
          };
        });
      }
    }
  }
  hookJQueryAjax();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hookJQueryAjax);
  }

  // --- STATE ---
  let products = [];
  let cart = JSON.parse(localStorage.getItem('organic_cart')) || [];
  let orders = JSON.parse(localStorage.getItem('organic_orders')) || [];

  // Shipping rates
  const SHIPPING_DHAKA = 80;
  const SHIPPING_OUTSIDE = 150;
  const FREE_SHIPPING_THRESHOLD = 1500;

  // Category mapping
  const CATEGORY_NAMES = {
    'ghee': 'ঘি',
    'oil': 'তেল',
    'honey': 'মধু',
    'dates': 'খেজুর',
    'nuts': 'বাদাম',
    'herbs': 'ভেষজ',
    'spices': 'মসলা',
    'wellness': 'সুস্থতা',
    'all': 'সকল পণ্য'
  };

  // --- INJECT GLOBAL ENHANCEMENT STYLES ---
  function injectEnhancementStyles() {
    if (document.getElementById('localBridgeStyles')) return;
    const style = document.createElement('style');
    style.id = 'localBridgeStyles';
    style.textContent = `
      body, h1, h2, h3, h4, h5, h6, input, button, select, textarea, .nav-link-text, .wd-entities-title {
        font-family: 'Anek Bangla', 'Segoe UI', system-ui, -apple-system, sans-serif !important;
      }
      .wd-product.product-grid-item, .wd-product.wd-col {
        transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
      }
      .wd-product.product-grid-item:hover, .wd-product.wd-col:hover {
        transform: translateY(-4px) !important;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08) !important;
      }
      .wd-buy-now-btn {
        background: #fbbc34 !important;
        color: #153a27 !important;
        font-weight: 800 !important;
        border-radius: 4px !important;
        transition: all 0.2s ease !important;
        border: none !important;
      }
      .wd-buy-now-btn:hover {
        background: #f5b01e !important;
        transform: translateY(-1px) !important;
      }
      .cat-item.wd-active > a,
      .cat-item.current-cat > a {
        color: #016738 !important;
        font-weight: 800 !important;
      }
      .cat-item.wd-active::before,
      .cat-item.current-cat::before {
        content: "";
        color: #016738;
        font-weight: bold;
      }
      .mobile-nav.wd-opened {
        transform: none !important;
        opacity: 1 !important;
        visibility: visible !important;
      }
      .wd-close-side.wd-close-side-opened {
        opacity: 1 !important;
        visibility: visible !important;
        display: block !important;
      }
      @keyframes localFadeIn {
        from { opacity: 0; transform: scale(0.96); }
        to { opacity: 1; transform: scale(1); }
      }
      .local-modal-animate {
        animation: localFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      .organic-cart-grid {
        display: grid;
        grid-template-columns: 1.8fr 1fr;
        gap: 30px;
      }
      .organic-checkout-grid {
        display: grid;
        grid-template-columns: 1.2fr 1fr;
        gap: 30px;
      }
      .organic-quickview-grid {
        display: grid;
        grid-template-columns: 1fr 1.2fr;
        gap: 24px;
        align-items: center;
      }
      @media (max-width: 860px) {
        .organic-cart-grid,
        .organic-checkout-grid,
        .organic-quickview-grid,
        #fullCheckoutPageForm,
        .woocommerce > div > div[style*="display:grid"],
        #quickViewContent > div[style*="display:grid"] {
          grid-template-columns: 1fr !important;
          gap: 20px !important;
        }
        .organic-cart-table-wrap {
          overflow-x: auto !important;
          -webkit-overflow-scrolling: touch;
        }
        #localCartDrawer {
          width: 92vw !important;
          max-width: 380px !important;
        }
        #localOrderModalOverlay > div,
        #localQuickViewOverlay > div {
          width: 95vw !important;
          margin: 10px auto !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // --- EMBEDDED PRODUCTS FALLBACK (Ensures 100% offline & file:// protocol compatibility) ---
  const EMBEDDED_PRODUCTS_FALLBACK = [{"id": 1271, "name": "প্রিমিয়াম চা - 1KG", "slug": "%e0%a6%aa%e0%a7%8d%e0%a6%b0%e0%a6%bf%e0%a6%ae%e0%a6%bf%e0%a6%af%e0%a6%bc%e0%a6%be%e0%a6%ae-%e0%a6%9a%e0%a6%be-1kg", "price": 500, "regular_price": 500, "on_sale": false, "discount_percent": 0, "categories": ["ভেষজ"], "category_slugs": ["herbs"], "images": ["assets/images/Masala-Chai-Tea-Recipe-Card.jpg"], "thumbnail": "assets/images/Masala-Chai-Tea-Recipe-Card.jpg", "rating": 0.0, "review_count": 12, "in_stock": true, "short_description": "সুন্দর ঘ্রাণ, সমৃদ্ধ স্বাদ ও সতেজ অনুভূতির জন্য বাছাই করা উন্নতমানের চা। প্রতিটি কাপেই পাবেন চায়ের আসল স্বাদ।", "description": "বাছাই করা উন্নতমানের চা পাতা দিয়ে তৈরি এই প্রিমিয়াম চা আপনাকে দেবে চমৎকার ঘ্রাণ, মসৃণ স্বাদ এবং সতেজ অনুভূতি। সকালে দিনের শুরুতে, বিকেলের আড্ডায় কিংবা পরিবার ও বন্ধুদের সঙ্গে এক কাপ গরম চা উপভোগ করার জন্য এটি হতে পারে দারুণ পছন্দ।\nবৈশিষ্ট্য:\n\nউন্নতমানের চা পাতা\nচমৎকার ঘ্রাণ ও স্বাদ\nপ্রতিদিনের জন্য উপযোগী\nসহজে প্রস্তুত করা যায়\nবাসা ও অফিসের জন্য উপযুক্ত"}, {"id": 1058, "name": "পাবনা ডেইরি বিশুদ্ধ ঘি", "slug": "%e0%a6%aa%e0%a6%be%e0%a6%ac%e0%a6%a8%e0%a6%be-%e0%a6%a1%e0%a7%87%e0%a6%87%e0%a6%b0%e0%a6%bf-%e0%a6%ac%e0%a6%bf%e0%a6%b6%e0%a7%81%e0%a6%a6%e0%a7%8d%e0%a6%a7-%e0%a6%98%e0%a6%bf-2", "price": 560, "regular_price": 660, "on_sale": true, "discount_percent": 15, "categories": ["ঘি"], "category_slugs": ["ghee"], "images": ["assets/images/1-3-1.webp", "assets/images/1-3-1.webp"], "thumbnail": "assets/images/1-3-1.webp", "rating": 0.0, "review_count": 12, "in_stock": true, "short_description": "পাবনা ডেইরি বিশুদ্ধ ঘি উন্নত মানের দুধ থেকে প্রস্তুত একটি প্রিমিয়াম ঘি। এর সমৃদ্ধ স্বাদ, মনোমুগ্ধকর সুবাস এবং মসৃণ টেক্সচার ভাত, খিচুড়ি, পোলাও, রুটি ও বিভিন্ন রান্নার স্বাদকে আরও সমৃদ্ধ করে।", "description": "পাবনা ডেইরি বিশুদ্ধ ঘি (Pabna Dairy Ghee) উন্নত মানের দুধ থেকে যত্নসহকারে প্রস্তুত করা হয়, যাতে এর প্রাকৃতিক স্বাদ, সুবাস এবং গুণগত মান বজায় থাকে। প্রতিদিনের রান্না থেকে শুরু করে বিশেষ খাবার ও ঐতিহ্যবাহী মিষ্টান্ন তৈরিতে এটি সমানভাবে উপযোগী। গরম ভাত, খিচুড়ি, পোলাও, বিরিয়ানি, ডাল, রুটি, পরোটা কিংবা পায়েস ও হালুয়ার মতো খাবারে এই ঘি ব্যবহার করলে খাবারের স্বাদ ও ঘ্রাণ আরও সমৃদ্ধ হয়ে ওঠে।\nবৈশিষ্ট্য\n\nউন্নত মানের দুধ থেকে প্রস্তুত\nপ্রিমিয়াম মানের বিশুদ্ধ ঘি\nসমৃদ্ধ স্বাদ ও মনোমুগ্ধকর সুবাস\nমসৃণ ও ঘন টেক্সচার\nকোনো কৃত্রিম রং, ফ্লেভার বা প্রিজারভেটিভ যোগ করা হয়নি\nভাত, খিচুড়ি, পোলাও ও বিরিয়ানির জন্য উপযোগী\nরুটি, পরোটা ও নানের সঙ্গে পরিবেশনের জন্য আদর্শ\nপায়েস, হালুয়া, সেমাই ও অন্যান্য মিষ্টান্ন তৈরিতে ব্যবহারযোগ্য\nস্বাস্থ্যসম্মত ও নিরাপদ প্যাকেজিং\n\nব্যবহারের উপায়\n\nগরম ভাত বা খিচুড়ির সঙ্গে পরিবেশন করুন।\nপোলাও, বিরিয়ানি ও অন্যান্য রান্নায় ব্যবহার করুন।\nরুটি, পরোটা বা নানের সঙ্গে উপভোগ করুন।\nপায়েস, হালুয়া, সেমাই ও বিভিন্ন মিষ্টান্ন তৈরিতে ব্যবহার করুন।\nরান্নার শেষে অল্প পরিমাণ ঘি যোগ করে খাবারের স্বাদ ও সুবাস বাড়ান।\n\nসংরক্ষণ নির্দেশনা\n\nঠান্ডা ও শুষ্ক স্থানে সংরক্ষণ করুন।\nসরাসরি সূর্যের আলো থেকে দূরে রাখুন।\nব্যবহারের পর ঢাকনা ভালোভাবে বন্ধ রাখুন।\nপরিষ্কার ও শুকনো চামচ ব্যবহার করুন।\n\n\nদ্রষ্টব্য: তাপমাত্রার পরিবর্তনের কারণে ঘির রঙ, ঘনত্ব বা টেক্সচারে সামান্য পরিবর্তন হতে পারে। এটি সম্পূর্ণ স্বাভাবিক এবং পণ্যের গুণগত মানের ওপর কোনো প্রভাব ফেলে না।"}, {"id": 1053, "name": "লাফজ আলফা সিরাম", "slug": "%e0%a6%b2%e0%a6%be%e0%a6%ab%e0%a6%9c-%e0%a6%86%e0%a6%b2%e0%a6%ab%e0%a6%be-%e0%a6%b8%e0%a6%bf%e0%a6%b0%e0%a6%be%e0%a6%ae", "price": 1549, "regular_price": 1599, "on_sale": true, "discount_percent": 3, "categories": ["তেল"], "category_slugs": ["oil"], "images": ["assets/images/lafz-luminous-skin-face-serum-alpha-arbutin-30-ml.webp"], "thumbnail": "assets/images/lafz-luminous-skin-face-serum-alpha-arbutin-30-ml.webp", "rating": 0.0, "review_count": 12, "in_stock": true, "short_description": "লাফজ লুমিনাস স্কিন ফেস সিরাম আলফা আরবুটিন (Lafz Luminous Skin Face Serum Alpha Arbutin) ত্বকের নিয়মিত পরিচর্যার জন্য তৈরি একটি হালকা ও দ্রুত শোষণযোগ্য ফেস সিরাম। এটি ত্বককে মসৃণ, উজ্জ্বল ও সতেজ রাখতে দৈনন্দিন স্কিনকেয়ার রুটিনে ব্যবহার করা যায়।", "description": "লাফজ লুমিনাস স্কিন ফেস সিরাম আলফা আরবুটিন (Lafz Luminous Skin Face Serum Alpha Arbutin) আধুনিক স্কিনকেয়ার রুটিনের জন্য উপযোগী একটি প্রিমিয়াম ফেস সিরাম। এর হালকা টেক্সচার ত্বকে দ্রুত শোষিত হয় এবং ত্বককে কোমল ও সতেজ অনুভূতি দেয়। প্রতিদিনের ব্যবহারে এটি ত্বকের যত্নে সহায়ক এবং অন্যান্য স্কিনকেয়ার পণ্যের সঙ্গে সহজেই ব্যবহার করা যায়।\nবৈশিষ্ট্য\n\nআলফা আরবুটিন সমৃদ্ধ ফেস সিরাম\nহালকা ও দ্রুত শোষণযোগ্য ফর্মুলা\nত্বককে মসৃণ ও কোমল রাখতে সহায়ক\nত্বককে উজ্জ্বল ও সতেজ দেখাতে সহায়ক\nদৈনন্দিন স্কিনকেয়ার রুটিনের জন্য উপযোগী\nসব ধরনের ত্বকের জন্য ব্যবহারযোগ্য\nনন-স্টিকি ও আরামদায়ক অনুভূতি\nস্বাস্থ্যসম্মত ও নিরাপদ প্যাকেজিং\n\nব্যবহারের উপায়\n\nমুখ ভালোভাবে পরিষ্কার করে শুকিয়ে নিন।\n২–৩ ফোঁটা সিরাম মুখ ও গলায় লাগান।\nআলতোভাবে ম্যাসাজ করুন যতক্ষণ না সম্পূর্ণ শোষিত হয়।\nএরপর প্রয়োজনে ময়েশ্চারাইজার ব্যবহার করুন।\nদিনের বেলায় ব্যবহার করলে সানস্ক্রিন ব্যবহার করার পরামর্শ দেওয়া হয়।\n\nসংরক্ষণ নির্দেশনা\n\nঠান্ডা ও শুষ্ক স্থানে সংরক্ষণ করুন।\nসরাসরি সূর্যের আলো থেকে দূরে রাখুন।\nব্যবহারের পর বোতলের ঢাকনা ভালোভাবে বন্ধ রাখুন।\nশিশুদের নাগালের বাইরে রাখুন।\n\n\nদ্রষ্টব্য: শুধুমাত্র বাহ্যিক ব্যবহারের জন্য। চোখে লাগলে পরিষ্কার পানি দিয়ে ধুয়ে ফেলুন। প্রথমবার ব্যবহারের আগে ত্বকের ছোট একটি অংশে প্যাচ টেস্ট করে নেওয়া ভালো। কোনো অস্বস্তি বা জ্বালাপোড়া অনুভব হলে ব্যবহার বন্ধ করুন।"}, {"id": 159, "name": "গোল্ডেন গ্রেইন চিয়া সিড", "slug": "%e0%a6%97%e0%a7%8b%e0%a6%b2%e0%a7%8d%e0%a6%a1%e0%a7%87%e0%a6%a8-%e0%a6%97%e0%a7%8d%e0%a6%b0%e0%a7%87%e0%a6%87%e0%a6%a8-%e0%a6%9a%e0%a6%bf%e0%a6%af%e0%a6%bc%e0%a6%be-%e0%a6%b8%e0%a6%bf%e0%a6%a1", "price": 179, "regular_price": 199, "on_sale": true, "discount_percent": 10, "categories": ["সুস্থতা"], "category_slugs": ["wellness"], "images": ["assets/images/golden-grain-chia-seed-100-gm.webp"], "thumbnail": "assets/images/golden-grain-chia-seed-100-gm.webp", "rating": 5.0, "review_count": 1, "in_stock": true, "short_description": "গোল্ডেন গ্রেইন চিয়া সিড (Golden Grain Chia Seed) নির্বাচিত মানের চিয়া বীজ দিয়ে প্রস্তুত একটি প্রিমিয়াম সুপারফুড। স্মুদি, ওটস, দই, সালাদ ও বিভিন্ন স্বাস্থ্যকর রেসিপিতে সহজেই ব্যবহার করা যায়।", "description": "গোল্ডেন গ্রেইন চিয়া সিড (Golden Grain Chia Seed) উচ্চমানের নির্বাচিত চিয়া বীজ থেকে প্রস্তুত একটি প্রিমিয়াম সুপারফুড। এটি প্রতিদিনের খাদ্যতালিকায় সহজেই অন্তর্ভুক্ত করা যায় এবং ওটস, দই, স্মুদি, সালাদ, জুস, পুডিং ও বিভিন্ন স্বাস্থ্যকর রেসিপিতে ব্যবহার করা যায়। পানিতে ভিজিয়ে খাওয়া বা বিভিন্ন খাবারের সঙ্গে মিশিয়ে উপভোগ করার জন্য এটি একটি জনপ্রিয় খাদ্য উপাদান।\nবৈশিষ্ট্য\n\nনির্বাচিত প্রিমিয়াম মানের চিয়া বীজ\nপ্রাকৃতিক ও বিশুদ্ধ সুপারফুড\nওটস, দই, স্মুদি ও সালাদের জন্য উপযোগী\nপুডিং, জুস ও বিভিন্ন স্বাস্থ্যকর রেসিপিতে ব্যবহারযোগ্য\nসহজে খাদ্যতালিকায় অন্তর্ভুক্ত করা যায়\nমচমচে টেক্সচার ও প্রাকৃতিক স্বাদ\nস্বাস্থ্যসম্মত ও নিরাপদ প্যাকেজিং\nপরিবারের দৈনন্দিন ব্যবহারের জন্য উপযুক্ত\n\nব্যবহারের উপায়\n\n১৫–২০ মিনিট পানিতে ভিজিয়ে খেতে পারেন।\nওটস, দই বা সিরিয়ালের সঙ্গে মিশিয়ে খান।\nস্মুদি, জুস বা শেকে যোগ করুন।\nসালাদ ও বিভিন্ন ডেজার্টের টপিং হিসেবে ব্যবহার করুন।\nচিয়া পুডিং বা অন্যান্য স্বাস্থ্যকর রেসিপিতে ব্যবহার করুন।\n\nসংরক্ষণ নির্দেশনা\n\nঠান্ডা ও শুষ্ক স্থানে সংরক্ষণ করুন।\nসরাসরি সূর্যের আলো থেকে দূরে রাখুন।\nব্যবহারের পর প্যাকেট বা বয়ামের মুখ ভালোভাবে বন্ধ রাখুন।\nদীর্ঘদিন সতেজ রাখতে বায়ুরোধী পাত্রে সংরক্ষণ করুন।\n\n\nদ্রষ্টব্য: চিয়া সিড একটি প্রাকৃতিক খাদ্যপণ্য। তাই বীজের আকার, রঙ বা টেক্সচারে সামান্য পার্থক্য থাকা স্বাভাবিক এবং এটি পণ্যের গুণগত মানের ওপর কোনো প্রভাব ফেলে না।"}, {"id": 155, "name": "শান বিরিয়ানি মসলা", "slug": "%e0%a6%b6%e0%a6%be%e0%a6%a8-%e0%a6%ac%e0%a6%bf%e0%a6%b0%e0%a6%bf%e0%a6%af%e0%a6%bc%e0%a6%be%e0%a6%a8%e0%a6%bf-%e0%a6%ae%e0%a6%b8%e0%a6%b2%e0%a6%be", "price": 280, "regular_price": 320, "on_sale": true, "discount_percent": 12, "categories": ["মসলা"], "category_slugs": ["spices"], "images": ["assets/images/shan-biryani-masala-50-gm.webp"], "thumbnail": "assets/images/shan-biryani-masala-50-gm.webp", "rating": 0.0, "review_count": 12, "in_stock": true, "short_description": "শান বিরিয়ানি মসলা (Shan Biryani Masala) নির্বাচিত মসলার নিখুঁত সংমিশ্রণে তৈরি একটি প্রিমিয়াম মসলা। সুগন্ধি ও সুস্বাদু বিরিয়ানি সহজেই প্রস্তুত করতে এটি একটি আদর্শ পছন্দ।", "description": "শান বিরিয়ানি মসলা (Shan Biryani Masala) উন্নত মানের নির্বাচিত মসলার সমন্বয়ে প্রস্তুত একটি প্রিমিয়াম মসলা মিক্স। এটি বিরিয়ানিতে সমৃদ্ধ স্বাদ, মনোমুগ্ধকর সুবাস এবং আকর্ষণীয় রং এনে দেয়। গরু, খাসি, মুরগি বা সবজি বিরিয়ানি তৈরিতে এটি সমানভাবে উপযোগী। ঘরে রেস্টুরেন্টের মতো সুস্বাদু বিরিয়ানি রান্না করতে শান বিরিয়ানি মসলা হতে পারে আপনার নির্ভরযোগ্য সঙ্গী।\nবৈশিষ্ট্য\n\nনির্বাচিত প্রিমিয়াম মানের মসলার সংমিশ্রণ\nবিরিয়ানির জন্য বিশেষভাবে প্রস্তুত\nসমৃদ্ধ স্বাদ ও মনোমুগ্ধকর সুবাস\nগরু, খাসি, মুরগি ও সবজি বিরিয়ানির জন্য উপযোগী\nঘরে সহজেই সুস্বাদু বিরিয়ানি রান্না করা যায়\nব্যবহার সহজ ও ঝামেলামুক্ত\nস্বাস্থ্যসম্মত ও নিরাপদ প্যাকেজিং\nদৈনন্দিন ও বিশেষ অনুষ্ঠানের রান্নার জন্য উপযুক্ত\n\nব্যবহারের উপায়\n\nপ্যাকেটের নির্দেশনা অনুযায়ী পরিমাণমতো মসলা ব্যবহার করুন।\nমাংস বা সবজির সঙ্গে ভালোভাবে মিশিয়ে রান্না করুন।\nচাল, মাংস ও অন্যান্য উপকরণের সঙ্গে ধাপে ধাপে ব্যবহার করুন।\nরান্না শেষে কিছুক্ষণ দমে রেখে পরিবেশন করুন।\nসালাদ, রায়তা বা বোরহানির সঙ্গে পরিবেশন করলে আরও সুস্বাদু লাগে।\n\nসংরক্ষণ নির্দেশনা\n\nঠান্ডা ও শুষ্ক স্থানে সংরক্ষণ করুন।\nসরাসরি সূর্যের আলো থেকে দূরে রাখুন।\nপ্যাকেট খোলার পর মুখ ভালোভাবে বন্ধ রাখুন।\nদীর্ঘদিন সতেজ রাখতে বায়ুরোধী পাত্রে সংরক্ষণ করুন।\n\n\nদ্রষ্টব্য: মসলা একটি প্রাকৃতিক খাদ্যপণ্য। কাঁচামালের বৈশিষ্ট্যের কারণে রং, ঘ্রাণ বা স্বাদে সামান্য পরিবর্তন হতে পারে, যা স্বাভাবিক এবং পণ্যের গুণগত মানের ওপর কোনো প্রভাব ফেলে না।"}, {"id": 150, "name": "কাজী অ্যান্ড কাজী মোরিঙ্গা চা", "slug": "%e0%a6%95%e0%a6%be%e0%a6%9c%e0%a7%80-%e0%a6%85%e0%a7%8d%e0%a6%af%e0%a6%be%e0%a6%a8%e0%a7%8d%e0%a6%a1-%e0%a6%95%e0%a6%be%e0%a6%9c%e0%a7%80-%e0%a6%ae%e0%a7%8b%e0%a6%b0%e0%a6%bf%e0%a6%99%e0%a7%8d", "price": 649, "regular_price": 699, "on_sale": true, "discount_percent": 7, "categories": ["ভেষজ"], "category_slugs": ["herbs"], "images": ["assets/images/kazi-kazi-organic-moringa-herbal-infusion-tea-25-pcs-375-gm.webp"], "thumbnail": "assets/images/kazi-kazi-organic-moringa-herbal-infusion-tea-25-pcs-375-gm.webp", "rating": 0.0, "review_count": 12, "in_stock": true, "short_description": "কাজী অ্যান্ড কাজী অর্গানিক মোরিঙ্গা হারবাল ইনফিউশন টি (২৫ পিস) নির্বাচিত অর্গানিক মোরিঙ্গা পাতার তৈরি ক্যাফেইন-মুক্ত হারবাল চা। প্রাকৃতিক স্বাদ ও মনোরম সুবাসের এই চা প্রতিদিনের চা-পানের জন্য একটি দারুণ পছন্দ।", "description": "কাজী অ্যান্ড কাজী অর্গানিক মোরিঙ্গা হারবাল ইনফিউশন টি (Kazi &amp; Kazi Organic Moringa Herbal Infusion Tea 25 pcs) উন্নত মানের অর্গানিক মোরিঙ্গা পাতা দিয়ে প্রস্তুত একটি প্রিমিয়াম হারবাল চা। প্রতিটি প্যাকে ২৫টি টি-ব্যাগ রয়েছে, যা প্রতিদিন সহজেই এক কাপ সতেজ ও সুস্বাদু হারবাল চা উপভোগ করার সুযোগ দেয়। এটি ক্যাফেইন-মুক্ত হওয়ায় দিনের যেকোনো সময় পান করা যায়।\nবৈশিষ্ট্য\n\nনির্বাচিত অর্গানিক মোরিঙ্গা পাতা দিয়ে প্রস্তুত\n২৫টি পৃথক টি-ব্যাগ সমৃদ্ধ প্যাক\nক্যাফেইন-মুক্ত হারবাল ইনফিউশন\nপ্রাকৃতিক স্বাদ ও মনোরম সুবাস\nদৈনন্দিন চা-পানের জন্য উপযোগী\nগরম পানি দিয়ে সহজেই প্রস্তুত করা যায়\nইচ্ছামতো মধু বা লেবুর সঙ্গে উপভোগ করা যায়\nস্বাস্থ্যসম্মত ও নিরাপদ প্যাকেজিং\n\nপ্রস্তুত প্রণালী\n\nএকটি কাপে ১টি টি-ব্যাগ নিন।\nগরম পানি ঢেলে ৩–৫ মিনিট ভিজিয়ে রাখুন।\nপছন্দ অনুযায়ী মধু বা লেবু যোগ করতে পারেন।\nগরম গরম পরিবেশন করুন।\n\nসংরক্ষণ নির্দেশনা\n\nঠান্ডা ও শুষ্ক স্থানে সংরক্ষণ করুন।\nসরাসরি সূর্যের আলো থেকে দূরে রাখুন।\nপ্যাকেট ব্যবহারের পর ভালোভাবে বন্ধ রাখুন।\nআর্দ্রতা থেকে দূরে সংরক্ষণ করুন।\n\n\nদ্রষ্টব্য: এটি একটি হারবাল ইনফিউশন চা। এর স্বাদ, রঙ ও সুবাস ব্যবহৃত প্রাকৃতিক মোরিঙ্গা পাতার বৈশিষ্ট্যের কারণে সামান্য ভিন্ন হতে পারে, যা সম্পূর্ণ স্বাভাবিক।"}, {"id": 145, "name": "কেডি হারবাল টি", "slug": "%e0%a6%95%e0%a7%87%e0%a6%a1%e0%a6%bf-%e0%a6%b9%e0%a6%be%e0%a6%b0%e0%a6%ac%e0%a6%be%e0%a6%b2-%e0%a6%9f%e0%a6%bf", "price": 1370, "regular_price": 1420, "on_sale": true, "discount_percent": 4, "categories": ["ভেষজ"], "category_slugs": ["herbs"], "images": ["assets/images/kd-herbal-tea-100-gm.webp"], "thumbnail": "assets/images/kd-herbal-tea-100-gm.webp", "rating": 0.0, "review_count": 12, "in_stock": true, "short_description": "কেডি হারবাল টি (KD Herbal Tea) প্রাকৃতিক ভেষজ উপাদান দিয়ে প্রস্তুত একটি সুগন্ধি হারবাল চা। প্রতিদিনের চা-পানের অভিজ্ঞতায় প্রাকৃতিক স্বাদ ও সতেজতার ছোঁয়া আনতে এটি একটি দারুণ পছন্দ।", "description": "কেডি হারবাল টি (KD Herbal Tea) নির্বাচিত প্রাকৃতিক ভেষজ উপাদান দিয়ে প্রস্তুত একটি প্রিমিয়াম মানের হারবাল চা। এর মনোরম সুবাস, প্রাকৃতিক স্বাদ এবং আরামদায়ক চা-পানের অভিজ্ঞতা একে দৈনন্দিন ব্যবহারের জন্য উপযুক্ত করে তুলেছে। সকালের শুরু, বিকেলের আড্ডা কিংবা দিনের যেকোনো সময় এক কাপ হারবাল চা আপনাকে এনে দিতে পারে প্রশান্তির অনুভূতি। এটি গরম পানি দিয়ে সহজেই প্রস্তুত করা যায় এবং ইচ্ছামতো মধু বা লেবুর সঙ্গে উপভোগ করা যায়।\nবৈশিষ্ট্য\n\nনির্বাচিত প্রাকৃতিক ভেষজ উপাদান দিয়ে প্রস্তুত\nপ্রিমিয়াম মানের হারবাল চা\nমনোমুগ্ধকর সুবাস ও প্রাকৃতিক স্বাদ\nপ্রতিদিনের চা-পানের জন্য উপযোগী\nগরম পানি দিয়ে সহজেই প্রস্তুত করা যায়\nমধু বা লেবুর সঙ্গে উপভোগ করা যায়\nস্বাস্থ্যসম্মত ও নিরাপদ প্যাকেজিং\nপরিবারের সকল সদস্যের জন্য উপযোগী\n\nপ্রস্তুত প্রণালী\n\nএক কাপ গরম পানিতে ১টি টি-ব্যাগ বা পরিমাণমতো হারবাল চা দিন।\n৩–৫ মিনিট ঢেকে রাখুন।\nস্বাদ অনুযায়ী মধু বা লেবু যোগ করতে পারেন।\nগরম গরম পরিবেশন করুন।\n\nসংরক্ষণ নির্দেশনা\n\nঠান্ডা ও শুষ্ক স্থানে সংরক্ষণ করুন।\nসরাসরি সূর্যের আলো থেকে দূরে রাখুন।\nপ্যাকেটের মুখ ব্যবহারের পর ভালোভাবে বন্ধ রাখুন।\nআর্দ্রতা থেকে দূরে রাখুন।\n\n\nদ্রষ্টব্য: এটি একটি হারবাল পানীয়। স্বাদ, রঙ ও সুবাস ব্যবহৃত ভেষজ উপাদানের প্রাকৃতিক বৈশিষ্ট্যের কারণে সামান্য ভিন্ন হতে পারে। এটি স্বাভাবিক এবং পণ্যের গুণগত মানের ওপর কোনো প্রভাব ফেলে না।"}, {"id": 140, "name": "টং গার্ডেন সল্টেড আমন্ড", "slug": "%e0%a6%9f%e0%a6%82-%e0%a6%97%e0%a6%be%e0%a6%b0%e0%a7%8d%e0%a6%a1%e0%a7%87%e0%a6%a8-%e0%a6%b8%e0%a6%b2%e0%a7%8d%e0%a6%9f%e0%a7%87%e0%a6%a1-%e0%a6%86%e0%a6%ae%e0%a6%a8%e0%a7%8d%e0%a6%a1", "price": 899, "regular_price": 999, "on_sale": true, "discount_percent": 10, "categories": ["বাদাম"], "category_slugs": ["nuts"], "images": ["assets/images/tong-garden-salted-almonds-35-gm.webp"], "thumbnail": "assets/images/tong-garden-salted-almonds-35-gm.webp", "rating": 0.0, "review_count": 12, "in_stock": true, "short_description": "টং গার্ডেন সল্টেড আমন্ড (Tong Garden Salted Almonds) নির্বাচিত প্রিমিয়াম মানের আমন্ড হালকা লবণ দিয়ে ভাজা একটি সুস্বাদু ও মচমচে স্ন্যাকস। প্রতিদিনের স্বাস্থ্যকর নাস্তা, অফিস, ভ্রমণ কিংবা অতিথি আপ্যায়নের জন্য এটি একটি চমৎকার পছন্দ।", "description": "টং গার্ডেন সল্টেড আমন্ড (Tong Garden Salted Almonds) উচ্চমানের নির্বাচিত আমন্ড থেকে প্রস্তুত করা হয়। প্রতিটি আমন্ডে রয়েছে মচমচে টেক্সচার, হালকা লবণাক্ত স্বাদ এবং প্রিমিয়াম মানের গুণগত বৈশিষ্ট্য। এটি সরাসরি স্ন্যাকস হিসেবে খাওয়ার পাশাপাশি সালাদ, ওটস, দই কিংবা বিভিন্ন ডেজার্টের সঙ্গেও উপভোগ করা যায়। স্বাস্থ্যকর জীবনযাপন পছন্দ করেন এমন মানুষের জন্য এটি একটি জনপ্রিয় খাদ্য।\nবৈশিষ্ট্য\n\nনির্বাচিত প্রিমিয়াম মানের আমন্ড\nহালকা লবণযুক্ত ও মচমচে স্বাদ\nস্বাস্থ্যকর স্ন্যাকস হিসেবে উপযোগী\nঅফিস, ভ্রমণ ও অতিথি আপ্যায়নের জন্য আদর্শ\nসালাদ, ওটস, দই ও সিরিয়ালের সঙ্গে ব্যবহারযোগ্য\nকেক, কুকিজ ও বিভিন্ন ডেজার্টে ব্যবহার করা যায়\nস্বাস্থ্যসম্মত ও নিরাপদ প্যাকেজিং\nপরিবারের সকল সদস্যের জন্য উপযোগী\n\nখাওয়ার উপায়\n\nসরাসরি স্ন্যাকস হিসেবে উপভোগ করুন।\nওটস, দই বা সিরিয়ালের সঙ্গে মিশিয়ে খান।\nসালাদ ও বিভিন্ন ডেজার্টের টপিং হিসেবে ব্যবহার করুন।\nকেক, কুকিজ ও অন্যান্য বেকিং রেসিপিতে ব্যবহার করুন।\nভ্রমণ বা অফিসে সহজে বহনযোগ্য স্বাস্থ্যকর নাস্তা হিসেবে সঙ্গে রাখুন।\n\nসংরক্ষণ নির্দেশনা\n\nঠান্ডা ও শুষ্ক স্থানে সংরক্ষণ করুন।\nসরাসরি সূর্যের আলো থেকে দূরে রাখুন।\nব্যবহারের পর প্যাকেট বা বয়ামের মুখ ভালোভাবে বন্ধ রাখুন।\nদীর্ঘদিন মচমচে রাখতে বায়ুরোধী পাত্রে সংরক্ষণ করুন।\n\n\nদ্রষ্টব্য: এটি একটি প্রক্রিয়াজাত বাদামজাত খাদ্যপণ্য। স্বাদ, রঙ বা আকারে সামান্য পার্থক্য হওয়া স্বাভাবিক এবং এটি পণ্যের গুণগত মানের ওপর কোনো প্রভাব ফেলে না।"}, {"id": 136, "name": "ব্লু ডায়মন্ড হানি রোস্টেড বাদাম", "slug": "%e0%a6%ac%e0%a7%8d%e0%a6%b2%e0%a7%81-%e0%a6%a1%e0%a6%be%e0%a6%af%e0%a6%bc%e0%a6%ae%e0%a6%a8%e0%a7%8d%e0%a6%a1-%e0%a6%b9%e0%a6%be%e0%a6%a8%e0%a6%bf-%e0%a6%b0%e0%a7%8b%e0%a6%b8%e0%a7%8d%e0%a6%9f", "price": 859, "regular_price": 959, "on_sale": true, "discount_percent": 10, "categories": ["বাদাম"], "category_slugs": ["nuts"], "images": ["assets/images/blue-diamond-almonds-honey-roasted-170-gm.webp"], "thumbnail": "assets/images/blue-diamond-almonds-honey-roasted-170-gm.webp", "rating": 0.0, "review_count": 12, "in_stock": true, "short_description": "ব্লু ডায়মন্ড হানি রোস্টেড বাদাম (Blue Diamond Almonds Honey Roasted) মধুর মিষ্টতা ও রোস্টেড বাদামের মচমচে স্বাদের অনন্য সমন্বয়। স্বাস্থ্যকর স্ন্যাকস, ভ্রমণ, অফিস কিংবা অতিথি আপ্যায়নের জন্য এটি একটি চমৎকার পছন্দ।", "description": "ব্লু ডায়মন্ড হানি রোস্টেড বাদাম (Blue Diamond Almonds Honey Roasted) নির্বাচিত প্রিমিয়াম মানের বাদামকে মধুর হালকা মিষ্টতা দিয়ে রোস্ট করে প্রস্তুত করা হয়। প্রতিটি বাদামে রয়েছে মচমচে টেক্সচার, সুস্বাদু স্বাদ এবং মনোমুগ্ধকর সুবাস। এটি প্রতিদিনের স্বাস্থ্যকর নাস্তা, বিকেলের স্ন্যাকস কিংবা ভ্রমণের সময় সহজেই উপভোগ করা যায়। এছাড়াও বিভিন্ন ডেজার্ট, সালাদ ও খাবারের টপিং হিসেবেও এটি ব্যবহার করা যায়।\nবৈশিষ্ট্য\n\nপ্রিমিয়াম মানের হানি রোস্টেড বাদাম\nমধুর হালকা মিষ্টতা ও মচমচে স্বাদ\nনির্বাচিত মানের সম্পূর্ণ বাদাম\nস্বাস্থ্যকর স্ন্যাকস হিসেবে উপযোগী\nঅফিস, ভ্রমণ ও অতিথি আপ্যায়নের জন্য আদর্শ\nসালাদ, দই, ওটস ও ডেজার্টের সঙ্গে ব্যবহারযোগ্য\nস্বাস্থ্যসম্মত ও নিরাপদ প্যাকেজিং\nপরিবারের সকল সদস্যের জন্য উপযোগী\n\nখাওয়ার উপায়\n\nসরাসরি স্ন্যাকস হিসেবে উপভোগ করুন।\nওটস, দই বা সিরিয়ালের সঙ্গে মিশিয়ে খান।\nসালাদ ও বিভিন্ন ডেজার্টের টপিং হিসেবে ব্যবহার করুন।\nকেক, কুকিজ ও অন্যান্য বেকিং রেসিপিতে ব্যবহার করুন।\nভ্রমণ বা অফিসে সহজে বহনযোগ্য স্বাস্থ্যকর নাস্তা হিসেবে রাখুন।\n\nসংরক্ষণ নির্দেশনা\n\nঠান্ডা ও শুষ্ক স্থানে সংরক্ষণ করুন।\nসরাসরি সূর্যের আলো থেকে দূরে রাখুন।\nব্যবহারের পর প্যাকেট বা বয়ামের মুখ ভালোভাবে বন্ধ রাখুন।\nদীর্ঘদিন মচমচে রাখতে বায়ুরোধী পাত্রে সংরক্ষণ করুন।\n\n\nদ্রষ্টব্য: এটি একটি প্রক্রিয়াজাত বাদামজাত খাদ্যপণ্য। স্বাদ, রঙ বা রোস্টের মাত্রায় সামান্য পার্থক্য হওয়া স্বাভাবিক এবং এটি পণ্যের গুণগত মানের ওপর কোনো প্রভাব ফেলে না।"}, {"id": 132, "name": "প্রিমিয়াম কাজু বাদাম", "slug": "%e0%a6%aa%e0%a7%8d%e0%a6%b0%e0%a6%bf%e0%a6%ae%e0%a6%bf%e0%a6%af%e0%a6%bc%e0%a6%be%e0%a6%ae-%e0%a6%95%e0%a6%be%e0%a6%9c%e0%a7%81-%e0%a6%ac%e0%a6%be%e0%a6%a6%e0%a6%be%e0%a6%ae", "price": 359, "regular_price": 379, "on_sale": true, "discount_percent": 5, "categories": ["বাদাম"], "category_slugs": ["nuts"], "images": ["assets/images/cashew-nut-kaju-badam-100-gm.webp"], "thumbnail": "assets/images/cashew-nut-kaju-badam-100-gm.webp", "rating": 0.0, "review_count": 12, "in_stock": true, "short_description": "প্রিমিয়াম কাজু বাদাম (Cashew Nut) সুস্বাদু, মচমচে এবং পুষ্টিগুণে সমৃদ্ধ একটি জনপ্রিয় ড্রাই ফ্রুট। প্রতিদিনের স্বাস্থ্যকর নাস্তা, বিভিন্ন রান্না, ডেজার্ট ও বেকিংয়ের জন্য এটি একটি উৎকৃষ্ট পছন্দ।", "description": "প্রিমিয়াম কাজু বাদাম (Cashew Nut) নির্বাচিত মানের কাজুবাদাম থেকে সংগ্রহ করা হয়, যা এর মচমচে টেক্সচার, হালকা মিষ্টি স্বাদ এবং উৎকৃষ্ট মানের জন্য পরিচিত। এটি প্রতিদিনের খাদ্যতালিকায় সহজেই অন্তর্ভুক্ত করা যায় এবং স্বাস্থ্যকর স্ন্যাকস হিসেবে বেশ জনপ্রিয়। এছাড়া পোলাও, কোরমা, বিরিয়ানি, হালুয়া, কেক, কুকিজ, আইসক্রিম ও বিভিন্ন ডেজার্ট তৈরিতেও এটি ব্যাপকভাবে ব্যবহৃত হয়।\nবৈশিষ্ট্য\n\nনির্বাচিত মানের প্রিমিয়াম কাজু বাদাম\nমচমচে ও সুস্বাদু স্বাদ\nপ্রাকৃতিকভাবে পুষ্টিগুণে সমৃদ্ধ\nস্বাস্থ্যকর স্ন্যাকস হিসেবে উপযোগী\nপোলাও, বিরিয়ানি ও কোরমায় ব্যবহারযোগ্য\nকেক, কুকিজ, পায়েস ও বিভিন্ন ডেজার্ট তৈরিতে আদর্শ\nস্বাস্থ্যসম্মত ও নিরাপদ প্যাকেজিং\nপরিবারের দৈনন্দিন ব্যবহারের জন্য উপযুক্ত\n\nখাওয়ার উপায়\n\nসরাসরি স্বাস্থ্যকর স্ন্যাকস হিসেবে।\nসালাদ, ওটস ও দইয়ের সঙ্গে।\nপোলাও, বিরিয়ানি ও বিভিন্ন রান্নায়।\nকেক, কুকিজ, পুডিং ও আইসক্রিমে।\nস্মুদি, মিল্কশেক ও ড্রাই ফ্রুট মিক্সে।\n\nসংরক্ষণ নির্দেশনা\n\nঠান্ডা ও শুষ্ক স্থানে সংরক্ষণ করুন।\nসরাসরি সূর্যের আলো থেকে দূরে রাখুন।\nব্যবহারের পর প্যাকেট বা বয়ামের মুখ ভালোভাবে বন্ধ রাখুন।\nদীর্ঘদিন সতেজ রাখতে বায়ুরোধী পাত্রে সংরক্ষণ করুন।\n\n\nদ্রষ্টব্য: কাজু বাদাম একটি প্রাকৃতিক খাদ্যপণ্য। তাই আকার, রঙ বা স্বাদে সামান্য পার্থক্য থাকা স্বাভাবিক এবং এটি পণ্যের গুণগত মানের ওপর কোনো প্রভাব ফেলে না।"}, {"id": 128, "name": "লাফজ আলফা সিরাম", "slug": "%e0%a6%b2%e0%a6%be%e0%a6%ab%e0%a6%9c-%e0%a6%86%e0%a6%b2%e0%a6%ab%e0%a6%be-%e0%a6%86%e0%a6%b0%e0%a6%ac%e0%a7%81%e0%a6%9f%e0%a6%bf%e0%a6%a8-%e0%a6%b8%e0%a6%bf%e0%a6%b0%e0%a6%be%e0%a6%ae", "price": 1549, "regular_price": 1599, "on_sale": true, "discount_percent": 3, "categories": ["তেল"], "category_slugs": ["oil"], "images": ["assets/images/lafz-luminous-skin-face-serum-alpha-arbutin-30-ml.webp"], "thumbnail": "assets/images/lafz-luminous-skin-face-serum-alpha-arbutin-30-ml.webp", "rating": 0.0, "review_count": 12, "in_stock": true, "short_description": "লাফজ লুমিনাস স্কিন ফেস সিরাম আলফা আরবুটিন (Lafz Luminous Skin Face Serum Alpha Arbutin) ত্বকের নিয়মিত পরিচর্যার জন্য তৈরি একটি হালকা ও দ্রুত শোষণযোগ্য ফেস সিরাম। এটি ত্বককে মসৃণ, উজ্জ্বল ও সতেজ রাখতে দৈনন্দিন স্কিনকেয়ার রুটিনে ব্যবহার করা যায়।", "description": "লাফজ লুমিনাস স্কিন ফেস সিরাম আলফা আরবুটিন (Lafz Luminous Skin Face Serum Alpha Arbutin) আধুনিক স্কিনকেয়ার রুটিনের জন্য উপযোগী একটি প্রিমিয়াম ফেস সিরাম। এর হালকা টেক্সচার ত্বকে দ্রুত শোষিত হয় এবং ত্বককে কোমল ও সতেজ অনুভূতি দেয়। প্রতিদিনের ব্যবহারে এটি ত্বকের যত্নে সহায়ক এবং অন্যান্য স্কিনকেয়ার পণ্যের সঙ্গে সহজেই ব্যবহার করা যায়।\nবৈশিষ্ট্য\n\nআলফা আরবুটিন সমৃদ্ধ ফেস সিরাম\nহালকা ও দ্রুত শোষণযোগ্য ফর্মুলা\nত্বককে মসৃণ ও কোমল রাখতে সহায়ক\nত্বককে উজ্জ্বল ও সতেজ দেখাতে সহায়ক\nদৈনন্দিন স্কিনকেয়ার রুটিনের জন্য উপযোগী\nসব ধরনের ত্বকের জন্য ব্যবহারযোগ্য\nনন-স্টিকি ও আরামদায়ক অনুভূতি\nস্বাস্থ্যসম্মত ও নিরাপদ প্যাকেজিং\n\nব্যবহারের উপায়\n\nমুখ ভালোভাবে পরিষ্কার করে শুকিয়ে নিন।\n২–৩ ফোঁটা সিরাম মুখ ও গলায় লাগান।\nআলতোভাবে ম্যাসাজ করুন যতক্ষণ না সম্পূর্ণ শোষিত হয়।\nএরপর প্রয়োজনে ময়েশ্চারাইজার ব্যবহার করুন।\nদিনের বেলায় ব্যবহার করলে সানস্ক্রিন ব্যবহার করার পরামর্শ দেওয়া হয়।\n\nসংরক্ষণ নির্দেশনা\n\nঠান্ডা ও শুষ্ক স্থানে সংরক্ষণ করুন।\nসরাসরি সূর্যের আলো থেকে দূরে রাখুন।\nব্যবহারের পর বোতলের ঢাকনা ভালোভাবে বন্ধ রাখুন।\nশিশুদের নাগালের বাইরে রাখুন।\n\n\nদ্রষ্টব্য: শুধুমাত্র বাহ্যিক ব্যবহারের জন্য। চোখে লাগলে পরিষ্কার পানি দিয়ে ধুয়ে ফেলুন। প্রথমবার ব্যবহারের আগে ত্বকের ছোট একটি অংশে প্যাচ টেস্ট করে নেওয়া ভালো। কোনো অস্বস্তি বা জ্বালাপোড়া অনুভব হলে ব্যবহার বন্ধ করুন।"}, {"id": 124, "name": "ইয়ো উই সুগন্ধি তিলের তেল", "slug": "%e0%a6%87%e0%a6%af%e0%a6%bc%e0%a7%8b-%e0%a6%89%e0%a6%87-%e0%a6%b8%e0%a7%81%e0%a6%97%e0%a6%a8%e0%a7%8d%e0%a6%a7%e0%a6%bf-%e0%a6%a4%e0%a6%bf%e0%a6%b2%e0%a7%87%e0%a6%b0-%e0%a6%a4%e0%a7%87%e0%a6%b2", "price": 545, "regular_price": 545, "on_sale": false, "discount_percent": 0, "categories": ["তেল"], "category_slugs": ["oil"], "images": ["assets/images/yo-we-fragrance-sesame-oil-630-ml.webp"], "thumbnail": "assets/images/yo-we-fragrance-sesame-oil-630-ml.webp", "rating": 0.0, "review_count": 12, "in_stock": true, "short_description": "ইয়ো উই সুগন্ধি তিলের তেল (YO WE Fragrance Sesame Oil) নির্বাচিত তিল থেকে প্রস্তুত একটি প্রিমিয়াম মানের তেল। এর মনোরম সুগন্ধ ও খাঁটি স্বাদ রান্না, সালাদ, মেরিনেশন এবং বিভিন্ন ঐতিহ্যবাহী খাবারে বিশেষ স্বাদ যোগ করে।", "description": "ইয়ো উই সুগন্ধি তিলের তেল (YO WE Fragrance Sesame Oil) উন্নত মানের তিল থেকে প্রস্তুত একটি প্রিমিয়াম তেল। এর প্রাকৃতিক সুবাস ও সমৃদ্ধ স্বাদের কারণে এটি বিভিন্ন দেশীয় ও আন্তর্জাতিক রান্নায় বহুল ব্যবহৃত হয়। সালাদ ড্রেসিং, নুডলস, সবজি, মাংস, মাছ এবং বিভিন্ন খাবারে এটি সহজেই ব্যবহার করা যায়। পাশাপাশি মেরিনেশন ও রান্নার শেষ পর্যায়ে ব্যবহার করলে খাবারের স্বাদ ও ঘ্রাণ আরও বৃদ্ধি পায়।\nবৈশিষ্ট্য\n\nনির্বাচিত তিল থেকে প্রস্তুত\nপ্রাকৃতিক সুগন্ধ ও সমৃদ্ধ স্বাদ\nপ্রিমিয়াম মানের তিলের তেল\nসালাদ, নুডলস ও বিভিন্ন রান্নায় উপযোগী\nমাংস, মাছ ও সবজি রান্নায় ব্যবহারযোগ্য\nমেরিনেশন ও ফিনিশিং অয়েল হিসেবে ব্যবহার করা যায়\nস্বাস্থ্যসম্মত ও নিরাপদ প্যাকেজিং\nদৈনন্দিন ব্যবহারের জন্য উপযুক্ত\n\nব্যবহারের উপায়\n\nসালাদ ড্রেসিংয়ে ব্যবহার করুন।\nনুডলস, ভাজি ও স্টির-ফ্রাই রান্নায় যোগ করুন।\nমাছ, মাংস ও সবজি মেরিনেট করতে ব্যবহার করুন।\nরান্নার শেষে কয়েক ফোঁটা তেল যোগ করে স্বাদ ও সুবাস বাড়ান।\nবিভিন্ন দেশীয় ও আন্তর্জাতিক রেসিপিতে ব্যবহার করুন।\n\nসংরক্ষণ নির্দেশনা\n\nঠান্ডা ও শুষ্ক স্থানে সংরক্ষণ করুন।\nসরাসরি সূর্যের আলো থেকে দূরে রাখুন।\nব্যবহারের পর বোতলের ঢাকনা ভালোভাবে বন্ধ রাখুন।\nআগুন বা অতিরিক্ত তাপের উৎস থেকে দূরে রাখুন।\n\n\nদ্রষ্টব্য: তাপমাত্রার পরিবর্তনের কারণে তেলের রঙ বা ঘনত্বে সামান্য পরিবর্তন হতে পারে। এটি স্বাভাবিক এবং পণ্যের গুণগত মানের ওপর কোনো প্রভাব ফেলে না।"}, {"id": 119, "name": "মায়া ট্রু হার্বস মারুলা অয়েল", "slug": "%e0%a6%ae%e0%a6%be%e0%a6%af%e0%a6%bc%e0%a6%be-%e0%a6%9f%e0%a7%8d%e0%a6%b0%e0%a7%81-%e0%a6%b9%e0%a6%be%e0%a6%b0%e0%a7%8d%e0%a6%ac%e0%a6%b8-%e0%a6%ae%e0%a6%be%e0%a6%b0%e0%a7%81%e0%a6%b2%e0%a6%be", "price": 1250, "regular_price": 1250, "on_sale": false, "discount_percent": 0, "categories": ["তেল"], "category_slugs": ["oil"], "images": ["assets/images/maya-true-herbs-marula-oil-30-ml.webp"], "thumbnail": "assets/images/maya-true-herbs-marula-oil-30-ml.webp", "rating": 0.0, "review_count": 12, "in_stock": true, "short_description": "মায়া ট্রু হার্বস মারুলা অয়েল (Maya True Herbs Marula Oil) প্রিমিয়াম মানের মারুলা ফলের বীজ থেকে প্রস্তুত একটি হালকা ও পুষ্টিকর তেল। ত্বক ও চুলের নিয়মিত পরিচর্যায় এটি ব্যবহার করা যায় এবং ত্বককে কোমল ও মসৃণ অনুভূতি দিতে সহায়ক।", "description": "মায়া ট্রু হার্বস মারুলা অয়েল (Maya True Herbs Marula Oil) উন্নত মানের মারুলা ফলের বীজ থেকে প্রস্তুত একটি প্রিমিয়াম বিউটি অয়েল। এর হালকা টেক্সচার ত্বকে সহজেই শোষিত হয় এবং ত্বক ও চুলের নিয়মিত পরিচর্যায় আরামদায়ক অনুভূতি প্রদান করে। এটি দৈনন্দিন স্কিনকেয়ার ও হেয়ার কেয়ার রুটিনে সহজেই ব্যবহার করা যায়। পাশাপাশি ম্যাসাজ এবং অন্যান্য কসমেটিক ব্যবহারের জন্যও উপযোগী।\nবৈশিষ্ট্য\n\nউন্নত মানের মারুলা বীজ থেকে প্রস্তুত\nহালকা ও সহজে শোষণযোগ্য\nত্বক ও চুলের নিয়মিত পরিচর্যায় উপযোগী\nত্বককে কোমল ও মসৃণ অনুভূতি দিতে সহায়ক\nচুলের উজ্জ্বলতা ও কোমলতা বজায় রাখতে ব্যবহারযোগ্য\nম্যাসাজ ও দৈনন্দিন বিউটি কেয়ারের জন্য উপযোগী\nস্বাস্থ্যসম্মত ও নিরাপদ প্যাকেজিং\nপ্রতিদিনের ব্যবহারের জন্য উপযুক্ত\n\nব্যবহারের উপায়\n\nপরিষ্কার ত্বকে কয়েক ফোঁটা তেল আলতোভাবে ম্যাসাজ করুন।\nচুলের গোড়া ও আগায় প্রয়োজনমতো ব্যবহার করুন।\nফেস অয়েল বা বডি অয়েল হিসেবে ব্যবহার করা যায়।\nঅন্যান্য স্কিনকেয়ার বা হেয়ার কেয়ার পণ্যের সঙ্গে মিশিয়ে ব্যবহার করা যায়।\nব্যবহারের আগে ত্বকের ছোট অংশে পরীক্ষা করে নেওয়া ভালো।\n\nসংরক্ষণ নির্দেশনা\n\nঠান্ডা ও শুষ্ক স্থানে সংরক্ষণ করুন।\nসরাসরি সূর্যের আলো থেকে দূরে রাখুন।\nব্যবহারের পর বোতলের ঢাকনা ভালোভাবে বন্ধ রাখুন।\nশিশুদের নাগালের বাইরে রাখুন।\n\n\nদ্রষ্টব্য: এটি বাহ্যিক ব্যবহারের জন্য উপযোগী একটি কসমেটিক অয়েল। চোখ বা সংবেদনশীল স্থানে ব্যবহার এড়িয়ে চলুন। কোনো ধরনের অস্বস্তি বা অ্যালার্জির লক্ষণ দেখা দিলে ব্যবহার বন্ধ করে প্রয়োজনে বিশেষজ্ঞের পরামর্শ নিন।"}, {"id": 115, "name": "ফার্মার্স গোল্ড ফ্ল্যাক্সসিড অয়েল", "slug": "%e0%a6%ab%e0%a6%be%e0%a6%b0%e0%a7%8d%e0%a6%ae%e0%a6%be%e0%a6%b0%e0%a7%8d%e0%a6%b8-%e0%a6%97%e0%a7%8b%e0%a6%b2%e0%a7%8d%e0%a6%a1-%e0%a6%ab%e0%a7%8d%e0%a6%b2%e0%a7%8d%e0%a6%af%e0%a6%be%e0%a6%95%e0%a7%8d", "price": 165, "regular_price": 165, "on_sale": false, "discount_percent": 0, "categories": ["তেল"], "category_slugs": ["oil"], "images": ["assets/images/farmers-gold-flaxseed-oil-100-ml.webp"], "thumbnail": "assets/images/farmers-gold-flaxseed-oil-100-ml.webp", "rating": 0.0, "review_count": 12, "in_stock": true, "short_description": "ফার্মার্স গোল্ড ফ্ল্যাক্সসিড অয়েল (Farmer&#8217;s Gold Flaxseed Oil) উন্নত মানের তিসি বীজ (Flaxseed) থেকে প্রস্তুত একটি প্রিমিয়াম ভোজ্য তেল। সালাদ, স্মুদি, বিভিন্ন স্বাস্থ্যকর খাবার এবং দৈনন্দিন খাদ্যাভ্যাসে এটি সহজেই ব্যবহার করা যায়।", "description": "ফার্মার্স গোল্ড ফ্ল্যাক্সসিড অয়েল (Farmer&#8217;s Gold Flaxseed Oil) নির্বাচিত মানসম্পন্ন তিসি বীজ (Flaxseed) থেকে প্রস্তুত করা হয়। এর প্রাকৃতিক স্বাদ, হালকা সুবাস এবং উন্নত মানের কারণে এটি স্বাস্থ্যসচেতন মানুষের কাছে জনপ্রিয়। সালাদ ড্রেসিং, স্মুদি, দই, ওটস এবং অন্যান্য স্বাস্থ্যকর খাবারের সঙ্গে সহজেই ব্যবহার করা যায়। প্রতিদিনের খাদ্যতালিকায় এটি একটি উৎকৃষ্ট সংযোজন হতে পারে।\nবৈশিষ্ট্য\n\nনির্বাচিত মানের তিসি বীজ (Flaxseed) থেকে প্রস্তুত\nপ্রিমিয়াম মানের ভোজ্য তেল\nপ্রাকৃতিক স্বাদ ও হালকা সুবাস\nসালাদ, স্মুদি ও স্বাস্থ্যকর খাবারের জন্য উপযোগী\nওটস, দই ও সিরিয়ালের সঙ্গে ব্যবহার করা যায়\nদৈনন্দিন খাদ্যাভ্যাসে সহজে অন্তর্ভুক্ত করা যায়\nস্বাস্থ্যসম্মত ও নিরাপদ প্যাকেজিং\nপরিবারের নিয়মিত ব্যবহারের জন্য উপযুক্ত\n\nব্যবহারের উপায়\n\nসালাদ ড্রেসিং হিসেবে ব্যবহার করুন।\nস্মুদি বা জুসের সঙ্গে মিশিয়ে পান করুন।\nওটস, দই বা সিরিয়ালের সঙ্গে ব্যবহার করুন।\nবিভিন্ন স্বাস্থ্যকর রেসিপিতে যোগ করুন।\nপণ্যের লেবেলে উল্লেখিত নির্দেশনা অনুযায়ী ব্যবহার করুন।\n\nসংরক্ষণ নির্দেশনা\n\nঠান্ডা ও শুষ্ক স্থানে সংরক্ষণ করুন।\nসরাসরি সূর্যের আলো থেকে দূরে রাখুন।\nব্যবহারের পর বোতলের ঢাকনা ভালোভাবে বন্ধ রাখুন।\nদীর্ঘদিন ভালো রাখতে খোলার পর রেফ্রিজারেটরে সংরক্ষণ করা যেতে পারে (যদি পণ্যের নির্দেশনায় উল্লেখ থাকে)।\n\n\nদ্রষ্টব্য: তাপমাত্রার পরিবর্তনের কারণে তেলের রঙ বা ঘনত্বে সামান্য পরিবর্তন হতে পারে। এটি স্বাভাবিক এবং পণ্যের গুণগত মানের ওপর কোনো প্রভাব ফেলে না।"}, {"id": 111, "name": "কেডি নেচারস রোজ অয়েল", "slug": "%e0%a6%95%e0%a7%87%e0%a6%a1%e0%a6%bf-%e0%a6%a8%e0%a7%87%e0%a6%9a%e0%a6%be%e0%a6%b0%e0%a6%b8-%e0%a6%b0%e0%a7%8b%e0%a6%9c-%e0%a6%85%e0%a6%af%e0%a6%bc%e0%a7%87%e0%a6%b2", "price": 280, "regular_price": 280, "on_sale": false, "discount_percent": 0, "categories": ["তেল"], "category_slugs": ["oil"], "images": ["assets/images/kd-natures-aid-rose-oil-50-ml.webp"], "thumbnail": "assets/images/kd-natures-aid-rose-oil-50-ml.webp", "rating": 0.0, "review_count": 12, "in_stock": true, "short_description": "কেডি নেচারস এইড রোজ অয়েল (KD Natures Aid Rose Oil) প্রাকৃতিক গোলাপের নির্যাস থেকে প্রস্তুত একটি প্রিমিয়াম মানের তেল। ত্বক ও চুলের নিয়মিত পরিচর্যার পাশাপাশি অ্যারোমাথেরাপি ও ম্যাসাজের জন্যও এটি ব্যবহার করা যায়।", "description": "কেডি নেচারস এইড রোজ অয়েল (KD Natures Aid Rose Oil) প্রাকৃতিক গোলাপের নির্যাস থেকে প্রস্তুত একটি উচ্চমানের তেল। এর মনোমুগ্ধকর গোলাপের সুবাস এবং মসৃণ টেক্সচার ত্বক ও চুলের যত্নে আরামদায়ক অনুভূতি এনে দেয়। দৈনন্দিন স্কিনকেয়ার, হেয়ার কেয়ার, ম্যাসাজ এবং অ্যারোমাথেরাপিতে এটি সহজেই ব্যবহার করা যায়। পাশাপাশি বিভিন্ন এসেনশিয়াল অয়েলের সঙ্গে মিশিয়েও ব্যবহার করা যায়।\nবৈশিষ্ট্য\n\nপ্রাকৃতিক গোলাপের নির্যাস থেকে প্রস্তুত\nমনোমুগ্ধকর গোলাপের সুবাস\nত্বক ও চুলের নিয়মিত পরিচর্যায় উপযোগী\nম্যাসাজ ও অ্যারোমাথেরাপির জন্য ব্যবহারযোগ্য\nহালকা ও সহজে শোষণযোগ্য\nদৈনন্দিন ব্যবহারের জন্য উপযোগী\nস্বাস্থ্যসম্মত ও নিরাপদ প্যাকেজিং\nপ্রিমিয়াম মানের কসমেটিক অয়েল\n\nব্যবহারের উপায়\n\nত্বকে প্রয়োজনমতো অল্প পরিমাণে ব্যবহার করুন।\nচুলের পরিচর্যায় অন্যান্য তেলের সঙ্গে মিশিয়ে ব্যবহার করতে পারেন।\nম্যাসাজের জন্য ক্যারিয়ার অয়েলের সঙ্গে মিশিয়ে ব্যবহার করুন।\nঅ্যারোমাথেরাপি বা ডিফিউজারে নির্দেশনা অনুযায়ী ব্যবহার করুন।\nব্যবহারের আগে ত্বকের ছোট অংশে পরীক্ষা করে নেওয়া ভালো।\n\nসংরক্ষণ নির্দেশনা\n\nঠান্ডা ও শুষ্ক স্থানে সংরক্ষণ করুন।\nসরাসরি সূর্যের আলো থেকে দূরে রাখুন।\nব্যবহারের পর বোতলের ঢাকনা ভালোভাবে বন্ধ রাখুন।\nশিশুদের নাগালের বাইরে রাখুন।\n\n\nদ্রষ্টব্য: এটি বাহ্যিক ব্যবহারের জন্য উপযোগী একটি কসমেটিক অয়েল। চোখ, মুখ বা সংবেদনশীল স্থানে ব্যবহার থেকে বিরত থাকুন। কোনো ধরনের অস্বস্তি বা জ্বালাপোড়া অনুভব হলে ব্যবহার বন্ধ করুন।"}, {"id": 106, "name": "রাঁধুনি বিশুদ্ধ সরিষার তেল", "slug": "%e0%a6%b0%e0%a6%be%e0%a6%81%e0%a6%a7%e0%a7%81%e0%a6%a8%e0%a6%bf-%e0%a6%ac%e0%a6%bf%e0%a6%b6%e0%a7%81%e0%a6%a6%e0%a7%8d%e0%a6%a7-%e0%a6%b8%e0%a6%b0%e0%a6%bf%e0%a6%b7%e0%a6%be%e0%a6%b0-%e0%a6%a4", "price": 99, "regular_price": 99, "on_sale": false, "discount_percent": 0, "categories": ["তেল"], "category_slugs": ["oil"], "images": ["assets/images/radhuni-pure-mustard-oil-500-ml.webp"], "thumbnail": "assets/images/radhuni-pure-mustard-oil-500-ml.webp", "rating": 0.0, "review_count": 12, "in_stock": true, "short_description": "রাঁধুনি বিশুদ্ধ সরিষার তেল উৎকৃষ্ট মানের সরিষা থেকে প্রস্তুত একটি প্রিমিয়াম ভোজ্য তেল। এর প্রাকৃতিক ঝাঁজ, সমৃদ্ধ ঘ্রাণ ও খাঁটি স্বাদ প্রতিদিনের রান্নাকে করে তোলে আরও সুস্বাদু।", "description": "রাঁধুনি বিশুদ্ধ সরিষার তেল (Radhuni Pure Mustard Oil) উন্নত মানের সরিষা থেকে প্রস্তুত করা হয়, যাতে এর প্রাকৃতিক স্বাদ, ঝাঁজ এবং সুগন্ধ অক্ষুণ্ণ থাকে। এটি বাংলাদেশের ঐতিহ্যবাহী রান্নায় বহুল ব্যবহৃত একটি ভোজ্য তেল। মাছ, মাংস, সবজি, ভর্তা, ডাল এবং বিভিন্ন ভাজাপোড়া রান্নায় এর ব্যবহার খাবারের স্বাদকে আরও সমৃদ্ধ করে।\nবৈশিষ্ট্য\n\nউন্নত মানের সরিষা থেকে প্রস্তুত\nপ্রিমিয়াম মানের বিশুদ্ধ সরিষার তেল\nপ্রাকৃতিক ঝাঁজ ও মনোমুগ্ধকর সুবাস\nরান্নায় খাঁটি স্বাদ বজায় রাখতে সহায়ক\nমাছ, মাংস, সবজি ও ভর্তার জন্য উপযোগী\nভাজা, রান্না ও মেরিনেশনে ব্যবহারযোগ্য\nস্বাস্থ্যসম্মত ও নিরাপদ প্যাকেজিং\nপরিবারের দৈনন্দিন ব্যবহারের জন্য উপযুক্ত\n\nব্যবহারের উপায়\n\nমাছ, মাংস ও সবজি রান্নায় ব্যবহার করুন।\nভর্তা তৈরিতে কাঁচা সরিষার তেল হিসেবে ব্যবহার করুন।\nআচার ও সালাদ ড্রেসিংয়ে ব্যবহার করা যায়।\nভাজাপোড়া ও বিভিন্ন ঐতিহ্যবাহী রান্নায় ব্যবহার করুন।\nমাংস বা মাছ মেরিনেট করতেও ব্যবহার করা যায়।\n\nসংরক্ষণ নির্দেশনা\n\nঠান্ডা ও শুষ্ক স্থানে সংরক্ষণ করুন।\nসরাসরি সূর্যের আলো থেকে দূরে রাখুন।\nব্যবহারের পর বোতলের ঢাকনা ভালোভাবে বন্ধ রাখুন।\nআগুন বা অতিরিক্ত তাপের উৎস থেকে দূরে রাখুন।\n\n\nদ্রষ্টব্য: তাপমাত্রার পরিবর্তনের কারণে তেলের রঙ বা ঘনত্বে সামান্য পরিবর্তন হতে পারে। এটি স্বাভাবিক এবং পণ্যের গুণগত মানের ওপর কোনো প্রভাব ফেলে না।"}, {"id": 101, "name": "ফ্রেশ ফোর্টিফাইড সয়াবিন তেল", "slug": "%e0%a6%ab%e0%a7%8d%e0%a6%b0%e0%a7%87%e0%a6%b6-%e0%a6%ab%e0%a7%8b%e0%a6%b0%e0%a7%8d%e0%a6%9f%e0%a6%bf%e0%a6%ab%e0%a6%be%e0%a6%87%e0%a6%a1-%e0%a6%b8%e0%a6%af%e0%a6%bc%e0%a6%be%e0%a6%ac%e0%a6%bf%e0%a6%a8", "price": 199, "regular_price": 199, "on_sale": false, "discount_percent": 0, "categories": ["তেল"], "category_slugs": ["oil"], "images": ["assets/images/fresh-fortified-soyabean-oil-5-ltr.webp"], "thumbnail": "assets/images/fresh-fortified-soyabean-oil-5-ltr.webp", "rating": 0.0, "review_count": 12, "in_stock": true, "short_description": "ফ্রেশ ফোর্টিফাইড সয়াবিন তেল উন্নত মানের সয়াবিন থেকে পরিশোধিত একটি ভোজ্য তেল। প্রতিদিনের রান্না, ভাজাপোড়া ও বিভিন্ন খাবার তৈরিতে এটি একটি নির্ভরযোগ্য পছন্দ।", "description": "ফ্রেশ ফোর্টিফাইড সয়াবিন তেল (Fresh Fortified Soyabean Oil) উন্নত মানের সয়াবিন থেকে পরিশোধন ও ফোর্টিফিকেশন প্রক্রিয়ার মাধ্যমে প্রস্তুত করা হয়। এটি প্রতিদিনের রান্নায় স্বাদ ও গুণগত মান বজায় রাখতে সহায়ক। ভাজা, রান্না, ডিপ ফ্রাই, সবজি, মাছ, মাংস এবং বিভিন্ন মুখরোচক খাবার তৈরিতে এই তেল সমানভাবে উপযোগী।\nবৈশিষ্ট্য\n\nউন্নত মানের সয়াবিন থেকে প্রস্তুত\nফোর্টিফাইড ভোজ্য তেল\nস্বচ্ছ, হালকা ও বিশুদ্ধ\nপ্রতিদিনের রান্নার জন্য উপযোগী\nভাজা, ডিপ ফ্রাই ও বিভিন্ন রান্নায় ব্যবহারযোগ্য\nখাবারের স্বাভাবিক স্বাদ বজায় রাখতে সহায়ক\nস্বাস্থ্যসম্মত ও নিরাপদ প্যাকেজিং\nপরিবারের দৈনন্দিন ব্যবহারের জন্য আদর্শ\n\nব্যবহারের উপায়\n\nভাত, সবজি, মাছ ও মাংস রান্নায় ব্যবহার করুন।\nভাজাপোড়া ও ডিপ ফ্রাইয়ের জন্য ব্যবহার করুন।\nপরোটা, পুরি ও নাস্তা তৈরিতে ব্যবহার করুন।\nবিভিন্ন দেশীয় ও আন্তর্জাতিক রান্নায় ব্যবহার করা যায়।\nপ্রতিদিনের সব ধরনের রান্নায় উপযোগী।\n\nসংরক্ষণ নির্দেশনা\n\nঠান্ডা ও শুষ্ক স্থানে সংরক্ষণ করুন।\nসরাসরি সূর্যের আলো থেকে দূরে রাখুন।\nব্যবহারের পর বোতলের ঢাকনা ভালোভাবে বন্ধ রাখুন।\nআগুন বা অতিরিক্ত তাপের উৎস থেকে দূরে রাখুন।\n\n\nদ্রষ্টব্য: পণ্যের রঙ বা ঘনত্বে তাপমাত্রার কারণে সামান্য পরিবর্তন হতে পারে। এটি স্বাভাবিক এবং পণ্যের গুণগত মানের ওপর কোনো প্রভাব ফেলে না।"}, {"id": 98, "name": "পাবনা ডেইরি বিশুদ্ধ ঘি", "slug": "%e0%a6%aa%e0%a6%be%e0%a6%ac%e0%a6%a8%e0%a6%be-%e0%a6%a1%e0%a7%87%e0%a6%87%e0%a6%b0%e0%a6%bf-%e0%a6%ac%e0%a6%bf%e0%a6%b6%e0%a7%81%e0%a6%a6%e0%a7%8d%e0%a6%a7-%e0%a6%98%e0%a6%bf", "price": 660, "regular_price": 660, "on_sale": false, "discount_percent": 0, "categories": ["ঘি"], "category_slugs": ["ghee"], "images": ["assets/images/1-3-1.webp", "assets/images/1-3-1.webp"], "thumbnail": "assets/images/1-3-1.webp", "rating": 0.0, "review_count": 12, "in_stock": true, "short_description": "পাবনা ডেইরি বিশুদ্ধ ঘি উন্নত মানের দুধ থেকে প্রস্তুত একটি প্রিমিয়াম ঘি। এর সমৃদ্ধ স্বাদ, মনোমুগ্ধকর সুবাস এবং মসৃণ টেক্সচার ভাত, খিচুড়ি, পোলাও, রুটি ও বিভিন্ন রান্নার স্বাদকে আরও সমৃদ্ধ করে।", "description": "পাবনা ডেইরি বিশুদ্ধ ঘি (Pabna Dairy Ghee) উন্নত মানের দুধ থেকে যত্নসহকারে প্রস্তুত করা হয়, যাতে এর প্রাকৃতিক স্বাদ, সুবাস এবং গুণগত মান বজায় থাকে। প্রতিদিনের রান্না থেকে শুরু করে বিশেষ খাবার ও ঐতিহ্যবাহী মিষ্টান্ন তৈরিতে এটি সমানভাবে উপযোগী। গরম ভাত, খিচুড়ি, পোলাও, বিরিয়ানি, ডাল, রুটি, পরোটা কিংবা পায়েস ও হালুয়ার মতো খাবারে এই ঘি ব্যবহার করলে খাবারের স্বাদ ও ঘ্রাণ আরও সমৃদ্ধ হয়ে ওঠে।\nবৈশিষ্ট্য\n\nউন্নত মানের দুধ থেকে প্রস্তুত\nপ্রিমিয়াম মানের বিশুদ্ধ ঘি\nসমৃদ্ধ স্বাদ ও মনোমুগ্ধকর সুবাস\nমসৃণ ও ঘন টেক্সচার\nকোনো কৃত্রিম রং, ফ্লেভার বা প্রিজারভেটিভ যোগ করা হয়নি\nভাত, খিচুড়ি, পোলাও ও বিরিয়ানির জন্য উপযোগী\nরুটি, পরোটা ও নানের সঙ্গে পরিবেশনের জন্য আদর্শ\nপায়েস, হালুয়া, সেমাই ও অন্যান্য মিষ্টান্ন তৈরিতে ব্যবহারযোগ্য\nস্বাস্থ্যসম্মত ও নিরাপদ প্যাকেজিং\n\nব্যবহারের উপায়\n\nগরম ভাত বা খিচুড়ির সঙ্গে পরিবেশন করুন।\nপোলাও, বিরিয়ানি ও অন্যান্য রান্নায় ব্যবহার করুন।\nরুটি, পরোটা বা নানের সঙ্গে উপভোগ করুন।\nপায়েস, হালুয়া, সেমাই ও বিভিন্ন মিষ্টান্ন তৈরিতে ব্যবহার করুন।\nরান্নার শেষে অল্প পরিমাণ ঘি যোগ করে খাবারের স্বাদ ও সুবাস বাড়ান।\n\nসংরক্ষণ নির্দেশনা\n\nঠান্ডা ও শুষ্ক স্থানে সংরক্ষণ করুন।\nসরাসরি সূর্যের আলো থেকে দূরে রাখুন।\nব্যবহারের পর ঢাকনা ভালোভাবে বন্ধ রাখুন।\nপরিষ্কার ও শুকনো চামচ ব্যবহার করুন।\n\n\nদ্রষ্টব্য: তাপমাত্রার পরিবর্তনের কারণে ঘির রঙ, ঘনত্ব বা টেক্সচারে সামান্য পরিবর্তন হতে পারে। এটি সম্পূর্ণ স্বাভাবিক এবং পণ্যের গুণগত মানের ওপর কোনো প্রভাব ফেলে না।"}, {"id": 95, "name": "জিও ন্যাচারালস মালাই ঘি", "slug": "%e0%a6%9c%e0%a6%bf%e0%a6%93-%e0%a6%a8%e0%a7%8d%e0%a6%af%e0%a6%be%e0%a6%9a%e0%a6%be%e0%a6%b0%e0%a6%be%e0%a6%b2%e0%a6%b8-%e0%a6%ae%e0%a6%be%e0%a6%b2%e0%a6%be%e0%a6%87-%e0%a6%98%e0%a6%bf", "price": 299, "regular_price": 299, "on_sale": false, "discount_percent": 0, "categories": ["ঘি"], "category_slugs": ["ghee"], "images": ["assets/images/1-5.webp"], "thumbnail": "assets/images/1-5.webp", "rating": 0.0, "review_count": 12, "in_stock": true, "short_description": "জিও ন্যাচারালস মালাই ঘি উন্নত মানের দুধের মালাই থেকে প্রস্তুত একটি প্রিমিয়াম ঘি। এর সমৃদ্ধ স্বাদ, মনোমুগ্ধকর সুবাস এবং মসৃণ টেক্সচার প্রতিদিনের রান্না ও বিভিন্ন ঐতিহ্যবাহী খাবারে বাড়তি স্বাদ যোগ করে।", "description": "জিও ন্যাচারালস মালাই ঘি (Gio Naturals Malai Ghee) উন্নত মানের দুধের মালাই থেকে যত্নসহকারে প্রস্তুত করা হয়, যাতে এর প্রাকৃতিক স্বাদ, সুবাস এবং গুণগত মান বজায় থাকে। এই ঘি দৈনন্দিন রান্না থেকে শুরু করে বিশেষ খাবার, পোলাও, বিরিয়ানি, খিচুড়ি, ডাল, রুটি, পরোটা এবং বিভিন্ন মিষ্টান্ন তৈরিতে সমানভাবে উপযোগী। এর সমৃদ্ধ ঘ্রাণ ও মসৃণ টেক্সচার প্রতিটি খাবারে আলাদা স্বাদ ও আকর্ষণ যোগ করে।\nবৈশিষ্ট্য\n\nউন্নত মানের দুধের মালাই থেকে প্রস্তুত\nপ্রিমিয়াম মানের বিশুদ্ধ ঘি\nসমৃদ্ধ স্বাদ ও প্রাকৃতিক সুবাস\nমসৃণ ও ঘন টেক্সচার\nকোনো কৃত্রিম রং, ফ্লেভার বা প্রিজারভেটিভ যোগ করা হয়নি\nভাত, খিচুড়ি, পোলাও ও বিরিয়ানির জন্য উপযোগী\nরুটি, পরোটা ও নানের সঙ্গে পরিবেশনের জন্য আদর্শ\nহালুয়া, পায়েস, সেমাই ও অন্যান্য মিষ্টান্ন তৈরিতে ব্যবহারযোগ্য\nস্বাস্থ্যসম্মত ও নিরাপদ প্যাকেজিং\n\nব্যবহারের উপায়\n\nগরম ভাত বা খিচুড়ির সঙ্গে পরিবেশন করুন।\nপোলাও, বিরিয়ানি ও অন্যান্য রান্নায় ব্যবহার করুন।\nরুটি, পরোটা বা নানের সঙ্গে উপভোগ করুন।\nপায়েস, হালুয়া, সেমাই ও বিভিন্ন মিষ্টান্ন তৈরিতে ব্যবহার করুন।\nরান্নার শেষে অল্প পরিমাণ ঘি যোগ করে খাবারের স্বাদ ও সুবাস বাড়ান।\n\nসংরক্ষণ নির্দেশনা\n\nঠান্ডা ও শুষ্ক স্থানে সংরক্ষণ করুন।\nসরাসরি সূর্যের আলো থেকে দূরে রাখুন।\nব্যবহারের পর ঢাকনা ভালোভাবে বন্ধ রাখুন।\nপরিষ্কার ও শুকনো চামচ ব্যবহার করুন।\n\n\nদ্রষ্টব্য: তাপমাত্রার পরিবর্তনের কারণে ঘির রঙ, ঘনত্ব বা টেক্সচারে সামান্য পরিবর্তন হতে পারে। এটি একটি স্বাভাবিক বৈশিষ্ট্য এবং পণ্যের গুণগত মানের ওপর কোনো প্রভাব ফেলে না।"}, {"id": 92, "name": "মিল্ক ভিটা বিশুদ্ধ ঘি", "slug": "%e0%a6%ae%e0%a6%bf%e0%a6%b2%e0%a7%8d%e0%a6%95-%e0%a6%ad%e0%a6%bf%e0%a6%9f%e0%a6%be-%e0%a6%ac%e0%a6%bf%e0%a6%b6%e0%a7%81%e0%a6%a6%e0%a7%8d%e0%a6%a7-%e0%a6%98%e0%a6%bf", "price": 375, "regular_price": 375, "on_sale": false, "discount_percent": 0, "categories": ["ঘি"], "category_slugs": ["ghee"], "images": ["assets/images/1-4-1.webp", "assets/images/1-4-1.webp"], "thumbnail": "assets/images/1-4-1.webp", "rating": 0.0, "review_count": 12, "in_stock": true, "short_description": "মিল্ক ভিটা বিশুদ্ধ ঘি উন্নত মানের দুধ থেকে প্রস্তুত একটি প্রিমিয়াম ঘি। এর খাঁটি স্বাদ, সমৃদ্ধ সুবাস এবং মসৃণ টেক্সচার ভাত, খিচুড়ি, পোলাও, রুটি ও বিভিন্ন রান্নায় অতুলনীয় স্বাদ যোগ করে।", "description": "মিল্ক ভিটা বিশুদ্ধ ঘি (Milk Vita Ghee) উন্নত মানের দুধ থেকে যত্নসহকারে প্রস্তুত করা হয়, যাতে এর প্রাকৃতিক স্বাদ, সুবাস এবং গুণগত মান বজায় থাকে। দৈনন্দিন রান্না থেকে শুরু করে বিশেষ খাবার ও ঐতিহ্যবাহী মিষ্টান্ন তৈরিতে এটি সমানভাবে উপযোগী। গরম ভাত, খিচুড়ি, পোলাও, বিরিয়ানি, ডাল, রুটি, পরোটা কিংবা পায়েস ও হালুয়ার মতো খাবারে এই ঘি ব্যবহার করলে খাবারের স্বাদ ও ঘ্রাণ আরও সমৃদ্ধ হয়ে ওঠে।\nবৈশিষ্ট্য\n\nউন্নত মানের দুধ থেকে প্রস্তুত\nপ্রিমিয়াম মানের বিশুদ্ধ ঘি\nসমৃদ্ধ স্বাদ ও মনোমুগ্ধকর সুবাস\nমসৃণ ও ঘন টেক্সচার\nকোনো কৃত্রিম রং, ফ্লেভার বা প্রিজারভেটিভ যোগ করা হয়নি\nভাত, খিচুড়ি, পোলাও ও বিরিয়ানির জন্য উপযোগী\nরুটি, পরোটা ও নানের সঙ্গে পরিবেশনের জন্য আদর্শ\nপায়েস, হালুয়া, সেমাই ও অন্যান্য মিষ্টান্ন তৈরিতে ব্যবহারযোগ্য\nস্বাস্থ্যসম্মত ও নিরাপদ প্যাকেজিং\n\nব্যবহারের উপায়\n\nগরম ভাত বা খিচুড়ির সঙ্গে পরিবেশন করুন।\nপোলাও, বিরিয়ানি ও অন্যান্য রান্নায় ব্যবহার করুন।\nরুটি, পরোটা বা নানের সঙ্গে উপভোগ করুন।\nপায়েস, হালুয়া, সেমাই ও বিভিন্ন মিষ্টান্ন তৈরিতে ব্যবহার করুন।\nরান্নার শেষে অল্প পরিমাণ ঘি যোগ করে খাবারের স্বাদ ও সুবাস বাড়ান।\n\nসংরক্ষণ নির্দেশনা\n\nঠান্ডা ও শুষ্ক স্থানে সংরক্ষণ করুন।\nসরাসরি সূর্যের আলো থেকে দূরে রাখুন।\nব্যবহারের পর ঢাকনা ভালোভাবে বন্ধ রাখুন।\nপরিষ্কার ও শুকনো চামচ ব্যবহার করুন।\n\n\nদ্রষ্টব্য: তাপমাত্রার পরিবর্তনের কারণে ঘির রঙ, ঘনত্ব বা টেক্সচারে সামান্য পরিবর্তন হতে পারে। এটি স্বাভাবিক এবং পণ্যের গুণগত মানের ওপর কোনো প্রভাব ফেলে না।"}, {"id": 89, "name": "দেশি গরুর গাওয়া ঘি", "slug": "%e0%a6%a6%e0%a7%87%e0%a6%b6%e0%a6%bf-%e0%a6%97%e0%a6%b0%e0%a7%81%e0%a6%b0-%e0%a6%97%e0%a6%be%e0%a6%93%e0%a6%af%e0%a6%bc%e0%a6%be-%e0%a6%98%e0%a6%bf", "price": 450, "regular_price": 450, "on_sale": false, "discount_percent": 0, "categories": ["ঘি"], "category_slugs": ["ghee"], "images": ["assets/images/1-6.webp"], "thumbnail": "assets/images/1-6.webp", "rating": 0.0, "review_count": 12, "in_stock": true, "short_description": "দেশি গরুর দুধের প্রিমিয়াম গাওয়া ঘি ঐতিহ্যবাহী পদ্ধতিতে প্রস্তুত, যা সমৃদ্ধ সুবাস, খাঁটি স্বাদ এবং উৎকৃষ্ট মানের জন্য পরিচিত। ভাত, খিচুড়ি, পোলাও, রুটি, মিষ্টান্ন ও বিভিন্ন রান্নায় এটি খাবারের স্বাদকে আরও সমৃদ্ধ করে।", "description": "দেশি গরুর দুধের প্রিমিয়াম গাওয়া ঘি খাঁটি দেশি গরুর দুধ থেকে ঐতিহ্যবাহী পদ্ধতিতে যত্নসহকারে প্রস্তুত করা হয়। ধীর আঁচে তৈরি হওয়ায় এর প্রাকৃতিক সুবাস, সোনালি রঙ এবং সমৃদ্ধ স্বাদ দীর্ঘ সময় ধরে অক্ষুণ্ণ থাকে। প্রতিদিনের রান্না থেকে শুরু করে বিশেষ খাবার, পোলাও, বিরিয়ানি, খিচুড়ি, হালুয়া, পায়েস এবং বিভিন্ন মিষ্টান্ন তৈরিতে এটি একটি আদর্শ উপাদান।\nবৈশিষ্ট্য\n\nখাঁটি দেশি গরুর দুধ থেকে প্রস্তুত\nঐতিহ্যবাহী পদ্ধতিতে তৈরি গাওয়া ঘি\nসমৃদ্ধ স্বাদ ও মনোমুগ্ধকর সুবাস\nমসৃণ টেক্সচার ও আকর্ষণীয় সোনালি রঙ\nকোনো কৃত্রিম রং, ফ্লেভার বা প্রিজারভেটিভ যোগ করা হয়নি\nভাত, খিচুড়ি, পোলাও ও বিরিয়ানির জন্য উপযোগী\nরুটি, পরোটা ও নানের সঙ্গে পরিবেশনের জন্য আদর্শ\nপায়েস, হালুয়া, সেমাই ও অন্যান্য মিষ্টান্ন তৈরিতে ব্যবহারযোগ্য\nস্বাস্থ্যসম্মত ও নিরাপদ প্যাকেজিং\n\nব্যবহারের উপায়\n\nগরম ভাত বা খিচুড়ির সঙ্গে পরিবেশন করুন।\nপোলাও, বিরিয়ানি ও বিভিন্ন রান্নায় ব্যবহার করুন।\nরুটি, পরোটা বা নানের সঙ্গে উপভোগ করুন।\nহালুয়া, পায়েস, সেমাই ও অন্যান্য মিষ্টান্ন তৈরিতে ব্যবহার করুন।\nরান্নার শেষে অল্প পরিমাণ ঘি যোগ করে খাবারের স্বাদ ও সুবাস বাড়ান।\n\nসংরক্ষণ নির্দেশনা\n\nঠান্ডা ও শুষ্ক স্থানে সংরক্ষণ করুন।\nসরাসরি সূর্যের আলো থেকে দূরে রাখুন।\nব্যবহারের পর ঢাকনা ভালোভাবে বন্ধ রাখুন।\nপরিষ্কার ও শুকনো চামচ ব্যবহার করুন।\n\n\nদ্রষ্টব্য: তাপমাত্রার পরিবর্তনের কারণে ঘির রঙ, ঘনত্ব বা টেক্সচারে সামান্য পরিবর্তন হতে পারে। এটি সম্পূর্ণ স্বাভাবিক এবং পণ্যের গুণগত মানের ওপর কোনো প্রভাব ফেলে না।"}, {"id": 86, "name": "আড়ং ডেইরি বিশুদ্ধ ঘি", "slug": "%e0%a6%86%e0%a6%a1%e0%a6%bc%e0%a6%82-%e0%a6%a1%e0%a7%87%e0%a6%87%e0%a6%b0%e0%a6%bf-%e0%a6%ac%e0%a6%bf%e0%a6%b6%e0%a7%81%e0%a6%a6%e0%a7%8d%e0%a6%a7-%e0%a6%98%e0%a6%bf", "price": 299, "regular_price": 299, "on_sale": false, "discount_percent": 0, "categories": ["ঘি"], "category_slugs": ["ghee"], "images": ["assets/images/1-1-1.webp", "assets/images/1-1-1.webp"], "thumbnail": "assets/images/1-1-1.webp", "rating": 0.0, "review_count": 12, "in_stock": true, "short_description": "আড়ং ডেইরি বিশুদ্ধ ঘি উন্নত মানের দুধ থেকে প্রস্তুত একটি প্রিমিয়াম ঘি। এর সমৃদ্ধ স্বাদ, মনোমুগ্ধকর সুবাস এবং মসৃণ টেক্সচার ভাত, খিচুড়ি, পোলাও, রুটি ও বিভিন্ন রান্নার স্বাদকে আরও সমৃদ্ধ করে।", "description": "আড়ং ডেইরি বিশুদ্ধ ঘি (Aarong Dairy Ghee) উন্নত মানের দুধ থেকে যত্নসহকারে প্রস্তুত করা হয়, যাতে এর প্রাকৃতিক স্বাদ, সুবাস এবং গুণগত মান বজায় থাকে। দৈনন্দিন রান্না থেকে শুরু করে বিশেষ খাবার ও ঐতিহ্যবাহী মিষ্টান্ন তৈরিতে এটি সমানভাবে উপযোগী। গরম ভাত, খিচুড়ি, পোলাও, বিরিয়ানি, ডাল, রুটি, পরোটা কিংবা পায়েস ও হালুয়ার মতো খাবারে এই ঘি যোগ করলে স্বাদ ও ঘ্রাণ আরও সমৃদ্ধ হয়।\nবৈশিষ্ট্য\n\nউন্নত মানের দুধ থেকে প্রস্তুত\nপ্রিমিয়াম মানের বিশুদ্ধ ঘি\nপ্রাকৃতিক স্বাদ ও সমৃদ্ধ সুবাস\nমসৃণ ও ঘন টেক্সচার\nভাত, খিচুড়ি, পোলাও ও বিরিয়ানির জন্য উপযোগী\nরুটি, পরোটা ও নানের সঙ্গে পরিবেশনের জন্য আদর্শ\nপায়েস, হালুয়া, সেমাই ও অন্যান্য মিষ্টান্ন তৈরিতে ব্যবহারযোগ্য\nস্বাস্থ্যসম্মত ও নিরাপদ প্যাকেজিং\n\nব্যবহারের উপায়\n\nগরম ভাত বা খিচুড়ির সঙ্গে পরিবেশন করুন।\nপোলাও, বিরিয়ানি ও অন্যান্য রান্নায় ব্যবহার করুন।\nরুটি, পরোটা বা নানের সঙ্গে উপভোগ করুন।\nপায়েস, হালুয়া, সেমাই ও বিভিন্ন মিষ্টান্ন তৈরিতে ব্যবহার করুন।\nরান্নার শেষে অল্প পরিমাণ ঘি যোগ করে খাবারের স্বাদ ও সুবাস বাড়ান।\n\nসংরক্ষণ নির্দেশনা\n\nঠান্ডা ও শুষ্ক স্থানে সংরক্ষণ করুন।\nসরাসরি সূর্যের আলো থেকে দূরে রাখুন।\nব্যবহারের পর ঢাকনা ভালোভাবে বন্ধ রাখুন।\nপরিষ্কার ও শুকনো চামচ ব্যবহার করুন।\n\n\nদ্রষ্টব্য: তাপমাত্রার পরিবর্তনের কারণে ঘির রঙ, ঘনত্ব বা টেক্সচারে সামান্য পরিবর্তন হতে পারে। এটি একটি স্বাভাবিক বৈশিষ্ট্য এবং পণ্যের গুণগত মানের ওপর কোনো প্রভাব ফেলে না।"}, {"id": 83, "name": "ACME প্রিমিয়াম বিশুদ্ধ ঘি", "slug": "acme-%e0%a6%aa%e0%a7%8d%e0%a6%b0%e0%a6%bf%e0%a6%ae%e0%a6%bf%e0%a6%af%e0%a6%bc%e0%a6%be%e0%a6%ae-%e0%a6%ac%e0%a6%bf%e0%a6%b6%e0%a7%81%e0%a6%a6%e0%a7%8d%e0%a6%a7-%e0%a6%98%e0%a6%bf", "price": 399, "regular_price": 399, "on_sale": false, "discount_percent": 0, "categories": ["ঘি"], "category_slugs": ["ghee"], "images": ["assets/images/1-2-1.webp", "assets/images/1-2-1.webp"], "thumbnail": "assets/images/1-2-1.webp", "rating": 0.0, "review_count": 12, "in_stock": true, "short_description": "Acme প্রিমিয়াম বিশুদ্ধ ঘি উন্নত মানের দুধ থেকে প্রস্তুত, যা প্রাকৃতিক স্বাদ, সমৃদ্ধ সুবাস এবং মসৃণ টেক্সচারের জন্য পরিচিত। ভাত, খিচুড়ি, পোলাও, রুটি ও বিভিন্ন রান্নায় এটি খাবারের স্বাদকে আরও সুস্বাদু করে তোলে।", "description": "প্রিমিয়াম বিশুদ্ধ ঘি (Acme Ghee) যত্নসহকারে প্রস্তুত করা হয়, যাতে এর আসল স্বাদ, সুবাস এবং গুণগত মান বজায় থাকে। এটি দৈনন্দিন রান্না থেকে শুরু করে বিভিন্ন ঐতিহ্যবাহী ও বিশেষ খাবার তৈরিতে ব্যবহার করা যায়। গরম ভাত, খিচুড়ি, পোলাও, বিরিয়ানি, ডাল, রুটি, পরোটা কিংবা বিভিন্ন মিষ্টান্নে এই ঘি খাবারের স্বাদ ও ঘ্রাণকে আরও সমৃদ্ধ করে।\nবৈশিষ্ট্য\n\nপ্রিমিয়াম মানের বিশুদ্ধ ঘি\nউন্নত মানের দুধ থেকে প্রস্তুত\nপ্রাকৃতিক স্বাদ ও মনোমুগ্ধকর সুবাস\nমসৃণ ও ঘন টেক্সচার\nভাত, খিচুড়ি, পোলাও ও বিরিয়ানির জন্য উপযোগী\nরুটি, পরোটা ও নানের সঙ্গে পরিবেশনের জন্য আদর্শ\nহালুয়া, পায়েস, সেমাই ও অন্যান্য মিষ্টান্ন তৈরিতে ব্যবহারযোগ্য\nস্বাস্থ্যসম্মত ও নিরাপদ প্যাকেজিং\n\nব্যবহারের উপায়\n\nগরম ভাত বা খিচুড়ির সঙ্গে পরিবেশন করুন।\nপোলাও, বিরিয়ানি ও অন্যান্য রান্নায় ব্যবহার করুন।\nরুটি, পরোটা বা নানের সঙ্গে উপভোগ করুন।\nপায়েস, হালুয়া, সেমাই ও বিভিন্ন মিষ্টান্ন তৈরিতে ব্যবহার করুন।\nরান্নার শেষে অল্প পরিমাণ ঘি যোগ করে খাবারের স্বাদ ও সুবাস বাড়ান।\n\nসংরক্ষণ নির্দেশনা\n\nঠান্ডা ও শুষ্ক স্থানে সংরক্ষণ করুন।\nসরাসরি সূর্যের আলো থেকে দূরে রাখুন।\nব্যবহারের পর ঢাকনা ভালোভাবে বন্ধ রাখুন।\nপরিষ্কার ও শুকনো চামচ ব্যবহার করুন।\n\n\nদ্রষ্টব্য: তাপমাত্রার পরিবর্তনের কারণে ঘির রঙ বা ঘনত্বে সামান্য পরিবর্তন হতে পারে। এটি স্বাভাবিক এবং পণ্যের গুণগত মানের ওপর কোনো প্রভাব ফেলে না।"}, {"id": 80, "name": "আসল প্রিমিয়াম বিশুদ্ধ ঘি", "slug": "%e0%a6%86%e0%a6%b8%e0%a6%b2-%e0%a6%aa%e0%a7%8d%e0%a6%b0%e0%a6%bf%e0%a6%ae%e0%a6%bf%e0%a6%af%e0%a6%bc%e0%a6%be%e0%a6%ae-%e0%a6%ac%e0%a6%bf%e0%a6%b6%e0%a7%81%e0%a6%a6%e0%a7%8d%e0%a6%a7-%e0%a6%98", "price": 399, "regular_price": 399, "on_sale": false, "discount_percent": 0, "categories": ["ঘি"], "category_slugs": ["ghee"], "images": ["assets/images/1-9.webp"], "thumbnail": "assets/images/1-9.webp", "rating": 0.0, "review_count": 12, "in_stock": true, "short_description": "আসল প্রিমিয়াম বিশুদ্ধ ঘি উৎকৃষ্ট মানের দুধ থেকে প্রস্তুত, যা প্রাকৃতিক স্বাদ, সমৃদ্ধ সুবাস এবং মসৃণ টেক্সচারের জন্য পরিচিত। ভাত, খিচুড়ি, পোলাও, রুটি এবং বিভিন্ন রান্নায় এটি খাবারের স্বাদকে আরও সমৃদ্ধ করে।", "description": "আসল প্রিমিয়াম বিশুদ্ধ ঘি যত্নসহকারে প্রস্তুত করা হয়, যাতে এর প্রাকৃতিক স্বাদ, সুবাস এবং গুণগত মান অক্ষুণ্ণ থাকে। এটি প্রতিদিনের রান্না থেকে শুরু করে বিভিন্ন ঐতিহ্যবাহী ও বিশেষ খাবারে ব্যবহার করা যায়। গরম ভাত, খিচুড়ি, পোলাও, বিরিয়ানি, ডাল, রুটি, পরোটা কিংবা মিষ্টান্ন—সব ধরনের খাবারের স্বাদ ও ঘ্রাণ বাড়াতে এটি একটি আদর্শ উপাদান।\nবৈশিষ্ট্য\n\nপ্রিমিয়াম মানের বিশুদ্ধ ঘি\nপ্রাকৃতিক স্বাদ ও সমৃদ্ধ সুবাস\nমসৃণ ও ঘন টেক্সচার\nকোনো কৃত্রিম রং বা ফ্লেভার যোগ করা হয়নি\nভাত, খিচুড়ি, পোলাও ও বিরিয়ানির জন্য উপযোগী\nরুটি, পরোটা ও বিভিন্ন মিষ্টান্নের সঙ্গে ব্যবহারযোগ্য\nস্বাস্থ্যসম্মত ও নিরাপদ প্যাকেজিং\nদৈনন্দিন রান্না ও বিশেষ অনুষ্ঠানের জন্য উপযুক্ত\n\nব্যবহারের উপায়\n\nগরম ভাত বা খিচুড়ির সঙ্গে পরিবেশন করুন।\nপোলাও, বিরিয়ানি ও বিভিন্ন রান্নায় ব্যবহার করুন।\nরুটি, পরোটা বা নানের সঙ্গে উপভোগ করুন।\nহালুয়া, পায়েস, সেমাই ও অন্যান্য মিষ্টান্ন তৈরিতে ব্যবহার করুন।\nরান্নার শেষে অল্প পরিমাণ ঘি যোগ করে খাবারের স্বাদ ও সুবাস বাড়ান।\n\nসংরক্ষণ নির্দেশনা\n\nঠান্ডা ও শুষ্ক স্থানে সংরক্ষণ করুন।\nসরাসরি সূর্যের আলো থেকে দূরে রাখুন।\nব্যবহারের পর ঢাকনা ভালোভাবে বন্ধ রাখুন।\nপরিষ্কার ও শুকনো চামচ ব্যবহার করুন।\n\n\nদ্রষ্টব্য: তাপমাত্রার পরিবর্তনের কারণে ঘির রঙ, ঘনত্ব বা টেক্সচারে সামান্য পরিবর্তন হতে পারে। এটি সম্পূর্ণ স্বাভাবিক এবং পণ্যের গুণগত মানের ওপর কোনো প্রভাব ফেলে না।"}, {"id": 66, "name": "একিউর প্রিমিয়াম বিশুদ্ধ ঘি", "slug": "%e0%a6%8f%e0%a6%95%e0%a6%bf%e0%a6%89%e0%a6%b0-%e0%a6%aa%e0%a7%8d%e0%a6%b0%e0%a6%bf%e0%a6%ae%e0%a6%bf%e0%a6%af%e0%a6%bc%e0%a6%be%e0%a6%ae-%e0%a6%ac%e0%a6%bf%e0%a6%b6%e0%a7%81%e0%a6%a6%e0%a7%8d%e0%a6%a7", "price": 300, "regular_price": 300, "on_sale": false, "discount_percent": 0, "categories": ["ঘি"], "category_slugs": ["ghee"], "images": ["assets/images/22-Photoroom.webp", "assets/images/22-Photoroom.webp"], "thumbnail": "assets/images/22-Photoroom.webp", "rating": 0.0, "review_count": 12, "in_stock": true, "short_description": "একিউর প্রিমিয়াম বিশুদ্ধ ঘি উৎকৃষ্ট মানের দুধের ক্রিম থেকে প্রস্তুত, যা প্রাকৃতিক স্বাদ, সমৃদ্ধ সুবাস ও মসৃণ টেক্সচারের জন্য পরিচিত। ভাত, খিচুড়ি, পোলাও, রুটি এবং বিভিন্ন রান্নায় এটি খাবারের স্বাদকে আরও সমৃদ্ধ করে।", "description": "একিউর প্রিমিয়াম বিশুদ্ধ ঘি ঐতিহ্যবাহী পদ্ধতিতে যত্নসহকারে প্রস্তুত করা হয়, যাতে এর প্রাকৃতিক স্বাদ, সুবাস এবং গুণগত মান বজায় থাকে। এটি দৈনন্দিন রান্না থেকে শুরু করে বিভিন্ন বিশেষ খাবার তৈরিতে ব্যবহার করা যায়। ভাত, খিচুড়ি, পোলাও, বিরিয়ানি, ডাল, পরোটা কিংবা মিষ্টান্ন—সব ধরনের খাবারে এর অনন্য স্বাদ আলাদা মাত্রা যোগ করে।\nবৈশিষ্ট্য\n\nপ্রিমিয়াম মানের বিশুদ্ধ ঘি\nসমৃদ্ধ স্বাদ ও মনোমুগ্ধকর সুবাস\nমসৃণ ও ঘন টেক্সচার\nকোনো কৃত্রিম রং বা ফ্লেভার যোগ করা হয়নি\nভাত, খিচুড়ি, পোলাও ও বিরিয়ানির জন্য উপযোগী\nরুটি, পরোটা ও বিভিন্ন মিষ্টান্নের সঙ্গে ব্যবহারযোগ্য\nস্বাস্থ্যসম্মত ও নিরাপদ প্যাকেজিং\nদৈনন্দিন রান্না ও বিশেষ অনুষ্ঠানের জন্য উপযুক্ত\n\nব্যবহারের উপায়\n\nগরম ভাত বা খিচুড়ির সঙ্গে পরিবেশন করুন।\nপোলাও, বিরিয়ানি ও বিভিন্ন রান্নায় ব্যবহার করুন।\nরুটি, পরোটা বা নানের সঙ্গে উপভোগ করুন।\nহালুয়া, পায়েস, সেমাই ও অন্যান্য মিষ্টান্ন তৈরিতে ব্যবহার করুন।\nরান্নার শেষে অল্প পরিমাণ ঘি যোগ করে খাবারের স্বাদ ও সুবাস বাড়াতে পারেন।\n\nসংরক্ষণ নির্দেশনা\n\nঠান্ডা ও শুষ্ক স্থানে সংরক্ষণ করুন।\nসরাসরি সূর্যের আলো থেকে দূরে রাখুন।\nব্যবহারের পর ঢাকনা ভালোভাবে বন্ধ রাখুন।\nপরিষ্কার ও শুকনো চামচ ব্যবহার করুন।\n\n\nদ্রষ্টব্য: তাপমাত্রার পরিবর্তনের কারণে ঘির রঙ, ঘনত্ব বা টেক্সচারে সামান্য পরিবর্তন হতে পারে। এটি সম্পূর্ণ স্বাভাবিক এবং পণ্যের গুণগত মানের ওপর কোনো প্রভাব ফেলে না।"}, {"id": 62, "name": "অর্গানিক ফ্রেশ কালমি খেজুর", "slug": "%e0%a6%85%e0%a6%b0%e0%a7%8d%e0%a6%97%e0%a6%be%e0%a6%a8%e0%a6%bf%e0%a6%95-%e0%a6%ab%e0%a7%8d%e0%a6%b0%e0%a7%87%e0%a6%b6-%e0%a6%95%e0%a6%be%e0%a6%b2%e0%a6%ae%e0%a6%bf-%e0%a6%96%e0%a7%87%e0%a6%9c", "price": 850, "regular_price": 850, "on_sale": false, "discount_percent": 0, "categories": ["খেজুর"], "category_slugs": ["dates"], "images": ["assets/images/kalmi-dates-khejur-500-gm.webp", "assets/images/kalmi-dates-khejur-500-gm-1.webp"], "thumbnail": "assets/images/kalmi-dates-khejur-500-gm.webp", "rating": 0.0, "review_count": 12, "in_stock": true, "short_description": "অর্গানিক ফ্রেশ কালমি খেজুর প্রাকৃতিকভাবে উৎপাদিত, নরম, রসালো ও সুস্বাদু একটি প্রিমিয়াম মানের খেজুর। প্রতিদিনের নাস্তা, ইফতার বা স্বাস্থ্যকর স্ন্যাকস হিসেবে এটি একটি উৎকৃষ্ট পছন্দ।", "description": "অর্গানিক ফ্রেশ কালমি খেজুর প্রাকৃতিক উপায়ে উৎপাদিত উচ্চমানের খেজুর, যা এর নরম টেক্সচার, মিষ্টি স্বাদ এবং সতেজতার জন্য বিশেষভাবে পরিচিত। এটি দৈনন্দিন খাদ্যতালিকায় সহজেই অন্তর্ভুক্ত করা যায় এবং পরিবারের সকল সদস্যের জন্য উপযোগী। সকালের নাস্তা, ইফতার, ভ্রমণ কিংবা দ্রুত শক্তির উৎস হিসেবে কালমি খেজুর একটি আদর্শ খাবার।\nবৈশিষ্ট্য\n\nপ্রিমিয়াম মানের অর্গানিক কালমি খেজুর\nনরম, রসালো ও প্রাকৃতিকভাবে মিষ্টি\nতাজা ও সতেজ স্বাদ\nকোনো কৃত্রিম রং, ফ্লেভার বা প্রিজারভেটিভ যোগ করা হয়নি\nস্বাস্থ্যকর স্ন্যাকস হিসেবে উপযোগী\nইফতার, নাস্তা ও অতিথি আপ্যায়নের জন্য আদর্শ\nস্মুদি, ডেজার্ট ও বিভিন্ন রেসিপিতে ব্যবহারযোগ্য\nস্বাস্থ্যসম্মত ও নিরাপদ প্যাকেজিং\n\nখাওয়ার উপায়\n\nসরাসরি স্ন্যাকস হিসেবে।\nইফতারে অন্যান্য খাবারের সঙ্গে।\nদুধ, দই, ওটস বা সিরিয়ালের সঙ্গে।\nস্মুদি, মিল্কশেক ও ডেজার্টে।\nকেক, পুডিং ও বিভিন্ন মিষ্টান্ন তৈরিতে।\n\nসংরক্ষণ নির্দেশনা\n\nঠান্ডা ও শুষ্ক স্থানে সংরক্ষণ করুন।\nসরাসরি সূর্যের আলো থেকে দূরে রাখুন।\nপ্যাকেট খোলার পর ভালোভাবে মুখ বন্ধ রাখুন।\nদীর্ঘদিন সংরক্ষণের জন্য রেফ্রিজারেটরে রাখা যেতে পারে।\n\n\nদ্রষ্টব্য: খেজুর একটি প্রাকৃতিক ফল। তাই আকার, রঙ, মিষ্টতার মাত্রা বা টেক্সচারে সামান্য পরিবর্তন হওয়া স্বাভাবিক এবং এটি পণ্যের গুণগত মানের ওপর কোনো প্রভাব ফেলে না।"}, {"id": 45, "name": "প্রিমিয়াম খুরমা খেজুর", "slug": "%e0%a6%aa%e0%a7%8d%e0%a6%b0%e0%a6%bf%e0%a6%ae%e0%a6%bf%e0%a6%af%e0%a6%bc%e0%a6%be%e0%a6%ae-%e0%a6%96%e0%a7%81%e0%a6%b0%e0%a6%ae%e0%a6%be-%e0%a6%96%e0%a7%87%e0%a6%9c%e0%a7%81%e0%a6%b0", "price": 350, "regular_price": 350, "on_sale": false, "discount_percent": 0, "categories": ["খেজুর"], "category_slugs": ["dates"], "images": ["assets/images/4-2.webp", "assets/images/4-1.webp", "assets/images/4-2.webp"], "thumbnail": "assets/images/4-2.webp", "rating": 0.0, "review_count": 12, "in_stock": true, "short_description": "প্রিমিয়াম খুরমা খেজুর প্রাকৃতিক মিষ্টতা, নরম টেক্সচার ও সুস্বাদু স্বাদের জন্য জনপ্রিয়। প্রতিদিনের নাস্তা, ইফতার কিংবা স্বাস্থ্যকর স্ন্যাকস হিসেবে এটি একটি উৎকৃষ্ট পছন্দ।", "description": "প্রিমিয়াম খুরমা খেজুর সুস্বাদু, পুষ্টিকর এবং প্রাকৃতিকভাবে মিষ্টি একটি ফল। এর নরম ও মাংসল গঠন, আকর্ষণীয় স্বাদ এবং উচ্চ পুষ্টিগুণের কারণে এটি সব বয়সের মানুষের কাছে সমানভাবে জনপ্রিয়। প্রতিদিনের খাদ্যতালিকায় এটি সহজেই অন্তর্ভুক্ত করা যায়। সকালের নাস্তা, ইফতার, ভ্রমণ কিংবা ব্যস্ত সময়ে দ্রুত শক্তির উৎস হিসেবে খুরমা খেজুর একটি আদর্শ খাবার।\nবৈশিষ্ট্য\n\nপ্রাকৃতিকভাবে মিষ্টি ও সুস্বাদু\nনরম, মাংসল ও তাজা খেজুর\nকোনো কৃত্রিম রং বা ফ্লেভার যোগ করা হয়নি\nস্বাস্থ্যকর স্ন্যাকস হিসেবে উপযোগী\nইফতার, নাস্তা ও অতিথি আপ্যায়নের জন্য উপযুক্ত\nস্মুদি, ডেজার্ট ও বিভিন্ন রেসিপিতে ব্যবহার করা যায়\nপরিষ্কার ও স্বাস্থ্যসম্মতভাবে প্যাকেজ করা\nপরিবারের সকল সদস্যের জন্য উপযোগী\n\nখাওয়ার উপায়\n\nসরাসরি স্বাস্থ্যকর স্ন্যাকস হিসেবে।\nইফতারে অন্যান্য খাবারের সঙ্গে।\nদুধ, ওটস বা দইয়ের সঙ্গে।\nস্মুদি, শেক ও ডেজার্টে।\nকেক, পুডিং ও অন্যান্য মিষ্টান্ন তৈরিতে।\n\nসংরক্ষণ নির্দেশনা\n\nঠান্ডা ও শুষ্ক স্থানে সংরক্ষণ করুন।\nসরাসরি সূর্যের আলো থেকে দূরে রাখুন।\nপ্যাকেট খোলার পর ভালোভাবে মুখ বন্ধ রাখুন।\nদীর্ঘদিন সংরক্ষণের জন্য রেফ্রিজারেটরে রাখা যেতে পারে।\n\n\nদ্রষ্টব্য: খেজুর একটি প্রাকৃতিক ফল। তাই আকার, রঙ ও স্বাদে সামান্য পার্থক্য থাকা স্বাভাবিক এবং এটি পণ্যের গুণগত মানের ওপর কোনো প্রভাব ফেলে না।"}, {"id": 38, "name": "কারকুমা অর্গানিক বিশুদ্ধ মধু", "slug": "%e0%a6%95%e0%a6%be%e0%a6%b0%e0%a6%95%e0%a7%81%e0%a6%ae%e0%a6%be-%e0%a6%85%e0%a6%b0%e0%a7%8d%e0%a6%97%e0%a6%be%e0%a6%a8%e0%a6%bf%e0%a6%95-%e0%a6%ac%e0%a6%bf%e0%a6%b6%e0%a7%81%e0%a6%a6%e0%a7%8d%e0%a6%a7", "price": 375, "regular_price": 375, "on_sale": false, "discount_percent": 0, "categories": ["মধু"], "category_slugs": ["honey"], "images": ["assets/images/2-Picsart-BackgroundChanger-1.jpg", "assets/images/2-Picsart-BackgroundChanger-1-Copy.webp", "assets/images/2-Picsart-BackgroundChanger-2-Copy.webp"], "thumbnail": "assets/images/2-Picsart-BackgroundChanger-1.jpg", "rating": 0.0, "review_count": 12, "in_stock": true, "short_description": "কারকুমা অর্গানিক বিশুদ্ধ মধু প্রাকৃতিক স্বাদ ও গুণে সমৃদ্ধ একটি প্রিমিয়াম মানের মধু। প্রতিদিনের খাদ্যতালিকায় স্বাস্থ্যকর সংযোজন হিসেবে চা, দুধ, টোস্ট, লেবুর পানি ও বিভিন্ন খাবারের সঙ্গে উপভোগ করা যায়।", "description": "কারকুমা অর্গানিক বিশুদ্ধ মধু প্রাকৃতিকভাবে সংগ্রহ ও যত্নসহকারে প্রক্রিয়াজাত করা হয়, যাতে মধুর আসল স্বাদ, সুগন্ধ এবং প্রাকৃতিক গুণাগুণ বজায় থাকে। এটি প্রতিদিনের খাদ্যাভ্যাসে সহজেই যুক্ত করা যায় এবং পরিবারের সকল সদস্যের জন্য উপযোগী। সকালের নাস্তা, স্বাস্থ্যকর পানীয়, ডেজার্ট কিংবা বিভিন্ন রান্নায় এটি একটি উৎকৃষ্ট উপাদান হিসেবে ব্যবহার করা যায়।\nবৈশিষ্ট্য\n\n১০০% অর্গানিক মানসম্পন্ন মধু\nপ্রাকৃতিক স্বাদ ও মনোমুগ্ধকর সুগন্ধ\nকোনো কৃত্রিম রং বা ফ্লেভার যোগ করা হয়নি\nচা, কফি, দুধ ও লেবুর পানির সঙ্গে উপযোগী\nটোস্ট, প্যানকেক, ওটস ও সিরিয়ালের সঙ্গে খাওয়া যায়\nস্মুদি, ডেজার্ট ও বিভিন্ন রান্নায় ব্যবহারযোগ্য\nস্বাস্থ্যসম্মত ও নিরাপদ প্যাকেজিং\nদৈনন্দিন ব্যবহারের জন্য উপযুক্ত\n\nব্যবহারের উপায়\n\nসকালে কুসুম গরম পানি বা লেবুর পানির সঙ্গে।\nচা বা দুধে প্রাকৃতিক মিষ্টতা যোগ করতে।\nরুটি, টোস্ট বা প্যানকেকের সঙ্গে।\nফল, দই, ওটস ও সিরিয়ালের সঙ্গে।\nবিভিন্ন ডেজার্ট, স্মুদি ও রান্নায়।\n\nসংরক্ষণ নির্দেশনা\n\nঠান্ডা ও শুষ্ক স্থানে সংরক্ষণ করুন।\nসরাসরি সূর্যের আলো থেকে দূরে রাখুন।\nব্যবহারের পর ঢাকনা ভালোভাবে বন্ধ করুন।\nপরিষ্কার ও শুকনো চামচ ব্যবহার করুন।\n\n\nদ্রষ্টব্য: মধু একটি প্রাকৃতিক খাদ্য। তাই সময়ের সঙ্গে এর রঙ, ঘনত্ব বা প্রাকৃতিকভাবে দানা বাঁধায় (ক্রিস্টালাইজেশন) পরিবর্তন আসতে পারে, যা সম্পূর্ণ স্বাভাবিক এবং পণ্যের গুণগত মানের ওপর কোনো প্রভাব ফেলে না।"}, {"id": 31, "name": "ডাবর বিশুদ্ধ প্রাকৃতিক মধু", "slug": "%e0%a6%a1%e0%a6%be%e0%a6%ac%e0%a6%b0-%e0%a6%ac%e0%a6%bf%e0%a6%b6%e0%a7%81%e0%a6%a6%e0%a7%8d%e0%a6%a7-%e0%a6%aa%e0%a7%8d%e0%a6%b0%e0%a6%be%e0%a6%95%e0%a7%83%e0%a6%a4%e0%a6%bf%e0%a6%95-%e0%a6%ae", "price": 820, "regular_price": 820, "on_sale": false, "discount_percent": 0, "categories": ["মধু"], "category_slugs": ["honey"], "images": ["assets/images/1-2.webp", "assets/images/1-3.webp", "assets/images/1-4.webp", "assets/images/1-1.webp"], "thumbnail": "assets/images/1-2.webp", "rating": 0.0, "review_count": 12, "in_stock": true, "short_description": "ডাবর বিশুদ্ধ প্রাকৃতিক মধু প্রতিদিনের পুষ্টি ও সুস্থতার জন্য একটি নির্ভরযোগ্য পছন্দ। চা, দুধ, পানীয় বা বিভিন্ন খাবারের সঙ্গে সহজেই উপভোগ করা যায়।", "description": "ডাবর বিশুদ্ধ প্রাকৃতিক মধু প্রাকৃতিক স্বাদ, সুগন্ধ এবং মান বজায় রেখে প্রস্তুত করা হয়। এটি দৈনন্দিন খাদ্যাভ্যাসে সহজেই অন্তর্ভুক্ত করা যায় এবং পরিবারের সকল সদস্যের জন্য উপযোগী। সকালের নাস্তা থেকে শুরু করে বিভিন্ন পানীয়, ডেজার্ট ও রান্নায় এটি ব্যবহার করে খাবারের স্বাদ আরও বাড়ানো যায়।\nবৈশিষ্ট্য\n\nপ্রাকৃতিক স্বাদ ও মনোরম সুগন্ধ\nদৈনন্দিন ব্যবহারের জন্য উপযোগী\nচা, কফি, দুধ ও লেবুর পানির সঙ্গে ব্যবহারযোগ্য\nটোস্ট, প্যানকেক, ওটস ও সিরিয়ালের সঙ্গে খাওয়ার উপযোগী\nবিভিন্ন ডেজার্ট ও রান্নার রেসিপিতে ব্যবহার করা যায়\nউন্নত মান নিয়ন্ত্রণের মাধ্যমে প্রস্তুত\nসহজে বহন ও সংরক্ষণযোগ্য প্যাকেজিং\n\nব্যবহারের উপায়\n\nসকালে কুসুম গরম পানি বা লেবুর পানির সঙ্গে।\nচা বা দুধে প্রাকৃতিক মিষ্টতা যোগ করতে।\nটোস্ট, রুটি বা প্যানকেকের সঙ্গে।\nফল, দই, ওটস ও সিরিয়ালের সঙ্গে।\nবিভিন্ন ডেজার্ট, স্মুদি ও ঘরোয়া রেসিপিতে।\n\nসংরক্ষণ নির্দেশনা\n\nশুষ্ক ও ঠান্ডা স্থানে সংরক্ষণ করুন।\nসরাসরি রোদ থেকে দূরে রাখুন।\nব্যবহারের পর ঢাকনা ভালোভাবে বন্ধ রাখুন।\nপরিষ্কার ও শুকনো চামচ ব্যবহার করুন।\n\n\nদ্রষ্টব্য: মধু একটি প্রাকৃতিক খাদ্য। সময়ের সাথে এর রঙ বা ঘনত্বে সামান্য পরিবর্তন বা প্রাকৃতিকভাবে দানা বাঁধা (ক্রিস্টালাইজেশন) স্বাভাবিক এবং এটি পণ্যের গুণগত মান নষ্ট হওয়ার লক্ষণ নয়।"}];

  // --- LOAD PRODUCTS DATA ---
  async function loadProducts() {
    // 1. Check window.ORGANIC_PRODUCTS (already loaded from products-data.js)
    if (Array.isArray(window.ORGANIC_PRODUCTS) && window.ORGANIC_PRODUCTS.length > 0) {
      products = window.ORGANIC_PRODUCTS;
      return products;
    }
    // 2. Fetch from data/products.json if on http/https
    try {
      const res = await fetch('data/products.json');
      if (res.ok) {
        products = await res.json();
        window.ORGANIC_PRODUCTS = products;
        return products;
      }
    } catch (e) {
      // Expected on file:// protocol or offline
    }
    // 3. Fallback to embedded products list
    if (Array.isArray(EMBEDDED_PRODUCTS_FALLBACK) && EMBEDDED_PRODUCTS_FALLBACK.length > 0) {
      products = EMBEDDED_PRODUCTS_FALLBACK;
      window.ORGANIC_PRODUCTS = products;
    }
    return products;
  }

  // --- CART MANAGEMENT ---
  function saveCart() {
    localStorage.setItem('organic_cart', JSON.stringify(cart));
    updateWoodmartCartUI();
    renderLocalCartItems();
    if (window.location.pathname.endsWith('cart.html') || window.location.href.includes('cart.html')) {
      renderCartPage();
    }
    if (window.location.pathname.endsWith('checkout.html') || window.location.href.includes('checkout.html')) {
      renderCheckoutPage();
    }
  }

  function addToCart(productId, title, price, img, qty = 1) {
    productId = String(productId);
    const existing = cart.find(i => String(i.id) === productId);
    const quantity = parseInt(qty, 10) || 1;

    if (existing) {
      existing.qty += quantity;
    } else {
      cart.push({
        id: productId,
        name: title || 'অর্গানিক ফুড পণ্য',
        price: parseFloat(price) || 500,
        thumbnail: img || 'assets/images/Organic-food-1.png',
        qty: quantity
      });
    }
    saveCart();
    showToast(`"${title || 'পণ্য'}" কার্টে যোগ করা হয়েছে!`);
    openLocalCartDrawer();
  }

  function updateCartQty(productId, delta) {
    productId = String(productId);
    const item = cart.find(i => String(i.id) === productId);
    if (!item) return;

    item.qty += delta;
    if (item.qty <= 0) {
      cart = cart.filter(i => String(i.id) !== productId);
      showToast('পণ্যটি কার্ট থেকে সরানো হয়েছে।');
    }
    saveCart();
  }

  function removeFromCart(productId) {
    productId = String(productId);
    cart = cart.filter(i => String(i.id) !== productId);
    saveCart();
    showToast('পণ্যটি কার্ট থেকে সরানো হয়েছে।');
  }

  window.removeLocalCartItem = removeFromCart;
  window.updateLocalCartQty = updateCartQty;

  function updateWoodmartCartUI() {
    const totalCount = cart.reduce((sum, item) => sum + item.qty, 0);
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

    // Update WoodMart cart counters
    document.querySelectorAll('.wd-cart-number, .wd-tools-count, .cart-count-badge, .badge-count').forEach(el => {
      el.textContent = totalCount;
      el.style.display = totalCount > 0 ? 'inline-flex' : 'none';
    });

    // Update WoodMart subtotal text elements
    document.querySelectorAll('.wd-cart-subtotal .amount, .cart-subtotal-val, .woocommerce-Price-amount').forEach(el => {
      if (el.closest('.whb-cart') || el.closest('.wd-header-cart') || el.closest('.cart-subtotal')) {
        el.innerHTML = `<span class="woocommerce-Price-currencySymbol">৳</span>${subtotal}`;
      }
    });
  }

  // --- TOAST NOTIFICATIONS ---
  function showToast(msg, type = 'success') {
    let t = document.getElementById('localToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'localToast';
      t.style.cssText = 'position:fixed; top:24px; right:24px; background:#016738; color:#fff; padding:14px 22px; border-radius:8px; box-shadow:0 8px 25px rgba(0,0,0,0.25); z-index:100005; font-family:"Anek Bangla",sans-serif; font-weight:700; font-size:15px; transition:all 0.35s cubic-bezier(0.16, 1, 0.3, 1); border-left:5px solid #fbbc34; display:flex; align-items:center; gap:10px; opacity:0; transform:translateY(-15px); pointer-events:none;';
      document.body.appendChild(t);
    }
    t.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#016738" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; display:inline-block;"><polyline points="20 6 9 17 4 12"></polyline></svg> <span>${msg}</span>`;
    t.style.opacity = '1';
    t.style.transform = 'translateY(0)';
    t.style.pointerEvents = 'auto';

    clearTimeout(t._timer);
    t._timer = setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateY(-15px)';
      t.style.pointerEvents = 'none';
    }, 2800);
  }

  window.showToast = showToast;

  // --- INJECT MODALS & DRAWER ---
  function injectLocalModals() {
    if (document.getElementById('localCartDrawer')) return;

    const modalHTML = `
      <!-- Cart Drawer Overlay -->
      <div id="localCartOverlay" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:99998; backdrop-filter:blur(3px); transition:opacity 0.3s ease;"></div>
      
      <!-- Cart Drawer -->
      <div id="localCartDrawer" style="position:fixed; top:0; right:-460px; width:100%; max-width:420px; height:100%; background:#fff; z-index:99999; box-shadow:-5px 0 35px rgba(0,0,0,0.25); display:flex; flex-direction:column; transition:right 0.35s cubic-bezier(0.16, 1, 0.3, 1); font-family:'Anek Bangla',sans-serif;">
        <!-- Drawer Header -->
        <div style="padding:18px 20px; background:#016738; color:#fff; display:flex; align-items:center; justify-content:space-between;">
          <div style="display:flex; align-items:center; gap:8px;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
            <h3 style="margin:0; font-size:18px; font-weight:700; color:#fff;">আপনার শপিং কার্ট</h3>
          </div>
          <button id="closeLocalCartBtn" style="background:none; border:none; color:#fff; font-size:24px; cursor:pointer; line-height:1; padding:0 4px;" aria-label="Close cart">&times;</button>
        </div>

        <!-- Free shipping bar -->
        <div id="localFreeShippingBox" style="padding:12px 20px; background:#f4faf6; border-bottom:1px solid #bfd9c9;">
          <div id="freeShippingNoticeText" style="font-size:13px; color:#016738; font-weight:700; margin-bottom:6px;">সারা দেশে দ্রুত ক্যাশ অন ডেলিভারি!</div>
          <div style="background:#e0ede5; height:7px; border-radius:4px; overflow:hidden;">
            <div id="freeShippingProgressFill" style="background:#016738; width:0%; height:100%; transition:width 0.4s ease;"></div>
          </div>
        </div>

        <!-- Items list -->
        <div id="localCartItemsList" style="flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:12px;"></div>

        <!-- Footer -->
        <div style="padding:18px 20px; border-top:1px solid #eee; background:#fafafa;">
          <div style="display:flex; justify-content:space-between; font-size:16px; font-weight:700; margin-bottom:14px; color:#153A27;">
            <span>মোট টাকা (Subtotal):</span>
            <span id="localCartSubtotalVal" style="color:#016738; font-size:19px; font-weight:800;">৳০</span>
          </div>
          <button id="openCheckoutModalBtn" style="width:100%; background:#016738; color:#fff; border:none; padding:13px; border-radius:6px; font-size:16px; font-weight:800; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 4px 12px rgba(1,103,56,0.3); transition:background 0.2s ease;">
            <span>চেকআউট করুন (ক্যাশ অন ডেলিভারি)</span>
          </button>
          <div style="display:flex; gap:10px; margin-top:10px;">
            <a href="cart.html" style="flex:1; text-align:center; padding:9px; border:1px solid #016738; border-radius:5px; color:#016738; font-weight:700; font-size:13px; text-decoration:none; background:#fff;">কার্ট পেজ দেখুন</a>
            <a href="shop.html" style="flex:1; text-align:center; padding:9px; border:1px solid #ccc; border-radius:5px; color:#555; font-weight:600; font-size:13px; text-decoration:none; background:#fff;">আরও কেনাকাটা</a>
          </div>
        </div>
      </div>

      <!-- 1-Click Order Modal -->
      <div id="localOrderModalOverlay" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.65); z-index:100000; align-items:center; justify-content:center; padding:15px; font-family:'Anek Bangla',sans-serif; backdrop-filter:blur(3px);">
        <div class="local-modal-animate" style="background:#fff; border-radius:10px; max-width:540px; width:100%; max-height:92vh; overflow-y:auto; box-shadow:0 20px 50px rgba(0,0,0,0.35); position:relative;">
          <div style="padding:16px 20px; background:#016738; color:#fff; display:flex; align-items:center; justify-content:space-between; border-top-left-radius:10px; border-top-right-radius:10px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
              <h3 style="margin:0; font-size:18px; font-weight:700; color:#fff;">অর্ডার নিশ্চিত করুন (ক্যাশ অন ডেলিভারি)</h3>
            </div>
            <button id="closeOrderModalBtn" style="background:none; border:none; color:#fff; font-size:24px; cursor:pointer; line-height:1;" aria-label="Close modal">&times;</button>
          </div>
          <div style="padding:22px;">
            <!-- Order items summary -->
            <div id="orderItemsSummaryBox" style="background:#f4faf6; border:1.5px solid #bfd9c9; border-radius:8px; padding:14px; margin-bottom:18px; font-size:14px;"></div>
            
            <form id="localOrderSubmitForm">
              <div style="margin-bottom:14px;">
                <label style="display:block; font-size:13px; font-weight:700; margin-bottom:5px; color:#153A27;">আপনার পুরো নাম <span style="color:#e53935;">*</span></label>
                <input type="text" id="custName" required placeholder="যেমন: মোঃ রফিকুল ইসলাম" style="width:100%; padding:11px 13px; border:1.5px solid #ccc; border-radius:6px; font-size:14px; box-sizing:border-box; outline:none; transition:border-color 0.2s;">
              </div>
              <div style="margin-bottom:14px;">
                <label style="display:block; font-size:13px; font-weight:700; margin-bottom:5px; color:#153A27;">১১ ডিজিটের মোবাইল নম্বর <span style="color:#e53935;">*</span></label>
                <input type="tel" id="custPhone" required placeholder="যেমন: 01712345678" pattern="[0-9০-৯\s\-+]{11,15}" style="width:100%; padding:11px 13px; border:1.5px solid #ccc; border-radius:6px; font-size:14px; box-sizing:border-box; outline:none;">
              </div>
              <div style="margin-bottom:14px;">
                <label style="display:block; font-size:13px; font-weight:700; margin-bottom:5px; color:#153A27;">সম্পূর্ণ ডেলিভারি ঠিকানা <span style="color:#e53935;">*</span></label>
                <textarea id="custAddress" required placeholder="বাসা/রোড নম্বর, এলাকা, থানা, জেলা" style="width:100%; padding:11px 13px; border:1.5px solid #ccc; border-radius:6px; font-size:14px; min-height:65px; box-sizing:border-box; outline:none; font-family:inherit;"></textarea>
              </div>
              <div style="margin-bottom:18px;">
                <label style="display:block; font-size:13px; font-weight:700; margin-bottom:6px; color:#153A27;">ডেলিভারি এলাকা নির্ধারণ করুন <span style="color:#e53935;">*</span></label>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                  <label id="lblDhakaArea" style="border:2px solid #016738; background:#eff8f3; padding:10px 14px; border-radius:8px; cursor:pointer; font-size:13px; display:flex; align-items:center; gap:8px;">
                    <input type="radio" name="local_delivery" value="dhaka" checked onchange="window.recalcOrderTotal()">
                    <div>
                      <strong style="color:#016738;">ঢাকার ভিতরে</strong><br>
                      <span style="font-size:12px; color:#555;">চার্জ: ৳৮০</span>
                    </div>
                  </label>
                  <label id="lblOutsideArea" style="border:2px solid #ddd; background:#fff; padding:10px 14px; border-radius:8px; cursor:pointer; font-size:13px; display:flex; align-items:center; gap:8px;">
                    <input type="radio" name="local_delivery" value="outside" onchange="window.recalcOrderTotal()">
                    <div>
                      <strong style="color:#153A27;">ঢাকার বাইরে</strong><br>
                      <span style="font-size:12px; color:#555;">চার্জ: ৳১৫০</span>
                    </div>
                  </label>
                </div>
              </div>
              <button type="submit" id="btnConfirmOrderSubmit" style="width:100%; background:#016738; color:#fff; border:none; padding:14px; border-radius:8px; font-size:17px; font-weight:800; cursor:pointer; box-shadow:0 6px 16px rgba(1,103,56,0.35); transition:background 0.2s ease;">
                অর্ডার সম্পন্ন করুন (<span id="btnOrderTotal">৳০</span>)
              </button>
              <div style="text-align:center; margin-top:10px; font-size:12px; color:#666;">
                ক্যাশ অন ডেলিভারি: পণ্য হাতে পেয়ে টাকা পরিশোধ করুন
              </div>
            </form>
          </div>
        </div>
      </div>

      <!-- Quick View Modal -->
      <div id="localQuickViewOverlay" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.65); z-index:100000; align-items:center; justify-content:center; padding:15px; font-family:'Anek Bangla',sans-serif; backdrop-filter:blur(3px);">
        <div id="localQuickViewBox" class="local-modal-animate" style="background:#fff; border-radius:10px; max-width:680px; width:100%; max-height:92vh; overflow-y:auto; box-shadow:0 20px 50px rgba(0,0,0,0.35); position:relative; display:flex; flex-direction:column;">
          <button id="closeQuickViewBtn" style="position:absolute; top:12px; right:14px; background:#f4faf6; border:1px solid #bfd9c9; border-radius:50%; width:32px; height:32px; font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center; color:#016738; z-index:2;">&times;</button>
          <div id="quickViewContent" style="padding:24px;"></div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Bind modal events
    document.getElementById('closeLocalCartBtn').addEventListener('click', closeLocalCartDrawer);
    document.getElementById('localCartOverlay').addEventListener('click', closeLocalCartDrawer);
    document.getElementById('openCheckoutModalBtn').addEventListener('click', () => {
      closeLocalCartDrawer();
      openOrderModal();
    });
    document.getElementById('closeOrderModalBtn').addEventListener('click', closeOrderModal);
    document.getElementById('closeQuickViewBtn').addEventListener('click', closeQuickViewModal);
    document.getElementById('localQuickViewOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'localQuickViewOverlay') closeQuickViewModal();
    });

    // Form submit
    document.getElementById('localOrderSubmitForm').addEventListener('submit', handleOrderSubmit);
  }

  function renderLocalCartItems() {
    const list = document.getElementById('localCartItemsList');
    const subtotalEl = document.getElementById('localCartSubtotalVal');
    const noticeEl = document.getElementById('freeShippingNoticeText');
    const fillEl = document.getElementById('freeShippingProgressFill');
    if (!list) return;

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    if (subtotalEl) subtotalEl.textContent = `৳${subtotal}`;

    // Free shipping calculation
    if (noticeEl && fillEl) {
      if (subtotal >= FREE_SHIPPING_THRESHOLD) {
        noticeEl.innerHTML = `অভিনন্দন! আপনি <strong>ফ্রি ডেলিভারি</strong> পাচ্ছেন!`;
        fillEl.style.width = '100%';
        fillEl.style.background = '#016738';
      } else {
        const remaining = FREE_SHIPPING_THRESHOLD - subtotal;
        const pct = Math.min(100, Math.round((subtotal / FREE_SHIPPING_THRESHOLD) * 100));
        noticeEl.innerHTML = `আর মাত্র <strong>৳${remaining}</strong> এর পণ্য কিনলে ফ্রি ডেলিভারি!`;
        fillEl.style.width = `${pct}%`;
        fillEl.style.background = '#fbbc34';
      }
    }

    if (cart.length === 0) {
      list.innerHTML = `
        <div style="text-align:center; padding:40px 20px; color:#888;">
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#016738" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:10px; display:inline-block;"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
          <div style="font-size:16px; font-weight:700; color:#153a27;">আপনার কার্ট খালি!</div>
          <p style="font-size:13px; color:#777; margin:6px 0 16px;">শপ পেজ থেকে আপনার পছন্দের বিশুদ্ধ অর্গানিক খাদ্যপণ্য যোগ করুন।</p>
          <a href="shop.html" style="display:inline-block; padding:10px 20px; background:#016738; color:#fff; border-radius:5px; text-decoration:none; font-weight:700; font-size:13px;">শপ দেখুন</a>
        </div>
      `;
      return;
    }

    list.innerHTML = cart.map(item => `
      <div style="display:flex; align-items:center; gap:12px; border-bottom:1px solid #eee; padding-bottom:12px;">
        <img src="${item.thumbnail}" style="width:58px; height:58px; object-fit:cover; border-radius:6px; border:1px solid #ddd;" alt="${item.name}">
        <div style="flex:1;">
          <a href="product-detail.html?id=${item.id}" style="font-weight:700; font-size:14px; color:#153A27; text-decoration:none; display:block; line-height:1.3; margin-bottom:4px;">${item.name}</a>
          <div style="font-size:13px; color:#016738; font-weight:700;">৳${item.price}</div>
          <div style="display:inline-flex; align-items:center; border:1px solid #ccc; border-radius:4px; margin-top:6px; overflow:hidden;">
            <button onclick="window.updateLocalCartQty('${item.id}', -1)" style="border:none; background:#f2f2f2; width:26px; height:24px; cursor:pointer; font-weight:bold; font-size:14px;">−</button>
            <span style="padding:0 10px; font-size:12px; font-weight:700;">${item.qty}</span>
            <button onclick="window.updateLocalCartQty('${item.id}', 1)" style="border:none; background:#f2f2f2; width:26px; height:24px; cursor:pointer; font-weight:bold; font-size:14px;">+</button>
          </div>
        </div>
        <button onclick="window.removeLocalCartItem('${item.id}')" style="background:none; border:none; color:#e53935; font-size:18px; cursor:pointer; padding:6px;" title="মুছে ফেলুন">&times;</button>
      </div>
    `).join('');
  }

  function openLocalCartDrawer() {
    injectLocalModals();
    renderLocalCartItems();
    const d = document.getElementById('localCartDrawer');
    const ov = document.getElementById('localCartOverlay');
    if (d && ov) {
      d.style.right = '0';
      ov.style.display = 'block';
    }
  }

  function closeLocalCartDrawer() {
    const d = document.getElementById('localCartDrawer');
    const ov = document.getElementById('localCartOverlay');
    if (d && ov) {
      d.style.right = '-460px';
      ov.style.display = 'none';
    }
  }

  window.openLocalCartDrawer = openLocalCartDrawer;
  window.closeLocalCartDrawer = closeLocalCartDrawer;

  let activeOrderItems = null;

  function openOrderModal(customItems = null) {
    injectLocalModals();
    activeOrderItems = customItems || cart;
    if (activeOrderItems.length === 0) {
      alert('আপনার কার্ট খালি! অনুগ্রহ করে পণ্য যুক্ত করুন।');
      return;
    }

    const subtotal = activeOrderItems.reduce((sum, i) => sum + (i.price * i.qty), 0);
    const box = document.getElementById('orderItemsSummaryBox');
    if (box) {
      box.innerHTML = `
        <div style="font-weight:700; color:#153a27; margin-bottom:8px; display:flex; justify-content:space-between;">
          <span>অর্ডারকৃত পণ্যসমূহ (${activeOrderItems.reduce((s, i) => s + i.qty, 0)}টি):</span>
        </div>
        <div style="max-height:140px; overflow-y:auto; display:flex; flex-direction:column; gap:6px; padding-right:4px;">
          ${activeOrderItems.map(i => `
            <div style="display:flex; justify-content:space-between; font-size:13px; color:#333;">
              <span>• ${i.name} (×${i.qty})</span>
              <strong style="color:#016738;">৳${i.price * i.qty}</strong>
            </div>
          `).join('')}
        </div>
        <div style="margin-top:10px; border-top:1px dashed #bfd9c9; padding-top:8px; display:flex; justify-content:space-between; font-size:14px; font-weight:700; color:#153a27;">
          <span>পণ্যের উপ-মোট:</span>
          <span style="color:#016738;">৳${subtotal}</span>
        </div>
      `;
    }

    window.recalcOrderTotal(activeOrderItems);

    const ov = document.getElementById('localOrderModalOverlay');
    if (ov) ov.style.display = 'flex';
  }

  window.openOrderModal = openOrderModal;

  window.recalcOrderTotal = function (items = null) {
    const orderItems = items || activeOrderItems || cart;
    const subtotal = orderItems.reduce((sum, i) => sum + (i.price * i.qty), 0);
    const area = document.querySelector('input[name="local_delivery"]:checked')?.value || 'dhaka';
    const isFree = subtotal >= FREE_SHIPPING_THRESHOLD;
    const delivery = isFree ? 0 : (area === 'outside' ? SHIPPING_OUTSIDE : SHIPPING_DHAKA);
    const grand = subtotal + delivery;

    // update radio border styling
    const lblDhaka = document.getElementById('lblDhakaArea');
    const lblOutside = document.getElementById('lblOutsideArea');
    if (lblDhaka && lblOutside) {
      if (area === 'dhaka') {
        lblDhaka.style.borderColor = '#016738';
        lblDhaka.style.background = '#eff8f3';
        lblOutside.style.borderColor = '#ddd';
        lblOutside.style.background = '#fff';
      } else {
        lblOutside.style.borderColor = '#016738';
        lblOutside.style.background = '#eff8f3';
        lblDhaka.style.borderColor = '#ddd';
        lblDhaka.style.background = '#fff';
      }
    }

    const btn = document.getElementById('btnOrderTotal');
    if (btn) btn.textContent = `৳${grand}`;
  };

  function closeOrderModal() {
    const ov = document.getElementById('localOrderModalOverlay');
    if (ov) ov.style.display = 'none';
    activeOrderItems = null;
  }

  function handleOrderSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('custName').value.trim();
    const rawPhone = document.getElementById('custPhone').value.trim();
    const phone = normalizeBengaliDigits(rawPhone).replace(/[^\d+]/g, '');
    const addr = document.getElementById('custAddress').value.trim();
    const area = document.querySelector('input[name="local_delivery"]:checked')?.value || 'dhaka';

    const orderItems = activeOrderItems || cart;
    if (orderItems.length === 0) {
      alert('অর্ডার করার জন্য কোনো পণ্য পাওয়া যায়নি!');
      return;
    }

    const subtotal = orderItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const isFree = subtotal >= FREE_SHIPPING_THRESHOLD;
    const deliveryCharge = isFree ? 0 : (area === 'outside' ? SHIPPING_OUTSIDE : SHIPPING_DHAKA);
    const grandTotal = subtotal + deliveryCharge;
    const orderId = 'ORD-' + Math.floor(100000 + Math.random() * 900000);
    const orderDate = new Date().toLocaleDateString('bn-BD', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    // Save order
    const orderRecord = {
      orderId,
      date: orderDate,
      customer: { name, phone, address: addr, area: area === 'dhaka' ? 'ঢাকার ভিতরে' : 'ঢাকার বাইরে' },
      items: [...orderItems],
      subtotal,
      deliveryCharge,
      grandTotal,
      status: 'প্রসেসিং (ক্যাশ অন ডেলিভারি)'
    };

    orders.unshift(orderRecord);
    localStorage.setItem('organic_orders', JSON.stringify(orders));

    closeOrderModal();

    // Prepare WhatsApp message
    const itemsText = orderItems.map(i => `• ${i.name} (৳${i.price} × ${i.qty})`).join('\n');
    const waText = `*নতুন অর্ডার কনফার্মেশন (অর্গানিক ফুড)*
-----------------------------------
*অর্ডার আইডি:* ${orderId}
*তারিখ:* ${orderDate}

*গ্রাহকের তথ্য:*
*নাম:* ${name}
*ফোন:* ${phone}
*ঠিকানা:* ${addr}
*ডেলিভারি এলাকা:* ${area === 'dhaka' ? 'ঢাকার ভিতরে (৳৮০)' : 'ঢাকার বাইরে (৳১৫০)'}

*অর্ডারকৃত পণ্যসমূহ:*
${itemsText}

-----------------------------------
*পণ্যের মূল্য:* ৳${subtotal}
*ডেলিভারি চার্জ:* ৳${deliveryCharge}
*সর্বমোট প্রদেয়:* ৳${grandTotal} (ক্যাশ অন ডেলিভারি)
-----------------------------------
অনুগ্রহ করে দ্রুত ডেলিভারির ব্যবস্থা করুন। ধন্যবাদ!`;

    // Empty cart if active order was whole cart
    if (!activeOrderItems || activeOrderItems === cart) {
      cart = [];
      saveCart();
    }

    // Open WhatsApp
    const waUrl = `https://wa.me/8801911125266?text=${encodeURIComponent(waText)}`;
    window.open(waUrl, '_blank');

    // Show celebration alert
    alert(`ধন্যবাদ ${name}!\n\nআপনার অর্ডারটি সফলভাবে সম্পন্ন হয়েছে।\nঅর্ডার আইডি: ${orderId}\nমোট প্রদেয়: ৳${grandTotal} (ক্যাশ অন ডেলিভারি)\n\nআমাদের প্রতিনিধি দ্রুত আপনার নম্বরে (${phone}) কল করে অর্ডার নিশ্চিত করবেন।`);
  }

  // --- QUICK VIEW MODAL ---
  function openQuickView(productId) {
    injectLocalModals();
    const p = products.find(x => String(x.id) === String(productId));
    if (!p) {
      location.href = `product-detail.html?id=${productId}`;
      return;
    }

    const modal = document.getElementById('localQuickViewOverlay');
    const box = document.getElementById('quickViewContent');
    const slug = (p.category_slugs && p.category_slugs[0]) || 'general';
    const catName = CATEGORY_NAMES[slug] || (p.categories && p.categories[0]) || 'অর্গানিক পণ্য';

    box.innerHTML = `
      <div class="organic-quickview-grid" style="display:grid; grid-template-columns:1fr 1.2fr; gap:24px; align-items:center;">
        <div>
          <img src="${p.thumbnail || p.images[0]}" style="width:100%; height:auto; border-radius:8px; object-fit:cover; border:1px solid #eee;" alt="${escapeHTML(p.name)}">
        </div>
        <div>
          <div style="font-size:12px; font-weight:700; color:#016738; text-transform:uppercase; margin-bottom:4px;">${escapeHTML(catName)}</div>
          <h2 style="font-size:20px; font-weight:800; color:#153a27; margin:0 0 10px; line-height:1.3;">${escapeHTML(p.name)}</h2>
          <div style="font-size:22px; font-weight:800; color:#016738; margin-bottom:14px;">
            ${p.regular_price && p.regular_price > p.price ? `<del style="color:#999; font-size:16px; margin-right:8px;">৳${p.regular_price}</del>` : ''}
            ৳${p.price}
          </div>
          <p style="font-size:14px; color:#555; line-height:1.6; margin-bottom:18px;">${escapeHTML(p.short_description || p.description?.slice(0, 150) || '১০০% খাঁটি ও বিশুদ্ধ খাদ্যপণ্য।')}</p>
          
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:18px;">
            <div style="display:flex; border:1.5px solid #ccc; border-radius:6px; overflow:hidden;">
              <button id="qvQtyMinus" type="button" style="width:34px; height:36px; border:none; background:#f5f5f5; cursor:pointer; font-size:16px; font-weight:bold;">−</button>
              <input type="text" id="qvQtyInput" value="1" readonly style="width:40px; border:none; text-align:center; font-weight:bold; font-size:14px;">
              <button id="qvQtyPlus" type="button" style="width:34px; height:36px; border:none; background:#f5f5f5; cursor:pointer; font-size:16px; font-weight:bold;">+</button>
            </div>
            <button id="qvAddToCartBtn" style="flex:1; background:#016738; color:#fff; border:none; padding:11px 16px; border-radius:6px; font-size:14px; font-weight:700; cursor:pointer;">
              + কার্টে রাখুন
            </button>
            <button id="qvBuyNowBtn" style="background:#fbbc34; color:#153a27; border:none; padding:11px 18px; border-radius:6px; font-size:14px; font-weight:800; cursor:pointer;">
              অর্ডার করুন
            </button>
          </div>

          <div style="font-size:13px; color:#666;">
            ক্যাশ অন ডেলিভারি সুবিধা &nbsp;|&nbsp; দ্রুত ডেলিভারি
          </div>
          <div style="margin-top:14px;">
            <a href="product-detail.html?id=${p.id}" style="color:#016738; font-weight:700; font-size:13px; text-decoration:underline;">সম্পূর্ণ বিবরণ দেখুন →</a>
          </div>
        </div>
      </div>
    `;

    // Quantity buttons
    const qtyInput = document.getElementById('qvQtyInput');
    document.getElementById('qvQtyMinus').addEventListener('click', () => {
      let q = parseInt(qtyInput.value, 10) || 1;
      if (q > 1) qtyInput.value = q - 1;
    });
    document.getElementById('qvQtyPlus').addEventListener('click', () => {
      let q = parseInt(qtyInput.value, 10) || 1;
      qtyInput.value = q + 1;
    });

    document.getElementById('qvAddToCartBtn').addEventListener('click', () => {
      const q = parseInt(qtyInput.value, 10) || 1;
      closeQuickViewModal();
      addToCart(p.id, p.name, p.price, p.thumbnail || p.images[0], q);
    });

    document.getElementById('qvBuyNowBtn').addEventListener('click', () => {
      const q = parseInt(qtyInput.value, 10) || 1;
      closeQuickViewModal();
      openOrderModal([{ id: p.id, name: p.name, price: p.price, thumbnail: p.thumbnail || p.images[0], qty: q }]);
    });

    modal.style.display = 'flex';
  }

  function closeQuickViewModal() {
    const modal = document.getElementById('localQuickViewOverlay');
    if (modal) modal.style.display = 'none';
  }

  // --- ENHANCE PRODUCT CARDS WITH "অর্ডার করুন" (BUY NOW) BUTTON ---
  function enhanceProductCards() {
    document.querySelectorAll('.wd-product-card-hover, .wd-add-btn').forEach(btnWrapper => {
      if (btnWrapper.querySelector('.wd-buy-now-btn')) return;
      const addBtn = btnWrapper.querySelector('.add_to_cart_button');
      if (!addBtn) return;
      const pid = addBtn.dataset.product_id;
      if (!pid) return;

      const buyBtn = document.createElement('a');
      buyBtn.href = 'javascript:void(0)';
      buyBtn.className = 'button wd-buy-now-btn';
      buyBtn.dataset.product_id = pid;
      buyBtn.style.cssText = 'background:#fbbc34 !important; color:#153a27 !important; font-weight:700 !important; border-radius:4px !important; padding:0 12px !important; margin-left:6px !important; display:inline-flex !important; align-items:center !important; justify-content:center !important; text-decoration:none !important; font-family:"Anek Bangla",sans-serif !important; font-size:13px !important; height:38px !important; cursor:pointer !important;';
      buyBtn.textContent = 'অর্ডার করুন';
      addBtn.insertAdjacentElement('afterend', buyBtn);
    });
  }

  // --- SHOP.HTML FILTER ENGINE ---
  function initShopFilterEngine() {
    const isShopPage = window.location.pathname.endsWith('shop.html') || window.location.href.includes('shop.html');
    if (!isShopPage) return;

    const urlParams = new URLSearchParams(window.location.search);
    const categoryParam = urlParams.get('category') || urlParams.get('filter_category');
    const searchParam = urlParams.get('search') || urlParams.get('s');
    const pageParam = parseInt(urlParams.get('page'), 10) || 1;

    applyShopFilter(categoryParam, searchParam, pageParam);

    // Sidebar category click interception
    document.querySelectorAll('.cat-item a, #sidebarCategoryList a').forEach(link => {
      link.addEventListener('click', (e) => {
        const href = link.getAttribute('href') || '';
        const match = href.match(/category=([a-zA-Z0-9_-]+)/);
        const catSlug = match ? match[1] : (link.dataset.category || 'all');

        e.preventDefault();
        const newUrl = catSlug === 'all' ? 'shop.html' : `shop.html?category=${catSlug}`;
        history.pushState(null, '', newUrl);
        applyShopFilter(catSlug, null, 1);
      });
    });

    // Handle browser back/forward buttons
    window.addEventListener('popstate', () => {
      const p = new URLSearchParams(window.location.search);
      applyShopFilter(p.get('category') || p.get('filter_category'), p.get('search') || p.get('s'), parseInt(p.get('page'), 10) || 1);
    });
  }

  function applyShopFilter(categorySlug, searchQuery, page = 1) {
    const grid = document.querySelector('.products.wd-products, .product-grid-item')?.closest('.products');
    if (!grid) return;

    const cards = grid.querySelectorAll('.product-grid-item, .wd-product');
    const activeSlug = (categorySlug || '').toLowerCase().trim();
    const query = (searchQuery || '').toLowerCase().trim();

    // 1. Highlight sidebar category
    document.querySelectorAll('.cat-item').forEach(item => {
      item.classList.remove('wd-active', 'current-cat');
      const link = item.querySelector('a');
      const href = link ? link.getAttribute('href') || '' : '';
      if (!activeSlug || activeSlug === 'all') {
        if (item.classList.contains('cat-item-all') || href === 'shop.html' || link?.dataset.category === 'all') {
          item.classList.add('wd-active', 'current-cat');
        }
      } else {
        if (href.includes(`category=${activeSlug}`) || item.dataset.slug === activeSlug || link?.dataset.category === activeSlug) {
          item.classList.add('wd-active', 'current-cat');
        }
      }
    });

    // 2. Filter items
    let visibleCount = 0;
    const matchedCards = [];

    cards.forEach(card => {
      const cardCat = (card.dataset.category || '').toLowerCase();
      const cardTitle = (card.querySelector('.wd-entities-title a, h3')?.textContent || '').toLowerCase();
      const cardClasses = card.className.toLowerCase();

      let matchesCat = true;
      if (activeSlug && activeSlug !== 'all') {
        matchesCat = cardCat === activeSlug || cardClasses.includes(`product_cat-${activeSlug}`);
      }

      let matchesSearch = true;
      if (query) {
        matchesSearch = cardTitle.includes(query) || cardCat.includes(query);
      }

      if (matchesCat && matchesSearch) {
        matchedCards.push(card);
      } else {
        card.style.display = 'none';
      }
    });

    // 3. Local Pagination (12 items per page)
    const PAGE_SIZE = 12;
    const totalMatched = matchedCards.length;
    const totalPages = Math.ceil(totalMatched / PAGE_SIZE) || 1;
    const currentPage = Math.min(Math.max(1, page), totalPages);

    matchedCards.forEach((card, idx) => {
      const shouldShow = (totalMatched <= PAGE_SIZE) || (idx >= (currentPage - 1) * PAGE_SIZE && idx < currentPage * PAGE_SIZE);
      card.style.display = shouldShow ? '' : 'none';
      if (shouldShow) visibleCount++;
    });

    // 4. Update result count text
    const resultCountEl = document.querySelector('.woocommerce-result-count');
    if (resultCountEl) {
      const catDisplayName = CATEGORY_NAMES[activeSlug] || activeSlug;
      if (query) {
        resultCountEl.innerHTML = `"${escapeHTML(query)}" এর জন্য <strong>${totalMatched}</strong> টি পণ্য পাওয়া গেছে`;
      } else if (activeSlug && activeSlug !== 'all') {
        resultCountEl.innerHTML = `ক্যাটাগরি <strong>"${escapeHTML(catDisplayName)}"</strong>: সর্বমোট <strong>${totalMatched}</strong> টি পণ্য`;
      } else {
        resultCountEl.innerHTML = `Showing ${Math.min(1, totalMatched)}&ndash;${visibleCount} of ${totalMatched} results`;
      }
    }

    // 5. Update pagination UI
    updateShopPaginationUI(currentPage, totalPages, activeSlug, query);

    // 6. Active filter indicator banner
    updateActiveFilterBadge(activeSlug, query);
  }

  function updateShopPaginationUI(currentPage, totalPages, activeSlug, query) {
    const paginContainer = document.querySelector('.wd-pagination, .woocommerce-pagination');
    if (!paginContainer) return;

    if (totalPages <= 1) {
      paginContainer.style.display = 'none';
      return;
    }

    paginContainer.style.display = 'block';
    let html = `<ul class="page-numbers">`;

    if (currentPage > 1) {
      html += `<li><a class="prev page-numbers" href="javascript:void(0)" onclick="window.goShopPage(${currentPage - 1})">&larr;</a></li>`;
    }

    for (let p = 1; p <= totalPages; p++) {
      if (p === currentPage) {
        html += `<li><span aria-current="page" class="page-numbers current">${p}</span></li>`;
      } else {
        html += `<li><a class="page-numbers" href="javascript:void(0)" onclick="window.goShopPage(${p})">${p}</a></li>`;
      }
    }

    if (currentPage < totalPages) {
      html += `<li><a class="next page-numbers" href="javascript:void(0)" onclick="window.goShopPage(${currentPage + 1})">&rarr;</a></li>`;
    }

    html += `</ul>`;
    paginContainer.innerHTML = html;
  }

  window.goShopPage = function (pageNum) {
    const p = new URLSearchParams(window.location.search);
    p.set('page', pageNum);
    history.pushState(null, '', `shop.html?${p.toString()}`);
    applyShopFilter(p.get('category') || p.get('filter_category'), p.get('search') || p.get('s'), pageNum);
    window.scrollTo({ top: 350, behavior: 'smooth' });
  };

  function updateActiveFilterBadge(activeSlug, query) {
    let badge = document.getElementById('activeFilterBadgeContainer');
    const headerTitleBox = document.querySelector('.wd-shop-result-count')?.parentElement || document.querySelector('.wd-shop-product');
    if (!headerTitleBox) return;

    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'activeFilterBadgeContainer';
      badge.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:15px; font-family:"Anek Bangla",sans-serif; flex-wrap:wrap;';
      headerTitleBox.insertAdjacentElement('beforebegin', badge);
    }

    if ((!activeSlug || activeSlug === 'all') && !query) {
      badge.style.display = 'none';
      badge.innerHTML = '';
      return;
    }

    const catName = CATEGORY_NAMES[activeSlug] || activeSlug;
    badge.style.display = 'flex';
    badge.innerHTML = `
      <span style="font-size:13px; font-weight:700; color:#153a27;">ফিল্টার সক্রিয়:</span>
      ${activeSlug && activeSlug !== 'all' ? `
        <span style="background:#eff8f3; border:1px solid #bfd9c9; color:#016738; padding:4px 10px; border-radius:15px; font-size:13px; font-weight:700; display:inline-flex; align-items:center; gap:6px;">
          ${escapeHTML(catName)}
          <a href="shop.html" onclick="event.preventDefault(); history.pushState(null,'','shop.html'); window.applyShopFilter('all');" style="color:#016738; text-decoration:none; font-weight:bold; cursor:pointer;">&times;</a>
        </span>
      ` : ''}
      ${query ? `
        <span style="background:#eff8f3; border:1px solid #bfd9c9; color:#016738; padding:4px 10px; border-radius:15px; font-size:13px; font-weight:700; display:inline-flex; align-items:center; gap:6px;">
          সার্চ: "${escapeHTML(query)}"
          <a href="shop.html" onclick="event.preventDefault(); history.pushState(null,'','shop.html'); window.applyShopFilter('all');" style="color:#016738; text-decoration:none; font-weight:bold; cursor:pointer;">&times;</a>
        </span>
      ` : ''}
      <button onclick="history.pushState(null,'','shop.html'); window.applyShopFilter('all');" style="background:none; border:none; color:#e53935; font-size:13px; font-weight:700; cursor:pointer; text-decoration:underline;">
        ফিল্টার মুছুন
      </button>
    `;
  }

  window.applyShopFilter = applyShopFilter;

  // --- PRODUCT-DETAIL.HTML DYNAMIC POPULATOR ---
  function populateProductDetailPage(productOverride = null) {
    const isProductPage = window.location.pathname.endsWith('product-detail.html') || window.location.href.includes('product-detail.html');
    if (!isProductPage) return;

    // 1. Determine Product ID
    let pid = null;
    if (productOverride) {
      if (typeof productOverride === 'object' && productOverride !== null) {
        pid = productOverride.id;
      } else if (typeof productOverride === 'string' || typeof productOverride === 'number') {
        pid = productOverride;
      }
    }

    if (!pid) {
      const urlParams = new URLSearchParams(window.location.search);
      // Check hash first if hash specifically specifies a product ID (e.g. #id=1058, #product_id=..., #83)
      if (window.location.hash) {
        const hash = window.location.hash;
        const m = hash.match(/(?:id|product_id|productId|p)=([0-9]+)/i) || hash.match(/^#([0-9]+)$/);
        if (m) pid = m[1];
      }

      // Support search params ?id=, ?product_id=, ?productId=, ?p=, ?slug=
      if (!pid) {
        pid = urlParams.get('id') || urlParams.get('product_id') || urlParams.get('productId') || urlParams.get('p') || urlParams.get('slug');
      }

      // Check sessionStorage fallback
      if (!pid) {
        try {
          pid = sessionStorage.getItem('current_product_id');
        } catch (e) {}
      }

      // Default to product 83 (ACME প্রিমিয়াম বিশুদ্ধ ঘি) if missing
      if (!pid) {
        pid = '83';
      }
    }

    // Ensure products is populated from window.ORGANIC_PRODUCTS or fallback if not already
    if ((!products || products.length === 0) && Array.isArray(window.ORGANIC_PRODUCTS) && window.ORGANIC_PRODUCTS.length > 0) {
      products = window.ORGANIC_PRODUCTS;
    } else if ((!products || products.length === 0) && typeof EMBEDDED_PRODUCTS_FALLBACK !== 'undefined') {
      products = EMBEDDED_PRODUCTS_FALLBACK;
    }

    if (!products || !products.length) return;

    // 2. Resolve Product from Catalog (Type-safe match string/number/slug)
    const targetId = String(pid).trim();
    const p = products.find(x => String(x.id).trim() === targetId) ||
              products.find(x => String(x.slug).trim() === targetId || decodeURIComponent(String(x.slug)).trim() === decodeURIComponent(targetId)) ||
              products.find(x => String(x.id).trim() === '83') ||
              products[0];

    if (!p) return;

    // Persist active product ID
    try {
      sessionStorage.setItem('current_product_id', String(p.id));
    } catch (e) {}

    // 3. Document Title
    document.title = `${p.name} – অর্গানিক ফুড`;

    // 4. Product Title Element(s)
    const titleEls = document.querySelectorAll('.product_title, h1.product_title, .wd-entities-title h1, h1.entry-title');
    titleEls.forEach(el => {
      el.textContent = p.name;
    });
    const mainTitleEl = titleEls[0] || document.querySelector('h1.product_title') || document.querySelector('.wd-entities-title h1');

    // 5. Container & Body Classes
    const slug = (p.category_slugs && p.category_slugs[0]) || 'ghee';
    const catName = CATEGORY_NAMES[slug] || (p.categories && p.categories[0]) || 'পণ্য';

    const singleProd = document.querySelector('.single-product-page, div[id^="product-"]');
    if (singleProd) {
      singleProd.id = `product-${p.id}`;
      singleProd.dataset.id = String(p.id);
      document.body.className = document.body.className.replace(/postid-\d+/g, `postid-${p.id}`);
      singleProd.className = singleProd.className.replace(/product_cat-[a-z0-9_-]+/g, `product_cat-${slug}`);
    }

    // Highlight active category in header navigation
    document.querySelectorAll('#menu-main-menu li').forEach(li => {
      li.classList.remove('current-product-ancestor', 'current-menu-parent', 'current-product-parent', 'current_page_item');
      const a = li.querySelector('a');
      if (a && (a.getAttribute('href') === `shop.html?category=${slug}` || (slug === 'all' && a.getAttribute('href') === 'shop.html'))) {
        li.classList.add('current-product-ancestor', 'current-menu-parent', 'current-product-parent');
      }
    });

    // 6. Breadcrumb (inject or update)
    let breadcrumb = document.querySelector('.woocommerce-breadcrumb, .wd-breadcrumbs');
    if (!breadcrumb && mainTitleEl) {
      breadcrumb = document.createElement('div');
      breadcrumb.className = 'woocommerce-breadcrumb wd-breadcrumbs';
      breadcrumb.style.cssText = 'margin-bottom:12px; font-size:14px; color:#666; font-family:"Anek Bangla",sans-serif;';
      mainTitleEl.insertAdjacentElement('beforebegin', breadcrumb);
    }
    if (breadcrumb) {
      breadcrumb.innerHTML = `<a href="index.html" style="color:#016738; text-decoration:none;">হোম</a> <span style="margin:0 5px; color:#aaa;">/</span> <a href="shop.html" style="color:#016738; text-decoration:none;">শপ</a> <span style="margin:0 5px; color:#aaa;">/</span> <a href="shop.html?category=${slug}" style="color:#016738; text-decoration:none;">${escapeHTML(catName)}</a> <span style="margin:0 5px; color:#aaa;">/</span> <span style="color:#153a27; font-weight:700;">${escapeHTML(p.name)}</span>`;
    }

    // 7. Price Element(s)
    const priceEls = document.querySelectorAll('.wd-single-price .price, p.price');
    priceEls.forEach(el => {
      if (el.closest('.wd-carousel-item') || el.closest('#carousel-870') || el.closest('.progress-msg')) return;
      if (p.regular_price && Number(p.regular_price) > Number(p.price)) {
        el.innerHTML = `<del aria-hidden="true"><span class="woocommerce-Price-amount amount"><bdi><span class="woocommerce-Price-currencySymbol">৳&nbsp;</span>${p.regular_price}</bdi></span></del> <ins><span class="woocommerce-Price-amount amount"><bdi><span class="woocommerce-Price-currencySymbol">৳&nbsp;</span>${p.price}</bdi></span></ins>`;
      } else {
        el.innerHTML = `<span class="woocommerce-Price-amount amount"><bdi><span class="woocommerce-Price-currencySymbol">৳&nbsp;</span>${p.price}</bdi></span>`;
      }
    });

    // 8. Product Images, Gallery, Thumbnails, Swiper & Zoom
    const imgs = (p.images && p.images.length > 0) ? p.images : (p.thumbnail ? [p.thumbnail] : ['assets/images/Organic-food-1.png']);
    let currentSlide = 0;

    const galleryWrap = document.querySelector('.woocommerce-product-gallery__wrapper .wd-carousel-wrap, .wd-gallery-images .wd-carousel-wrap');
    if (galleryWrap) {
      galleryWrap.style.display = 'flex';
      galleryWrap.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
      galleryWrap.style.transform = 'translate3d(0, 0, 0)';
      galleryWrap.innerHTML = imgs.map((src, idx) => `
        <div class="wd-carousel-item ${idx === 0 ? 'wd-active' : ''}" role="group" aria-label="${idx + 1} / ${imgs.length}" style="width:100%; min-width:100%; flex:0 0 100%;">
          <figure data-thumb="${src}" data-thumb-alt="${escapeHTML(p.name)} - Image ${idx + 1}" class="woocommerce-product-gallery__image" style="position:relative; overflow:hidden; margin:0;">
            <a data-elementor-open-lightbox="no" href="${src}">
              <img width="600" height="600" src="${src}" class="wp-post-image" alt="${escapeHTML(p.name)} - Image ${idx + 1}" title="${escapeHTML(p.name)}" data-caption="" data-src="${src}" data-large_image="${src}" data-large_image_width="1200" data-large_image_height="1200" decoding="async" srcset="" sizes="(max-width: 600px) 100vw, 600px" style="width:100%; height:auto; display:block; border-radius:8px;">
            </a>
          </figure>
        </div>
      `).join('');
    }

    function goToSlide(idx) {
      if (idx < 0) idx = 0;
      if (idx >= imgs.length) idx = imgs.length - 1;
      currentSlide = idx;

      const galleryEl = document.querySelector('.woocommerce-product-gallery__wrapper');
      if (galleryEl && galleryEl.swiper && typeof galleryEl.swiper.slideTo === 'function') {
        if (galleryEl.swiper.activeIndex !== currentSlide) {
          galleryEl.swiper.slideTo(currentSlide);
        }
      } else if (galleryWrap) {
        galleryWrap.style.transform = `translate3d(-${currentSlide * 100}%, 0, 0)`;
      }

      if (galleryWrap) {
        galleryWrap.querySelectorAll('.wd-carousel-item').forEach((item, i) => {
          item.classList.toggle('wd-active', i === currentSlide);
        });
      }

      // Update thumbnails
      const thumbItems = document.querySelectorAll('.wd-gallery-thumb .wd-carousel-item');
      thumbItems.forEach((t, i) => {
        t.classList.toggle('wd-active', i === currentSlide);
        t.classList.toggle('active-thumb', i === currentSlide);
        const box = t.querySelector('.wd-gallery-thumb-item');
        if (box) box.style.borderColor = i === currentSlide ? '#016738' : '#e0e0e0';
      });

      // Update enlarge link
      const enlargeLink = document.querySelector('.woodmart-show-product-gallery');
      if (enlargeLink && imgs[currentSlide]) {
        enlargeLink.href = imgs[currentSlide];
      }

      // Update arrow states
      const prevBtn = document.querySelector('.wd-gallery-images .wd-btn-arrow.wd-prev');
      const nextBtn = document.querySelector('.wd-gallery-images .wd-btn-arrow.wd-next');
      if (prevBtn) prevBtn.classList.toggle('wd-disabled', currentSlide === 0);
      if (nextBtn) nextBtn.classList.toggle('wd-disabled', currentSlide === imgs.length - 1);

      // Re-init jQuery zoom for active slide
      if (window.jQuery && window.jQuery.fn && window.jQuery.fn.zoom && galleryWrap) {
        try {
          const $activeFig = window.jQuery(galleryWrap).find('.wd-carousel-item.wd-active .woocommerce-product-gallery__image');
          $activeFig.trigger('zoom.destroy');
          $activeFig.zoom({ url: imgs[currentSlide], touch: false });
        } catch (err) {}
      }
    }

    // Direct image fallback updates
    document.querySelectorAll('.woocommerce-product-gallery img.wp-post-image, .woocommerce-product-gallery__image img').forEach(img => {
      img.src = imgs[0];
      img.srcset = '';
      img.alt = p.name;
      img.title = p.name;
      img.dataset.src = imgs[0];
      img.dataset.large_image = imgs[0];
      const a = img.closest('a');
      if (a) a.href = imgs[0];
    });

    // Clean up any existing .zoomImg
    document.querySelectorAll('.zoomImg').forEach(z => z.remove());

    // Re-initialize jQuery zoom
    if (window.jQuery && window.jQuery.fn && window.jQuery.fn.zoom) {
      try {
        window.jQuery('.woocommerce-product-gallery__image').each(function () {
          const $fig = window.jQuery(this);
          $fig.trigger('zoom.destroy');
          const bigSrc = $fig.find('img').attr('data-large_image') || $fig.find('a').attr('href') || imgs[0];
          $fig.zoom({ url: bigSrc, touch: false });
        });
      } catch (err) {}
    }

    // Gallery Thumbnails
    const thumbWrap = document.querySelector('.wd-gallery-thumb .wd-carousel-wrap');
    if (thumbWrap) {
      if (imgs.length > 1) {
        thumbWrap.innerHTML = imgs.map((src, idx) => `
          <div class="wd-carousel-item ${idx === 0 ? 'wd-active active-thumb' : ''}" role="group" data-index="${idx}" style="cursor:pointer; display:inline-block; margin-right:8px; width:70px;">
            <div class="wd-gallery-thumb-item" style="padding:3px; border:2px solid ${idx === 0 ? '#016738' : '#e0e0e0'}; border-radius:6px; transition:border-color 0.2s;">
              <img width="70" height="70" src="${src}" alt="${escapeHTML(p.name)}" style="width:100%; height:auto; display:block; border-radius:4px; object-fit:cover;">
            </div>
          </div>
        `).join('');

        thumbWrap.querySelectorAll('.wd-carousel-item').forEach((item, idx) => {
          item.addEventListener('click', () => goToSlide(idx));
        });
      } else {
        thumbWrap.innerHTML = '';
      }
    }

    // Prev / Next Arrows
    const prevArrow = document.querySelector('.wd-gallery-images .wd-btn-arrow.wd-prev');
    const nextArrow = document.querySelector('.wd-gallery-images .wd-btn-arrow.wd-next');
    if (prevArrow) {
      prevArrow.onclick = (e) => {
        const galleryEl = document.querySelector('.woocommerce-product-gallery__wrapper');
        if (galleryEl && galleryEl.swiper) {
          // Native swiper listener handles it
          return;
        }
        e.preventDefault();
        goToSlide(currentSlide - 1);
      };
    }
    if (nextArrow) {
      nextArrow.onclick = (e) => {
        const galleryEl = document.querySelector('.woocommerce-product-gallery__wrapper');
        if (galleryEl && galleryEl.swiper) {
          // Native swiper listener handles it
          return;
        }
        e.preventDefault();
        goToSlide(currentSlide + 1);
      };
    }

    // Swiper slide change sync
    const galleryEl = document.querySelector('.woocommerce-product-gallery__wrapper');
    if (galleryEl) {
      galleryEl.addEventListener('wdSlideChange', (e) => {
        const active = e.detail?.activeIndex ?? galleryEl.swiper?.activeIndex;
        if (typeof active === 'number') {
          goToSlide(active);
        }
      });
      if (galleryEl.swiper && typeof galleryEl.swiper.on === 'function') {
        galleryEl.swiper.on('slideChange', () => {
          if (typeof galleryEl.swiper.activeIndex === 'number') {
            goToSlide(galleryEl.swiper.activeIndex);
          }
        });
      }
    }

    goToSlide(0);

    // "Click to enlarge" Link
    const enlargeLink = document.querySelector('.woodmart-show-product-gallery');
    if (enlargeLink) {
      enlargeLink.href = imgs[0];
    }

    // 9. Short Description
    const shortDescEl = document.querySelector('.woocommerce-product-details__short-description');
    if (shortDescEl) {
      shortDescEl.innerHTML = `<p>${escapeHTML(p.short_description || '')}</p>`;
    }

    // 10. Full Description Tab
    const fullDescEl = document.querySelector('#tab-description, .woocommerce-Tabs-panel--description');
    if (fullDescEl && p.description) {
      const formattedDesc = escapeHTML(p.description).split('\n').join('<br>');
      fullDescEl.innerHTML = `
        <h2 style="font-family:'Anek Bangla',sans-serif; color:#153a27; margin-bottom:15px;">পণ্য বিবরণ</h2>
        <div class="product-full-description" style="font-size:15px; line-height:1.8; color:#444; font-family:'Anek Bangla',sans-serif;">
          ${formattedDesc}
        </div>
      `;
    }

    // 11. Reviews Tab
    const replyTitle = document.querySelector('#reply-title, .comment-reply-title');
    if (replyTitle) {
      replyTitle.innerHTML = `Be the first to review &ldquo;${escapeHTML(p.name)}&rdquo; <small><a rel="nofollow" id="cancel-comment-reply-link" href="#respond" style="display:none;">Cancel reply</a></small>`;
    }
    const commentPostId = document.querySelector('#comment_post_ID');
    if (commentPostId) commentPostId.value = String(p.id);
    const reviewsBox = document.querySelector('#reviews, .woocommerce-Reviews');
    if (reviewsBox) reviewsBox.dataset.productId = String(p.id);
    const estDel = document.querySelector('.wd-est-del');
    if (estDel) estDel.dataset.productId = String(p.id);

    // 12. Form cart setup
    const cartForm = document.querySelector('form.cart');
    if (cartForm) {
      cartForm.action = `product-detail.html?id=${p.id}`;
      // Prevent reload on Enter or submit
      cartForm.addEventListener('submit', (e) => {
        e.preventDefault();
      });

      // Quantity buttons type="button"
      cartForm.querySelectorAll('button.minus, button.plus').forEach(b => {
        b.type = 'button';
      });

      // Wire Add to Cart button
      const addBtn = cartForm.querySelector('.single_add_to_cart_button');
      if (addBtn) {
        addBtn.dataset.product_id = p.id;
        addBtn.value = p.id;
      }

      // Wire Buy Now button
      const buyBtn = cartForm.querySelector('.wd-buy-now-btn, #wd-add-to-cart');
      if (buyBtn) {
        buyBtn.dataset.product_id = p.id;
        buyBtn.value = p.id;
      }

      // Ensure no duplicate button exists
      const extraBtn = document.getElementById('singleProductDirectOrderBtn');
      if (extraBtn) extraBtn.remove();
    }

    // Quantity label
    const qtyLabel = document.querySelector('label[for^="quantity_"]');
    if (qtyLabel) {
      qtyLabel.textContent = `${p.name} quantity`;
    }

    // 13. Dynamic Related Products update
    const relatedGrid = document.querySelector('#carousel-870 .wd-carousel-wrap, .wd-products-element .wd-carousel-wrap');
    if (relatedGrid) {
      let related = products.filter(x => String(x.id) !== String(p.id) && x.category_slugs && x.category_slugs.includes(slug)).slice(0, 4);
      if (related.length === 0) {
        related = products.filter(x => String(x.id) !== String(p.id)).slice(0, 4);
      }
      if (related.length > 0) {
        relatedGrid.innerHTML = related.map(rp => `
          <div class="wd-carousel-item" role="group">
            <div class="wd-product wd-hover-fw-button wd-hover-with-fade product-grid-item product" data-id="${rp.id}">
              <div class="wd-product-wrapper product-wrapper">
                <div class="wd-product-thumb product-element-top wd-quick-shop">
                  <a href="product-detail.html?id=${rp.id}" class="wd-product-img-link product-image-link" aria-label="${escapeHTML(rp.name)}">
                    <img width="300" height="300" src="${rp.thumbnail || rp.images[0]}" class="attachment-large size-large" alt="${escapeHTML(rp.name)}" loading="lazy">
                  </a>
                  <div class="wd-buttons wd-pos-r-t">
                    <div class="wd-quick-view-btn wd-quick-view-icon wd-action-btn wd-style-icon">
                      <a href="javascript:void(0)" class="open-quick-view" data-id="${rp.id}" aria-label="Quick view">
                        <span class="wd-action-icon"></span>
                        <span class="wd-action-text">Quick view</span>
                      </a>
                    </div>
                  </div>
                </div>
                <div class="product-element-bottom">
                  <h3 class="wd-entities-title"><a href="product-detail.html?id=${rp.id}">${escapeHTML(rp.name)}</a></h3>
                  <div class="wrap-price">
                    <span class="price"><span class="woocommerce-Price-amount amount">৳${rp.price}</span></span>
                  </div>
                  <div class="wd-add-btn wd-add-btn-replace">
                    <a href="javascript:void(0)" class="button add_to_cart_button add-to-cart-loop" data-product_id="${rp.id}">
                      <span class="wd-action-icon"><span class="wd-check-icon"></span></span>
                      <span class="wd-action-text">+ কার্ট রাখুন</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `).join('');

        // Re-enhance newly rendered product cards (inject Buy Now button)
        enhanceProductCards();
      }
    }

    // 14. Update JSON-LD structured data
    const jsonLd = document.querySelector('script[type="application/ld+json"]');
    if (jsonLd) {
      try {
        const data = JSON.parse(jsonLd.textContent);
        data.name = p.name;
        data.image = imgs[0];
        if (data.offers && data.offers[0]) {
          data.offers[0].price = p.price;
        }
        jsonLd.textContent = JSON.stringify(data);
      } catch (e) {}
    }

    // 15. Update Elementor config if present
    if (window.elementorFrontendConfig && window.elementorFrontendConfig.post) {
      window.elementorFrontendConfig.post.id = p.id;
      window.elementorFrontendConfig.post.title = p.name;
      window.elementorFrontendConfig.post.excerpt = p.short_description || '';
    }
  }

  window.populateProductDetailPage = populateProductDetailPage;
  window.initProductDetailPage = populateProductDetailPage;

  // --- CART.HTML DYNAMIC RENDERER ---
  function renderCartPage() {
    const isCartPage = window.location.pathname.endsWith('cart.html') || window.location.href.includes('cart.html');
    if (!isCartPage) return;

    const mainContainer = document.querySelector('.woocommerce, article#post-12 .woocommerce');
    if (!mainContainer) return;

    if (cart.length === 0) {
      mainContainer.innerHTML = `
        <div class="woocommerce-notices-wrapper"></div>
        <div style="text-align:center; padding:50px 20px; font-family:'Anek Bangla',sans-serif;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#016738" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:12px; display:inline-block;"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
          <h2 style="font-size:22px; font-weight:800; color:#153A27; margin-bottom:8px;">আপনার শপিং কার্ট খালি</h2>
          <p style="color:#666; font-size:14px; margin-bottom:20px;">আপনার পছন্দের অর্গানিক খাদ্যপণ্য কিনতে এখনই শপ পেজে প্রবেশ করুন।</p>
          <a href="shop.html" class="button wc-backward" style="background:#016738; color:#fff; font-weight:700; padding:12px 24px; border-radius:6px; text-decoration:none;">শপে ফিরে যান</a>
        </div>
      `;
      return;
    }

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const isFree = subtotal >= FREE_SHIPPING_THRESHOLD;
    const delivery = isFree ? 0 : SHIPPING_DHAKA;
    const grand = subtotal + delivery;

    mainContainer.innerHTML = `
      <div style="font-family:'Anek Bangla',sans-serif;">
        <h1 style="font-size:24px; font-weight:800; color:#153a27; margin-bottom:20px;">শপিং কার্ট</h1>
        
        <div class="organic-cart-grid" style="display:grid; grid-template-columns:1.8fr 1fr; gap:30px;">
          <!-- Cart Table -->
          <div class="organic-cart-table-wrap" style="background:#fff; border:1px solid #e5e5e5; border-radius:8px; overflow:hidden;">
            <table style="width:100%; border-collapse:collapse; font-size:14px;">
              <thead>
                <tr style="background:#f7f9f8; border-bottom:1px solid #e5e5e5; text-align:left; color:#153A27;">
                  <th style="padding:14px;">পণ্য</th>
                  <th style="padding:14px;">মূল্য</th>
                  <th style="padding:14px; text-align:center;">পরিমাণ</th>
                  <th style="padding:14px;">উপ-মোট</th>
                  <th style="padding:14px; text-align:center;">মুছুন</th>
                </tr>
              </thead>
              <tbody>
                ${cart.map(item => `
                  <tr style="border-bottom:1px solid #eee;">
                    <td style="padding:14px; display:flex; align-items:center; gap:12px;">
                      <img src="${item.thumbnail}" style="width:50px; height:50px; object-fit:cover; border-radius:6px; border:1px solid #ddd;">
                      <a href="product-detail.html?id=${item.id}" style="color:#153A27; font-weight:700; text-decoration:none;">${item.name}</a>
                    </td>
                    <td style="padding:14px; color:#016738; font-weight:700;">৳${item.price}</td>
                    <td style="padding:14px; text-align:center;">
                      <div style="display:inline-flex; border:1px solid #ccc; border-radius:4px; overflow:hidden;">
                        <button onclick="window.updateLocalCartQty('${item.id}', -1)" style="border:none; background:#f5f5f5; width:28px; height:28px; cursor:pointer; font-weight:bold;">−</button>
                        <span style="padding:0 10px; line-height:28px; font-size:13px; font-weight:700;">${item.qty}</span>
                        <button onclick="window.updateLocalCartQty('${item.id}', 1)" style="border:none; background:#f5f5f5; width:28px; height:28px; cursor:pointer; font-weight:bold;">+</button>
                      </div>
                    </td>
                    <td style="padding:14px; color:#016738; font-weight:800;">৳${item.price * item.qty}</td>
                    <td style="padding:14px; text-align:center;">
                      <button onclick="window.removeLocalCartItem('${item.id}')" style="background:none; border:none; color:#e53935; font-size:18px; cursor:pointer;">&times;</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div style="padding:14px; background:#fafafa; display:flex; justify-content:space-between; align-items:center;">
              <a href="shop.html" style="color:#016738; font-weight:700; text-decoration:none; font-size:14px;">← আরও পণ্য কেনাকাটা করুন</a>
            </div>
          </div>

          <!-- Cart Totals Card -->
          <div style="background:#fff; border:1.5px solid #bfd9c9; border-radius:8px; padding:20px; height:fit-content;">
            <h3 style="font-size:18px; font-weight:800; color:#153a27; margin:0 0 16px; border-bottom:1px solid #eee; padding-bottom:10px;">অর্ডার সারসংক্ষেপ</h3>
            
            <div style="display:flex; justify-content:space-between; margin-bottom:12px; font-size:15px;">
              <span>পণ্যের মোট মূল্য:</span>
              <strong style="color:#016738;">৳${subtotal}</strong>
            </div>

            <div style="margin-bottom:14px; font-size:14px;">
              <div style="font-weight:700; margin-bottom:6px;">ডেলিভারি চার্জ:</div>
              <div style="display:flex; flex-direction:column; gap:6px; background:#f9fcfb; padding:10px; border-radius:6px; border:1px solid #e0ede5;">
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px;">
                  <input type="radio" name="cart_delivery" value="dhaka" checked onchange="window.updateCartPageTotal()">
                  <span>ঢাকার ভিতরে (৳৮০)</span>
                </label>
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px;">
                  <input type="radio" name="cart_delivery" value="outside" onchange="window.updateCartPageTotal()">
                  <span>ঢাকার বাইরে (৳১৫০)</span>
                </label>
              </div>
            </div>

            <div style="display:flex; justify-content:space-between; margin-top:14px; padding-top:12px; border-top:2px solid #eee; font-size:18px; font-weight:800; color:#153a27;">
              <span>সর্বমোট প্রদেয়:</span>
              <span id="cartPageGrandTotal" style="color:#016738;">৳${grand}</span>
            </div>

            <a href="checkout.html" style="display:block; width:100%; text-align:center; box-sizing:border-box; background:#016738; color:#fff; padding:13px; border-radius:6px; font-size:16px; font-weight:800; text-decoration:none; margin-top:18px; box-shadow:0 4px 12px rgba(1,103,56,0.3);">
              চেকআউটে এগিয়ে যান →
            </a>
          </div>
        </div>
      </div>
    `;
  }

  window.updateCartPageTotal = function () {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const area = document.querySelector('input[name="cart_delivery"]:checked')?.value || 'dhaka';
    const isFree = subtotal >= FREE_SHIPPING_THRESHOLD;
    const delivery = isFree ? 0 : (area === 'outside' ? SHIPPING_OUTSIDE : SHIPPING_DHAKA);
    const grand = subtotal + delivery;
    const el = document.getElementById('cartPageGrandTotal');
    if (el) el.textContent = `৳${grand}`;
  };

  // --- CHECKOUT.HTML DYNAMIC RENDERER ---
  function renderCheckoutPage() {
    const isCheckoutPage = window.location.pathname.endsWith('checkout.html') || window.location.href.includes('checkout.html');
    if (!isCheckoutPage) return;

    const mainContainer = document.querySelector('.woocommerce, article#post-12 .woocommerce');
    if (!mainContainer) return;

    if (cart.length === 0) {
      mainContainer.innerHTML = `
        <div style="text-align:center; padding:50px 20px; font-family:'Anek Bangla',sans-serif;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#016738" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:12px; display:inline-block;"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
          <h2 style="font-size:22px; font-weight:800; color:#153A27; margin-bottom:8px;">আপনার কার্টে কোনো পণ্য নেই</h2>
          <p style="color:#666; font-size:14px; margin-bottom:20px;">চেকআউট সম্পন্ন করার পূর্বে অনুগ্রহ করে পণ্য কার্টে যোগ করুন।</p>
          <a href="shop.html" style="display:inline-block; background:#016738; color:#fff; font-weight:700; padding:12px 24px; border-radius:6px; text-decoration:none;">শপে ফিরে যান</a>
        </div>
      `;
      return;
    }

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const isFree = subtotal >= FREE_SHIPPING_THRESHOLD;
    const delivery = isFree ? 0 : SHIPPING_DHAKA;
    const grand = subtotal + delivery;

    mainContainer.innerHTML = `
      <div style="font-family:'Anek Bangla',sans-serif;">
        <h1 style="font-size:24px; font-weight:800; color:#153a27; margin-bottom:20px;">চেকআউট (ক্যাশ অন ডেলিভারি)</h1>
        
        <form id="fullCheckoutPageForm" class="organic-checkout-grid" style="display:grid; grid-template-columns:1.2fr 1fr; gap:30px;">
          <!-- Billing Details -->
          <div style="background:#fff; border:1px solid #e0ede5; border-radius:8px; padding:24px;">
            <h3 style="font-size:18px; font-weight:800; color:#153A27; margin:0 0 18px; border-bottom:1px solid #eee; padding-bottom:10px;">ডেলিভারি তথ্য</h3>
            
            <div style="margin-bottom:14px;">
              <label style="display:block; font-size:14px; font-weight:700; margin-bottom:5px;">আপনার পুরো নাম <span style="color:red;">*</span></label>
              <input type="text" id="chkCustName" required placeholder="নাম লিখুন" style="width:100%; padding:11px; border:1px solid #ccc; border-radius:6px; font-size:14px; box-sizing:border-box;">
            </div>

            <div style="margin-bottom:14px;">
              <label style="display:block; font-size:14px; font-weight:700; margin-bottom:5px;">মোবাইল নম্বর <span style="color:red;">*</span></label>
              <input type="tel" id="chkCustPhone" required placeholder="১১ ডিজিটের সচল নম্বর" pattern="[0-9০-৯\s\-+]{11,15}" style="width:100%; padding:11px; border:1px solid #ccc; border-radius:6px; font-size:14px; box-sizing:border-box;">
            </div>

            <div style="margin-bottom:14px;">
              <label style="display:block; font-size:14px; font-weight:700; margin-bottom:5px;">সম্পূর্ণ ঠিকানা <span style="color:red;">*</span></label>
              <textarea id="chkCustAddress" required placeholder="বাসা/রোড, এলাকা, থানা, জেলা" style="width:100%; padding:11px; border:1px solid #ccc; border-radius:6px; font-size:14px; min-height:70px; box-sizing:border-box; font-family:inherit;"></textarea>
            </div>

            <div style="margin-bottom:16px;">
              <label style="display:block; font-size:14px; font-weight:700; margin-bottom:6px;">ডেলিভারি এলাকা <span style="color:red;">*</span></label>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <label style="border:1.5px solid #016738; background:#eff8f3; padding:10px; border-radius:6px; cursor:pointer; font-size:13px; display:flex; align-items:center; gap:6px;">
                  <input type="radio" name="chk_delivery" value="dhaka" checked onchange="window.recalcCheckoutPageTotal()">
                  <div><strong>ঢাকার ভিতরে</strong><br><span style="font-size:11px; color:#555;">চার্জ: ৳৮০</span></div>
                </label>
                <label style="border:1.5px solid #ccc; background:#fff; padding:10px; border-radius:6px; cursor:pointer; font-size:13px; display:flex; align-items:center; gap:6px;">
                  <input type="radio" name="chk_delivery" value="outside" onchange="window.recalcCheckoutPageTotal()">
                  <div><strong>ঢাকার বাইরে</strong><br><span style="font-size:11px; color:#555;">চার্জ: ৳১৫০</span></div>
                </label>
              </div>
            </div>

            <div>
              <label style="display:block; font-size:14px; font-weight:700; margin-bottom:5px;">অর্ডারের নোট (ঐচ্ছিক)</label>
              <input type="text" id="chkCustNotes" placeholder="ডেলিভারি সংক্রান্ত কোনো বিশেষ নির্দেশনা থাকলে লিখুন" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:6px; font-size:13px; box-sizing:border-box;">
            </div>
          </div>

          <!-- Order Summary -->
          <div style="background:#fff; border:1.5px solid #bfd9c9; border-radius:8px; padding:24px; height:fit-content;">
            <h3 style="font-size:18px; font-weight:800; color:#153A27; margin:0 0 16px; border-bottom:1px solid #eee; padding-bottom:10px;">আপনার অর্ডার</h3>
            
            <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:16px;">
              ${cart.map(i => `
                <div style="display:flex; justify-content:space-between; font-size:14px;">
                  <span style="color:#153a27;">${i.name} × <strong>${i.qty}</strong></span>
                  <span style="color:#016738; font-weight:700;">৳${i.price * i.qty}</span>
                </div>
              `).join('')}
            </div>

            <div style="border-top:1px dashed #bfd9c9; padding-top:12px; display:flex; justify-content:space-between; font-size:15px; margin-bottom:8px;">
              <span>উপ-মোট:</span>
              <strong style="color:#016738;">৳${subtotal}</strong>
            </div>

            <div style="display:flex; justify-content:space-between; font-size:14px; margin-bottom:14px;">
              <span>ডেলিভারি চার্জ:</span>
              <strong id="chkDeliveryVal" style="color:#016738;">৳${delivery}</strong>
            </div>

            <div style="border-top:2px solid #016738; padding-top:12px; display:flex; justify-content:space-between; font-size:18px; font-weight:800; color:#153a27; margin-bottom:18px;">
              <span>সর্বমোট প্রদেয়:</span>
              <span id="chkGrandTotalVal" style="color:#016738;">৳${grand}</span>
            </div>

            <div style="background:#eff8f3; border-left:4px solid #016738; padding:12px; border-radius:4px; font-size:13px; color:#153a27; margin-bottom:18px;">
              <strong>ক্যাশ অন ডেলিভারি:</strong> পণ্য বুঝে পেয়ে মূল্য পরিশোধ করুন।
            </div>

            <button type="submit" style="width:100%; background:#016738; color:#fff; border:none; padding:14px; border-radius:6px; font-size:16px; font-weight:800; cursor:pointer; box-shadow:0 4px 14px rgba(1,103,56,0.35);">
              অর্ডার কনফার্ম করুন (<span id="btnChkSubmitTotal">৳${grand}</span>)
            </button>
          </div>
        </form>
      </div>
    `;

    document.getElementById('fullCheckoutPageForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('chkCustName').value.trim();
      const rawPhone = document.getElementById('chkCustPhone').value.trim();
      const phone = normalizeBengaliDigits(rawPhone).replace(/[^\d+]/g, '');
      const addr = document.getElementById('chkCustAddress').value.trim();
      const area = document.querySelector('input[name="chk_delivery"]:checked')?.value || 'dhaka';

      const orderItems = [...cart];
      const sub = orderItems.reduce((s, i) => s + (i.price * i.qty), 0);
      const isF = sub >= FREE_SHIPPING_THRESHOLD;
      const del = isF ? 0 : (area === 'outside' ? SHIPPING_OUTSIDE : SHIPPING_DHAKA);
      const gr = sub + del;
      const orderId = 'ORD-' + Math.floor(100000 + Math.random() * 900000);
      const orderDate = new Date().toLocaleDateString('bn-BD', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

      // Save order
      orders.unshift({
        orderId,
        date: orderDate,
        customer: { name, phone, address: addr, area: area === 'dhaka' ? 'ঢাকার ভিতরে' : 'ঢাকার বাইরে' },
        items: orderItems,
        subtotal: sub,
        deliveryCharge: del,
        grandTotal: gr,
        status: 'প্রসেসিং (ক্যাশ অন ডেলিভারি)'
      });
      localStorage.setItem('organic_orders', JSON.stringify(orders));

      // Clear cart
      cart = [];
      saveCart();

      // Open WhatsApp
      const itemsText = orderItems.map(i => `• ${i.name} (৳${i.price} × ${i.qty})`).join('\n');
      const waText = `*নতুন অর্ডার কনফার্মেশন (অর্গানিক ফুড)*\nঅর্ডার আইডি: ${orderId}\nতারিখ: ${orderDate}\nনাম: ${name}\nফোন: ${phone}\nঠিকানা: ${addr}\nপণ্যসমূহ:\n${itemsText}\nমোট প্রদেয়: ৳${gr} (ক্যাশ অন ডেলিভারি)`;
      window.open(`https://wa.me/8801911125266?text=${encodeURIComponent(waText)}`, '_blank');

      alert(`ধন্যবাদ ${name}!\nআপনার অর্ডারটি সফলভাবে সম্পন্ন হয়েছে।\nঅর্ডার আইডি: ${orderId}\nমোট প্রদেয়: ৳${gr} (ক্যাশ অন ডেলিভারি)`);
      window.location.href = 'index.html';
    });
  }

  window.recalcCheckoutPageTotal = function () {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const area = document.querySelector('input[name="chk_delivery"]:checked')?.value || 'dhaka';
    const isFree = subtotal >= FREE_SHIPPING_THRESHOLD;
    const delivery = isFree ? 0 : (area === 'outside' ? SHIPPING_OUTSIDE : SHIPPING_DHAKA);
    const grand = subtotal + delivery;

    document.getElementById('chkDeliveryVal').textContent = `৳${delivery}`;
    document.getElementById('chkGrandTotalVal').textContent = `৳${grand}`;
    document.getElementById('btnChkSubmitTotal').textContent = `৳${grand}`;
  };

  // --- MY-ACCOUNT.HTML ORDERS RENDERER ---
  function initMyAccountOrders() {
    const isAccountPage = window.location.pathname.endsWith('my-account.html') || window.location.href.includes('my-account.html');
    if (!isAccountPage) return;

    const mainContainer = document.querySelector('.woocommerce-MyAccount-content, .woocommerce');
    if (!mainContainer || orders.length === 0) return;

    const ordersHTML = `
      <div style="margin-top:25px; font-family:'Anek Bangla',sans-serif;">
        <h3 style="font-size:20px; font-weight:800; color:#153A27; margin-bottom:14px;">আপনার সাম্প্রতিক অর্ডারসমূহ</h3>
        <div style="display:flex; flex-direction:column; gap:12px;">
          ${orders.map(o => `
            <div style="background:#fff; border:1.5px solid #bfd9c9; border-radius:8px; padding:16px; box-shadow:0 2px 8px rgba(0,0,0,0.05);">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid #eee; padding-bottom:8px;">
                <div>
                  <strong style="color:#016738; font-size:15px;">${o.orderId}</strong>
                  <span style="font-size:12px; color:#888; margin-left:8px;">${o.date}</span>
                </div>
                <span style="background:#eff8f3; color:#016738; font-weight:700; font-size:12px; padding:3px 10px; border-radius:12px; border:1px solid #bfd9c9;">
                  ${o.status || 'প্রসেসিং'}
                </span>
              </div>
              <div style="font-size:13px; color:#555; margin-bottom:8px;">
                ${o.items.map(i => `${i.name} (×${i.qty})`).join(', ')}
              </div>
              <div style="display:flex; justify-content:space-between; font-size:14px; font-weight:700;">
                <span>সর্বমোট: <strong style="color:#016738;">৳${o.grandTotal}</strong></span>
                <a href="https://wa.me/8801911125266?text=${encodeURIComponent('আসসালামু আলাইকুম, আমি আমার অর্ডার ' + o.orderId + ' সম্পর্কে জানতে চাই।')}" target="_blank" style="color:#016738; text-decoration:none; font-size:13px;">WhatsApp-এ হেল্প চান →</a>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    mainContainer.insertAdjacentHTML('beforeend', ordersHTML);
  }

  // --- INTERCEPT EVENTS ON WOODMART DOM ---
  function bindWoodmartEvents() {
    injectEnhancementStyles();
    injectLocalModals();
    updateWoodmartCartUI();
    enhanceProductCards();

    // Product Link & Card Click Delegation
    document.addEventListener('click', (e) => {
      const pLink = e.target.closest('a[href*="product-detail.html"]');
      if (pLink) {
        const href = pLink.getAttribute('href') || '';
        const m = href.match(/[?&](?:id|product_id|productId|p)=([0-9]+)/i);
        if (m) {
          try {
            sessionStorage.setItem('current_product_id', m[1]);
          } catch (err) {}
        }
      }

      // Card click delegation (when clicking outside action buttons/links)
      const pCard = e.target.closest('.wd-product, .product-grid-item');
      if (pCard && !e.target.closest('a, button, input, textarea, select, .wd-action-btn, .quantity')) {
        const pid = pCard.dataset.id || pCard.querySelector('a[href*="product-detail.html"]')?.getAttribute('href')?.match(/[?&](?:id|product_id|productId|p)=([0-9]+)/i)?.[1];
        if (pid) {
          try {
            sessionStorage.setItem('current_product_id', String(pid));
          } catch (err) {}
          window.location.href = `product-detail.html?id=${pid}`;
        }
      }
    });

    // Global Quantity Steppers (+ / -) handler
    document.addEventListener('click', (e) => {
      const minusBtn = e.target.closest('.quantity .minus, .quantity-button.minus');
      if (minusBtn) {
        e.preventDefault();
        e.stopPropagation();
        const input = minusBtn.closest('.quantity')?.querySelector('input.qty, input[name="quantity"]');
        if (input) {
          let val = parseInt(input.value, 10) || 1;
          if (val > 1) {
            input.value = val - 1;
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
        return;
      }

      const plusBtn = e.target.closest('.quantity .plus, .quantity-button.plus');
      if (plusBtn) {
        e.preventDefault();
        e.stopPropagation();
        const input = plusBtn.closest('.quantity')?.querySelector('input.qty, input[name="quantity"]');
        if (input) {
          let val = parseInt(input.value, 10) || 1;
          input.value = val + 1;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return;
      }

      // 1. Add to Cart click delegation (.add_to_cart_button, .single_add_to_cart_button)
      const addBtn = e.target.closest('.add_to_cart_button, .single_add_to_cart_button');
      if (addBtn) {
        e.preventDefault();
        e.stopPropagation();

        const card = addBtn.closest('.wd-product, .product, .product-grid-item') || document;
        const pid = addBtn.dataset.product_id || addBtn.value || card.dataset.id || new URLSearchParams(window.location.search).get('id') || Date.now();
        const pObj = products.find(x => String(x.id) === String(pid));

        const titleEl = card.querySelector('.wd-entities-title a, .product-title a, h1.product_title');
        const priceEl = card.querySelector('.price ins .amount, .price .amount, .amount');
        const imgEl = card.querySelector('.product-image-link img, .woocommerce-product-gallery__image img, img');

        const title = pObj?.name || (titleEl ? titleEl.textContent.trim() : 'অর্গানিক ফুড পণ্য');
        const price = pObj?.price || parseFloat(priceEl?.textContent.replace(/[^\d.]/g, '') || 500);
        const img = pObj?.thumbnail || (imgEl ? imgEl.src : 'assets/images/Organic-food-1.png');

        // Check if on single product page with quantity input
        let qty = 1;
        const cardQtyInput = card.querySelector('input.qty, input[name="quantity"]');
        if (cardQtyInput) {
          qty = parseInt(cardQtyInput.value, 10) || 1;
        } else if (addBtn.closest('form.cart') || addBtn.classList.contains('single_add_to_cart_button')) {
          const formQty = document.querySelector('form.cart input[name="quantity"]');
          qty = formQty ? (parseInt(formQty.value, 10) || 1) : 1;
        } else {
          qty = 1;
        }

        addToCart(pid, title, price, img, qty);
      }

      // 2. Buy Now button (.wd-buy-now-btn, #wd-add-to-cart)
      const buyBtn = e.target.closest('.wd-buy-now-btn, #wd-add-to-cart');
      if (buyBtn) {
        e.preventDefault();
        e.stopPropagation();

        const card = buyBtn.closest('.wd-product, .product') || document;
        const pid = buyBtn.dataset.product_id || buyBtn.value || card.dataset.id || new URLSearchParams(window.location.search).get('id') || Date.now();
        const pObj = products.find(x => String(x.id) === String(pid));

        const titleEl = card.querySelector('.wd-entities-title a, .product-title a, h1.product_title');
        const priceEl = card.querySelector('.price ins .amount, .price .amount, .amount');
        const imgEl = card.querySelector('.product-image-link img, .woocommerce-product-gallery__image img, img');

        const title = pObj?.name || (titleEl ? titleEl.textContent.trim() : 'অর্গানিক ফুড পণ্য');
        const price = pObj?.price || parseFloat(priceEl?.textContent.replace(/[^\d.]/g, '') || 500);
        const img = pObj?.thumbnail || (imgEl ? imgEl.src : 'assets/images/Organic-food-1.png');

        let qty = 1;
        const cardQtyInput = card.querySelector('input.qty, input[name="quantity"]');
        if (cardQtyInput) {
          qty = parseInt(cardQtyInput.value, 10) || 1;
        } else if (buyBtn.closest('form.cart') || buyBtn.id === 'wd-add-to-cart') {
          const formQty = document.querySelector('form.cart input[name="quantity"]');
          qty = formQty ? (parseInt(formQty.value, 10) || 1) : 1;
        } else {
          qty = 1;
        }

        openOrderModal([{ id: pid, name: title, price: price, thumbnail: img, qty: qty }]);
      }

      // 3. Quick View button (.open-quick-view, .wd-quick-view-btn)
      const qvBtn = e.target.closest('.open-quick-view, .wd-quick-view-btn a');
      if (qvBtn) {
        e.preventDefault();
        e.stopPropagation();
        const pid = qvBtn.dataset.id || qvBtn.closest('[data-id]')?.dataset.id;
        if (pid) {
          openQuickView(pid);
        }
      }

      // 4. Cart opener click (.whb-cart, .wd-header-cart, .cart-widget-opener, .open-cart-btn)
      const cartOpener = e.target.closest('.whb-cart, .wd-header-cart, .cart-widget-opener, .open-cart-btn');
      if (cartOpener) {
        e.preventDefault();
        openLocalCartDrawer();
      }

      // 5. Mobile toolbar cart icon
      const toolbarCart = e.target.closest('.wd-toolbar-cart, [data-key="cart"]');
      if (toolbarCart) {
        e.preventDefault();
        openLocalCartDrawer();
      }

      // 6. Mobile navigation drawer toggle
      const mobNavBtn = e.target.closest('.wd-header-mobile-nav, [aria-label="Open mobile menu"]');
      if (mobNavBtn) {
        e.preventDefault();
        const mobNav = document.querySelector('.mobile-nav');
        const closeSide = document.querySelector('.wd-close-side');
        if (mobNav) mobNav.classList.add('wd-opened');
        if (closeSide) closeSide.classList.add('wd-close-side-opened');
      }

      const closeNavBtn = e.target.closest('.wd-close-side, .close-side-widget, .close-mobile-nav');
      if (closeNavBtn) {
        const mobNav = document.querySelector('.mobile-nav');
        const closeSide = document.querySelector('.wd-close-side');
        if (mobNav) mobNav.classList.remove('wd-opened');
        if (closeSide) closeSide.classList.remove('wd-close-side-opened');
      }
    });

    // 7. Live Search Input interception
    document.querySelectorAll('.woodmart-ajax-search input.s, input[name="s"]').forEach(input => {
      input.addEventListener('input', (e) => {
        const query = e.target.value.trim().toLowerCase();
        const resultsContainer = input.closest('.woodmart-ajax-search')?.querySelector('.wd-search-results') ||
                                 document.querySelector('.wd-search-results');

        if (!resultsContainer || !products.length) return;

        if (query.length < 2) {
          resultsContainer.style.display = 'none';
          resultsContainer.innerHTML = '';
          return;
        }

        const matches = products.filter(p => {
          const name = (p.name || '').toLowerCase();
          const cats = (p.categories || []).join(' ').toLowerCase();
          return name.includes(query) || cats.includes(query);
        });

        if (matches.length === 0) {
          resultsContainer.innerHTML = `<div style="padding:15px; text-align:center; color:#888; font-family:'Anek Bangla',sans-serif;">"${escapeHTML(query)}" পাওয়া যায়নি।</div>`;
        } else {
          resultsContainer.innerHTML = matches.slice(0, 6).map(p => `
            <div style="display:flex; align-items:center; gap:12px; padding:10px 14px; border-bottom:1px solid #eee; cursor:pointer; font-family:'Anek Bangla',sans-serif; transition:background 0.2s;" onmouseover="this.style.background='#f4faf6'" onmouseout="this.style.background='#fff'" onclick="location.href='product-detail.html?id=${p.id}'">
              <img src="${p.thumbnail || p.images[0]}" style="width:42px; height:42px; object-fit:cover; border-radius:5px; border:1px solid #ddd;">
              <div style="flex:1;">
                <div style="font-weight:700; font-size:13px; color:#153A27; line-height:1.3;">${p.name}</div>
                <div style="color:#016738; font-size:12px; font-weight:800; margin-top:2px;">৳${p.price}</div>
              </div>
              <span style="font-size:12px; color:#016738; font-weight:bold;">দেখুন →</span>
            </div>
          `).join('');
        }
        resultsContainer.style.display = 'block';
      });

      // Form submission
      const form = input.closest('form');
      if (form) {
        form.addEventListener('submit', (e) => {
          const q = input.value.trim();
          if (q) {
            e.preventDefault();
            window.location.href = `shop.html?search=${encodeURIComponent(q)}`;
          }
        });
      }
    });

    // Close search dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.woodmart-ajax-search')) {
        document.querySelectorAll('.wd-search-results').forEach(el => {
          el.style.display = 'none';
        });
      }
    });
  }

  // --- INITIALIZE ON DOM READY & REACTIVE HISTORY NAVIGATION ---
  async function initializeApp() {
    await loadProducts();
    bindWoodmartEvents();
    initShopFilterEngine();
    populateProductDetailPage();
    renderCartPage();
    renderCheckoutPage();
    initMyAccountOrders();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
  } else {
    initializeApp();
  }

  // Reactive listeners for popstate, hashchange, and bfcache pageshow
  window.addEventListener('popstate', () => {
    populateProductDetailPage();
  });
  window.addEventListener('hashchange', () => {
    populateProductDetailPage();
  });
  window.addEventListener('pageshow', () => {
    populateProductDetailPage();
  });

})();
