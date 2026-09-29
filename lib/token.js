'use strict';
// Signed entitlement token. It holds only a provider reference (no name, no email).
// The server never trusts it alone: subscription status is re-checked with the provider.
const crypto = require('crypto');

let SECRET = process.env.TOKEN_SECRET;
if (!SECRET) {
  SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('[startline] TOKEN_SECRET is not set. A temporary one is used, so subscribers are signed out on every restart. Add TOKEN_SECRET in Secrets before you go live.');
}

const mac = (body) => crypto.createHmac('sha256', SECRET).update(body).digest('base64url');

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return body + '.' + mac(body);
}

function verify(t) {
  if (typeof t !== 'string' || t.length > 2000) return null;
  const parts = t.split('.');
  if (parts.length !== 2) return null;
  const a = Buffer.from(parts[1]);
  const b = Buffer.from(mac(parts[0]));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(parts[0], 'base64url').toString()); } catch (e) { return null; }
}

module.exports = { sign, verify };
