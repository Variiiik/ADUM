'use strict';

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Autentimine nõutav.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Autentimine nõutav.' });
  }
  if (!req.session.user.isAdmin) {
    return res.status(403).json({ error: 'Administraatori õigused nõutavad.' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
