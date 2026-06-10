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

const LOGO_FILE = path.join(__dirname, '..', 'config', 'logo.dat');

const DEFAULTS = {
  roles: {
    hrGroup:    'AD-HR',
    adminGroup: '',
  },
  appearance: {
    systemName:  'AD Kasutajahaldus',
    orgName:     'Viljandi Haigla',
    accentColor: '#b02a37',
    navyColor:   '#5e1d27',
    navyColor2:  '#4a141d',
    navyColor3:  '#74303c',
    logoEnabled: false,
    logoMime:    null,
    logoVersion: 0,
  },
  ui: {
    usernamePrefix: '1',
    showManager: true,
  },
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
    email: {
      welcome: {
        enabled: true,
        subject: 'Teie Active Directory konto on loodud',
        body: 'Lugupeetud {{displayName}},\n\nTeie uus konto on loodud.\n\nKasutajanimi: {{username}}\nOsakond: {{department}}\n\nSisselogimise parool on edastatud teile eraldi SMS-iga.\n\nParimate soovidega,\nIT-osakond',
      },
      passwordReset: {
        enabled: true,
        subject: 'Teie parool on lähtestatud',
        body: 'Lugupeetud {{displayName}},\n\nTeie konto parool on lähtestatud.\n\nUus parool on edastatud teile eraldi SMS-iga.\n\nParimate soovidega,\nIT-osakond',
      },
      accountDisabled: {
        enabled: true,
        subject: 'Teie konto on keelatud',
        body: 'Lugupeetud {{displayName}},\n\nTeie Active Directory konto on keelatud.\n\nVõtke ühendust IT-osakonnaga, kui teil on küsimusi.\n\nParimate soovidega,\nIT-osakond',
      },
      accountEnabled: {
        enabled: true,
        subject: 'Teie konto on taas lubatud',
        body: 'Lugupeetud {{displayName}},\n\nTeie Active Directory konto on taas lubatud. Saate nüüd uuesti sisse logida.\n\nParimate soovidega,\nIT-osakond',
      },
    },
    sms: {
      newAccount: {
        enabled: true,
        body: 'Tere {{displayName}}!\n\nTeie uus AD konto on loodud.\nKasutajanimi: {{username}}\nAjutine parool: {{password}}\n\nPalun vahetage parool esimesel sisselogimisel.',
      },
      passwordReset: {
        enabled: true,
        body: 'Tere {{displayName}}!\n\nTeie AD konto parool on lähtestatud.\nKasutajanimi: {{username}}\nUus ajutine parool: {{password}}\n\nPalun vahetage parool esimesel sisselogimisel.',
      },
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

const VALID_SECTIONS = ['appearance','ui','ldap','email','sms','templates','roles'];

// PUT /api/settings
router.put('/', requireAdmin, (req, res) => {
  const { section, data } = req.body;
  const actor = req.session.user.sam;

  if (!section || !VALID_SECTIONS.includes(section) || !data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Vigased seaded.' });
  }

  try {
    const settings = load();

    if (section === 'appearance') {
      settings.appearance = { ...(settings.appearance || {}), ...data };
    } else if (section === 'ui') {
      settings.ui = { ...settings.ui, ...data };
    } else if (section === 'ldap') {
      settings.ldap = { ...settings.ldap, ...data };
      if (data.bindPass === MASK) settings.ldap.bindPass = load().ldap?.bindPass || '';
    } else if (section === 'email') {
      settings.email = { ...settings.email, ...data };
      if (data.pass === MASK) settings.email.pass = load().email?.pass || '';
    } else if (section === 'sms') {
      settings.sms = { ...settings.sms, ...data };
      if (data.apiKey === MASK)    settings.sms.apiKey    = load().sms?.apiKey    || '';
      if (data.apiSecret === MASK) settings.sms.apiSecret = load().sms?.apiSecret || '';
    } else if (section === 'roles') {
      settings.roles = { ...(settings.roles || {}), ...data };
    } else if (section === 'templates') {
      settings.templates = { ...(settings.templates || {}) };
      ['email', 'sms'].forEach(chan => {
        if (!data[chan] || typeof data[chan] !== 'object') return;
        settings.templates[chan] = { ...(settings.templates[chan] || {}) };
        Object.keys(data[chan]).forEach(k => {
          settings.templates[chan][k] = { ...(settings.templates[chan][k] || {}), ...data[chan][k] };
        });
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

// GET /api/settings/logo — serve logo (public, no auth needed)
router.get('/logo', (req, res) => {
  const settings = load();
  if (!settings.appearance?.logoEnabled || !fs.existsSync(LOGO_FILE)) {
    return res.status(404).end();
  }
  const ct = settings.appearance.logoMime || 'image/png';
  res.setHeader('Content-Type', ct);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(fs.readFileSync(LOGO_FILE));
});

// POST /api/settings/logo — upload logo as JSON { dataUrl: 'data:image/...;base64,...' }
router.post('/logo', requireAdmin, (req, res) => {
  const { dataUrl } = req.body || {};
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Vigane pilt.' });
  }
  const match = dataUrl.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/s);
  if (!match) return res.status(400).json({ error: 'Vigane pilt.' });
  const mime = match[1];
  const buf  = Buffer.from(match[2], 'base64');
  if (!buf.length) return res.status(400).json({ error: 'Vigane pilt.' });
  const actor = req.session.user.sam;
  try {
    const dir = path.dirname(LOGO_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LOGO_FILE, buf);
    const settings = load();
    settings.appearance = {
      ...(settings.appearance || {}),
      logoEnabled: true,
      logoMime:    mime,
      logoVersion: Date.now(),
    };
    save(settings);
    audit.logEvent(actor, 'UPDATE_SETTINGS', 'logo-upload', 'success');
    res.json({ ok: true, settings: mask(settings) });
  } catch (err) {
    console.error('[settings] logo upload:', err.message);
    res.status(500).json({ error: 'Logo salvestamine ebaõnnestus.' });
  }
});

// DELETE /api/settings/logo — remove logo
router.delete('/logo', requireAdmin, (req, res) => {
  const actor = req.session.user.sam;
  try {
    if (fs.existsSync(LOGO_FILE)) fs.unlinkSync(LOGO_FILE);
    const settings = load();
    settings.appearance = { ...(settings.appearance || {}), logoEnabled: false, logoMime: null, logoVersion: 0 };
    save(settings);
    audit.logEvent(actor, 'UPDATE_SETTINGS', 'logo-remove', 'success');
    res.json({ ok: true, settings: mask(settings) });
  } catch (err) {
    res.status(500).json({ error: 'Logo eemaldamine ebaõnnestus.' });
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
