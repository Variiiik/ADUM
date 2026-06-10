'use strict';
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const FILE = path.join(__dirname, '..', 'config', 'requests.json');

function load() {
  try {
    if (fs.existsSync(FILE)) return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch { /* fall through */ }
  return [];
}

function save(list) {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2), 'utf8');
}

function add(submitter, data) {
  const list = load();
  const item = {
    id:              'req-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex'),
    status:          'pending',
    submittedBy:     submitter.sam,
    submittedByName: submitter.displayName || submitter.sam,
    submittedAt:     new Date().toISOString(),
    reviewedBy:      null,
    reviewedAt:      null,
    rejectionReason: '',
    data,
  };
  list.push(item);
  save(list);
  return item;
}

function get(id) {
  return load().find(r => r.id === id) || null;
}

function update(id, fields) {
  const list = load();
  const idx  = list.findIndex(r => r.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...fields };
  save(list);
  return list[idx];
}

function remove(id) {
  const list = load();
  const idx  = list.findIndex(r => r.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  save(list);
  return true;
}

module.exports = { load, add, get, update, remove };
