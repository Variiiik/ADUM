'use strict';

const express    = require('express');
const fs         = require('fs');
const path       = require('path');
const router     = express.Router();
const lc         = require('../config/ldap');
const audit      = require('../lib/audit');
const { requireAdmin } = require('../middleware/auth');
const { createUser } = require('../lib/createUser');

// Map a raw LDAP object to a clean user record
// Safely read an attribute — tries original key, then lowercase
function str(e, ...keys) {
  for (const k of keys) {
    const v = e[k] ?? e[k.toLowerCase()];
    if (v != null) return Array.isArray(v) ? (v[0] ?? '') : String(v);
  }
  return '';
}

function mapUser(e) {
  if (!e) return null;
  // sAMAccountName is the minimum required field
  const sam = str(e, 'sAMAccountName');
  if (!sam) return null;

  const uac   = parseInt(str(e, 'userAccountControl')) || 512;
  const lockT = parseInt(str(e, 'lockoutTime')) || 0;

  const rawMemberOf = e.memberOf ?? e.memberof;
  const groups = rawMemberOf
    ? (Array.isArray(rawMemberOf) ? rawMemberOf : [rawMemberOf])
        .map(dn => (dn.match(/CN=([^,]+)/i) || [])[1]).filter(Boolean)
    : [];

  const dn = str(e, 'distinguishedName');
  return {
    sam,
    displayName:       str(e, 'displayName'),
    givenName:         str(e, 'givenName'),
    sn:                str(e, 'sn'),
    userPrincipalName: str(e, 'userPrincipalName'),
    mail:              str(e, 'mail'),
    department:        str(e, 'department'),
    title:             str(e, 'title'),
    manager:           str(e, 'manager') || null,
    telephoneNumber:   str(e, 'telephoneNumber'),
    employeeID:        str(e, 'employeeID', 'employeeId'),
    ou:                dn ? dn.split(',').slice(1).join(',') : '',
    dn,
    status:            lc.computeStatus(uac, lockT),
    lockoutTime:       lockT || null,
    lastLogon:         str(e, 'lastLogon') || null,
    pwdLastSet:        str(e, 'pwdLastSet') || null,
    pwNeverExpires:    !!(uac & 0x10000),
    mustChangePw:      str(e, 'pwdLastSet') === '0',
    groups,
    avatarColor:       e.avatarColor || '#2563eb',
  };
}

function validateSam(sam) {
  return typeof sam === 'string' && /^[\w.\-@]{1,64}$/.test(sam);
}

// GET /api/users
router.get('/', async (req, res) => {
  const { q, dept, status } = req.query;
  try {
    if (lc.MOCK_AD) {
      let users = lc.MOCK_USERS.map(u => ({ ...u, status: lc.computeStatus(u.userAccountControl, u.lockoutTime) }));
      if (q) {
        const sq = q.toLowerCase();
        users = users.filter(u =>
          u.displayName.toLowerCase().includes(sq) ||
          u.sam.toLowerCase().includes(sq) ||
          (u.mail || '').toLowerCase().includes(sq));
      }
      if (dept)   users = users.filter(u => u.department === dept);
      if (status) users = users.filter(u => u.status === status);
      return res.json({ users });
    }

    let filter = '(&(objectClass=user)(objectCategory=person))';
    if (q) {
      const e = lc.escapeLdap(q);
      filter = `(&(objectClass=user)(objectCategory=person)(|(displayName=*${e}*)(sAMAccountName=*${e}*)(mail=*${e}*)))`;
    }
    const attrs = ['sAMAccountName','displayName','givenName','sn','mail','department','title',
      'userAccountControl','lockoutTime','lastLogon','telephoneNumber','distinguishedName','memberOf',
      'userPrincipalName','employeeID','pwdLastSet'];
    let results = await lc.searchUsers(filter, attrs);
    let users   = results.map(mapUser).filter(Boolean);
    if (dept)   users = users.filter(u => u.department === dept);
    if (status) users = users.filter(u => u.status === status);
    res.json({ users });
  } catch (err) {
    console.error('[users] list:', err.message);
    res.status(500).json({ error: 'Kasutajate laadimine ebaõnnestus.' });
  }
});

