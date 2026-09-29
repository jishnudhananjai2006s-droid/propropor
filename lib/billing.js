'use strict';
// One small interface for three payment modes: demo, stripe, razorpay.
//   createCheckout({origin}) -> what the browser needs to start paying
//   confirm(body)            -> verified provider reference (customer or subscription id)
//   isActive(ref)            -> true while the subscription gives access
//   portal(ref, origin)      -> manage or cancel
// No database: the provider is the source of truth, checked live and cached for 5 minutes.
const crypto = require('crypto');

const mode = (process.env.PAYMENTS_PROVIDER || 'demo').toLowerCase();
const trialDays = Math.max(0, Number(process.env.TRIAL_DAYS || 0) || 0);
const priceLabel = process.env.PRICE_LABEL || '₹149 / month';

function need(names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    console.error('[startline] PAYMENTS_PROVIDER=' + mode + ' needs these Secrets: ' + missing.join(', '));
    process.exit(1);
  }
}
const bad = (msg) => { const e = new Error(msg); e.expose = true; return e; };

/* ---------- demo: simulated payments for testing the paywall ---------- */
function demo() {
  const active = new Set();
  return {
    async createCheckout() { return { provider: 'demo' }; },
    async confirm() { const ref = 'demo-' + crypto.randomBytes(8).toString('hex'); active.add(ref); return ref; },
    async isActive(ref) { return active.has(ref); },
    async portal(ref) { active.delete(ref); return { cancelled: true }; },
  };
}

/* ---------- Stripe (hosted Checkout + billing portal) ---------- */
function stripe() {
  need(['STRIPE_SECRET_KEY', 'STRIPE_PRICE_ID']);
  const Stripe = require('stripe');
  const s = new Stripe(process.env.STRIPE_SECRET_KEY);
  return {
    async createCheckout({ origin }) {
      const params = {
        mode: 'subscription',
        line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
        success_url: origin + '/?paid={CHECKOUT_SESSION_ID}',
        cancel_url: origin + '/?canceled=1',
        allow_promotion_codes: true,
      };
      if (trialDays > 0) params.subscription_data = { trial_period_days: trialDays };
      const session = await s.checkout.sessions.create(params);
      return { provider: 'stripe', url: session.url };
    },
    async confirm(body) {
      const id = String((body && body.session_id) || '');
      if (!/^cs_[A-Za-z0-9_]+$/.test(id)) throw bad('bad session');
      const ses = await s.checkout.sessions.retrieve(id);
      if (ses.status !== 'complete' || !ses.customer) throw bad('not complete');
      return String(ses.customer);
    },
    async isActive(ref) {
      const list = await s.subscriptions.list({ customer: ref, status: 'all', limit: 10 });
      return list.data.some((x) => x.status === 'active' || x.status === 'trialing');
    },
    async portal(ref, origin) {
      const p = await s.billingPortal.sessions.create({ customer: ref, return_url: origin });
      return { url: p.url };
    },
  };
}

/* ---------- Razorpay (Standard Checkout for Subscriptions) ---------- */
function razorpay() {
  need(['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_PLAN_ID']);
  const Razorpay = require('razorpay');
  const keyId = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  const rz = new Razorpay({ key_id: keyId, key_secret: secret });
  return {
    async createCheckout() {
      const body = {
        plan_id: process.env.RAZORPAY_PLAN_ID,
        total_count: Number(process.env.RAZORPAY_TOTAL_COUNT || 120),
        customer_notify: true,
      };
      if (trialDays > 0) body.start_at = Math.floor(Date.now() / 1000) + trialDays * 86400 + 300;
      const sub = await rz.subscriptions.create(body);
      return { provider: 'razorpay', keyId, subscriptionId: sub.id };
    },
    async confirm(b) {
      const pay = String((b && b.razorpay_payment_id) || '');
      const sub = String((b && b.razorpay_subscription_id) || '');
      const sig = String((b && b.razorpay_signature) || '');
      if (!pay || !sub || !sig) throw bad('missing fields');
      const expected = crypto.createHmac('sha256', secret).update(pay + '|' + sub).digest('hex');
      const a = Buffer.from(sig), e = Buffer.from(expected);
      if (a.length !== e.length || !crypto.timingSafeEqual(a, e)) throw bad('bad signature');
      return sub;
    },
    async isActive(ref) {
      const sub = await rz.subscriptions.fetch(ref);
      return sub.status === 'active' || sub.status === 'authenticated';
    },
    async portal(ref) {
      try { await rz.subscriptions.cancel(ref, { cancel_at_cycle_end: true }); }
      catch (e) { await rz.subscriptions.cancel(ref, { cancel_at_cycle_end: false }); }
      return { cancelled: true };
    },
  };
}

const adapter = { demo, stripe, razorpay }[mode];
if (!adapter) {
  console.error('[startline] PAYMENTS_PROVIDER must be demo, stripe or razorpay (got "' + mode + '").');
  process.exit(1);
}
const impl = adapter();
if (mode === 'demo') console.warn('[startline] TEST MODE: payments are simulated and nobody is charged. Set PAYMENTS_PROVIDER before you go live.');

const cache = new Map();
const TTL = 5 * 60 * 1000;

async function isActive(ref) {
  if (!ref) return false;
  const c = cache.get(ref);
  if (c && Date.now() - c.at < TTL) return c.v;
  try {
    const v = await impl.isActive(ref);
    cache.set(ref, { v, at: Date.now() });
    return v;
  } catch (e) {
    console.error('[startline] status check failed:', e.message);
    return c ? c.v : false; // provider hiccup: keep the last known answer
  }
}

module.exports = {
  mode, trialDays, priceLabel, isActive,
  createCheckout: (o) => impl.createCheckout(o),
  confirm: (b) => impl.confirm(b),
  portal: async (ref, origin) => { const r = await impl.portal(ref, origin); cache.delete(ref); return r; },
  forget: (ref) => cache.delete(ref),
};
