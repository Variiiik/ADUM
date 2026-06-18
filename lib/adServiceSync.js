'use strict';

const fs   = require('fs');
const path = require('path');
const lc   = require('../config/ldap');

const SETTINGS_FILE = path.join(__dirname, '..', 'config', 'settings.json');

// Role codes used in the AD attribute value
const ROLE_OWNER = 'O'; // omanik
const ROLE_TECH  = 'T'; // tehniline isik

// Attribute format per service entry: "CODE:owner:tech:groupIdx"
// Examples: "RAP:O:T:1"  "ERP:O::"  "CRM:::2"
// Priority for display: owner > tech > group member
const ROLE_PRIORITY = { O: 3, T: 2, G: 1 };

function getAdAttribute() {
  try {
    const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    return s.services?.adAttribute || process.env.AD_SERVICE_ATTRIBUTE || 'extensionAttribute1';
  } catch {
    return process.env.AD_SERVICE_ATTRIBUTE || 'extensionAttribute1';
  }
}

// "ERP:O::;RAP:::1;CRM:O:T:2" → { ERP: 'O::', RAP: '::1', CRM: 'O:T:2' }
// Also handles legacy format: "ERP:O;RAP:1L;CRM:OT2L"
function parseRoles(raw) {
  const roles = {};
  if (!raw || typeof raw !== 'string') return roles;
  for (const part of raw.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(':');
    if (colon < 1) continue;
    const code = trimmed.slice(0, colon).toUpperCase();
    const role = trimmed.slice(colon + 1).toUpperCase();
    if (code && role) roles[code] = role;
  }
  return roles;
}

// { ERP: 'O::', RAP: '::1' } → "ERP:O::;RAP:::1" (sorted alphabetically)
// Skips entries where all three role parts are empty
function serializeRoles(rolesMap) {
  return Object.entries(rolesMap)
    .filter(([, r]) => r && r.replace(/:/g, '').length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, role]) => `${code}:${role}`)
    .join(';');
}

// Returns "owner:tech:groupIdx" for a user in a service.
// Format: each part is O/T/number or empty. Examples: "O:T:1" "O::" "::2" "O:T:"
// Group index is 1-based and recalculated from current rightsGroups array position,
// so deleting a group automatically re-indexes remaining groups on next sync.
function computeRole(svc, sam) {
  const owner = (svc.owners || []).includes(sam) ? ROLE_OWNER : '';
  const tech  = svc.technicalPerson === sam ? ROLE_TECH : '';

  let groupIdx = '';
  if (!svc.adLinked && svc.groupMembers && svc.rightsGroups) {
    for (const gname of svc.rightsGroups) {
      const mems = svc.groupMembers[gname] || [];
      if (mems.includes(sam)) {
        // Use stable stored index; fall back to position+1 for legacy data without groupIndices
        const stored = svc.groupIndices?.[gname];
        groupIdx = String(stored != null ? stored : (svc.rightsGroups.indexOf(gname) + 1));
        break;
      }
    }
  } else if (svc.adLinked && (svc.members || []).includes(sam)) {
    groupIdx = '0';
  }

  if (!owner && !tech && !groupIdx) return null;
  return `${owner}:${tech}:${groupIdx}`;
}

// ── Mock AD: in-memory attribute store ────────────────────────────────────────
const _mockStore = {}; // { sam → raw string }

function _mockGet(sam) {
  const u = lc.MOCK_USERS.find(x => x.sam === sam);
  return (u && u.serviceAttribute) || _mockStore[sam] || '';
}

function _mockSet(sam, raw) {
  _mockStore[sam] = raw;
  const u = lc.MOCK_USERS.find(x => x.sam === sam);
  if (u) u.serviceAttribute = raw;
}

// ── Real LDAP helpers ─────────────────────────────────────────────────────────

function _bind(client) {
  return new Promise((ok, fail) => {
    client.bind(lc.BIND_USER, lc.BIND_PASS, e => {
      if (e) { client.destroy(); fail(new Error('LDAP bind: ' + e.message)); } else ok();
    });
  });
}

async function _getUserInfo(sam, attrName) {
  const results = await lc.searchUsers(
    `(&(objectClass=user)(sAMAccountName=${lc.escapeLdap(sam)}))`,
    ['distinguishedName', attrName]
  );
  if (!results.length) return null;
  const r   = results[0];
  const dn  = r.distinguishedName || r.distinguishedname || '';
  const raw = r[attrName] || r[attrName.toLowerCase()] || '';
  return { dn, raw: Array.isArray(raw) ? (raw[0] || '') : String(raw || '') };
}

