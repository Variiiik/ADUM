'use strict';

const express = require('express');
const crypto  = require('crypto');
const { requireAdmin } = require('../middleware/auth');
const lc     = require('../config/ldap');
const audit  = require('../lib/audit');
const db     = require('../lib/db');
const adSync = require('../lib/adServiceSync');

const router = express.Router();

// ── Code validation ───────────────────────────────────────────────────────────
function validateCode(code) {
  return typeof code === 'string' && /^[A-Z0-9][A-Z0-9\-]{0,19}$/i.test(code);
}
function normalizeCode(code) { return String(code).toUpperCase().trim(); }

// ── DB row → service object ───────────────────────────────────────────────────
function _row(row) {
  if (!row) return null;
  const owners       = typeof row.owners        === 'string' ? JSON.parse(row.owners)        : (row.owners        || []);
  const rightsGroups = typeof row.rights_groups === 'string' ? JSON.parse(row.rights_groups) : (row.rights_groups || []);
  const members      = typeof row.members       === 'string' ? JSON.parse(row.members)       : (row.members       || []);
  const groupMembers = typeof row.group_members === 'string' ? JSON.parse(row.group_members) : (row.group_members || {});
  return {
    id:              row.id,
    code:            row.code || null,
    name:            row.name,
    description:     row.description || '',
    adLinked:        row.ad_linked !== undefined ? !!(row.ad_linked) : true,
    owners,
    technicalPerson: row.technical_person || null,
    members,
    rightsGroups,
    groupMembers,
    createdAt:  row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt:  row.updated_at instanceof Date ? row.updated_at.toISOString() : (row.updated_at || null),
  };
}

async function listServices() {
  const [rows] = await db.execute('SELECT * FROM services ORDER BY created_at ASC');
  return rows.map(_row);
}

async function getService(id) {
  const [rows] = await db.execute('SELECT * FROM services WHERE id = ?', [id]);
  return _row(rows[0] || null);
}

async function codeExists(code, excludeId) {
  if (!code) return false;
  const [rows] = excludeId
    ? await db.execute('SELECT id FROM services WHERE code = ? AND id != ?', [code, excludeId])
    : await db.execute('SELECT id FROM services WHERE code = ?', [code]);
  return rows.length > 0;
}

// ── LDAP/mock enrichment ──────────────────────────────────────────────────────

async function enrichServices(services) {
  if (!services.length) return [];

  if (lc.MOCK_AD) {
    const userMap  = Object.fromEntries(lc.MOCK_USERS.map(u => [u.sam, u]));
    const groupMap = Object.fromEntries(
      lc.MOCK_GROUPS.map(g => [g.name, {
        ...g,
        memberCount: lc.MOCK_USERS.filter(u => u.groups.includes(g.name)).length,
      }])
    );
    return services.map(svc => _enrich(svc, userMap, groupMap));
  }

  try {
    const [uRes, gRes] = await Promise.all([
      lc.searchUsers('(objectClass=user)', ['sAMAccountName','displayName','title','department']),
      lc.searchGroups('(objectClass=group)', ['cn','description','groupType','member']),
    ]);
    const userMap = {};
    uRes.forEach(u => {
      const sam = u.samaccountname || u.sAMAccountName;
      if (sam) userMap[sam] = { sam, displayName: u.displayname || u.displayName || sam, title: u.title || '', department: u.department || '' };
    });
    const groupMap = {};
    gRes.forEach(g => {
      const name = g.cn || g.CN;
      if (!name) return;
      const rawMember   = g.member ?? g.Member;
      const memberCount = rawMember ? (Array.isArray(rawMember) ? rawMember.length : 1) : 0;
      const gType = parseInt(g.groupType || g.grouptype || '0');
      groupMap[name] = { name, desc: g.description || '', type: (gType & 0x80000000) ? 'Turberühm' : 'Jaotusrühm', memberCount };
    });
    return services.map(svc => _enrich(svc, userMap, groupMap));
  } catch {
    return services.map(_enrichFallback);
  }
}

function _enrichUser(sam, userMap) {
  const u = userMap[sam];
  return u ? { sam: u.sam, displayName: u.displayName, title: u.title || '', department: u.department || '', avatarColor: u.avatarColor } : { sam, displayName: sam };
}

