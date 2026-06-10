'use strict';
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const authRouter     = require('./routes/auth');
const usersRouter    = require('./routes/users');
const groupsRouter   = require('./routes/groups');
const settingsRouter = require('./routes/settings');
const requestsRouter = require('./routes/requests');
const { requireAuth } = require('./middleware/auth');
const audit = require('./lib/audit');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';
// Cookie Secure flag requires HTTPS — set HTTPS=true only when running behind TLS
const useSecureCookie = process.env.HTTPS === 'true';

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.warn('[SECURITY] SESSION_SECRET is missing or too short. Use a random 64-char string in production.');
}

// Security headers — CSP is disabled in development to avoid blocking HTTP access
app.use(helmet({
  contentSecurityPolicy: isProd ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: null,
    },
  } : false,
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  strictTransportSecurity: false,
}));

// Rate limiting
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Liiga palju sisselogimiskatseid. Proovige 15 minuti pärast uuesti.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// Body parsing (limit size to mitigate DoS)
app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: false, limit: '512kb' }));

// Session
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
app.use(session({
  secret: sessionSecret,
  name: 'sid',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: useSecureCookie,
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
  },
}));

// CSRF protection: generate token on first session, validate on mutating requests
app.use((req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (unsafe && req.path.startsWith('/api/') && req.path !== '/api/auth/login') {
    const clientToken = req.headers['x-csrf-token'] || '';
    let valid = false;
    try {
      const a = Buffer.from(clientToken);
      const b = Buffer.from(req.session.csrfToken);
      valid = a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch { valid = false; }
    if (!valid) {
      return res.status(403).json({ error: 'CSRF token on vale. Laadige leht uuesti.' });
    }
  }
  // Always echo the current session CSRF token so the client stays in sync
  // (critical after server restarts that wipe the in-memory session store)
  res.setHeader('X-CSRF-Token', req.session.csrfToken);
  next();
});

// Public config endpoint — non-sensitive info for the frontend
app.get('/api/config', (req, res) => {
  const baseDomain = (process.env.LDAP_BASE_DN || 'DC=varik,DC=local')
    .replace(/DC=/gi, '').replace(/,/g, '.');
  const primaryDomain = process.env.LDAP_UPN_SUFFIX || baseDomain;
  const extra = process.env.LDAP_EXTRA_DOMAINS
    ? process.env.LDAP_EXTRA_DOMAINS.split(',').map(d => d.trim()).filter(Boolean)
    : [];
  const domains = [primaryDomain, ...extra.filter(d => d !== primaryDomain)];
  res.json({ domains });
});

// OU tree builder — recursive, creates intermediate nodes on-the-fly
function buildOuTree(ouDNs, baseDN) {
  const root = { dn: baseDN, name: baseDN.replace(/DC=/gi,'').replace(/,/g,'.'), children: [] };
  const map  = { [baseDN.toLowerCase()]: root };

  function ensureNode(dn) {
    const key = dn.toLowerCase();
    if (map[key]) return map[key];
    const parts  = dn.split(',');
    const name   = (parts[0].split('=')[1] || parts[0]).trim();
    const parent = ensureNode(parts.slice(1).join(','));
    const node   = { dn, name, children: [] };
    parent.children.push(node);
    map[key] = node;
    return node;
  }

  for (const dn of ouDNs) {
    if (dn.toLowerCase() !== baseDN.toLowerCase()) ensureNode(dn);
  }
  return root;
}

// GET /api/ous — AD OU hierarhia (mock: staatilised andmed; real: LDAP search)
app.get('/api/ous', requireAuth, async (req, res) => {
  const lc = require('./config/ldap');
  try {
    if (lc.MOCK_AD) {
      return res.json({ tree: buildOuTree(lc.OUS, lc.BASE_DN) });
    }
    const results = await lc.search(
      lc.BASE_DN,
      '(objectClass=organizationalUnit)',
      ['distinguishedName']
    );
    const dns = results
      .map(r => r.distinguishedName || r.distinguishedname)
      .filter(Boolean);
    res.json({ tree: buildOuTree(dns, lc.BASE_DN) });
  } catch (err) {
    console.error('[ous]', err.message);
    res.status(500).json({ error: 'OU struktuuri laadimine ebaõnnestus.' });
  }
});

// Static files (no directory listing)
app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  etag: true,
  lastModified: true,
}));

// Apply rate limiters
app.use('/api/auth/login', loginLimiter);
app.use('/api/', apiLimiter);

// Public branding endpoints — no auth, needed for login page theming
const SETTINGS_FILE_PATH = path.join(__dirname, 'config', 'settings.json');
const LOGO_FILE_PATH     = path.join(__dirname, 'config', 'logo.dat');

app.get('/api/settings/appearance', (req, res) => {
  try {
    const s = JSON.parse(fs.readFileSync(SETTINGS_FILE_PATH, 'utf8'));
    res.json({ appearance: s.appearance || {} });
  } catch {
    res.json({ appearance: {} });
  }
});

app.get('/api/settings/logo', (req, res) => {
  try {
    const s = JSON.parse(fs.readFileSync(SETTINGS_FILE_PATH, 'utf8'));
    if (!s.appearance?.logoEnabled || !fs.existsSync(LOGO_FILE_PATH)) return res.status(404).end();
    res.setHeader('Content-Type', s.appearance.logoMime || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(fs.readFileSync(LOGO_FILE_PATH));
  } catch { res.status(404).end(); }
});

// Routes
app.use('/api/auth',     authRouter);
app.use('/api/users',    requireAuth, usersRouter);
app.use('/api/groups',   requireAuth, groupsRouter);
app.use('/api/settings', requireAuth, settingsRouter);
app.use('/api/requests', requireAuth, requestsRouter);

// Audit log endpoint
app.get('/api/audit', requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '200', 10), 500);
  res.json({ entries: audit.getLog(limit) });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler (never leak stack traces in prod)
app.use((err, req, res, _next) => {
  console.error('[ERROR]', req.method, req.path, err.message);
  if (res.headersSent) return;
  const status = err.status || 500;
  res.status(status).json({ error: isProd ? 'Serveriviga. Proovige uuesti.' : err.message });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`AD Kasutajahaldus käivitub: http://localhost:${PORT}`);
  console.log(`Keskkond: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Mock AD: ${process.env.MOCK_AD === 'true' ? 'SEES' : 'VÄLJAS'}`);
});

module.exports = app;
