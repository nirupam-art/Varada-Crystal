/**
 * VARADA CRYSTAL — Interactive Application Logic (app.js)
 * Multi-Page Cart Sync, Smooth Scroll & Luxury Interactivity Engine
 */

document.addEventListener('DOMContentLoaded', () => {
  initSmoothScroll();
  initScrollReveal();
  initCartSystem();
  initAccordions();
  initCategoryDrawerEvents();
  initHeroParallaxHover();
});

/* ==========================================================================
   1. SILKY-SMOOTH SCROLL ENGINE WITH CUBIC EASING
   ========================================================================== */
function initSmoothScroll() {
  document.addEventListener('click', (e) => {
    const anchor = e.target.closest('a[href^="#"]');
    if (!anchor) return;

    const targetId = anchor.getAttribute('href');
    if (!targetId || targetId === '#') return;

    const targetElement = document.querySelector(targetId);
    if (targetElement) {
      e.preventDefault();

      // Close drawer if open before scrolling
      closeCategoryDrawer();
      closeCart();

      // Trigger custom smooth scroll
      smoothScrollTo(targetElement, 750);
    }
  });
}

function smoothScrollTo(target, duration = 750) {
  const targetElement = typeof target === 'string' ? document.querySelector(target) : target;
  if (!targetElement) return;

  const targetPosition = targetElement.getBoundingClientRect().top + window.pageYOffset - 20;
  const startPosition = window.pageYOffset;
  const distance = targetPosition - startPosition;
  let startTime = null;

  function animation(currentTime) {
    if (startTime === null) startTime = currentTime;
    const timeElapsed = currentTime - startTime;
    const run = easeInOutCubic(timeElapsed, startPosition, distance, duration);
    window.scrollTo(0, run);
    if (timeElapsed < duration) {
      requestAnimationFrame(animation);
    } else {
      window.scrollTo(0, targetPosition);
    }
  }

  function easeInOutCubic(t, b, c, d) {
    t /= d / 2;
    if (t < 1) return (c / 2) * t * t * t + b;
    t -= 2;
    return (c / 2) * (t * t * t + 2) + b;
  }

  requestAnimationFrame(animation);
}

/* ==========================================================================
   2. SCROLL-DRIVEN ENTRANCE REVEAL ANIMATIONS
   ========================================================================== */
function initScrollReveal() {
  const revealElements = document.querySelectorAll('.spotlight-card, .benefit-card-light, .spec-box-light, .usage-step-card-light, .review-card-light, .comparison-table-light-wrapper, .product-card-light, .section-header');

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        revealObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -30px 0px'
  });

  revealElements.forEach(el => {
    el.classList.add('reveal-item');
    revealObserver.observe(el);
  });
}

/* ==========================================================================
   3. CATEGORY SLIDE-OUT DRAWER
   ========================================================================== */
function openCategoryDrawer() {
  const drawer = document.getElementById('categoryDrawerOverlay');
  if (drawer) {
    drawer.classList.add('active');
    drawer.setAttribute('aria-hidden', 'false');
  }
}

function closeCategoryDrawer() {
  const drawer = document.getElementById('categoryDrawerOverlay');
  if (drawer) {
    drawer.classList.remove('active');
    drawer.setAttribute('aria-hidden', 'true');
  }
}

function initCategoryDrawerEvents() {
  const drawerOverlay = document.getElementById('categoryDrawerOverlay');
  if (drawerOverlay) {
    drawerOverlay.addEventListener('click', (e) => {
      if (e.target === drawerOverlay) {
        closeCategoryDrawer();
      }
    });
  }
}

/* ==========================================================================
   4. CATEGORY FILTERING ENGINE (ON SHOP PAGE)
   ========================================================================== */
