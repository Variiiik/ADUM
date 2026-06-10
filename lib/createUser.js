'use strict';
const lc = require('../config/ldap');

const COLORS = ['#2563eb','#7c3aed','#db2777','#ea580c','#0891b2','#16a34a'];

// Creates a user in AD (mock or real LDAP).
// Returns { user } in mock mode, { ok: true } in real LDAP mode.
// Throws on error (attaches .status = 409 for duplicate username).
async function createUser(data) {
  const { username, givenName, sn, mail, password, department, title,
          manager, ou, enabled, telephoneNumber } = data;

  if (lc.MOCK_AD) {
    if (lc.MOCK_USERS.find(u => u.sam === username)) {
      const e = new Error('Kasutajanimi on juba kasutusel.');
      e.status = 409;
      throw e;
    }
    const nu = {
      sam: username,
      displayName: `${givenName.trim()} ${sn.trim()}`,
      givenName: givenName.trim(), sn: sn.trim(),
      userPrincipalName: `${username}@domeen.ee`,
      mail: mail || `${username}@domeen.ee`,
      department: department || '', title: title || '',
      manager: manager || null,
      telephoneNumber: telephoneNumber || '',
      employeeID: 'EMP' + (4100 + lc.MOCK_USERS.length),
      ou: ou || lc.USERS_OU, dn: `CN=${givenName.trim()} ${sn.trim()},${ou || lc.USERS_OU}`,
      userAccountControl: enabled === false ? 514 : 512,
      lockoutTime: 0, lastLogon: null,
      pwdLastSet: new Date().toISOString(), pwNeverExpires: false, mustChangePw: true,
      groups: ['Haigla-Kõik'],
      avatarColor: COLORS[lc.MOCK_USERS.length % COLORS.length],
      created: new Date().toLocaleDateString('et-EE'),
      status: enabled === false ? 'disabled' : 'active',
    };
    lc.MOCK_USERS.unshift(nu);
    return { user: nu };
  }

  // Real LDAP — 3-step: create disabled → set password → enable
  const ldapjs = require('ldapjs');
  const client = lc.createClient();

  await new Promise((ok, fail) => {
    client.bind(lc.BIND_USER, lc.BIND_PASS, e => {
      if (e) { client.destroy(); fail(new Error('LDAP bind: ' + e.message)); } else ok();
    });
  });

  const display  = `${givenName.trim()} ${sn.trim()}`;
  const targetOU = ou || lc.USERS_OU;
  const userDN   = `CN=${display},${targetOU}`;
  const domain   = lc.BASE_DN.replace(/DC=/gi, '').replace(/,/g, '.');

  const entry = {
    objectClass: ['top', 'person', 'organizationalPerson', 'user'],
    sAMAccountName: username,
    userPrincipalName: `${username}@${domain}`,
    cn: display, givenName: givenName.trim(), sn: sn.trim(),
    displayName: display, userAccountControl: '514',
  };
  if (mail)            entry.mail            = mail;
  if (department)      entry.department      = department;
  if (title)           entry.title           = title;
  if (manager)         entry.manager         = manager;
  if (telephoneNumber) entry.telephoneNumber = telephoneNumber;

  await new Promise((ok, fail) =>
    client.add(userDN, entry, e => e ? fail(Object.assign(e, { step: 'add' })) : ok())
  );

  const pwBuf = Buffer.from(`"${password}"`, 'utf16le');
  await new Promise((ok, fail) => {
    client.modify(userDN, [new ldapjs.Change({
      operation: 'replace',
      modification: { type: 'unicodePwd', values: [pwBuf] },
    })], e => e ? fail(e) : ok());
  });

  if (enabled !== false) {
    await new Promise((ok, fail) => {
      client.modify(userDN, [new ldapjs.Change({
        operation: 'replace',
        modification: { type: 'userAccountControl', values: ['512'] },
      })], e => e ? fail(e) : ok());
    });
  }

  client.unbind();
  return { ok: true };
}

module.exports = { createUser };