function _enrich(svc, userMap, groupMap) {
  const rightsGroupDetails = (svc.rightsGroups || []).map(gname => {
    if (!svc.adLinked) {
      const sams     = (svc.groupMembers || {})[gname] || [];
      const _members = sams.map(sam => _enrichUser(sam, userMap));
      return { name: gname, desc: '', type: 'Kohalik grupp', memberCount: sams.length, _members };
    }
    const g = groupMap[gname];
    return g
      ? { name: g.name, desc: g.desc || '', type: g.type || '', memberCount: g.memberCount || 0 }
      : { name: gname, desc: '', type: '', memberCount: 0 };
  });

  return {
    ...svc,
    ownerDetails:          (svc.owners   || []).map(sam => _enrichUser(sam, userMap)),
    memberDetails:         (svc.members  || []).map(sam => _enrichUser(sam, userMap)),
    technicalPersonDetail: svc.technicalPerson ? _enrichUser(svc.technicalPerson, userMap) : null,
    rightsGroupDetails,
  };
}

function _enrichFallback(svc) {
  const u = sam => ({ sam, displayName: sam });
  const rightsGroupDetails = (svc.rightsGroups || []).map(gname => {
    if (!svc.adLinked) {
      const sams = (svc.groupMembers || {})[gname] || [];
      return { name: gname, desc: '', type: 'Kohalik grupp', memberCount: sams.length, _members: sams.map(u) };
    }
    return { name: gname, desc: '', type: '', memberCount: 0 };
  });
  return {
    ...svc,
    ownerDetails:          (svc.owners   || []).map(u),
    memberDetails:         (svc.members  || []).map(u),
    technicalPersonDetail: svc.technicalPerson ? u(svc.technicalPerson) : null,
    rightsGroupDetails,
  };
}

