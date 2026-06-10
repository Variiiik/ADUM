'use strict';

const express    = require('express');
const path       = require('path');
const fs         = require('fs');
const router     = express.Router();
const { requireAdmin } = require('../middleware/auth');
const requests   = require('../lib/requests');
const { createUser } = require('../lib/createUser');
const audit      = require('../lib/audit');

// GET /api/requests — admin: all; HR/user: own only
router.get('/', (req, res) => {
  const { isAdmin, sam } = req.session.user;
  const list = requests.load();
  res.json({ requests: isAdmin ? list : list.filter(r => r.submittedBy === sam) });
});

// GET /api/requests/count — pending count for nav badge
router.get('/count', requireAdmin, (req, res) => {
  const pending = requests.load().filter(r => r.status === 'pending').length;
  res.json({ pending });
});

// POST /api/requests — submit a new request
router.post('/', (req, res) => {
  const { givenName, sn, username } = req.body;
  if (!givenName?.trim() || !sn?.trim() || !username?.trim()) {
    return res.status(400).json({ error: 'Kohustuslikud väljad puuduvad.' });
  }
  const item = requests.add(req.session.user, req.body);
  audit.logEvent(req.session.user.sam, 'CREATE_REQUEST', username, 'success', req.body.department || '');
  res.status(201).json({ ok: true, request: item });
});

// POST /api/requests/:id/approve — admin approves → creates user
router.post('/:id/approve', requireAdmin, async (req, res) => {
  const actor = req.session.user.sam;
  const item  = requests.get(req.params.id);
  if (!item)                      return res.status(404).json({ error: 'Taotlus ei leitud.' });
  if (item.status !== 'pending')  return res.status(400).json({ error: 'Taotlus on juba menetletud.' });

  // Admin can override any field, especially password
  const data = { ...item.data, ...req.body };
  const { username, givenName, sn, password } = data;

  if (!givenName?.trim() || !sn?.trim() || !username?.trim()) {
    return res.status(400).json({ error: 'Kohustuslikud väljad puuduvad.' });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Parool peab olema vähemalt 8 tähemärki.' });
  }

  try {
    const result = await createUser(data);

    // SMS if requested and phone present
    let smsResult = null;
    if (data.sendSms && data.telephoneNumber) {
      smsResult = await trySendSms(username, password, data.telephoneNumber,
        `${givenName.trim()} ${sn.trim()}`);
      audit.logEvent(actor, 'SMS_SENT', username, smsResult.ok ? 'success' : 'warning',
        smsResult.reason || data.telephoneNumber);
    }

    requests.update(item.id, {
      status:     'approved',
      reviewedBy: actor,
      reviewedAt: new Date().toISOString(),
    });

    audit.logEvent(actor, 'APPROVE_REQUEST', username, 'success', data.department || '');
    res.json({ ok: true, user: result.user, sms: smsResult });
  } catch (err) {
    audit.logEvent(actor, 'APPROVE_REQUEST', username || '?', 'failure', err.message);
    res.status(err.status || 500).json({ error: err.message || 'Kinnitamine ebaõnnestus.' });
  }
});

// POST /api/requests/:id/reject — admin rejects
router.post('/:id/reject', requireAdmin, (req, res) => {
  const actor = req.session.user.sam;
  const item  = requests.get(req.params.id);
  if (!item)                     return res.status(404).json({ error: 'Taotlus ei leitud.' });
  if (item.status !== 'pending') return res.status(400).json({ error: 'Taotlus on juba menetletud.' });

  requests.update(item.id, {
    status:          'rejected',
    reviewedBy:      actor,
    reviewedAt:      new Date().toISOString(),
    rejectionReason: req.body.reason || '',
  });
  audit.logEvent(actor, 'REJECT_REQUEST', item.data?.username || '?', 'warning');
  res.json({ ok: true });
});

// DELETE /api/requests/:id — HR: own pending only; Admin: any pending
router.delete('/:id', (req, res) => {
  const { isAdmin, sam } = req.session.user;
  const item = requests.get(req.params.id);
  if (!item)  return res.status(404).json({ error: 'Taotlus ei leitud.' });
  if (!isAdmin && item.submittedBy !== sam) return res.status(403).json({ error: 'Juurdepääs keelatud.' });
  if (item.status !== 'pending') return res.status(400).json({ error: 'Ainult ootel taotlusi saab kustutada.' });
  requests.remove(item.id);
  audit.logEvent(sam, 'DELETE_REQUEST', item.data?.username || '?', 'success');
  res.json({ ok: true });
});

// ─── SMS helper (mirrors routes/users.js) ────────────────────────────────────
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
