const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const Razorpay = require('razorpay');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// SECURITY: Load credentials from environment — no hardcoded fallbacks.
// If either is missing, the server refuses to start.
// ---------------------------------------------------------------------------
const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;
const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

if (!keyId || !keySecret) {
  console.error('[FATAL] RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in your .env file.');
  console.error('[FATAL] Copy .env.example to .env and fill in your Razorpay credentials.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Initialize Razorpay — server-side only. keySecret NEVER leaves this file.
// ---------------------------------------------------------------------------
const razorpay = new Razorpay({
  key_id: keyId,
  key_secret: keySecret
});

// ---------------------------------------------------------------------------
// In-memory order store.
// Maps Razorpay order_id → { amount (paise), currency, customer, items }
// This lets /api/verify-payment confirm amount/currency independently of
// anything the browser sends back.
//
// NOTE: This is cleared on server restart. For production, persist this in
// a database (Postgres, MongoDB, Redis, etc.). A persistent store is required
// to safely handle webhooks that arrive after a server restart.
// ---------------------------------------------------------------------------
const pendingOrders = new Map();

// ---------------------------------------------------------------------------
// Server-Authoritative Product Pricing Catalog (prices in INR).
// The server ALWAYS uses this table — client-supplied prices are never trusted.
// ---------------------------------------------------------------------------
const PRODUCT_CATALOG = {
  'Single Bottle (100ml)': 349,
  'Varada Crystal Signature Spray (100ml)': 349,
  'Pocket Edition (50ml)': 229,
  'Varada Pocket & Gym Mist (50ml)': 229,
  'Duo Pack (2x 100ml)': 629,
  'Varada Duo Pack (2x 100ml)': 629,
  'Family Pack (3x 100ml)': 889,
  'Varada Family Wellness Pack (3x 100ml)': 889,
  'Varada Rose & Mineral Hydrating Mist (100ml)': 399,
  'Varada Pure Mineral Alum Bar (120g)': 279,
  'Varada Lavender Detox Roll-On (75ml)': 349
};

const FREE_SHIPPING_THRESHOLD = 499; // INR
const STANDARD_SHIPPING_FEE = 49;   // INR

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

// Webhook route needs the RAW body for HMAC signature validation.
// Mount it BEFORE express.json() so the JSON parser doesn't consume the body.
app.post(
  '/api/razorpay/webhook',
  express.raw({ type: 'application/json' }),
  handleWebhook
);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

// ---------------------------------------------------------------------------
// GET /api/config
// Returns only the public Razorpay Key ID to the frontend.
// NEVER returns keySecret or webhookSecret.
// ---------------------------------------------------------------------------
app.get('/api/config', (req, res) => {
  res.json({ key_id: keyId });
});

// ---------------------------------------------------------------------------
// POST /api/create-order
// Validates the cart against the server catalog, calculates the authoritative
// total, creates a real Razorpay order, and stores the order in memory.
//
// Security rules enforced here:
//   - Client-supplied price/subtotal/shipping/total is IGNORED.
//   - Unknown products are rejected (no client-price fallback).
//   - Quantities must be positive integers within [1, 100].
//   - Final amount must be positive.
// ---------------------------------------------------------------------------
app.post('/api/create-order', async (req, res) => {
  try {
    const { items, customer } = req.body;

    // --- Validate cart ---
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Your cart is empty. Please add a product to continue.' });
    }

    // --- Validate customer fields ---
    const name    = (customer?.name    || '').trim();
    const phone   = (customer?.phone   || '').trim();
    const email   = (customer?.email   || '').trim();
    const address = (customer?.address || '').trim();
    const city    = (customer?.city    || '').trim();
    const pincode = (customer?.pincode || '').trim();

    if (!name || !phone || !email || !address || !city || !pincode) {
      return res.status(400).json({ success: false, error: 'All delivery address fields are required.' });
    }
    if (!/^\d{6}$/.test(pincode)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid 6-digit pincode.' });
    }
    if (!/^\d{10}$/.test(phone)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid 10-digit phone number.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
    }

    // --- Validate and price each item from the server catalog ---
    let serverSubtotal = 0;

    for (const item of items) {
      const productName = (item?.name || '').trim();

      // Only accept products that exist in the server catalog
      if (!productName || !(productName in PRODUCT_CATALOG)) {
        return res.status(400).json({
          success: false,
          error: `Unknown product: "${productName}". Please refresh and try again.`
        });
      }

      const qty = parseInt(item?.quantity, 10);
      if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
        return res.status(400).json({ success: false, error: `Invalid quantity for "${productName}". Must be between 1 and 100.` });
      }

      // Server-authoritative price — client-supplied price is never used
      const serverPrice = PRODUCT_CATALOG[productName];
      serverSubtotal += serverPrice * qty;
    }

    if (serverSubtotal <= 0) {
      return res.status(400).json({ success: false, error: 'Order total must be greater than zero.' });
    }

    // --- Server-side shipping calculation ---
    const shippingFee = serverSubtotal >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING_FEE;
    const grandTotalINR = serverSubtotal + shippingFee;
    const amountInPaise = Math.round(grandTotalINR * 100);

    // --- Generate a safe, unique receipt reference ---
    const receipt = `vc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // --- Create the Razorpay order server-side ---
    const rzpOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: receipt,
      notes: {
        customer_name: name,
        // Do not include sensitive data (email, full address) in Razorpay notes
        delivery_city: city
      }
    });

    // --- Store the order so /api/verify-payment can confirm amount independently ---
    pendingOrders.set(rzpOrder.id, {
      amount: amountInPaise,    // paise
      currency: 'INR',
      receipt: receipt,
      customer: { name, phone, email, address, city, pincode }
    });

    // Clean up old entries if the map grows too large (simple safety valve)
    if (pendingOrders.size > 1000) {
      const firstKey = pendingOrders.keys().next().value;
      pendingOrders.delete(firstKey);
    }

    console.log(`[ORDER CREATED] ${rzpOrder.id} | ₹${grandTotalINR} | Receipt: ${receipt}`);

    // Return ONLY what the frontend needs — NEVER return keySecret
    return res.json({
      success: true,
      key_id: keyId,
      order_id: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency
    });

  } catch (err) {
    // Log detail server-side only — never expose to client
    console.error('[CREATE ORDER ERROR]', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to create order. Please try again or contact support.'
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/verify-payment
// Cryptographically verifies the Razorpay payment signature using HMAC-SHA256.
//
// Security rules enforced here:
//   - Signature is re-generated server-side using keySecret.
//   - Expected order amount is taken from the server's pendingOrders store,
//     NOT from anything the browser sends.
//   - All three fields (order_id, payment_id, signature) must be present.
//   - Payment is considered successful only when all checks pass.
// ---------------------------------------------------------------------------
app.post('/api/verify-payment', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, error: 'Missing payment verification fields.' });
    }

    // --- Retrieve server-stored order (not browser-supplied data) ---
    const storedOrder = pendingOrders.get(razorpay_order_id);
    if (!storedOrder) {
      // This can happen if the server restarted between order creation and payment.
      // In production, look up the order from the database.
      console.warn(`[VERIFY] Order not found in memory: ${razorpay_order_id}`);
      return res.status(400).json({ success: false, error: 'Order not found. Please try again.' });
    }

    // --- HMAC-SHA256 signature verification ---
    // The signed message is exactly: order_id + "|" + payment_id
    const generatedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    // Use a timing-safe comparison to prevent timing attacks
    const expectedBuf  = Buffer.from(generatedSignature, 'hex');
    const receivedBuf  = Buffer.from(razorpay_signature,  'hex');
    const signaturesMatch =
      expectedBuf.length === receivedBuf.length &&
      crypto.timingSafeEqual(expectedBuf, receivedBuf);

    if (!signaturesMatch) {
      console.warn(`[VERIFY FAILED] Signature mismatch for order: ${razorpay_order_id}`);
      return res.status(400).json({ success: false, error: 'Payment verification failed. Please contact support.' });
    }

    // --- Fetch payment details from Razorpay to confirm amount & status ---
    let payment;
    try {
      payment = await razorpay.payments.fetch(razorpay_payment_id);
    } catch (fetchErr) {
      console.error('[VERIFY] Failed to fetch payment from Razorpay:', fetchErr.message);
      return res.status(500).json({ success: false, error: 'Could not confirm payment status. Please contact support.' });
    }

    // Confirm this payment belongs to the expected order
    if (payment.order_id !== razorpay_order_id) {
      console.warn(`[VERIFY MISMATCH] payment.order_id (${payment.order_id}) !== expected (${razorpay_order_id})`);
      return res.status(400).json({ success: false, error: 'Payment does not match the order. Contact support.' });
    }

    // Confirm amount (Razorpay returns amount in paise)
    if (payment.amount !== storedOrder.amount) {
      console.warn(`[VERIFY MISMATCH] payment.amount (${payment.amount}) !== expected (${storedOrder.amount})`);
      return res.status(400).json({ success: false, error: 'Payment amount mismatch. Contact support.' });
    }

    // Confirm currency
    if (payment.currency !== 'INR') {
      console.warn(`[VERIFY MISMATCH] payment.currency (${payment.currency}) !== INR`);
      return res.status(400).json({ success: false, error: 'Invalid payment currency.' });
    }

    // Confirm payment is captured or authorized
    // 'captured' = money collected; 'authorized' = held, not yet settled (manual capture mode)
    if (payment.status !== 'captured' && payment.status !== 'authorized') {
      console.warn(`[VERIFY] Payment ${razorpay_payment_id} status is "${payment.status}" — not fulfilled`);
      return res.status(400).json({ success: false, error: `Payment is in "${payment.status}" state. Contact support.` });
    }

    // --- All checks passed — mark the order fulfilled ---
    pendingOrders.delete(razorpay_order_id);

    const amountINR = storedOrder.amount / 100;
    console.log(`[PAYMENT VERIFIED] Order: ${razorpay_order_id} | Payment: ${razorpay_payment_id} | ₹${amountINR}`);

    return res.json({
      success: true,
      message: 'Payment verified successfully.',
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      amountINR: amountINR,
      date: new Date().toISOString()
    });

  } catch (err) {
    console.error('[VERIFY ERROR]', err.message);
    return res.status(500).json({
      success: false,
      error: 'An error occurred during payment verification. Please contact support.'
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/razorpay/webhook
// Receives asynchronous payment events from Razorpay.
//
// Security:
//   - Validates the Razorpay-Signature header using RAZORPAY_WEBHOOK_SECRET
//     and the RAW request body (not parsed JSON — that would invalidate HMAC).
//   - Deduplicates events using the x-razorpay-event-id header.
//   - Does NOT mark orders paid based solely on webhook; cross-references with
//     pendingOrders (or your database in production).
//
// IMPORTANT: This function is defined here and mounted BEFORE express.json()
// so it receives the raw Buffer body needed for HMAC validation.
// ---------------------------------------------------------------------------
const processedWebhookEvents = new Set(); // In-memory dedup store

function handleWebhook(req, res) {
  try {
    const rawBody = req.body; // Buffer — NOT parsed JSON

    if (!webhookSecret) {
      // If webhook secret isn't configured, acknowledge but don't process
      console.warn('[WEBHOOK] RAZORPAY_WEBHOOK_SECRET is not set — skipping signature validation.');
      return res.status(200).json({ received: true });
    }

    const razorpaySignature = req.headers['x-razorpay-signature'];
    const eventId           = req.headers['x-razorpay-event-id'];

    if (!razorpaySignature) {
      return res.status(400).json({ error: 'Missing webhook signature.' });
    }

    // --- Validate webhook HMAC using the RAW body ---
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    let sigValid = false;
    try {
      const expBuf = Buffer.from(expectedSignature, 'hex');
      const recBuf = Buffer.from(razorpaySignature,  'hex');
      sigValid = expBuf.length === recBuf.length && crypto.timingSafeEqual(expBuf, recBuf);
    } catch {
      sigValid = false;
    }

    if (!sigValid) {
      console.warn('[WEBHOOK] Invalid signature — rejecting request.');
      return res.status(400).json({ error: 'Invalid webhook signature.' });
    }

    // --- Deduplicate events ---
    if (eventId) {
      if (processedWebhookEvents.has(eventId)) {
        console.log(`[WEBHOOK] Duplicate event ignored: ${eventId}`);
        return res.status(200).json({ received: true, duplicate: true });
      }
      processedWebhookEvents.add(eventId);
      // Simple size cap
      if (processedWebhookEvents.size > 5000) {
        const firstVal = processedWebhookEvents.values().next().value;
        processedWebhookEvents.delete(firstVal);
      }
    }

    // --- Parse and handle the event ---
    const event = JSON.parse(rawBody.toString('utf8'));
    const eventType = event.event;

    console.log(`[WEBHOOK] Received event: ${eventType} | ID: ${eventId || 'N/A'}`);

    switch (eventType) {
      case 'payment.authorized': {
        const payment = event.payload?.payment?.entity;
        if (payment) {
          console.log(`[WEBHOOK] Payment authorized: ${payment.id} | Order: ${payment.order_id} | ₹${payment.amount / 100}`);
          // In production: update order status to "authorized" in your database.
          // If using auto-capture (default), this transitions to "captured" automatically.
        }
        break;
      }

      case 'payment.captured': {
        const payment = event.payload?.payment?.entity;
        if (payment) {
          console.log(`[WEBHOOK] Payment captured: ${payment.id} | Order: ${payment.order_id} | ₹${payment.amount / 100}`);
          // In production: mark the order as paid/fulfilled in your database.
          // Remove from pendingOrders if still present.
          if (payment.order_id) pendingOrders.delete(payment.order_id);
        }
        break;
      }

      case 'payment.failed': {
        const payment = event.payload?.payment?.entity;
        if (payment) {
          console.warn(`[WEBHOOK] Payment failed: ${payment.id} | Order: ${payment.order_id}`);
          // In production: mark the order as failed in your database.
        }
        break;
      }

      case 'order.paid': {
        const order = event.payload?.order?.entity;
        if (order) {
          console.log(`[WEBHOOK] Order paid: ${order.id} | ₹${order.amount_paid / 100}`);
          if (order.id) pendingOrders.delete(order.id);
        }
        break;
      }

      default:
        console.log(`[WEBHOOK] Unhandled event type: ${eventType}`);
    }

    // Always respond 200 quickly so Razorpay doesn't retry
    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('[WEBHOOK ERROR]', err.message);
    // Still return 200 to prevent Razorpay from retrying on our processing errors
    return res.status(200).json({ received: true });
  }
}

// ---------------------------------------------------------------------------
// Fallback to index.html for unknown GET routes (SPA support)
// ---------------------------------------------------------------------------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ---------------------------------------------------------------------------
// Start Server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log('=======================================================');
  console.log('✨ VARADA CRYSTAL E-COMMERCE SERVER RUNNING');
  console.log(`🌐 Local URL: http://localhost:${PORT}`);
  // Log only the public key — NEVER log keySecret
  console.log(`💳 Razorpay Key ID: ${keyId}`);
  console.log(`🔗 Webhook: ${webhookSecret ? 'Configured' : 'Not configured (set RAZORPAY_WEBHOOK_SECRET)'}`);
  console.log('=======================================================');
});
