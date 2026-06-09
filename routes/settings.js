'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const router  = express.Router();
const { requireAdmin } = require('../middleware/auth');
const audit   = require('../lib/audit');
const lc      = require('../config/ldap');

const SETTINGS_FILE = path.join(__dirname, '..', 'config', 'settings.json');

const DEFAULTS = {
  ldap: {
    url:       process.env.LDAP_URL      || 'ldap://dc01.haigla.vmh.ee',
    port:      389,
    tls:       false,
    baseDN:    process.env.LDAP_BASE_DN  || 'DC=haigla,DC=vmh,DC=ee',
    bindDN:    process.env.LDAP_BIND_DN  || '',
    bindPass:  '',
    usersOU:   process.env.LDAP_USERS_OU || '',
    pageSize:  1000,
    timeout:   5000,
  },
  email: {
    enabled:  false,
    host:     '',
    port:     587,
    secure:   false,
    user:     '',
    pass:     '',
    from:     '',
    fromName: 'AD Kasutajahaldus',
  },
  sms: {
    enabled:   false,
    provider:  'twilio',
    apiKey:    '',
    apiSecret: '',
    from:      '',
  },
  templates: {
    welcome: {
      subject: 'Teie Active Directory konto on loodud',
      body: 'Lugupeetud {{displayName}},\n\nTeie konto on loodud.\n\nKasutajanimi: {{username}}\nAjutine parool: {{password}}\n\nPalun vahetage parool esimesel sisselogimisel.\n\nParimate soovidega,\nIT-osakond',
    },
    passwordReset: {
      subject: 'Teie parool on lähtestatud',
      body: 'Lugupeetud {{displayName}},\n\nTeie konto parool on lähtestatud.\n\nUus ajutine parool: {{password}}\n\nPalun vahetage parool esimesel sisselogimisel.\n\nParimate soovidega,\nIT-osakond',
    },
    accountDisabled: {
      subject: 'Teie konto on keelatud',
      body: 'Lugupeetud {{displayName}},\n\nTeie Active Directory konto on keelatud.\n\nVõtke ühendust IT-osakonnaga, kui teil on küsimusi.\n\nParimate soovidega,\nIT-osakond',
    },
    accountEnabled: {
      subject: 'Teie konto on taas lubatud',
      body: 'Lugupeetud {{displayName}},\n\nTeie Active Directory konto on taas lubatud. Saate nüüd uuesti sisse logida.\n\nParimate soovidega,\nIT-osakond',
    },
  },
};

function load() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    }
  } catch { /* fall through */ }
  return JSON.parse(JSON.stringify(DEFAULTS));
}

function save(settings) {
  const dir = path.dirname(SETTINGS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
}

const MASK = '••••••••';

function mask(settings) {
  const s = JSON.parse(JSON.stringify(settings));
  if (s.ldap?.bindPass)   s.ldap.bindPass   = MASK;
  if (s.email?.pass)      s.email.pass      = MASK;
  if (s.sms?.apiKey)      s.sms.apiKey      = MASK;
  if (s.sms?.apiSecret)   s.sms.apiSecret   = MASK;
  return s;
}

// GET /api/settings
router.get('/', (req, res) => {
  res.json({ settings: mask(load()) });
});

const VALID_SECTIONS = ['ldap','email','sms','templates'];

// PUT /api/settings
router.put('/', requireAdmin, (req, res) => {
  const { section, data } = req.body;
  const actor = req.session.user.sam;

  if (!section || !VALID_SECTIONS.includes(section) || !data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Vigased seaded.' });
  }

  try {
    const settings = load();

    if (section === 'ldap') {
      settings.ldap = { ...settings.ldap, ...data };
      if (data.bindPass === MASK) settings.ldap.bindPass = load().ldap?.bindPass || '';
    } else if (section === 'email') {
      settings.email = { ...settings.email, ...data };
      if (data.pass === MASK) settings.email.pass = load().email?.pass || '';
    } else if (section === 'sms') {
      settings.sms = { ...settings.sms, ...data };
      if (data.apiKey === MASK)    settings.sms.apiKey    = load().sms?.apiKey    || '';
      if (data.apiSecret === MASK) settings.sms.apiSecret = load().sms?.apiSecret || '';
    } else if (section === 'templates') {
      // Merge individual template objects
      settings.templates = { ...settings.templates };
      Object.keys(data).forEach(k => {
        if (settings.templates[k]) settings.templates[k] = { ...settings.templates[k], ...data[k] };
        else settings.templates[k] = data[k];
      });
    }

    save(settings);
    audit.logEvent(actor, 'UPDATE_SETTINGS', section, 'success');
    res.json({ ok: true, settings: mask(settings) });
  } catch (err) {
    console.error('[settings] save:', err.message);
    res.status(500).json({ error: 'Seadete salvestamine ebaõnnestus.' });
  }
});

// POST /api/settings/test-ldap
router.post('/test-ldap', requireAdmin, async (req, res) => {
  const actor = req.session.user.sam;
  try {
    if (lc.MOCK_AD) {
      audit.logEvent(actor, 'TEST_LDAP', 'mock', 'success');
      return res.json({ ok: true, message: 'Mock-režiimis ühendus simuleeritud edukalt.' });
    }
    const { bindDN, bindPass } = req.body;
    const settings = load();
    const dn   = bindDN   || settings.ldap?.bindDN  || lc.BIND_USER;
    const pass = bindPass && bindPass !== MASK ? bindPass : (settings.ldap?.bindPass || lc.BIND_PASS);
    const client = lc.createClient();
    await new Promise((ok, fail) => {
      client.bind(dn, pass, (err) => { client.destroy(); err ? fail(err) : ok(); });
    });
    audit.logEvent(actor, 'TEST_LDAP', dn, 'success');
    res.json({ ok: true, message: 'LDAP ühendus ja autentimine õnnestus.' });
  } catch (err) {
    audit.logEvent(actor, 'TEST_LDAP', '?', 'failure', err.message);
    res.status(500).json({ ok: false, message: 'LDAP ühendus ebaõnnestus: ' + err.message });
  }
});

// POST /api/settings/test-email
router.post('/test-email', requireAdmin, (req, res) => {
  const actor = req.session.user.sam;
  audit.logEvent(actor, 'TEST_EMAIL', 'smtp', 'warning', 'Nodemailer pole installitud');
  res.json({ ok: false, message: 'E-posti test: lisage nodemailer sõltuvuseks ja implementeerige SMTP.' });
});

module.exports = router;
