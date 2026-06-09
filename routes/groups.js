'use strict';

const express = require('express');
const router  = express.Router();
const lc      = require('../config/ldap');

// GET /api/groups
router.get('/', async (req, res) => {
  try {
    if (lc.MOCK_AD) {
      const groups = lc.MOCK_GROUPS.map(g => ({
        ...g,
        memberCount: lc.MOCK_USERS.filter(u => u.groups.includes(g.name)).length,
        members: lc.MOCK_USERS
          .filter(u => u.groups.includes(g.name))
          .map(u => ({ sam: u.sam, displayName: u.displayName, title: u.title, department: u.department })),
      }));
      return res.json({ groups });
    }

    const results = await lc.searchGroups(
      '(objectClass=group)',
      ['cn','description','groupType','member','distinguishedName']
    );
    function gstr(g, ...keys) {
      for (const k of keys) {
        const v = g[k] ?? g[k.toLowerCase()];
        if (v != null) return Array.isArray(v) ? (v[0] ?? '') : String(v);
      }
      return '';
    }
    const groups = results
      .filter(g => g && (g.cn || g.CN))
      .map(g => {
        const memberRaw = g.member ?? g.Member;
        return {
          name: gstr(g, 'cn', 'CN'),
          desc: gstr(g, 'description') || '',
          type: (parseInt(gstr(g, 'groupType')) & 0x80000000) ? 'Turberühm' : 'Jaotusrühm',
          dn:   gstr(g, 'distinguishedName'),
          memberCount: memberRaw ? (Array.isArray(memberRaw) ? memberRaw.length : 1) : 0,
          members: [],
        };
      });
    res.json({ groups });
  } catch (err) {
    console.error('[groups] list:', err.message);
    res.status(500).json({ error: 'Gruppide laadimine ebaõnnestus.' });
  }
});

module.exports = router;