function filterCatalog(category) {
  const filterBtns = document.querySelectorAll('.category-pill-btn-light');
  const cards = document.querySelectorAll('.product-card-light');

  // Update active pill state
  filterBtns.forEach(btn => {
    if (btn.getAttribute('data-category') === category) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Filter cards with smooth opacity animation
  cards.forEach(card => {
    const cardCategory = card.getAttribute('data-category');
    if (category === 'all' || cardCategory === category) {
      card.style.display = 'flex';
      card.style.opacity = '0';
      card.style.transform = 'translateY(15px)';
      setTimeout(() => {
        card.style.transition = 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
      }, 50);
    } else {
      card.style.display = 'none';
    }
  });
}

/* ==========================================================================
   5. HERO PARALLAX & TILT TRANSITIONS (ON HOME PAGE)
   ========================================================================== */
function initHeroParallaxHover() {
  const heroViewport = document.getElementById('hero');
  const primaryCard = document.querySelector('.editorial-photo-primary');
  const secondaryCard = document.querySelector('.editorial-photo-secondary');
  const giantTitle = document.querySelector('.editorial-giant-title');

  if (!heroViewport || window.innerWidth <= 992) return;

  heroViewport.addEventListener('mousemove', (e) => {
    const { clientX, clientY } = e;
    const { innerWidth, innerHeight } = window;

    const xOffset = (clientX / innerWidth - 0.5) * 20;
    const yOffset = (clientY / innerHeight - 0.5) * 20;

    if (primaryCard) {
      primaryCard.style.transform = `translate3d(${-xOffset * 0.8}px, ${-yOffset * 0.8}px, 0)`;
    }
    if (secondaryCard) {
      secondaryCard.style.transform = `translate3d(${xOffset * 1.2}px, ${yOffset * 1.2}px, 0) rotate(${1 + xOffset * 0.05}deg)`;
    }
    if (giantTitle) {
      giantTitle.style.transform = `translate3d(${xOffset * 0.4}px, ${yOffset * 0.4}px, 0)`;
    }
  });

  heroViewport.addEventListener('mouseleave', () => {
    if (primaryCard) primaryCard.style.transform = 'translate3d(0, 0, 0)';
    if (secondaryCard) secondaryCard.style.transform = 'translate3d(0, 0, 0)';
    if (giantTitle) giantTitle.style.transform = 'translate3d(0, 0, 0)';
  });
}

/* ==========================================================================
   6. PERSISTENT SHOPPING CART & COMMERCE ENGINE (LOCALSTORAGE SYNC)
   ========================================================================== */
let cart = loadCartFromStorage();

function loadCartFromStorage() {
  try {
    const saved = localStorage.getItem('varada_cart');
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error(e);
  }
  return [
    {
      name: 'Single Bottle (100ml)',
      price: 349,
      quantity: 1
    }
  ];
}

function saveCartToStorage() {
  try {
    localStorage.setItem('varada_cart', JSON.stringify(cart));
  } catch (e) {
    console.error(e);
  }
}

function initCartSystem() {
  const cartToggleBtn = document.getElementById('cartToggleBtn');
  const cartCloseBtn = document.getElementById('cartCloseBtn');
  const cartOverlay = document.getElementById('cartOverlay');

  if (cartToggleBtn) {
    cartToggleBtn.addEventListener('click', openCart);
  }

  if (cartCloseBtn) {
    cartCloseBtn.addEventListener('click', closeCart);
  }

  if (cartOverlay) {
    cartOverlay.addEventListener('click', (e) => {
      if (e.target === cartOverlay) {
        closeCart();
      }
    });
  }

  renderCart();
}

function openCart() {
  const cartOverlay = document.getElementById('cartOverlay');
  if (cartOverlay) {
    cartOverlay.classList.add('active');
    cartOverlay.setAttribute('aria-hidden', 'false');
  }
}

function closeCart() {
  const cartOverlay = document.getElementById('cartOverlay');
  if (cartOverlay) {
    cartOverlay.classList.remove('active');
    cartOverlay.setAttribute('aria-hidden', 'true');
  }
}

function addToCart(name, price, qty = 1) {
  const existingItem = cart.find(item => item.name === name);
  if (existingItem) {
    existingItem.quantity += qty;
  } else {
    cart.push({ name, price, quantity: qty });
  }

  saveCartToStorage();
  renderCart();
  openCart();
  showToast(`Added ${name} to your bag!`);
}

function updateCartItemQty(index, change) {
  if (!cart[index]) return;
  cart[index].quantity += change;
  if (cart[index].quantity <= 0) {
    cart.splice(index, 1);
  }
  saveCartToStorage();
  renderCart();
}

function renderCart() {
  const cartList = document.getElementById('cartItemsList');
  const cartCountBadge = document.getElementById('cartCountBadge');
  const drawerCartCount = document.getElementById('drawerCartCount');
  const cartSubtotal = document.getElementById('cartSubtotal');
  const shippingFill = document.getElementById('shippingMeterFill');
  const shippingText = document.getElementById('shippingMeterText');

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  if (cartCountBadge) cartCountBadge.textContent = totalItems;
  if (drawerCartCount) drawerCartCount.textContent = totalItems;
  if (cartSubtotal) cartSubtotal.textContent = `₹${subtotal.toFixed(2)}`;

  // Free shipping progress logic (Threshold ₹499)
  if (shippingFill && shippingText) {
    const freeShippingThreshold = 499;
    if (subtotal >= freeShippingThreshold) {
      shippingFill.style.width = '100%';
      shippingText.innerHTML = '🎉 <strong>FREE EXPRESS SHIPPING UNLOCKED!</strong>';
    } else {
      const remaining = freeShippingThreshold - subtotal;
      const progressPercent = Math.min(100, Math.max(10, (subtotal / freeShippingThreshold) * 100));
      shippingFill.style.width = `${progressPercent}%`;
      shippingText.innerHTML = `Add <strong>₹${remaining.toFixed(0)}</strong> more for <strong>FREE SHIPPING!</strong>`;
    }
  }

  if (!cartList) return;

  if (cart.length === 0) {
    cartList.innerHTML = `
      <div class="empty-cart-state" id="emptyCartState">
        <div class="empty-icon">🛍️</div>
        <p>Your bag is currently empty.</p>
        <a href="shop.html" class="btn btn-blue btn-sm" onclick="closeCart()">Explore Store</a>
      </div>
    `;
    return;
  }

  let html = '';
  cart.forEach((item, index) => {
    html += `
      <div class="cart-item-card">
        <div class="cart-item-meta">
          <h4>${item.name}</h4>
          <span>₹${item.price} each</span>
        </div>
        <div class="cart-item-actions">
          <button class="qty-btn" onclick="updateCartItemQty(${index}, -1)" aria-label="Decrease quantity">−</button>
          <span style="font-weight:700; min-width:20px; text-align:center;">${item.quantity}</span>
          <button class="qty-btn" onclick="updateCartItemQty(${index}, 1)" aria-label="Increase quantity">+</button>
        </div>
      </div>
    `;
  });

  cartList.innerHTML = html;
}

/* ==========================================================================
   7. NOTIFY ME / PRE-ORDER MODAL ENGINE
   ========================================================================== */
let activeNotifyProduct = '';

function openNotifyModal(productName) {
  activeNotifyProduct = productName;
  const modal = document.getElementById('notifyModal');
  const title = document.getElementById('notifyModalTitle');
  const desc = document.getElementById('notifyModalDesc');

  if (title) title.textContent = `Get Early Access: ${productName}`;
  if (desc) desc.textContent = `We will notify you immediately once ${productName} is ready to dispatch with an exclusive 20% launch code!`;

  if (modal) {
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
  }
}

function closeNotifyModal() {
  const modal = document.getElementById('notifyModal');
  if (modal) {
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
  }
}

function submitNotifyForm(e) {
  e.preventDefault();
  const input = document.getElementById('notifyEmailInput');
  closeNotifyModal();
  if (input) input.value = '';
  showToast(`🎉 You're on the VIP list for ${activeNotifyProduct || 'new arrivals'}!`);
}

/* ==========================================================================
   8. ACCORDIONS (FAQS)
   ========================================================================== */
function initAccordions() {
  const faqQuestions = document.querySelectorAll('.faq-question-light');
  faqQuestions.forEach(btn => {
    btn.addEventListener('click', () => {
      const isExpanded = btn.getAttribute('aria-expanded') === 'true';
      const answer = btn.nextElementSibling;

      faqQuestions.forEach(otherBtn => {
        if (otherBtn !== btn) {
          otherBtn.setAttribute('aria-expanded', 'false');
          if (otherBtn.nextElementSibling) {
            otherBtn.nextElementSibling.classList.remove('show');
          }
        }
      });

      btn.setAttribute('aria-expanded', !isExpanded);
      if (answer) {
        answer.classList.toggle('show');
      }
    });
  });
}

/* ==========================================================================
   9. SECURE RAZORPAY CHECKOUT & PAYMENT VERIFICATION ENGINE
   ========================================================================== */
function triggerCheckout() {
  if (!cart || cart.length === 0) {
    showToast('Your bag is empty! Please add a product to checkout.');
    return;
  }

  closeCart();

  const modal = document.getElementById('checkoutModal');
  const formState = document.getElementById('checkoutFormState');
  const successState = document.getElementById('checkoutSuccessState');
  const summaryBox = document.getElementById('modalOrderSummary');

  // Reset modal state
  if (formState) formState.style.display = 'block';
  if (successState) successState.style.display = 'none';

  if (summaryBox) {
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const shippingFee = subtotal >= 499 ? 0 : 49;
    const shippingText = subtotal >= 499 ? 'FREE (Express India Shipping)' : '₹49.00';
    const grandTotal = subtotal + shippingFee;

    summaryBox.innerHTML = `
      <p style="margin-bottom: 6px; font-weight:700; color:#FFFFFF;">Order Breakdown (${totalItems} item${totalItems > 1 ? 's' : ''}):</p>
      <ul style="list-style: none; padding-left: 0; margin-bottom: 10px; color: var(--text-light-muted); line-height: 1.6;">
        ${cart.map(item => `<li>• ${item.name} × ${item.quantity} — <strong style="color:#FFF;">₹${(item.price * item.quantity).toFixed(2)}</strong></li>`).join('')}
      </ul>
      <div style="border-top: 1px solid var(--border-subtle); padding-top: 8px; margin-top: 8px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span>Subtotal:</span>
          <strong>₹${subtotal.toFixed(2)}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span>Shipping:</span>
          <span style="color: #059669; font-weight:700;">${shippingText}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size: 1.05rem; color: var(--color-blue-azure); font-weight: 800; border-top: 1px solid var(--border-subtle); padding-top: 6px; margin-top: 6px;">
          <span>Total Payable:</span>
          <span>₹${grandTotal.toFixed(2)}</span>
        </div>
      </div>
    `;
  }

  if (modal) {
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
  }
}

function closeCheckoutModal() {
  const modal = document.getElementById('checkoutModal');
  if (modal) {
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
  }
  resetPayButton();
}

function resetPayButton() {
  const payBtn = document.getElementById('payRazorpayBtn');
  if (payBtn) {
    payBtn.disabled = false;
    payBtn.innerHTML = '<span>Pay & Complete Order with Razorpay 💳</span>';
  }
}

async function handleCheckoutFormSubmit(event) {
  event.preventDefault();

  const payBtn = document.getElementById('payRazorpayBtn');
  if (payBtn) {
    payBtn.disabled = true;
    payBtn.innerHTML = '<span>⏳ Creating Secure Razorpay Order...</span>';
  }

  const customerData = {
    name: document.getElementById('checkoutName')?.value?.trim() || '',
    phone: document.getElementById('checkoutPhone')?.value?.trim() || '',
    email: document.getElementById('checkoutEmail')?.value?.trim() || '',
    address: document.getElementById('checkoutAddress')?.value?.trim() || '',
    city: document.getElementById('checkoutCity')?.value?.trim() || '',
    pincode: document.getElementById('checkoutPincode')?.value?.trim() || ''
  };

  try {
    // 1. Call Backend API to create Razorpay Order
    const response = await fetch('/api/create-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        items: cart,
        customer: customerData
      })
    });

    const orderData = await response.json();

    if (!response.ok || !orderData.success) {
      throw new Error(orderData.error || 'Server failed to initialize Razorpay order');
    }

    if (payBtn) {
      payBtn.innerHTML = '<span>💳 Opening Payment Gateway...</span>';
    }

    // 2. Configure Razorpay Standard Checkout SDK Options
    const options = {
      key: orderData.key_id,
      amount: orderData.amount,
      currency: orderData.currency || 'INR',
      name: 'Varada Crystal',
      description: `Fragrance Order (#${orderData.order_id.slice(-6)})`,
      image: 'logo-icon.svg',
      order_id: orderData.order_id,
      handler: async function (rzpResponse) {
        if (payBtn) {
          payBtn.innerHTML = '<span>🔒 Verifying Payment Signature...</span>';
        }
        await verifyRazorpayPayment(rzpResponse, customerData, orderData);
      },
      prefill: {
        name: customerData.name,
        email: customerData.email,
        contact: customerData.phone
        // Note: do NOT set prefill.method — it interferes with Razorpay's payment method selection UI
      },
      method: {
        upi: true,
        card: true,
        netbanking: true,
        wallet: true
      },
      notes: {
        address: `${customerData.address}, ${customerData.city} - ${customerData.pincode}`
      },
      theme: {
        color: '#00B4D8'
      },
      modal: {
        ondismiss: function () {
          resetPayButton();
          showToast('Payment process paused. You can retry anytime.');
        }
      }
    };

    // 3. Launch Razorpay Widget
    if (typeof Razorpay !== 'undefined') {
      const rzp = new Razorpay(options);
      rzp.on('payment.failed', function (response) {
        resetPayButton();
        showToast(`❌ Payment Failed: ${response.error.description || 'Transaction declined. Please retry.'}`);
      });
      rzp.open();
    } else {
      // Razorpay SDK failed to load — do NOT simulate a payment.
      // Show a clear error so the customer knows payment is unavailable.
      resetPayButton();
      showToast('⚠️ Payment gateway unavailable. Please refresh the page or try a different browser.');
    }

  } catch (err) {
    console.error('Checkout error:', err);
    resetPayButton();
    showToast(`⚠️ Order Error: ${err.message}`);
  }
}