// ── AD sync helper ────────────────────────────────────────────────────────────
async function _syncUsers(svc, sams) {
  const errors = [];
  await Promise.all(sams.map(sam =>
    adSync.syncUserRole(svc, sam).catch(err => errors.push(`${sam}: ${err.message}`))
  ));
  return errors;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/services/user/:sam — services where a user has any role
// (must be before /:id routes so "user" isn't matched as an id)
router.get('/user/:sam', async (req, res) => {
  try {
    const sam      = req.params.sam;
    const services = await listServices();
    const result   = services.flatMap(svc => {
      const roles = [];
      if ((svc.owners  || []).includes(sam))  roles.push('O');
      if (svc.technicalPerson === sam)        roles.push('T');
      if ((svc.members || []).includes(sam))  roles.push('L');

      const userGroups = [];
      if (!svc.adLinked && svc.groupMembers) {
        Object.entries(svc.groupMembers).forEach(([gname, mems]) => {
          if (mems.includes(sam)) userGroups.push(gname);
        });
      }

      if (!roles.length && !userGroups.length) return [];
      return [{ id: svc.id, code: svc.code, name: svc.name, description: svc.description, adLinked: svc.adLinked, userRoles: roles, userGroups }];
    });
    res.json({ services: result });
  } catch (err) {
    console.error('[services user]', err.message);
    res.status(500).json({ error: 'Teenuste laadimine ebaõnnestus.' });
  }
});

// GET /api/services
router.get('/', async (req, res) => {
  try {
    const services = await listServices();
    res.json({
      services:    await enrichServices(services),
      adAttribute: adSync.getAdAttribute(),
    });
  } catch (err) {
    console.error('[services] list:', err.message);
    res.status(500).json({ error: 'Teenuste laadimine ebaõnnestus.' });
  }
});

// POST /api/services — admin only
router.post('/', requireAdmin, async (req, res) => {
  const { name, description, code, adLinked } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Teenuse nimi on kohustuslik.' });
  if (!code || !validateCode(code))  return res.status(400).json({ error: 'Teenuse kood on kohustuslik (2-20 tähemärki, ainult tähed/numbrid/sidekriips).' });
  const normCode  = normalizeCode(code);
  if (await codeExists(normCode)) return res.status(409).json({ error: `Kood "${normCode}" on juba kasutusel.` });
  const isAdLinked = adLinked !== false && adLinked !== 0;

  const id  = crypto.randomUUID();
  const now = new Date();
  await db.execute(
    `INSERT INTO services (id, code, name, description, owners, technical_person, members, rights_groups, ad_linked, group_members, created_at)
     VALUES (?, ?, ?, ?, '[]', NULL, '[]', '[]', ?, '{}', ?)`,
    [id, normCode, String(name).trim(), String(description || '').trim(), isAdLinked ? 1 : 0, now]
  );
  const svc = await getService(id);
  audit.logEvent(req.session.user.sam, 'CREATE_SERVICE', svc.name, 'success', normCode);
  res.status(201).json({ service: _enrichFallback(svc) });
});

// PUT /api/services/:id — admin only
router.put('/:id', requireAdmin, async (req, res) => {
  const svc = await getService(req.params.id);
  if (!svc) return res.status(404).json({ error: 'Teenust ei leitud.' });

  const { name, description, code, adLinked, owners, technicalPerson, members, rightsGroups } = req.body;

  if (code !== undefined) {
    if (!validateCode(code)) return res.status(400).json({ error: 'Vigane teenuse kood.' });
    const normCode = normalizeCode(code);
    if (normCode !== svc.code && await codeExists(normCode, req.params.id)) {
      return res.status(409).json({ error: `Kood "${normCode}" on juba kasutusel.` });
    }
  }

  const sets = ['updated_at = ?'];
  const vals = [new Date()];

  if (name !== undefined)        { sets.push('name = ?');             vals.push(String(name).trim()); }
  if (description !== undefined) { sets.push('description = ?');      vals.push(String(description).trim()); }
  if (code !== undefined)        { sets.push('code = ?');             vals.push(normalizeCode(code)); }
  if (adLinked !== undefined)    { sets.push('ad_linked = ?');        vals.push(adLinked !== false && adLinked !== 0 ? 1 : 0); }
  if (owners !== undefined && Array.isArray(owners))         { sets.push('owners = ?');        vals.push(JSON.stringify(owners)); }
  if (technicalPerson !== undefined) { sets.push('technical_person = ?'); vals.push(technicalPerson || null); }
  if (members !== undefined && Array.isArray(members))       { sets.push('members = ?');       vals.push(JSON.stringify(members)); }
  if (rightsGroups !== undefined && Array.isArray(rightsGroups)) { sets.push('rights_groups = ?'); vals.push(JSON.stringify(rightsGroups)); }

  vals.push(req.params.id);
  await db.execute(`UPDATE services SET ${sets.join(', ')} WHERE id = ?`, vals);

  const updated = await getService(req.params.id);

  // AD sync for owners/members/tech changes
  const affected = new Set([
    ...(svc.owners || []),    ...(updated.owners || []),
    ...(svc.members || []),   ...(updated.members || []),
    ...[svc.technicalPerson, updated.technicalPerson].filter(Boolean),
  ]);
  const syncErrors = await _syncUsers(updated, [...affected]);

  audit.logEvent(req.session.user.sam, 'UPDATE_SERVICE', updated.name, 'success', updated.code);
  const [enriched] = await enrichServices([updated]);
  res.json({ service: enriched, ...(syncErrors.length ? { syncWarnings: syncErrors } : {}) });
});

// DELETE /api/services/:id — admin only
router.delete('/:id', requireAdmin, async (req, res) => {
  const svc = await getService(req.params.id);
  if (!svc) return res.status(404).json({ error: 'Teenust ei leitud.' });

  // Collect every user who has any role in this service
  const affected = new Set([
    ...(svc.owners || []),
    ...(svc.members || []),
    ...[svc.technicalPerson].filter(Boolean),
    ...Object.values(svc.groupMembers || {}).flat(),
  ]);

  await db.execute('DELETE FROM services WHERE id = ?', [req.params.id]);
  audit.logEvent(req.session.user.sam, 'DELETE_SERVICE', svc.name, 'success', svc.code);

  // Remove service entry from every affected user's AD attribute (fire-and-forget)
  if (svc.code) {
    affected.forEach(sam =>
      adSync.setServiceRole(sam, svc.code, null)
        .catch(err => console.error('[adSync] delete service clear:', sam, err.message))
    );
  }

  res.json({ ok: true });
});

// ── Non-AD group management ───────────────────────────────────────────────────

// POST /api/services/:id/groups — create a custom group (non-AD services only)
router.post('/:id/groups', requireAdmin, async (req, res) => {
  const svc = await getService(req.params.id);
  if (!svc) return res.status(404).json({ error: 'Teenust ei leitud.' });
  if (svc.adLinked) return res.status(400).json({ error: 'AD-teenuse grupid pärinevad Active Directory-st. Kasuta AD grupi lisamiseks teenuse muutmist.' });

  const gname = String(req.body.name || '').trim();
  if (!gname) return res.status(400).json({ error: 'Grupi nimi on kohustuslik.' });
  if ((svc.rightsGroups || []).includes(gname)) return res.status(409).json({ error: `Grupp "${gname}" on juba olemas.` });

  const newGroups      = [...(svc.rightsGroups  || []), gname];
  const newGroupMembers = { ...(svc.groupMembers || {}), [gname]: [] };

  await db.execute(
    'UPDATE services SET rights_groups = ?, group_members = ?, updated_at = ? WHERE id = ?',
    [JSON.stringify(newGroups), JSON.stringify(newGroupMembers), new Date(), req.params.id]
  );
  audit.logEvent(req.session.user.sam, 'UPDATE_SERVICE', `${svc.name} / lisa grupp ${gname}`, 'success', svc.code);
  const updated = await getService(req.params.id);
  const [enriched] = await enrichServices([updated]);
  res.status(201).json({ service: enriched });
});

// DELETE /api/services/:id/groups/:gname — delete a custom group
router.delete('/:id/groups/:gname', requireAdmin, async (req, res) => {
  const svc = await getService(req.params.id);
  if (!svc) return res.status(404).json({ error: 'Teenust ei leitud.' });
  if (svc.adLinked) return res.status(400).json({ error: 'AD-teenuse gruppe ei saa siit kustutada.' });

  const gname = decodeURIComponent(req.params.gname);
  const newGroups      = (svc.rightsGroups  || []).filter(g => g !== gname);
  const newGroupMembers = { ...(svc.groupMembers || {}) };
  delete newGroupMembers[gname];

  await db.execute(
    'UPDATE services SET rights_groups = ?, group_members = ?, updated_at = ? WHERE id = ?',
    [JSON.stringify(newGroups), JSON.stringify(newGroupMembers), new Date(), req.params.id]
  );
  audit.logEvent(req.session.user.sam, 'UPDATE_SERVICE', `${svc.name} / kustuta grupp ${gname}`, 'success', svc.code);
  const updated = await getService(req.params.id);

  // Re-sync all affected users: deleted group's former members may lose role;
  // remaining group members may shift index (2L → 1L etc.)
  const affectedSams = new Set([
    ...(svc.groupMembers?.[gname] || []),
    ...Object.values(updated.groupMembers || {}).flat(),
  ]);
  affectedSams.forEach(sam =>
    adSync.syncUserRole(updated, sam).catch(err => console.error('[adSync] group delete re-sync:', err.message))
  );

  const [enriched] = await enrichServices([updated]);
  res.json({ service: enriched });
});

// POST /api/services/:id/groups/:gname/members — add member to non-AD group
router.post('/:id/groups/:gname/members', requireAdmin, async (req, res) => {
  const svc = await getService(req.params.id);
  if (!svc) return res.status(404).json({ error: 'Teenust ei leitud.' });
  if (svc.adLinked) return res.status(400).json({ error: 'AD-teenuse puhul kasutage AD rühma haldust.' });

  const gname = decodeURIComponent(req.params.gname);
  const sam   = String(req.body.sam || '').trim();
  if (!sam) return res.status(400).json({ error: 'Kasutajatunnus on kohustuslik.' });
  if (!(svc.rightsGroups || []).includes(gname)) return res.status(404).json({ error: 'Gruppi ei leitud.' });

  const groupMembers = { ...(svc.groupMembers || {}) };
  const current = groupMembers[gname] || [];
  if (current.includes(sam)) return res.status(409).json({ error: 'Kasutaja on juba selle grupi liige.' });

  groupMembers[gname] = [...current, sam];
  await db.execute('UPDATE services SET group_members = ?, updated_at = ? WHERE id = ?',
    [JSON.stringify(groupMembers), new Date(), req.params.id]);

  audit.logEvent(req.session.user.sam, 'UPDATE_SERVICE', `${svc.name} / ${gname} +${sam}`, 'success', svc.code);
  const updated = await getService(req.params.id);
  // Sync AD attribute so non-AD group members are still tracked in extensionAttribute
  adSync.syncUserRole(updated, sam).catch(err => console.error('[adSync] group member add:', err.message));
  const [enriched] = await enrichServices([updated]);
  res.json({ service: enriched });
});

// DELETE /api/services/:id/groups/:gname/members/:sam — remove member from non-AD group
router.delete('/:id/groups/:gname/members/:sam', requireAdmin, async (req, res) => {
  const svc = await getService(req.params.id);
  if (!svc) return res.status(404).json({ error: 'Teenust ei leitud.' });
  if (svc.adLinked) return res.status(400).json({ error: 'AD-teenuse puhul kasutage AD rühma haldust.' });

  const gname = decodeURIComponent(req.params.gname);
  const sam   = decodeURIComponent(req.params.sam);

  const groupMembers = { ...(svc.groupMembers || {}) };
  groupMembers[gname] = (groupMembers[gname] || []).filter(s => s !== sam);

  await db.execute('UPDATE services SET group_members = ?, updated_at = ? WHERE id = ?',
    [JSON.stringify(groupMembers), new Date(), req.params.id]);

  audit.logEvent(req.session.user.sam, 'UPDATE_SERVICE', `${svc.name} / ${gname} -${sam}`, 'success', svc.code);
  const updated = await getService(req.params.id);
  // Re-sync AD attribute: if user is in no other group/role, attribute entry is removed
  adSync.syncUserRole(updated, sam).catch(err => console.error('[adSync] group member remove:', err.message));
  const [enriched] = await enrichServices([updated]);
  res.json({ service: enriched });
});

// GET /api/services/:id/groups/:groupName/members — members of a rights group
router.get('/:id/groups/:groupName/members', async (req, res) => {
  const svc = await getService(req.params.id);
  if (!svc) return res.status(404).json({ error: 'Teenust ei leitud.' });
  const groupName = decodeURIComponent(req.params.groupName);
  if (!(svc.rightsGroups || []).includes(groupName)) {
    return res.status(404).json({ error: 'Grupp ei kuulu teenuse juurde.' });
  }

  // Non-AD service: members stored in DB
  if (!svc.adLinked) {
    const sams = (svc.groupMembers || {})[groupName] || [];
    if (lc.MOCK_AD) {
      const members = sams.map(sam => {
        const u = lc.MOCK_USERS.find(x => x.sam === sam);
        return u ? { sam: u.sam, displayName: u.displayName, title: u.title || '', department: u.department || '', avatarColor: u.avatarColor } : { sam, displayName: sam };
      });
      return res.json({ members });
    }
    if (!sams.length) return res.json({ members: [] });
    try {
      const orClauses = sams.slice(0, 100).map(s => `(sAMAccountName=${lc.escapeLdap(s)})`).join('');
      const uResults  = await lc.searchUsers(
        `(&(objectClass=user)(|${orClauses}))`,
        ['sAMAccountName','displayName','title','department']
      );
      const found = {};
      uResults.forEach(u => {
        const s = u.samaccountname || u.sAMAccountName;
        if (s) found[s] = { sam: s, displayName: u.displayname || u.displayName || s, title: u.title || '', department: u.department || '' };
      });
      return res.json({ members: sams.map(s => found[s] || { sam: s, displayName: s }) });
    } catch (err) {
      return res.json({ members: sams.map(s => ({ sam: s, displayName: s })) });
    }
  }

  // AD service: lookup from AD
  try {
    if (lc.MOCK_AD) {
      const members = lc.MOCK_USERS
        .filter(u => u.groups.includes(groupName))
        .map(u => ({ sam: u.sam, displayName: u.displayName, title: u.title || '', department: u.department || '', avatarColor: u.avatarColor }));
      return res.json({ members });
    }

    const gResults = await lc.searchGroups(
      `(&(objectClass=group)(cn=${lc.escapeLdap(groupName)}))`,
      ['member']
    );
    if (!gResults.length) return res.json({ members: [] });
    const rawMember = gResults[0].member ?? gResults[0].Member;
    const memberDNs = rawMember ? (Array.isArray(rawMember) ? rawMember : [rawMember]) : [];
    if (!memberDNs.length) return res.json({ members: [] });

    const cap = memberDNs.slice(0, 100);
    const orClauses = cap.map(dn => `(distinguishedName=${lc.escapeLdap(dn)})`).join('');
    const uResults = await lc.searchUsers(
      `(&(objectClass=user)(|${orClauses}))`,
      ['sAMAccountName','displayName','title','department']
    );
    res.json({ members: uResults.map(u => ({
      sam:         u.samaccountname || u.sAMAccountName || '',
      displayName: u.displayname    || u.displayName    || '',
      title:       u.title          || '',
      department:  u.department     || '',
    })) });
  } catch (err) {
    console.error('[services group members]', err.message);
    res.status(500).json({ error: 'Liikmete laadimine ebaõnnestus.' });
  }
});

// GET /api/services/:id/user/:sam/attribute — raw AD attribute for debugging
router.get('/:id/user/:sam/attribute', requireAdmin, async (req, res) => {
  try {
    const raw = await adSync.getUserServiceAttribute(req.params.sam);
    res.json({ raw, roles: adSync.parseRoles(raw) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