// GET /api/users/:sam
router.get('/:sam', async (req, res) => {
  const { sam } = req.params;
  if (!validateSam(sam)) return res.status(400).json({ error: 'Vigane kasutajanimi.' });
  try {
    if (lc.MOCK_AD) {
      const u = lc.MOCK_USERS.find(x => x.sam === sam);
      if (!u) return res.status(404).json({ error: 'Kasutajat ei leitud.' });
      return res.json({ user: { ...u, status: lc.computeStatus(u.userAccountControl, u.lockoutTime) } });
    }
    const r = await lc.searchUsers(`(&(objectClass=user)(objectCategory=person)(sAMAccountName=${lc.escapeLdap(sam)}))`, ['*']);
    if (!r.length) return res.status(404).json({ error: 'Kasutajat ei leitud.' });
    res.json({ user: mapUser(r[0]) });
  } catch (err) {
    res.status(500).json({ error: 'Kasutaja laadimine ebaõnnestus.' });
  }
});

// POST /api/users — create (admin only; HR users must use /api/requests)
router.post('/', requireAdmin, async (req, res) => {
  const actor = req.session.user.sam;
  const { givenName, sn, username, mail, password, department, title, manager, ou, enabled,
          telephoneNumber, sendSms } = req.body;

  if (!givenName?.trim() || !sn?.trim() || !username?.trim() || !password) {
    return res.status(400).json({ error: 'Kohustuslikud väljad puuduvad.' });
  }
  if (!validateSam(username)) return res.status(400).json({ error: 'Kasutajanimi sisaldab lubamatuid märke.' });
  if (password.length < 8)    return res.status(400).json({ error: 'Parool peab olema vähemalt 8 tähemärki.' });

  try {
    const result = await createUser(req.body);
    const nu     = result.user || {};

    audit.logEvent(actor, 'CREATE_USER', username, 'success', department);

    let smsResult = null;
    if (sendSms && telephoneNumber) {
      if (lc.MOCK_AD) {
        smsResult = { ok: true, simulated: true };
        audit.logEvent(actor, 'SMS_SENT', username, 'success', `Simuleeritud → ${telephoneNumber}`);
      } else {
        const display = `${givenName.trim()} ${sn.trim()}`;
        smsResult = await trySendSms(username, password, telephoneNumber, display);
        audit.logEvent(actor, 'SMS_SENT', username, smsResult.ok ? 'success' : 'warning',
          smsResult.reason || telephoneNumber);
      }
    }
    res.status(201).json({ user: nu, sms: smsResult });
  } catch (err) {
    audit.logEvent(actor, 'CREATE_USER', username || '?', 'failure', err.message);
    console.error('[users] create:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'Kasutaja loomine ebaõnnestus.' });
  }
});

// PUT /api/users/:sam — update
router.put('/:sam', async (req, res) => {
  const { sam } = req.params;
  const actor   = req.session.user.sam;
  if (!validateSam(sam)) return res.status(400).json({ error: 'Vigane kasutajanimi.' });
  const { givenName, sn, mail, department, title, manager } = req.body;

  try {
    if (lc.MOCK_AD) {
      const idx = lc.MOCK_USERS.findIndex(u => u.sam === sam);
      if (idx === -1) return res.status(404).json({ error: 'Kasutajat ei leitud.' });
      const u = lc.MOCK_USERS[idx];
      if (givenName !== undefined) u.givenName = givenName;
      if (sn !== undefined)        u.sn = sn;
      if (givenName !== undefined || sn !== undefined)
        u.displayName = (u.givenName || '') + ' ' + (u.sn || '');
      if (mail !== undefined)       u.mail = mail;
      if (department !== undefined) u.department = department;
      if (title !== undefined)      u.title = title;
      if (manager !== undefined)    u.manager = manager;
      audit.logEvent(actor, 'MODIFY_USER', sam, 'success');
      return res.json({ ok: true });
    }

    const r = await lc.searchUsers(
      `(&(objectClass=user)(sAMAccountName=${lc.escapeLdap(sam)}))`,
      ['distinguishedName']
    );
    if (!r.length) return res.status(404).json({ error: 'Kasutajat ei leitud.' });
    const userDN = r[0].distinguishedName || r[0].distinguishedname;
    if (!userDN) return res.status(404).json({ error: 'Kasutaja DN puudub.' });

    const client = lc.createClient();
    await bind(client);

    const changes = ldapChanges([
      { op: 'replace', type: 'givenName',   val: givenName },
      { op: 'replace', type: 'sn',           val: sn },
      { op: 'replace', type: 'mail',         val: mail },
      { op: 'replace', type: 'displayName',  val: givenName && sn ? `${givenName.trim()} ${sn.trim()}` : undefined },
      { op: 'replace', type: 'department',   val: department },
      { op: 'replace', type: 'title',        val: title },
      manager !== undefined ? { op: manager ? 'replace' : 'delete', type: 'manager', val: manager || undefined } : null,
    ]);

    if (changes.length) {
      await new Promise((ok, fail) => client.modify(userDN, changes, e => {
        if (e) { console.error('[LDAP] modify error:', e.message); fail(e); } else ok();
      }));
    }
    client.unbind();
    audit.logEvent(actor, 'MODIFY_USER', sam, 'success');
    res.json({ ok: true });
  } catch (err) {
    audit.logEvent(actor, 'MODIFY_USER', sam, 'failure', err.message);
    console.error('[users] update:', err.message);
    res.status(500).json({ error: 'Kasutaja uuendamine ebaõnnestus.' });
  }
});

// DELETE /api/users/:sam
router.delete('/:sam', async (req, res) => {
  const { sam } = req.params;
  const actor   = req.session.user.sam;
  if (!validateSam(sam)) return res.status(400).json({ error: 'Vigane kasutajanimi.' });

  try {
    if (lc.MOCK_AD) {
      const idx = lc.MOCK_USERS.findIndex(u => u.sam === sam);
      if (idx === -1) return res.status(404).json({ error: 'Kasutajat ei leitud.' });
      lc.MOCK_USERS.splice(idx, 1);
      audit.logEvent(actor, 'DELETE_USER', sam, 'success');
      return res.json({ ok: true });
    }

    const r = await lc.searchUsers(`(&(objectClass=user)(sAMAccountName=${lc.escapeLdap(sam)}))`, ['distinguishedName']);
    if (!r.length) return res.status(404).json({ error: 'Kasutajat ei leitud.' });
    const client = lc.createClient();
    await bind(client);
    await new Promise((ok, fail) => client.del(r[0].distinguishedName, e => e ? fail(e) : ok()));
    client.unbind();
    audit.logEvent(actor, 'DELETE_USER', sam, 'success');
    res.json({ ok: true });
  } catch (err) {
    audit.logEvent(actor, 'DELETE_USER', sam, 'failure', err.message);
    console.error('[users] delete:', err.message);
    res.status(500).json({ error: 'Kasutaja kustutamine ebaõnnestus.' });
  }
});

// POST /api/users/:sam/reset-password
router.post('/:sam/reset-password', async (req, res) => {
  const { sam } = req.params;
  const actor   = req.session.user.sam;
  const { password } = req.body;
  if (!validateSam(sam)) return res.status(400).json({ error: 'Vigane kasutajanimi.' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Parool peab olema vähemalt 8 tähemärki.' });

  try {
    if (lc.MOCK_AD) {
      const u = lc.MOCK_USERS.find(x => x.sam === sam);
      if (!u) return res.status(404).json({ error: 'Kasutajat ei leitud.' });
      u.pwdLastSet = new Date().toISOString();
      audit.logEvent(actor, 'RESET_PASSWORD', sam, 'success');
      return res.json({ ok: true });
    }

    const ldapjs = require('ldapjs');
    const r = await lc.searchUsers(`(&(objectClass=user)(sAMAccountName=${lc.escapeLdap(sam)}))`, ['distinguishedName']);
    if (!r.length) return res.status(404).json({ error: 'Kasutajat ei leitud.' });
    const dn = getDN(r);
    const client = lc.createClient();
    await bind(client);
    const pwBuf = Buffer.from(`"${password}"`, 'utf16le');
    await ldapModify(client, dn, [new ldapjs.Change({
      operation: 'replace', modification: { type: 'unicodePwd', values: [pwBuf] }
    })]);
    client.unbind();
    audit.logEvent(actor, 'RESET_PASSWORD', sam, 'success');
    res.json({ ok: true });
  } catch (err) {
    audit.logEvent(actor, 'RESET_PASSWORD', sam, 'failure', err.message);
    console.error('[users] reset-password:', err.message);
    res.status(500).json({ error: 'Parooli lähtestamine ebaõnnestus.' });
  }
});

// POST /api/users/:sam/enable
router.post('/:sam/enable', async (req, res) => {
  const { sam } = req.params;
  const actor   = req.session.user.sam;
  if (!validateSam(sam)) return res.status(400).json({ error: 'Vigane kasutajanimi.' });
  try {
    if (lc.MOCK_AD) {
      const u = lc.MOCK_USERS.find(x => x.sam === sam);
      if (!u) return res.status(404).json({ error: 'Kasutajat ei leitud.' });
      u.userAccountControl = 512; u.lockoutTime = 0;
      audit.logEvent(actor, 'ENABLE_USER', sam, 'success');
      return res.json({ ok: true });
    }
    await setUAC(sam, false);
    audit.logEvent(actor, 'ENABLE_USER', sam, 'success');
    res.json({ ok: true });
  } catch (err) {
    audit.logEvent(actor, 'ENABLE_USER', sam, 'failure', err.message);
    res.status(500).json({ error: 'Konto lubamine ebaõnnestus.' });
  }
});

// POST /api/users/:sam/disable
router.post('/:sam/disable', async (req, res) => {
  const { sam } = req.params;
  const actor   = req.session.user.sam;
  if (!validateSam(sam)) return res.status(400).json({ error: 'Vigane kasutajanimi.' });
  try {
    if (lc.MOCK_AD) {
      const u = lc.MOCK_USERS.find(x => x.sam === sam);
      if (!u) return res.status(404).json({ error: 'Kasutajat ei leitud.' });
      u.userAccountControl = 514;
      audit.logEvent(actor, 'DISABLE_USER', sam, 'success');
      return res.json({ ok: true });
    }
    await setUAC(sam, true);
    audit.logEvent(actor, 'DISABLE_USER', sam, 'success');
    res.json({ ok: true });
  } catch (err) {
    audit.logEvent(actor, 'DISABLE_USER', sam, 'failure', err.message);
    res.status(500).json({ error: 'Konto keelamine ebaõnnestus.' });
  }
});

// POST /api/users/:sam/unlock
router.post('/:sam/unlock', async (req, res) => {
  const { sam } = req.params;
  const actor   = req.session.user.sam;
  if (!validateSam(sam)) return res.status(400).json({ error: 'Vigane kasutajanimi.' });
  try {
    if (lc.MOCK_AD) {
      const u = lc.MOCK_USERS.find(x => x.sam === sam);
      if (!u) return res.status(404).json({ error: 'Kasutajat ei leitud.' });
      u.lockoutTime = 0;
      audit.logEvent(actor, 'UNLOCK_USER', sam, 'success');
      return res.json({ ok: true });
    }

    const r = await lc.searchUsers(`(&(objectClass=user)(sAMAccountName=${lc.escapeLdap(sam)}))`, ['distinguishedName']);
    if (!r.length) return res.status(404).json({ error: 'Kasutajat ei leitud.' });
    const dn = getDN(r);
    const client = lc.createClient();
    await bind(client);
    await ldapModify(client, dn, ldapChanges([
      { op: 'replace', type: 'lockoutTime', val: '0' }
    ]));
    client.unbind();
    audit.logEvent(actor, 'UNLOCK_USER', sam, 'success');
    res.json({ ok: true });
  } catch (err) {
    audit.logEvent(actor, 'UNLOCK_USER', sam, 'failure', err.message);
    res.status(500).json({ error: 'Konto avamine ebaõnnestus.' });
  }
});

// POST /api/users/:sam/groups/add
router.post('/:sam/groups/add', async (req, res) => {
  const { sam } = req.params;
  const { groupName } = req.body;
  const actor = req.session.user.sam;
  if (!validateSam(sam)) return res.status(400).json({ error: 'Vigane kasutajanimi.' });
  if (!groupName || typeof groupName !== 'string') return res.status(400).json({ error: 'Grupinimi puudub.' });

  try {
    if (lc.MOCK_AD) {
      const u = lc.MOCK_USERS.find(x => x.sam === sam);
      if (!u) return res.status(404).json({ error: 'Kasutajat ei leitud.' });
      if (!u.groups.includes(groupName)) u.groups.push(groupName);
      audit.logEvent(actor, 'GROUP_ADD', sam, 'success', groupName);
      return res.json({ ok: true });
    }

    const ldapjs = require('ldapjs');
    const [uRes, gRes] = await Promise.all([
      lc.searchUsers(`(&(objectClass=user)(sAMAccountName=${lc.escapeLdap(sam)}))`, ['distinguishedName']),
      lc.searchGroups(`(&(objectClass=group)(cn=${lc.escapeLdap(groupName)}))`, ['distinguishedName']),
    ]);
    if (!uRes.length) return res.status(404).json({ error: 'Kasutajat ei leitud.' });
    if (!gRes.length) return res.status(404).json({ error: 'Gruppi ei leitud.' });

    const groupDN = getDN(gRes);
    const userDN2 = getDN(uRes);
    const client = lc.createClient();
    await bind(client);
    await ldapModify(client, groupDN, ldapChanges([
      { op: 'add', type: 'member', val: userDN2 }
    ]));
    client.unbind();
    audit.logEvent(actor, 'GROUP_ADD', sam, 'success', groupName);
    res.json({ ok: true });
  } catch (err) {
    audit.logEvent(actor, 'GROUP_ADD', sam, 'failure', err.message);
    res.status(500).json({ error: 'Gruppi lisamine ebaõnnestus.' });
  }
});

// POST /api/users/:sam/groups/remove
router.post('/:sam/groups/remove', async (req, res) => {
  const { sam } = req.params;
  const { groupName } = req.body;
  const actor = req.session.user.sam;
  if (!validateSam(sam)) return res.status(400).json({ error: 'Vigane kasutajanimi.' });
  if (!groupName || typeof groupName !== 'string') return res.status(400).json({ error: 'Grupinimi puudub.' });

  try {
    if (lc.MOCK_AD) {
      const u = lc.MOCK_USERS.find(x => x.sam === sam);
      if (!u) return res.status(404).json({ error: 'Kasutajat ei leitud.' });
      u.groups = u.groups.filter(g => g !== groupName);
      audit.logEvent(actor, 'GROUP_REMOVE', sam, 'success', groupName);
      return res.json({ ok: true });
    }

    const [uRes, gRes] = await Promise.all([
      lc.searchUsers(`(&(objectClass=user)(sAMAccountName=${lc.escapeLdap(sam)}))`, ['distinguishedName']),
      lc.searchGroups(`(&(objectClass=group)(cn=${lc.escapeLdap(groupName)}))`, ['distinguishedName']),
    ]);
    if (!uRes.length) return res.status(404).json({ error: 'Kasutajat ei leitud.' });
    if (!gRes.length) return res.status(404).json({ error: 'Gruppi ei leitud.' });

    const groupDN2 = getDN(gRes);
    const userDN3  = getDN(uRes);
    const client = lc.createClient();
    await bind(client);
    await ldapModify(client, groupDN2, ldapChanges([
      { op: 'delete', type: 'member', val: userDN3 }
    ]));
    client.unbind();
    audit.logEvent(actor, 'GROUP_REMOVE', sam, 'success', groupName);
    res.json({ ok: true });
  } catch (err) {
    audit.logEvent(actor, 'GROUP_REMOVE', sam, 'failure', err.message);
    res.status(500).json({ error: 'Grupist eemaldamine ebaõnnestus.' });
  }
});

// ─── LDAP helpers ────────────────────────────────────────────────────────────

function bind(client) {
  return new Promise((ok, fail) => {
    client.bind(lc.BIND_USER, lc.BIND_PASS, e => {
      if (e) { client.destroy(); fail(e); } else ok();
    });
  });
}

// Build ldapjs v3 Change objects from a list of {op, type, val} descriptors.
// ldapjs v3 requires modification.values to be an array.
function ldapChanges(specs) {
  const ldapjs = require('ldapjs');
  const out = [];
  for (const s of specs) {
    if (!s || s.val === undefined) continue;
    const vals = s.val === null || s.val === '' ? [] : [String(s.val)];
    out.push(new ldapjs.Change({
      operation: s.op || 'replace',
      modification: { type: s.type, values: vals },
    }));
  }
  return out;
}

function ldapModify(client, dn, changes) {
  return new Promise((ok, fail) => {
    client.modify(dn, changes, e => {
      if (e) { console.error('[LDAP] modify:', e.message); fail(e); } else ok();
    });
  });
}

function getDN(results) {
  const r = results && results[0];
  return r ? (r.distinguishedName || r.distinguishedname || '') : '';
}

async function setUAC(sam, disable) {
  const r = await lc.searchUsers(
    `(&(objectClass=user)(sAMAccountName=${lc.escapeLdap(sam)}))`,
    ['distinguishedName', 'userAccountControl']
  );
  if (!r.length) throw new Error('User not found');
  const dn  = getDN(r);
  let uac = parseInt(r[0].userAccountControl || r[0].useraccountcontrol) || 512;
  uac = disable ? (uac | 0x0002) : (uac & ~0x0002);
  const client = lc.createClient();
  await bind(client);
  await ldapModify(client, dn, ldapChanges([
    { op: 'replace', type: 'userAccountControl', val: String(uac) }
  ]));
  client.unbind();
}

// ─── SMS helper ──────────────────────────────────────────────────────────────

async function trySendSms(username, password, phone, displayName) {
  const settingsFile = path.join(__dirname, '..', 'config', 'settings.json');
  let settings = {};
  try {
    if (fs.existsSync(settingsFile)) settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  } catch { /* kasuta vaikimisi */ }

  const sms = settings.sms || {};
  if (!sms.enabled) return { ok: false, reason: 'SMS pole seadistatud' };

  const smsTpl = settings.templates?.sms?.newAccount;
  if (smsTpl && smsTpl.enabled === false) return { ok: false, reason: 'SMS mall on keelatud' };

  const tplBody = smsTpl?.body ||
    'Teie uus AD konto:\nKasutajanimi: {{username}}\nAjutine parool: {{password}}\nPalun vahetage parool esimesel sisselogimisel.';

  const msg = tplBody
    .replace(/\{\{username\}\}/g,    username)
    .replace(/\{\{password\}\}/g,    password)
    .replace(/\{\{displayName\}\}/g, displayName || username)
    .replace(/\{\{department\}\}/g,  '');

  const provider = sms.provider || 'twilio';

  if (provider === 'twilio') {
    try {
      // eslint-disable-next-line import/no-extraneous-dependencies
      const twilio = require('twilio');
      const client = twilio(sms.apiKey, sms.apiSecret);
      await client.messages.create({ body: msg, from: sms.from, to: phone });
      return { ok: true };
    } catch (e) {
      const notInstalled = e.code === 'MODULE_NOT_FOUND' || e.message?.includes('Cannot find module');
      return { ok: false, reason: notInstalled ? 'Twilio pole installitud (npm install twilio)' : e.message };
    }
  }

  return { ok: false, reason: `SMS pakkuja '${provider}' pole toetatud` };
}

module.exports = router;
