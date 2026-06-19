'use strict';

const express    = require('express');
const path       = require('path');
const fs         = require('fs');
const router     = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const requests   = require('../lib/requests');
const { createUser } = require('../lib/createUser');
const audit      = require('../lib/audit');
const lc         = require('../config/ldap');

// GET /api/requests — admin: all; HR/user: own only
router.get('/', requireAuth, async (req, res) => {
  try {
    const { isAdmin, sam } = req.session.user;
    const list = await requests.load();
    res.json({ requests: isAdmin ? list : list.filter(r => r.submittedBy === sam) });
  } catch (err) {
    console.error('[requests] list:', err.message);
    res.status(500).json({ error: 'Taotluste laadimine ebaõnnestus.' });
  }
});

// GET /api/requests/count — pending count for nav badge
router.get('/count', requireAdmin, async (req, res) => {
  try {
    const list    = await requests.load();
    const pending = list.filter(r => r.status === 'pending').length;
    res.json({ pending });
  } catch {
    res.json({ pending: 0 });
  }
});

// POST /api/requests — submit a new request (type: create | modify | disable | delete)
router.post('/', requireAuth, async (req, res) => {
  const type = req.body.type || 'create';

  if (type === 'create') {
    const { givenName, sn, username } = req.body;
    if (!givenName?.trim() || !sn?.trim() || !username?.trim()) {
      return res.status(400).json({ error: 'Kohustuslikud väljad puuduvad.' });
    }
    try {
      const item = await requests.add(req.session.user, req.body);
      audit.logEvent(req.session.user.sam, 'CREATE_REQUEST', username, 'success', req.body.department || '');
      return res.status(201).json({ ok: true, request: item });
    } catch (err) {
      console.error('[requests] add:', err.message);
      return res.status(500).json({ error: 'Taotluse esitamine ebaõnnestus.' });
    }
  }

  if (type === 'modify' || type === 'disable' || type === 'delete') {
    const targetSam = String(req.body.targetSam || '').trim();
    if (!targetSam) return res.status(400).json({ error: 'Sihtkasutaja on kohustuslik.' });
    if (type === 'modify') {
      const changes = req.body.changes || {};
      if (!Object.keys(changes).length) return res.status(400).json({ error: 'Muutused on kohustuslikud.' });
    }
    try {
      const item = await requests.add(req.session.user, { ...req.body, type });
      audit.logEvent(req.session.user.sam, 'CREATE_REQUEST', targetSam, 'success', type);
      return res.status(201).json({ ok: true, request: item });
    } catch (err) {
      console.error('[requests] add:', err.message);
      return res.status(500).json({ error: 'Taotluse esitamine ebaõnnestus.' });
    }
  }

  return res.status(400).json({ error: `Tundmatu taotluse tüüp: ${type}` });
});

// POST /api/requests/:id/approve — admin approves
router.post('/:id/approve', requireAdmin, async (req, res) => {
  const actor = req.session.user.sam;
  const item  = await requests.get(req.params.id);
  if (!item)                     return res.status(404).json({ error: 'Taotlus ei leitud.' });
  if (item.status !== 'pending') return res.status(400).json({ error: 'Taotlus on juba menetletud.' });

  const type = item.data.type || 'create';

  // ── create ──────────────────────────────────────────────────────────────────
  if (type === 'create') {
    const data = { ...item.data, ...req.body };
    const { username, givenName, sn, password } = data;
    if (!givenName?.trim() || !sn?.trim() || !username?.trim())
      return res.status(400).json({ error: 'Kohustuslikud väljad puuduvad.' });
    if (!password || password.length < 8)
      return res.status(400).json({ error: 'Parool peab olema vähemalt 8 tähemärki.' });
    try {
      const result = await createUser(data);
      let smsResult = null;
      if (data.sendSms && data.telephoneNumber) {
        smsResult = await trySendSms(username, password, data.telephoneNumber,
          `${givenName.trim()} ${sn.trim()}`);
        audit.logEvent(actor, 'SMS_SENT', username, smsResult.ok ? 'success' : 'warning',
          smsResult.reason || data.telephoneNumber);
      }
      await requests.update(item.id, { status:'approved', reviewedBy:actor, reviewedAt:new Date().toISOString() });
      audit.logEvent(actor, 'APPROVE_REQUEST', username, 'success', data.department || '');
      return res.json({ ok:true, user:result.user, sms:smsResult });
    } catch (err) {
      audit.logEvent(actor, 'APPROVE_REQUEST', item.data.username||'?', 'failure', err.message);
      return res.status(err.status||500).json({ error: err.message||'Kinnitamine ebaõnnestus.' });
    }
  }

  // ── modify / disable / delete ────────────────────────────────────────────────
  const sam = item.data.targetSam;
  if (!sam) return res.status(400).json({ error: 'Sihtkasutaja puudub taotlusest.' });

  try {
    if (type === 'modify') {
      const changes = item.data.changes || {};
      await _applyUserModify(sam, changes);
      audit.logEvent(actor, 'MODIFY_USER', sam, 'success', Object.keys(changes).join(', '));
    } else if (type === 'disable') {
      await _applyUserDisable(sam);
      audit.logEvent(actor, 'DISABLE_USER', sam, 'success', 'taotlus kinnitatud');
    } else if (type === 'delete') {
      await _applyUserDelete(sam);
      audit.logEvent(actor, 'DELETE_USER', sam, 'success', 'taotlus kinnitatud');
    }
    await requests.update(item.id, { status:'approved', reviewedBy:actor, reviewedAt:new Date().toISOString() });
    audit.logEvent(actor, 'APPROVE_REQUEST', sam, 'success', type);
    return res.json({ ok:true });
  } catch (err) {
    audit.logEvent(actor, 'APPROVE_REQUEST', sam, 'failure', err.message);
    return res.status(500).json({ error: err.message || 'Kinnitamine ebaõnnestus.' });
  }
});

