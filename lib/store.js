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

const onReplit = !!process.env.REPLIT_DB_URL || fs.existsSync('/tmp/replitdb');
const store = onReplit ? replitStore() : fileStore();
console.log('[startline] storage: ' + store.kind);
module.exports = store;
