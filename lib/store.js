'use strict';
// Tiny key-value store with two backends:
//   - Replit Database, when the app runs on Replit (nothing to set up)
//   - a JSON file in ./data, for running on your own computer
// Keys use only letters, digits, "_" and "-".
const fs = require('fs');
const path = require('path');

function fileStore() {
  const dir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  const file = path.join(dir, 'store.json');
  let m = null;
  const load = () => { if (!m) { try { m = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { m = {}; } } };
  const flush = () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify(m));
    fs.renameSync(file + '.tmp', file);
  };
  return {
    kind: 'file',
    async get(k) { load(); return Object.prototype.hasOwnProperty.call(m, k) ? JSON.parse(JSON.stringify(m[k])) : null; },
    async set(k, v) { load(); m[k] = v; flush(); },
    async del(k) { load(); delete m[k]; flush(); },
  };
}

function replitStore() {
  const Database = require('@replit/database');
  const db = new Database();
  return {
    kind: 'replit',
    async get(k) { const v = await db.get(k); return v === undefined ? null : v; },
    async set(k, v) { await db.set(k, v); },
    async del(k) { await db.delete(k); },
  };
}

// Upstash Redis over its REST API (free tier; works on hosts with no disk, like Render).
function upstashStore() {
  const base = process.env.UPSTASH_REDIS_REST_URL.replace(/\/+$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const run = async (cmd) => {
    const r = await fetch(base, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error('upstash: ' + (j.error || r.status));
    return j.result;
  };
  return {
    kind: 'upstash',
    async get(k) { const v = await run(['GET', k]); return v == null ? null : JSON.parse(v); },
    async set(k, v) { await run(['SET', k, JSON.stringify(v)]); },
    async del(k) { await run(['DEL', k]); },
  };
}

const onReplit = !!process.env.REPLIT_DB_URL || fs.existsSync('/tmp/replitdb');
const useUpstash = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const store = useUpstash ? upstashStore() : onReplit ? replitStore() : fileStore();
console.log('[startline] storage: ' + store.kind);
module.exports = store;
