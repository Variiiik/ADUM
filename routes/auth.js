'use strict';

const express  = require('express');
const crypto   = require('crypto');
const fs       = require('fs');
const path     = require('path');
const router   = express.Router();
const lc       = require('../config/ldap');
const audit    = require('../lib/audit');

function getRolesConfig() {
  try {
    const file = path.join(__dirname, '..', 'config', 'settings.json');
    if (fs.existsSync(file)) {
      const s = JSON.parse(fs.readFileSync(file, 'utf8'));
      return s.roles || {};
    }
  } catch { /* fall through */ }
  return {};
}

const DEBUG = process.env.LDAP_DEBUG === 'true';

function dbg(...args) {
  if (DEBUG) console.log('[AUTH DEBUG]', ...args);
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password ||
      typeof username !== 'string' || typeof password !== 'string' ||
      username.length > 64 || password.length > 256) {
    return res.status(400).json({ error: 'Kasutajanimi ja parool on kohustuslikud.' });
  }

  const safeName = username.replace(/[\r\n]/g, '');

  // ── Local admin account (always available, independent of AD/Mock) ─────────
  const localUser = process.env.LOCAL_ADMIN_USER;
  const localPass = process.env.LOCAL_ADMIN_PASS;
  if (localUser && safeName === localUser) {
    if (!localPass || password !== localPass) {
      audit.logEvent(safeName, 'LOGIN', safeName, 'failure', 'Vale kohalik parool');
      return res.status(401).json({ error: 'Vale kasutajanimi või parool.' });
    }
    const user = { sam: safeName, displayName: 'Kohalik Admin', isAdmin: true, isLocal: true };
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Sessiooni viga.' });
      req.session.user = user;
      req.session.csrfToken = crypto.randomBytes(32).toString('hex');
      audit.logEvent(safeName, 'LOGIN', safeName, 'success', 'Local admin');
      res.json({ user, csrfToken: req.session.csrfToken });
    });
    return;
  }

  // ── Mock mode ──────────────────────────────────────────────────────────────
  if (lc.MOCK_AD) {
    const mockAdmin = process.env.MOCK_ADMIN_USER || 'admin';
    const mockPass  = process.env.MOCK_ADMIN_PASS || 'admin123';
    const isAdmin   = safeName === mockAdmin && password === mockPass;
    const mockUser  = lc.MOCK_USERS.find(u => u.sam === safeName);
    const isUser    = mockUser && password === 'Password1!';

    if (!isAdmin && !isUser) {
      audit.logEvent(safeName, 'LOGIN', safeName, 'failure', 'Vale parool (mock)');
      return res.status(401).json({ error: 'Vale kasutajanimi või parool.' });
    }

    // Determine role from group membership
    const roles   = getRolesConfig();
    const hrGroup = roles.hrGroup || process.env.LDAP_HR_GROUP || 'AD-HR';
    const userIsHR = isUser && mockUser.groups && mockUser.groups.includes(hrGroup);

    const user = isAdmin
      ? { sam: 'k.admin', displayName: 'Klaus Admin', isAdmin: true }
      : userIsHR
      ? { sam: mockUser.sam, displayName: mockUser.displayName, isHR: true }
      : { sam: mockUser.sam, displayName: mockUser.displayName };

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Sessiooni viga.' });
      req.session.user = user;
      req.session.csrfToken = crypto.randomBytes(32).toString('hex');
      audit.logEvent(user.sam, 'LOGIN', user.sam, 'success', 'Mock mode');
      res.json({ user, csrfToken: req.session.csrfToken });
    });
    return;
  }

  // ── Real LDAP ──────────────────────────────────────────────────────────────
  // Build bind DN: prefer explicit UPN suffix, otherwise derive from BASE_DN
  const upnSuffix = process.env.LDAP_UPN_SUFFIX ||
    lc.BASE_DN.replace(/DC=/gi, '').replace(/,/g, '.');
  const userDN = `${safeName}@${upnSuffix}`;

  dbg(`Attempting bind as: ${userDN}`);

  const client = lc.createClient();

  client.bind(userDN, password, (bindErr) => {
    client.destroy();

    if (bindErr) {
      console.error(`[AUTH] Bind failed for "${safeName}": ${bindErr.message}`);
      audit.logEvent(safeName, 'LOGIN', safeName, 'failure', bindErr.message);
      // Give a hint in debug mode, generic message in production
      const errMsg = DEBUG
        ? `Bind ebaõnnestus: ${bindErr.message}`
        : 'Vale kasutajanimi või parool.';
      return res.status(401).json({ error: errMsg });
    }

    dbg(`Bind OK for ${safeName}, querying memberOf...`);

    // Look up user info + memberOf using service account
    lc.searchUsers(
      `(&(objectClass=user)(objectCategory=person)(sAMAccountName=${lc.escapeLdap(safeName)}))`,
      ['displayName', 'department', 'memberOf']
    ).then(results => {
      const info       = results[0] || {};
      const roles      = getRolesConfig();
      const adminGroup = roles.adminGroup || process.env.LDAP_ADMIN_GROUP || '';
      const hrGroup    = roles.hrGroup    || process.env.LDAP_HR_GROUP    || '';

      const memberOf = info.memberOf
        ? (Array.isArray(info.memberOf) ? info.memberOf : [info.memberOf])
        : [];

      dbg(`memberOf (${memberOf.length}):`, memberOf);
      dbg(`Admin group: "${adminGroup}", HR group: "${hrGroup}"`);

      const inAdminGroup = adminGroup
        ? memberOf.some(dn => dn.toLowerCase().includes(`cn=${adminGroup.toLowerCase()},`))
        : false;
      const inHrGroup = hrGroup
        ? memberOf.some(dn => dn.toLowerCase().includes(`cn=${hrGroup.toLowerCase()},`))
        : false;

      // If neither group configured → allow as admin (legacy/open behavior)
      if (!adminGroup && !hrGroup) {
        // pass through — user gets isAdmin below
      } else if (!inAdminGroup && !inHrGroup) {
        const groupNames = [adminGroup, hrGroup].filter(Boolean).join('" või "');
        console.warn(`[AUTH] "${safeName}" not in any required group. memberOf: ${memberOf.join(' | ')}`);
        audit.logEvent(safeName, 'LOGIN', safeName, 'failure',
          `Pole grupis "${groupNames}"`);
        return res.status(403).json({
          error: `Ligipääs keelatud. Peate olema grupis "${groupNames}".`,
        });
      }

      const user = {
        sam:         safeName,
        displayName: info.displayName || safeName,
        isAdmin:     inAdminGroup || (!adminGroup && !hrGroup),
        isHR:        inHrGroup && !inAdminGroup,
      };
      req.session.regenerate((sErr) => {
        if (sErr) return res.status(500).json({ error: 'Sessiooni viga.' });
        req.session.user = user;
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
        audit.logEvent(safeName, 'LOGIN', safeName, 'success', adminGroup || '');
        res.json({ user, csrfToken: req.session.csrfToken });
      });

    }).catch((lookupErr) => {
      console.error(`[AUTH] User lookup failed for "${safeName}": ${lookupErr.message}`);
      audit.logEvent(safeName, 'LOGIN', safeName, 'failure',
        'Kasutaja info päring ebaõnnestus: ' + lookupErr.message);

      return res.status(503).json({
        error: DEBUG
          ? `Kasutaja info päring ebaõnnestus: ${lookupErr.message}`
          : 'Ligipääsu kontroll ebaõnnestus. Võtke ühendust administraatoriga.',
      });
    });
  });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const actor = req.session?.user?.sam || 'unknown';
  req.session.destroy(() => {
    audit.logEvent(actor, 'LOGOUT', actor, 'success');
    res.clearCookie('sid');
    res.json({ ok: true });
  });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Pole autentitud.' });
  }
  res.json({ user: req.session.user, csrfToken: req.session.csrfToken });
});

module.exports = router;
