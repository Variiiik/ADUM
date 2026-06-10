'use strict';

const fs   = require('fs');
const path = require('path');
const lc   = require('../config/ldap');

const SETTINGS_FILE = path.join(__dirname, '..', 'config', 'settings.json');

// Role codes used in the AD attribute value
const ROLE_OWNER  = 'O'; // omanik
const ROLE_TECH   = 'T'; // tehniline isik
const ROLE_MEMBER = 'L'; // liige

// Priority: owner > technical > member
const ROLE_PRIORITY = { O: 3, T: 2, L: 1 };

function getAdAttribute() {
  try {
    const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    return s.services?.adAttribute || process.env.AD_SERVICE_ATTRIBUTE || 'extensionAttribute1';
  } catch {
    return process.env.AD_SERVICE_ATTRIBUTE || 'extensionAttribute1';
  }
}

// "ERP:O;RAP:1L;CRM:2L" → { ERP: 'O', RAP: '1L', CRM: '2L' }
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

// { ERP: 'O', RAP: '1L' } → "ERP:O;RAP:1L" (sorted alphabetically)
function serializeRoles(rolesMap) {
  return Object.entries(rolesMap)
    .filter(([, r]) => r)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, role]) => `${code}:${role}`)
    .join(';');
}

// Compute the combined role string for a user in a service.
// All applicable roles are concatenated in order: O, T, then group memberships by index.
// Examples: "O", "T", "OT", "1L", "O1L", "OT1L", "OT1L2L"
function computeRole(svc, sam) {
  let role = '';
  if ((svc.owners || []).includes(sam)) role += ROLE_OWNER;
  if (svc.technicalPerson === sam)       role += ROLE_TECH;
  if (!svc.adLinked && svc.groupMembers && svc.rightsGroups) {
    for (let i = 0; i < svc.rightsGroups.length; i++) {
      const mems = svc.groupMembers[svc.rightsGroups[i]] || [];
      if (mems.includes(sam)) role += `${i + 1}${ROLE_MEMBER}`;
    }
  }
  // AD-linked direct members (legacy, no group index)
  if (svc.adLinked && (svc.members || []).includes(sam) && !role.includes(ROLE_MEMBER)) {
    role += ROLE_MEMBER;
  }
  return role || null;
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

module.exports = {
  ROLE_OWNER, ROLE_TECH, ROLE_MEMBER, ROLE_PRIORITY,
  parseRoles, serializeRoles, computeRole,
  setServiceRole, syncUserRole, getUserServiceAttribute,
  getAdAttribute,
};