// POST /api/requests/:id/reject — admin rejects
router.post('/:id/reject', requireAdmin, async (req, res) => {
  const actor = req.session.user.sam;
  try {
    const item = await requests.get(req.params.id);
    if (!item)                     return res.status(404).json({ error: 'Taotlus ei leitud.' });
    if (item.status !== 'pending') return res.status(400).json({ error: 'Taotlus on juba menetletud.' });

    await requests.update(item.id, {
      status:          'rejected',
      reviewedBy:      actor,
      reviewedAt:      new Date().toISOString(),
      rejectionReason: req.body.reason || '',
    });
    audit.logEvent(actor, 'REJECT_REQUEST', item.data?.username || '?', 'warning');
    res.json({ ok: true });
  } catch (err) {
    console.error('[requests] reject:', err.message);
    res.status(500).json({ error: 'Tagasilükkamine ebaõnnestus.' });
  }
});

// DELETE /api/requests/:id — HR: own pending only; Admin: any pending
router.delete('/:id', requireAuth, async (req, res) => {
  const { isAdmin, sam } = req.session.user;
  try {
    const item = await requests.get(req.params.id);
    if (!item)  return res.status(404).json({ error: 'Taotlus ei leitud.' });
    if (!isAdmin && item.submittedBy !== sam) return res.status(403).json({ error: 'Juurdepääs keelatud.' });
    if (item.status !== 'pending') return res.status(400).json({ error: 'Ainult ootel taotlusi saab kustutada.' });
    await requests.remove(item.id);
    audit.logEvent(sam, 'DELETE_REQUEST', item.data?.username || '?', 'success');
    res.json({ ok: true });
  } catch (err) {
    console.error('[requests] delete:', err.message);
    res.status(500).json({ error: 'Kustutamine ebaõnnestus.' });
  }
});

// ─── User operation helpers (called from approve handler) ─────────────────────

async function _applyUserModify(sam, changes) {
  if (lc.MOCK_AD) {
    const u = lc.MOCK_USERS.find(x => x.sam === sam);
    if (!u) throw new Error('Kasutajat ei leitud: ' + sam);
    const { givenName, sn, mail, department, title } = changes;
    if (givenName !== undefined) u.givenName = givenName;
    if (sn !== undefined)        u.sn = sn;
    if (givenName !== undefined || sn !== undefined)
      u.displayName = ((changes.givenName||u.givenName)||'') + ' ' + ((changes.sn||u.sn)||'');
    if (mail !== undefined)       u.mail = mail;
    if (department !== undefined) u.department = department;
    if (title !== undefined)      u.title = title;
    return;
  }
  const ldapjs = require('ldapjs');
  const r = await lc.searchUsers(`(&(objectClass=user)(sAMAccountName=${lc.escapeLdap(sam)}))`, ['distinguishedName']);
  if (!r.length) throw new Error('Kasutajat ei leitud: ' + sam);
  const dn = r[0].distinguishedName || r[0].distinguishedname;
  const { givenName, sn, mail, department, title } = changes;
  const specs = [
    givenName  !== undefined ? { op:'replace', type:'givenName',  val:givenName  } : null,
    sn         !== undefined ? { op:'replace', type:'sn',         val:sn         } : null,
    mail       !== undefined ? { op:'replace', type:'mail',       val:mail       } : null,
    department !== undefined ? { op:'replace', type:'department', val:department } : null,
    title      !== undefined ? { op:'replace', type:'title',      val:title      } : null,
    givenName !== undefined || sn !== undefined
      ? { op:'replace', type:'displayName', val:`${(givenName||'').trim()} ${(sn||'').trim()}`.trim() }
      : null,
  ].filter(Boolean);
  if (!specs.length) return;
  const ldapChanges = specs.map(s => new ldapjs.Change({
    operation: s.op,
    modification: { type: s.type, values: s.val ? [s.val] : [] },
  }));
  const client = lc.createClient();
  await new Promise((ok, fail) => client.bind(lc.BIND_USER, lc.BIND_PASS, e => e ? (client.destroy(), fail(e)) : ok()));
  await new Promise((ok, fail) => client.modify(dn, ldapChanges, e => e ? fail(e) : ok()));
  client.unbind();
}

