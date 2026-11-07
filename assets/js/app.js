/**
 * ORGANIC FOOD E-COMMERCE - CORE APPLICATION JAVASCRIPT
 * Target: https://demo11.itservicelab.com/
 * Features: Product rendering, Hero Slider, Live Search, Cart State, 
 * Direct 1-Click Checkout, Quick View Modal, Toast notifications.
 */

(function () {
  'use strict';

  // --- STATE ---
  let products = [];
  let categories = [];
  let cart = JSON.parse(localStorage.getItem('organic_cart')) || [];
  let currentSlide = 0;
  let slideInterval = null;
  let activeCategoryFilter = 'all';

  // Shipping constants
  const SHIPPING_DHAKA = 80;
  const SHIPPING_OUTSIDE = 150;
  const FREE_SHIPPING_THRESHOLD = 1500;

  // --- DOM ELEMENTS ---
  const cartDrawer = document.getElementById('cartDrawer');
  const cartOverlay = document.getElementById('cartDrawerOverlay');
  const cartDrawerItems = document.getElementById('cartDrawerItems');
  const cartDrawerSubtotal = document.getElementById('cartDrawerSubtotal');
  const cartCountBadges = document.querySelectorAll('.cart-count-badge');
  const cartHeaderSubtotal = document.getElementById('cartHeaderSubtotal');
  const shippingFill = document.getElementById('shippingProgressFill');
  const shippingText = document.getElementById('shippingProgressText');

  const searchInput = document.getElementById('searchInput');
  const searchResultsDropdown = document.getElementById('searchResultsDropdown');
  const searchCategorySelect = document.getElementById('searchCategorySelect');

  const quickViewOverlay = document.getElementById('quickViewOverlay');
  const orderModalOverlay = document.getElementById('orderModalOverlay');
  const successModalOverlay = document.getElementById('successModalOverlay');

  // --- INITIALIZATION ---
  document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    initHeroSlider();
    initSearch();
    renderCategories();
    renderSpecialDiscountSection();
    renderGheeSection();
    renderOilSection();
    renderAllProductsSection();
    updateCartUI();
    initEventListeners();
  });

  // --- LOAD DATA ---
  async function loadData() {
    try {
      const prodRes = await fetch('data/products.json');
      products = await prodRes.json();

      const catRes = await fetch('data/categories.json');
      categories = await catRes.json();
    } catch (err) {
      console.error('Failed to load JSON data, trying fallback...', err);
    }
  }

  // --- HERO SLIDER ---
  function initHeroSlider() {
    const slides = document.querySelectorAll('.hero-slide');
    const dots = document.querySelectorAll('.slider-dot');
    const prevBtn = document.getElementById('sliderPrev');
    const nextBtn = document.getElementById('sliderNext');

    if (!slides.length) return;

    function goToSlide(index) {
      slides[currentSlide].classList.remove('active');
      if (dots[currentSlide]) dots[currentSlide].classList.remove('active');

      currentSlide = (index + slides.length) % slides.length;

      slides[currentSlide].classList.add('active');
      if (dots[currentSlide]) dots[currentSlide].classList.add('active');
    }

    if (prevBtn) prevBtn.addEventListener('click', () => { goToSlide(currentSlide - 1); resetInterval(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { goToSlide(currentSlide + 1); resetInterval(); });

    dots.forEach((dot, idx) => {
      dot.addEventListener('click', () => {
        goToSlide(idx);
        resetInterval();
      });
    });

    function resetInterval() {
      clearInterval(slideInterval);
      slideInterval = setInterval(() => goToSlide(currentSlide + 1), 4500);
    }

    resetInterval();
  }

  // --- RENDER CATEGORIES ---
  function renderCategories() {
    const container = document.getElementById('categoryGrid');
    if (!container) return;

    container.innerHTML = categories.map(cat => `
      <div class="category-card" onclick="window.filterByCategory('${cat.slug}')">
        <div class="category-img-wrap">
          <img src="${cat.image}" alt="${cat.name}" loading="lazy">
        </div>
        <div class="category-name">${cat.name}</div>
        <div class="category-count">${cat.count} টি পণ্য</div>
      </div>
    `).join('');

    // Populate search select
    if (searchCategorySelect) {
      searchCategorySelect.innerHTML = `<option value="all">সকল ক্যাটাগরি</option>` +
        categories.map(c => `<option value="${c.slug}">${c.name}</option>`).join('');
    }
  }

  // --- PRODUCT CARD TEMPLATE ---
  function createProductCardHTML(p) {
    const discountBadge = p.discount_percent > 0
      ? `<span class="badge-discount">${p.discount_percent}% ছাড়</span>`
      : '';

    const regularPriceHTML = p.regular_price > p.price
      ? `<span class="regular-price">৳${p.regular_price}</span>`
      : '';

    const categoryName = p.categories && p.categories.length > 0 ? p.categories[0] : 'অর্গানিক';

    return `
      <div class="product-card" data-id="${p.id}">
        <div class="product-thumb-wrap">
          ${discountBadge}
          <img src="${p.thumbnail}" alt="${p.name}" loading="lazy">
          <button class="quick-view-btn" onclick="window.openQuickView(${p.id})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            দ্রুত দেখুন
          </button>
        </div>
        <div class="product-content">
          <div class="product-category-tag">${categoryName}</div>
          <h3 class="product-title" title="${p.name}">
            <a href="javascript:void(0)" onclick="window.openQuickView(${p.id})">${p.name}</a>
          </h3>
          <div class="product-rating">
            <span>*****</span>
            <span class="rating-count">(${p.review_count || 12})</span>
          </div>
          <div class="product-price-box">
            <span class="current-price">৳${p.price}</span>
            ${regularPriceHTML}
          </div>
          <div class="product-card-actions">
            <button class="btn-buy-now" onclick="window.openDirectOrder(${p.id})">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
              অর্ডার করুন
            </button>
            <button class="btn-add-cart" onclick="window.addToCart(${p.id})">
              কার্টে রাখুন
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // --- SECTION RENDERS ---
  function renderSpecialDiscountSection() {
    const container = document.getElementById('specialDiscountGrid');
    if (!container) return;
    const discounted = products.filter(p => p.discount_percent > 0).slice(0, 4);
    container.innerHTML = discounted.map(createProductCardHTML).join('');
  }

  function renderGheeSection() {
    const container = document.getElementById('gheeGrid');
    if (!container) return;
    const gheeItems = products.filter(p => p.category_slugs && p.category_slugs.includes('ghee')).slice(0, 4);
    container.innerHTML = gheeItems.map(createProductCardHTML).join('');
  }

  function renderOilSection() {
    const container = document.getElementById('oilGrid');
    if (!container) return;
    const oilItems = products.filter(p => p.category_slugs && p.category_slugs.includes('oil')).slice(0, 4);
    container.innerHTML = oilItems.map(createProductCardHTML).join('');
  }

  function renderAllProductsSection() {
    const container = document.getElementById('allProductsGrid');
    if (!container) return;

    let filtered = products;
    if (activeCategoryFilter !== 'all') {
      filtered = products.filter(p => p.category_slugs && p.category_slugs.includes(activeCategoryFilter));
    }

    container.innerHTML = filtered.map(createProductCardHTML).join('');
  }

  // --- FILTER BY CATEGORY ---
  window.filterByCategory = function (slug) {
    activeCategoryFilter = slug;

    // Update active tab buttons
    document.querySelectorAll('.filter-tab-btn').forEach(btn => {
      if (btn.dataset.category === slug) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    renderAllProductsSection();

    // Scroll smoothly to all products section
    const sec = document.getElementById('allProductsSection');
    if (sec) {
      sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // --- LIVE SEARCH ---
  function initSearch() {
    if (!searchInput || !searchResultsDropdown) return;

    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim().toLowerCase();
      const selectedCat = searchCategorySelect ? searchCategorySelect.value : 'all';

      if (query.length < 2) {
        searchResultsDropdown.classList.remove('active');
        searchResultsDropdown.innerHTML = '';
        return;
      }

      let matches = products.filter(p => {
        const matchesName = p.name.toLowerCase().includes(query);
        const matchesCat = selectedCat === 'all' || (p.category_slugs && p.category_slugs.includes(selectedCat));
        return matchesName && matchesCat;
      });

      if (matches.length === 0) {
        searchResultsDropdown.innerHTML = `
          <div style="padding: 16px; text-align: center; color: #888; font-size: 14px;">
            "${query}" সম্পর্কিত কোনো পণ্য পাওয়া যায়নি।
          </div>
        `;
      } else {
        searchResultsDropdown.innerHTML = matches.slice(0, 6).map(p => `
          <div class="search-result-item" onclick="window.openQuickView(${p.id})">
            <img src="${p.thumbnail}" alt="${p.name}">
            <div class="search-result-info">
              <div class="search-result-title">${p.name}</div>
              <div class="search-result-price">৳${p.price}</div>
            </div>
            <button class="btn-buy-now" style="width: auto; padding: 4px 10px; font-size: 12px;" onclick="event.stopPropagation(); window.openDirectOrder(${p.id})">
              অর্ডার
            </button>
          </div>
        `).join('');
      }

      searchResultsDropdown.classList.add('active');
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && !searchResultsDropdown.contains(e.target)) {
        searchResultsDropdown.classList.remove('active');
      }
    });
  }

  // --- CART MANAGEMENT ---
  window.addToCart = function (productId, qty = 1) {
    const prod = products.find(p => p.id === productId);
    if (!prod) return;

    const existing = cart.find(item => item.id === productId);
    if (existing) {
      existing.qty += qty;
    } else {
      cart.push({
        id: prod.id,
        name: prod.name,
        price: prod.price,
        thumbnail: prod.thumbnail,
        qty: qty
      });
    }

    saveCart();
    updateCartUI();
    showToast(`"${prod.name}" কার্টে যোগ করা হয়েছে!`);
    openCartDrawer();
  };

  window.updateCartQty = function (productId, delta) {
    const item = cart.find(i => i.id === productId);
    if (!item) return;

    item.qty += delta;
    if (item.qty <= 0) {
      cart = cart.filter(i => i.id !== productId);
    }

    saveCart();
    updateCartUI();
  };

  window.removeCartItem = function (productId) {
    cart = cart.filter(i => i.id !== productId);
    saveCart();
    updateCartUI();
    showToast('পণ্যটি কার্ট থেকে সরানো হয়েছে');
  };

  function saveCart() {
    localStorage.setItem('organic_cart', JSON.stringify(cart));
  }

  function updateCartUI() {
    const totalCount = cart.reduce((sum, item) => sum + item.qty, 0);
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

    // Badges
    cartCountBadges.forEach(badge => {
      badge.textContent = totalCount;
      badge.style.display = totalCount > 0 ? 'flex' : 'none';
    });

    // Subtotal headers
    if (cartHeaderSubtotal) {
      cartHeaderSubtotal.textContent = `৳${subtotal}`;
    }
    if (cartDrawerSubtotal) {
      cartDrawerSubtotal.textContent = `৳${subtotal}`;
    }

    // Shipping progress
    if (shippingFill && shippingText) {
      if (subtotal >= FREE_SHIPPING_THRESHOLD) {
        shippingFill.style.width = '100%';
        shippingText.innerHTML = `অভিনন্দন! আপনি <strong>ফ্রি ডেলিভারি</strong> পাচ্ছেন!`;
      } else {
        const remaining = FREE_SHIPPING_THRESHOLD - subtotal;
        const pct = Math.min(100, Math.round((subtotal / FREE_SHIPPING_THRESHOLD) * 100));
        shippingFill.style.width = `${pct}%`;
        shippingText.innerHTML = `আর মাত্র <strong>৳${remaining}</strong> টাকার অর্ডার করলেই <strong>ফ্রি ডেলিভারি</strong>!`;
      }
    }

    // Render Drawer Items
    if (!cartDrawerItems) return;

    if (cart.length === 0) {
      cartDrawerItems.innerHTML = `
        <div class="cart-empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
          <p style="font-weight: 600; font-size: 16px; margin-bottom: 6px;">আপনার কার্ট খালি!</p>
          <p style="font-size: 13px;">পছন্দের খাঁটি খাদ্যপণ্য যোগ করুন।</p>
        </div>
      `;
    } else {
      cartDrawerItems.innerHTML = cart.map(item => `
        <div class="cart-item">
          <img src="${item.thumbnail}" alt="${item.name}" class="cart-item-img">
          <div class="cart-item-info">
            <div class="cart-item-title">${item.name}</div>
            <div class="cart-item-price">৳${item.price}</div>
            <div class="cart-qty-ctrl">
              <button class="qty-btn" onclick="window.updateCartQty(${item.id}, -1)">-</button>
              <span class="qty-val">${item.qty}</span>
              <button class="qty-btn" onclick="window.updateCartQty(${item.id}, 1)">+</button>
            </div>
          </div>
          <button class="cart-item-remove" onclick="window.removeCartItem(${item.id})" title="মুছুন">
            &times;
          </button>
        </div>
      `).join('');
    }
  }

  function openCartDrawer() {
    if (cartDrawer && cartOverlay) {
      cartDrawer.classList.add('active');
      cartOverlay.classList.add('active');
    }
  }

  function closeCartDrawer() {
    if (cartDrawer && cartOverlay) {
      cartDrawer.classList.remove('active');
      cartOverlay.classList.remove('active');
    }
  }

  // --- QUICK VIEW MODAL ---
  window.openQuickView = function (productId) {
    const prod = products.find(p => p.id === productId);
    if (!prod || !quickViewOverlay) return;

    const discountBadge = prod.discount_percent > 0
      ? `<span class="badge-discount" style="position:static; margin-right:8px;">${prod.discount_percent}% ছাড়</span>`
      : '';

    const regPrice = prod.regular_price > prod.price
      ? `<span class="qv-reg-price">৳${prod.regular_price}</span>`
      : '';

    const imagesHTML = (prod.images || [prod.thumbnail]).map((img, i) => `
      <img src="${img}" class="qv-thumb ${i === 0 ? 'active' : ''}" onclick="window.switchQVImage('${img}', this)" alt="${prod.name}">
    `).join('');

    quickViewOverlay.innerHTML = `
      <div class="quick-view-dialog">
        <button class="modal-close" style="position:absolute; top:15px; right:15px; color:#222; z-index:10;" onclick="window.closeQuickView()">&times;</button>
        <div class="qv-content">
          <div class="qv-gallery">
            <img src="${prod.thumbnail}" id="qvMainImage" class="qv-main-img" alt="${prod.name}">
            <div class="qv-thumbs">${imagesHTML}</div>
          </div>
          <div class="qv-details">
            <span class="qv-badge-stock">ইন স্টক (স্টকে আছে)</span>
            <h2 class="qv-title">${prod.name}</h2>
            <div class="qv-price-box">
              ${discountBadge}
              <span class="qv-price">৳${prod.price}</span>
              ${regPrice}
            </div>
            <div class="qv-desc">${prod.short_description || prod.description}</div>
            
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
              <span style="font-weight:600; font-size:14px;">পরিমাণ:</span>
              <div class="cart-qty-ctrl" style="padding:2px 4px;">
                <button class="qty-btn" onclick="window.adjustQVQty(-1)">-</button>
                <span class="qty-val" id="qvQtyVal">1</span>
                <button class="qty-btn" onclick="window.adjustQVQty(1)">+</button>
              </div>
            </div>

            <div class="qv-actions">
              <button class="btn-buy-now" onclick="window.buyNowFromQV(${prod.id})">
                সরাসরি অর্ডার করুন
              </button>
              <button class="btn-add-cart" onclick="window.addFromQV(${prod.id})">
                কার্টে রাখুন
              </button>
            </div>

            <a href="https://wa.me/8801911125266?text=${encodeURIComponent(`আসসালামু আলাইকুম, আমি '${prod.name}' (মূল্য: ৳${prod.price}) অর্ডার করতে চাই।`)}" target="_blank" class="qv-direct-whatsapp">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.698c.969.584 1.777.818 2.796.818 3.179 0 5.766-2.587 5.766-5.768 0-3.18-2.587-5.765-5.766-5.765zm0 10.354c-.911 0-1.637-.253-2.385-.698l-.171-.102-1.77.464.473-1.725-.112-.178c-.488-.779-.747-1.558-.747-2.515 0-2.529 2.057-4.587 4.587-4.587 2.528 0 4.586 2.058 4.586 4.587 0 2.529-2.058 4.587-4.586 4.587z"></path></svg>
              হোয়াটসঅ্যাপে অর্ডার করুন
            </a>
          </div>
        </div>
      </div>
    `;

    quickViewOverlay.classList.add('active');
  };

  window.switchQVImage = function (src, el) {
    const main = document.getElementById('qvMainImage');
    if (main) main.src = src;
    document.querySelectorAll('.qv-thumb').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
  };

  let qvCurrentQty = 1;
  window.adjustQVQty = function (delta) {
    qvCurrentQty = Math.max(1, qvCurrentQty + delta);
    const el = document.getElementById('qvQtyVal');
    if (el) el.textContent = qvCurrentQty;
  };

  window.addFromQV = function (id) {
    window.addToCart(id, qvCurrentQty);
    window.closeQuickView();
  };

  window.buyNowFromQV = function (id) {
    window.closeQuickView();
    window.openDirectOrder(id, qvCurrentQty);
  };

  window.closeQuickView = function () {
    if (quickViewOverlay) quickViewOverlay.classList.remove('active');
    qvCurrentQty = 1;
  };

  // --- 1-CLICK DIRECT ORDER MODAL ---
  let directOrderItems = [];

  window.openDirectOrder = function (productId = null, qty = 1) {
    if (productId) {
      const prod = products.find(p => p.id === productId);
      if (!prod) return;
      directOrderItems = [{
        id: prod.id,
        name: prod.name,
        price: prod.price,
        thumbnail: prod.thumbnail,
        qty: qty
      }];
    } else {
      if (cart.length === 0) {
        showToast('আপনার কার্ট খালি! অনুগ্রহ করে পণ্য যোগ করুন।');
        return;
      }
      directOrderItems = [...cart];
    }

    renderOrderModal();
    if (orderModalOverlay) orderModalOverlay.classList.add('active');
  };

  function renderOrderModal() {
    if (!orderModalOverlay) return;

    const subtotal = directOrderItems.reduce((sum, i) => sum + (i.price * i.qty), 0);
    const defaultDelivery = SHIPPING_DHAKA;
    const total = subtotal + defaultDelivery;

    orderModalOverlay.innerHTML = `
      <div class="order-modal">
        <div class="modal-header">
          <h3>অর্ডার কনফার্মেশন (ক্যাশ অন ডেলিভারি)</h3>
          <span class="modal-close" onclick="window.closeOrderModal()">&times;</span>
        </div>
        <div class="modal-body">
          <div class="order-summary-box">
            <h4 style="font-size:15px; font-weight:700; margin-bottom:10px; color:#153A27;">আপনার অর্ডারের বিবরণ:</h4>
            <div class="order-items-preview">
              ${directOrderItems.map(item => `
                <div class="order-preview-item">
                  <div class="order-preview-item-left">
                    <img src="${item.thumbnail}" alt="${item.name}">
                    <div>
                      <div style="font-weight:600;">${item.name}</div>
                      <div style="font-size:12px; color:#666;">৳${item.price} × ${item.qty}</div>
                    </div>
                  </div>
                  <div style="font-weight:700; color:#016738;">৳${item.price * item.qty}</div>
                </div>
              `).join('')}
            </div>
            
            <div class="order-preview-calc-row">
              <span>মোট পণ্যের মূল্য:</span>
              <strong id="modalSubtotal">৳${subtotal}</strong>
            </div>
            <div class="order-preview-calc-row">
              <span>ডেলিভারি চার্জ:</span>
              <strong id="modalDeliveryCharge">৳${defaultDelivery}</strong>
            </div>
            <div class="order-preview-calc-row total-row">
              <span>সর্বমোট প্রদেয় টাকা:</span>
              <strong id="modalGrandTotal">৳${total}</strong>
            </div>
          </div>

          <form id="directOrderForm" onsubmit="window.handleOrderSubmit(event)">
            <div class="form-group">
              <label class="form-label">আপনার নাম <span class="req">*</span></label>
              <input type="text" id="orderCustomerName" class="form-input" placeholder="যেমন: মোঃ আব্দুল্লাহ" required>
            </div>

            <div class="form-group">
              <label class="form-label">মোবাইল নাম্বার <span class="req">*</span></label>
              <input type="tel" id="orderCustomerPhone" class="form-input" placeholder="যেমন: 017XXXXXXXX" pattern="[0-9]{11}" title="১১ ডিজিটের মোবাইল নম্বর দিন" required>
            </div>

            <div class="form-group">
              <label class="form-label">সম্পূর্ণ ডেলিভারি ঠিকানা <span class="req">*</span></label>
              <textarea id="orderCustomerAddress" class="form-textarea" placeholder="বাসা/হোল্ডিং নম্বর, রোড, এলাকা/থানা, জেলা" required></textarea>
            </div>

            <div class="form-group">
              <label class="form-label">ডেলিভারি এলাকা নির্বাচন করুন <span class="req">*</span></label>
              <div class="radio-cards-grid">
                <label class="radio-card active">
                  <input type="radio" name="delivery_area" value="dhaka" checked onchange="window.updateOrderTotals()">
                  <div class="radio-card-content">
                    <strong>ঢাকার ভিতরে</strong>
                    <span>চার্জ: ৳৮০ (১-২ দিনে ডেলিভারি)</span>
                  </div>
                </label>
                <label class="radio-card">
                  <input type="radio" name="delivery_area" value="outside" onchange="window.updateOrderTotals()">
                  <div class="radio-card-content">
                    <strong>ঢাকার বাইরে</strong>
                    <span>চার্জ: ৳১৫০ (২-৩ দিনে ডেলিভারি)</span>
                  </div>
                </label>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">পেমেন্ট পদ্ধতি</label>
              <div class="radio-cards-grid">
                <label class="radio-card active">
                  <input type="radio" name="payment_method" value="cod" checked>
                  <div class="radio-card-content">
                    <strong>ক্যাশ অন ডেলিভারি</strong>
                    <span>পণ্য হাতে পেয়ে টাকা পরিশোধ করুন</span>
                  </div>
                </label>
                <label class="radio-card">
                  <input type="radio" name="payment_method" value="bkash">
                  <div class="radio-card-content">
                    <strong>বিকাশ / নগদ (অনলাইন)</strong>
                    <span>অগ্রিম পেমেন্ট করুন</span>
                  </div>
                </label>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">অর্ডারের বিশেষ নির্দেশিকা (যদি থাকে)</label>
              <input type="text" id="orderNotes" class="form-input" placeholder="যেমন: সকাল ১০টার পর ডেলিভারি দিন">
            </div>

            <button type="submit" class="btn-confirm-order">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
              অর্ডার নিশ্চিত করুন (৳<span id="btnTotalText">${total}</span>)
            </button>
          </form>
        </div>
      </div>
    `;
  }

  window.updateOrderTotals = function () {
    const subtotal = directOrderItems.reduce((sum, i) => sum + (i.price * i.qty), 0);
    const selectedArea = document.querySelector('input[name="delivery_area"]:checked');
    const delivery = (selectedArea && selectedArea.value === 'outside') ? SHIPPING_OUTSIDE : SHIPPING_DHAKA;
    const total = subtotal + delivery;

    const chargeEl = document.getElementById('modalDeliveryCharge');
    const totalEl = document.getElementById('modalGrandTotal');
    const btnText = document.getElementById('btnTotalText');

    if (chargeEl) chargeEl.textContent = `৳${delivery}`;
    if (totalEl) totalEl.textContent = `৳${total}`;
    if (btnText) btnText.textContent = `${total}`;
  };

  window.handleOrderSubmit = function (e) {
    e.preventDefault();

    const name = document.getElementById('orderCustomerName').value.trim();
    const phone = document.getElementById('orderCustomerPhone').value.trim();
    const address = document.getElementById('orderCustomerAddress').value.trim();
    const notes = document.getElementById('orderNotes').value.trim();

    const selectedArea = document.querySelector('input[name="delivery_area"]:checked');
    const areaName = selectedArea && selectedArea.value === 'outside' ? 'ঢাকার বাইরে' : 'ঢাকার ভিতরে';
    const delivery = selectedArea && selectedArea.value === 'outside' ? SHIPPING_OUTSIDE : SHIPPING_DHAKA;

    const selectedPayment = document.querySelector('input[name="payment_method"]:checked');
    const paymentMethodName = selectedPayment && selectedPayment.value === 'bkash' ? 'বিকাশ / নগদ' : 'ক্যাশ অন ডেলিভারি';

    const subtotal = directOrderItems.reduce((sum, i) => sum + (i.price * i.qty), 0);
    const grandTotal = subtotal + delivery;
    const orderId = 'ORD-' + Math.floor(100000 + Math.random() * 900000);

    // Close order modal
    window.closeOrderModal();

    // Clear cart if direct order was from cart
    if (cart.length > 0 && directOrderItems.length === cart.length) {
      cart = [];
      saveCart();
      updateCartUI();
    }

    // Show Success Modal
    showOrderSuccessModal({
      orderId,
      name,
      phone,
      address,
      areaName,
      paymentMethodName,
      items: directOrderItems,
      subtotal,
      delivery,
      grandTotal,
      notes
    });
  };

  function showOrderSuccessModal(data) {
    if (!successModalOverlay) return;

    successModalOverlay.innerHTML = `
      <div class="invoice-card">
        <div class="invoice-icon">&check;</div>
        <h2 class="invoice-title">ধন্যবাদ! আপনার অর্ডার সফল হয়েছে</h2>
        <p class="invoice-msg">আমাদের প্রতিনিধি দ্রুতই আপনার সাথে ফোনে যোগাযোগ করে অর্ডার কনফার্ম করবেন।</p>
        
        <table class="invoice-details-table">
          <tr>
            <td>অর্ডার আইডি:</td>
            <td class="strong">${data.orderId}</td>
          </tr>
          <tr>
            <td>গ্রাহকের নাম:</td>
            <td class="strong">${data.name}</td>
          </tr>
          <tr>
            <td>মোবাইল নম্বর:</td>
            <td class="strong">${data.phone}</td>
          </tr>
          <tr>
            <td>ঠিকানা:</td>
            <td>${data.address} (${data.areaName})</td>
          </tr>
          <tr>
            <td>পেমেন্ট মেথড:</td>
            <td class="strong">${data.paymentMethodName}</td>
          </tr>
          <tr>
            <td>অর্ডারকৃত পণ্য:</td>
            <td>${data.items.map(i => `${i.name} (×${i.qty})`).join(', ')}</td>
          </tr>
          <tr>
            <td>মোট প্রদেয় টাকা:</td>
            <td class="strong" style="color:#016738; font-size:16px;">৳${data.grandTotal} (ডেলিভারিসহ)</td>
          </tr>
        </table>

        <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center;">
          <a href="https://wa.me/8801911125266?text=${encodeURIComponent(`আসসালামু আলাইকুম, আমি অর্ডার সম্পন্ন করেছি।\nঅর্ডার আইডি: ${data.orderId}\nনাম: ${data.name}\nমোট টাকা: ৳${data.grandTotal}`)}" target="_blank" class="qv-direct-whatsapp">
            হোয়াটসঅ্যাপে কনফার্মেশন পাঠান
          </a>
          <button class="btn-buy-now" style="width:auto; padding:10px 20px;" onclick="window.closeSuccessModal()">
            হোমে ফিরে যান
          </button>
        </div>
      </div>
    `;

    successModalOverlay.classList.add('active');
  }

  window.closeOrderModal = function () {
    if (orderModalOverlay) orderModalOverlay.classList.remove('active');
  };

  window.closeSuccessModal = function () {
    if (successModalOverlay) successModalOverlay.classList.remove('active');
  };

  // --- TOAST NOTIFICATIONS ---
  function showToast(message) {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:#fbbc34;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
      <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(50px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  // --- EVENT LISTENERS ---
  function initEventListeners() {
    // Cart drawer openers
    document.querySelectorAll('.open-cart-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openCartDrawer();
      });
    });

    // Cart drawer close
    const cartCloseBtn = document.getElementById('cartDrawerClose');
    if (cartCloseBtn) cartCloseBtn.addEventListener('click', closeCartDrawer);
    if (cartOverlay) cartOverlay.addEventListener('click', closeCartDrawer);

    // Drawer checkout button
    const drawerCheckoutBtn = document.getElementById('drawerCheckoutBtn');
    if (drawerCheckoutBtn) {
      drawerCheckoutBtn.addEventListener('click', () => {
        closeCartDrawer();
        window.openDirectOrder();
      });
    }

    // Modal background close
    if (quickViewOverlay) {
      quickViewOverlay.addEventListener('click', (e) => {
        if (e.target === quickViewOverlay) window.closeQuickView();
      });
    }
    if (orderModalOverlay) {
      orderModalOverlay.addEventListener('click', (e) => {
        if (e.target === orderModalOverlay) window.closeOrderModal();
      });
    }
    if (successModalOverlay) {
      successModalOverlay.addEventListener('click', (e) => {
        if (e.target === successModalOverlay) window.closeSuccessModal();
      });
    }

    // Keyboard ESC close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeCartDrawer();
        window.closeQuickView();
        window.closeOrderModal();
        window.closeSuccessModal();
      }
    });
  }

})();