async function _writeAttr(dn, attrName, value) {
  const ldapjs = require('ldapjs');
  const client = lc.createClient();
  await _bind(client);
  await new Promise((ok, fail) => {
    const change = new ldapjs.Change({
      operation: 'replace',
      modification: { type: attrName, values: value ? [value] : [] },
    });
    client.modify(dn, [change], e => {
      if (e) { console.error('[adSync] modify:', e.message); fail(e); } else ok();
    });
  });
  client.unbind();
}

// ── Public API ────────────────────────────────────────────────────────────────

async function setServiceRole(sam, serviceCode, role) {
  const attrName = getAdAttribute();
  const code     = serviceCode.toUpperCase();

  if (lc.MOCK_AD) {
    const roles = parseRoles(_mockGet(sam));
    if (role) { roles[code] = role; } else { delete roles[code]; }
    _mockSet(sam, serializeRoles(roles));
    return;
  }

  const info = await _getUserInfo(sam, attrName);
  if (!info) throw new Error(`AD kasutajat ei leitud: ${sam}`);
  const roles = parseRoles(info.raw);
  if (role) { roles[code] = role; } else { delete roles[code]; }
  await _writeAttr(info.dn, attrName, serializeRoles(roles));
}

// Sync the user's role based on their current membership in the service.
// Call this after any owner/member/tech change for each affected user.
async function syncUserRole(svc, sam) {
  if (!svc.code) return; // no code → nothing to sync
  const role = computeRole(svc, sam);
  await setServiceRole(sam, svc.code, role);
}

async function getUserServiceAttribute(sam) {
  const attrName = getAdAttribute();
  if (lc.MOCK_AD) return _mockGet(sam);
  const info = await _getUserInfo(sam, attrName);
  return info ? info.raw : '';
}

function getGroupIndexAttribute() {
  try {
    const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    return s.services?.groupIndexAttribute || process.env.AD_GROUP_INDEX_ATTRIBUTE || 'extensionAttribute1';
  } catch {
    return process.env.AD_GROUP_INDEX_ATTRIBUTE || 'extensionAttribute1';
  }
}

// Reads the stored index from an AD group's attribute. Returns integer or null.
async function readGroupIndex(groupName) {
  if (lc.MOCK_AD) return null;
  const attrName = getGroupIndexAttribute();
  try {
    const results = await lc.searchGroups(
      `(&(objectClass=group)(cn=${lc.escapeLdap(groupName)}))`,
      ['distinguishedName', attrName]
    );
    if (!results.length) return null;
    const raw = results[0][attrName] || results[0][attrName.toLowerCase()];
    const val = Array.isArray(raw) ? raw[0] : raw;
    const num = parseInt(String(val || ''), 10);
    return Number.isInteger(num) && num > 0 ? num : null;
  } catch {
    return null;
  }
}

// Writes the group's index to the AD group attribute.
async function writeGroupIndex(groupName, index) {
  if (lc.MOCK_AD) return;
  const attrName = getGroupIndexAttribute();
  const ldapjs = require('ldapjs');
  try {
    const results = await lc.searchGroups(
      `(&(objectClass=group)(cn=${lc.escapeLdap(groupName)}))`,
      ['distinguishedName']
    );
    if (!results.length) return;
    const dn = results[0].distinguishedName || results[0].distinguishedname;
    if (!dn) return;
    const client = lc.createClient();
    await _bind(client);
    await new Promise((ok, fail) => {
      client.modify(dn, [new ldapjs.Change({
        operation: 'replace',
        modification: { type: attrName, values: [String(index)] },
      })], e => { if (e) fail(e); else ok(); });
    });
    client.unbind();
  } catch (err) {
    console.warn(`[adSync] writeGroupIndex "${groupName}": ${err.message}`);
  }
}

// Clears the group index attribute from an AD group.
async function clearGroupIndex(groupName) {
  if (lc.MOCK_AD) return;
  const attrName = getGroupIndexAttribute();
  const ldapjs = require('ldapjs');
  try {
    const results = await lc.searchGroups(
      `(&(objectClass=group)(cn=${lc.escapeLdap(groupName)}))`,
      ['distinguishedName']
    );
    if (!results.length) return;
    const dn = results[0].distinguishedName || results[0].distinguishedname;
    if (!dn) return;
    const client = lc.createClient();
    await _bind(client);
    await new Promise((ok, fail) => {
      client.modify(dn, [new ldapjs.Change({
        operation: 'replace',
        modification: { type: attrName, values: [] },
      })], e => { if (e) fail(e); else ok(); });
    });
    client.unbind();
  } catch (err) {
    console.warn(`[adSync] clearGroupIndex "${groupName}": ${err.message}`);
  }
}

module.exports = {
  ROLE_OWNER, ROLE_TECH, ROLE_PRIORITY,
  parseRoles, serializeRoles, computeRole,
  setServiceRole, syncUserRole, getUserServiceAttribute,
  getAdAttribute,
  getGroupIndexAttribute, readGroupIndex, writeGroupIndex, clearGroupIndex,
};