async function _applyUserDisable(sam) {
  if (lc.MOCK_AD) {
    const u = lc.MOCK_USERS.find(x => x.sam === sam);
    if (!u) throw new Error('Kasutajat ei leitud: ' + sam);
    u.userAccountControl = 514;
    return;
  }
  const ldapjs = require('ldapjs');
  const r = await lc.searchUsers(`(&(objectClass=user)(sAMAccountName=${lc.escapeLdap(sam)}))`, ['distinguishedName','userAccountControl']);
  if (!r.length) throw new Error('Kasutajat ei leitud: ' + sam);
  const dn  = r[0].distinguishedName || r[0].distinguishedname;
  const uac = (parseInt(r[0].userAccountControl || r[0].useraccountcontrol) || 512) | 0x0002;
  const client = lc.createClient();
  await new Promise((ok, fail) => client.bind(lc.BIND_USER, lc.BIND_PASS, e => e ? (client.destroy(), fail(e)) : ok()));
  const ch = new ldapjs.Change({ operation:'replace', modification:{ type:'userAccountControl', values:[String(uac)] } });
  await new Promise((ok, fail) => client.modify(dn, [ch], e => e ? fail(e) : ok()));
  client.unbind();
}

async function _applyUserDelete(sam) {
  if (lc.MOCK_AD) {
    const idx = lc.MOCK_USERS.findIndex(x => x.sam === sam);
    if (idx === -1) throw new Error('Kasutajat ei leitud: ' + sam);
    lc.MOCK_USERS.splice(idx, 1);
    return;
  }
  const r = await lc.searchUsers(`(&(objectClass=user)(sAMAccountName=${lc.escapeLdap(sam)}))`, ['distinguishedName']);
  if (!r.length) throw new Error('Kasutajat ei leitud: ' + sam);
  const dn = r[0].distinguishedName || r[0].distinguishedname;
  const client = lc.createClient();
  await new Promise((ok, fail) => client.bind(lc.BIND_USER, lc.BIND_PASS, e => e ? (client.destroy(), fail(e)) : ok()));
  await new Promise((ok, fail) => client.del(dn, e => e ? fail(e) : ok()));
  client.unbind();
}

// ─── SMS helper ───────────────────────────────────────────────────────────────
async function trySendSms(username, password, phone, displayName) {
  const settingsFile = path.join(__dirname, '..', 'config', 'settings.json');
  let settings = {};
  try {
    if (fs.existsSync(settingsFile)) settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  } catch { /* use defaults */ }

  const sms = settings.sms || {};
  if (!sms.enabled) return { ok: false, reason: 'SMS pole seadistatud' };

  const smsTpl = settings.templates?.sms?.newAccount;
  if (smsTpl?.enabled === false) return { ok: false, reason: 'SMS mall on keelatud' };

  const tplBody = smsTpl?.body ||
    'Teie uus AD konto:\nKasutajanimi: {{username}}\nAjutine parool: {{password}}\nPalun vahetage parool esimesel sisselogimisel.';

  const msg = tplBody
    .replace(/\{\{username\}\}/g, username)
    .replace(/\{\{password\}\}/g, password)
    .replace(/\{\{displayName\}\}/g, displayName || username)
    .replace(/\{\{department\}\}/g, '');

  if ((sms.provider || 'twilio') === 'twilio') {
    try {
      const twilio = require('twilio');
      const client = twilio(sms.apiKey, sms.apiSecret);
      await client.messages.create({ body: msg, from: sms.from, to: phone });
      return { ok: true };
    } catch (e) {
      const notInstalled = e.code === 'MODULE_NOT_FOUND' || e.message?.includes('Cannot find module');
      return { ok: false, reason: notInstalled ? 'Twilio pole installitud' : e.message };
    }
  }
  return { ok: false, reason: `SMS pakkuja '${sms.provider}' pole toetatud` };
}

module.exports = router;
