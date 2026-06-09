'use strict';
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const crypto = require('crypto');

const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const groupsRouter = require('./routes/groups');
const settingsRouter = require('./routes/settings');
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

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
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
    const clientToken = req.headers['x-csrf-token'];
    if (!clientToken || !crypto.timingSafeEqual(
      Buffer.from(clientToken),
      Buffer.from(req.session.csrfToken)
    )) {
      return res.status(403).json({ error: 'CSRF token on vale. Laadige leht uuesti.' });
    }
  }
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

// Static files (no directory listing)
app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  etag: true,
  lastModified: true,
}));

// Apply rate limiters
app.use('/api/auth/login', loginLimiter);
app.use('/api/', apiLimiter);

// Routes
app.use('/api/auth', authRouter);
app.use('/api/users', requireAuth, usersRouter);
app.use('/api/groups', requireAuth, groupsRouter);
app.use('/api/settings', requireAuth, settingsRouter);

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