async function verifyRazorpayPayment(rzpResponse, customerData, orderData) {
  try {
    // Send ONLY the three Razorpay-returned fields to the backend.
    // The server derives the expected amount from its own in-memory order store —
    // we do NOT send amount/price here so the server can't be tricked.
    const verifyRes = await fetch('/api/verify-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        razorpay_order_id:  rzpResponse.razorpay_order_id,
        razorpay_payment_id: rzpResponse.razorpay_payment_id,
        razorpay_signature:  rzpResponse.razorpay_signature
      })
    });

    const verifyResult = await verifyRes.json();

    if (verifyRes.ok && verifyResult.success) {
      // ✅ Backend confirmed payment — now safe to clear cart and show success
      cart = [];
      saveCartToStorage();
      renderCart();

      const formState    = document.getElementById('checkoutFormState');
      const successState = document.getElementById('checkoutSuccessState');
      const detailsBox   = document.getElementById('modalSuccessDetails');

      if (formState)    formState.style.display    = 'none';
      if (successState) successState.style.display = 'block';

      if (detailsBox) {
        const paidINR = verifyResult.amountINR != null
          ? `₹${Number(verifyResult.amountINR).toFixed(2)}`
          : 'Confirmed';
        detailsBox.innerHTML = `
          <p style="margin-bottom:6px; color:#059669; font-weight:700;">✓ Transaction Verified</p>
          <p><strong>Payment ID:</strong> <span style="font-family:monospace; color:#FFF;">${verifyResult.paymentId}</span></p>
          <p><strong>Order ID:</strong> <span style="font-family:monospace; color:#FFF;">${verifyResult.orderId}</span></p>
          <p><strong>Amount Paid:</strong> ${paidINR}</p>
          <p><strong>Deliver To:</strong> ${customerData.name}, ${customerData.address}, ${customerData.city} - ${customerData.pincode}</p>
          <p><strong>Contact:</strong> ${customerData.phone} | ${customerData.email}</p>
        `;
      }

      showToast('🎉 Payment Verified & Order Confirmed!');
    } else {
      // ❌ Backend rejected — do NOT clear cart, do NOT show success
      throw new Error(verifyResult.error || 'Payment verification failed. Please contact support.');
    }
  } catch (err) {
    console.error('Payment verification error:', err);
    // Restore button so customer can retry — cart is preserved
    resetPayButton();
    showToast(`❌ ${err.message}`);
  }
}

/* ==========================================================================
   10. TOAST NOTIFICATIONS
   ========================================================================== */
function showToast(message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00B4D8" stroke-width="2.5">
      <path d="M20 6L9 17L4 12"/>
    </svg>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3200);
}
