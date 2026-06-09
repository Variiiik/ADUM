'use strict';
require('dotenv').config();

const ldap = require('ldapjs');
const tls  = require('tls');

const LDAP_URL  = process.env.LDAP_URL      || 'ldap://localhost';
const BASE_DN   = process.env.LDAP_BASE_DN  || 'DC=haigla,DC=vmh,DC=ee';
const BIND_USER = process.env.LDAP_BIND_DN  || '';
const BIND_PASS = process.env.LDAP_BIND_PASS || '';
const USERS_OU  = process.env.LDAP_USERS_OU  || BASE_DN;
const GROUPS_OU = process.env.LDAP_GROUPS_OU || BASE_DN;
const MOCK_AD   = process.env.MOCK_AD === 'true';

// AD-s on tihti ise-allkirjastatud sertifikaat — LDAP_TLS_VERIFY=true ainult kui on usaldusväärne CA
const tlsVerify = process.env.LDAP_TLS_VERIFY === 'true';

function createClient() {
  const isLdaps = LDAP_URL.toLowerCase().startsWith('ldaps://');
  const client = ldap.createClient({
    url: LDAP_URL,
    reconnect: false,
    timeout: 10000,
    connectTimeout: 10000,
    tlsOptions: isLdaps ? { rejectUnauthorized: tlsVerify } : undefined,
  });
  // Prevent unhandled 'error' events from crashing the Node process
  client.on('error', (err) => {
    // ECONNRESET is normal — AD closes the TCP connection after operations complete
    if (err.code !== 'ECONNRESET') {
      console.error('[LDAP] Connection error:', err.message);
    }
  });
  return client;
}

// Escape special LDAP filter characters to prevent injection
function escapeLdap(str) {
  return String(str)
    .replace(/\\/g, '\\5c')
    .replace(/\*/g, '\\2a')
    .replace(/\(/g, '\\28')
    .replace(/\)/g, '\\29')
    .replace(/\0/g, '\\00')
    .replace(/\//g, '\\2f');
}

// Parse an ldapjs v3 SearchEntry into a plain attribute object.
// ldapjs v3 returns the raw LDAP protocol message: entry.object has the shape
//   { objectName: '<DN>', attributes: [{type:'sAMAccountName', values:['j.tamm']}, ...] }
// We flatten that into { sAMAccountName:'j.tamm', samaccountname:'j.tamm', ... }
function normaliseEntry(entry) {
  if (!entry) return null;

  // entry.object in ldapjs v3 is the raw SearchEntry protocol object
  const raw = entry.object || entry;
  if (!raw || typeof raw !== 'object') return null;

  const out = {};

  // Branch A: ldapjs v3 raw message format — attributes is an array of {type, values}
  if (Array.isArray(raw.attributes)) {
    // DN from objectName field
    const dn = raw.objectName || raw.objectname || '';
    if (dn) {
      out.distinguishedName = dn;
      out.distinguishedname = dn;
    }

    for (const attr of raw.attributes) {
      const name = attr.type || '';
      if (!name) continue;
      const vals = (attr.values || attr.vals || []).map(v =>
        Buffer.isBuffer(v) ? v.toString('utf8') : String(v)
      );
      const value = vals.length === 1 ? vals[0] : vals.length === 0 ? '' : vals;
      out[name] = value;
      const nl = name.toLowerCase();
      if (nl !== name) out[nl] = value;
    }
    return Object.keys(out).length > 1 ? out : null;
  }

  // Branch B: already-parsed flat object (older ldapjs / future compat)
  for (const [k, v] of Object.entries(raw)) {
    if (['messageId','protocolOp','controls','type'].includes(k)) continue;
    out[k] = v;
    const kl = k.toLowerCase();
    if (!(kl in out)) out[kl] = v;
  }
  return out;
}

function search(baseDN, filter, attributes) {
  return new Promise((resolve, reject) => {
    const client = createClient();
    // Increase max listeners to prevent EventEmitter warning when many
    // searches run concurrently (each adds close/end listeners)
    client.setMaxListeners(30);

    client.bind(BIND_USER, BIND_PASS, (err) => {
      if (err) { client.destroy(); return reject(new Error('LDAP bind ebaõnnestus: ' + err.message)); }
      const results = [];
      client.search(baseDN, {
        filter,
        scope: 'sub',
        attributes: attributes || ['*'],
        paged: { pageSize: 1000, pagePause: false },
      }, (searchErr, res) => {
        if (searchErr) { client.destroy(); return reject(searchErr); }
        res.on('searchEntry', (entry) => {
          const obj = normaliseEntry(entry);
          if (obj) results.push(obj);
        });
        res.on('error', (e) => { client.destroy(); reject(e); });
        res.on('end', () => {
          client.unbind();
          if (process.env.LDAP_DEBUG === 'true') {
            console.log(`[LDAP] search(${baseDN}) filter="${filter}" → ${results.length} kirjet`);
            if (results.length > 0) {
              const sample = results[0];
              console.log('[LDAP] Esimese kirje võtmed:', Object.keys(sample).filter(k => k === k.toLowerCase() || /^[a-z]/i.test(k[0])).slice(0, 12).join(', '));
            }
          }
          resolve(results);
        });
      });
    });
  });
}

const searchUsers  = (filter, attrs) => search(USERS_OU,  filter, attrs);
const searchGroups = (filter, attrs) => search(GROUPS_OU, filter, attrs);

// ─── Mock dataset ────────────────────────────────────────────────────────────

const DEPARTMENTS = [
  'Kardioloogia','Kiirabi','Radioloogia','IT-osakond','Kirurgia',
  'Pediaatria','Neuroloogia','Sünnitusosakond','Apteek',
  'Laboratoorium','Personaliosakond','Anestesioloogia','Onkoloogia',
];

const DEPT_TITLES = {
  'Kardioloogia':    ['Kardioloog','Vanemõde','Õde','Resident'],
  'Kiirabi':         ['Kiirabiarst','Parameedik','Erakorralise meditsiini õde','Brigaadijuht'],
  'Radioloogia':     ['Radioloog','Radioloogiatehnik','Vanemõde'],
  'IT-osakond':      ['Süsteemiadministraator','IT-tugispetsialist','Arendaja','IT-juht'],
  'Kirurgia':        ['Kirurg','Operatsiooniõde','Vanemõde','Resident'],
  'Pediaatria':      ['Lastearst','Lasteõde','Vanemõde'],
  'Neuroloogia':     ['Neuroloog','Õde','Resident'],
  'Sünnitusosakond': ['Günekoloog','Ämmaemand','Vanemõde'],
  'Apteek':          ['Proviisor','Farmatseut','Apteegijuht'],
  'Laboratoorium':   ['Laboriarst','Laborant','Bioanalüütik'],
  'Personaliosakond':['Personalijuht','Personalispetsialist','Värbamisspetsialist'],
  'Anestesioloogia': ['Anestesioloog','Anesteesiaõde','Resident'],
  'Onkoloogia':      ['Onkoloog','Õde','Vanemõde'],
};

const OUS = [
  'OU=Kasutajad,OU=Tallinn,DC=haigla,DC=vmh,DC=ee',
  'OU=Arstid,OU=Kliinikud,DC=haigla,DC=vmh,DC=ee',
  'OU=Õed,OU=Kliinikud,DC=haigla,DC=vmh,DC=ee',
  'OU=Tugipersonal,OU=Tallinn,DC=haigla,DC=vmh,DC=ee',
  'OU=Administratsioon,OU=Tallinn,DC=haigla,DC=vmh,DC=ee',
  'OU=Teenusekontod,DC=haigla,DC=vmh,DC=ee',
];

const ALL_GROUPS = [
  'Haigla-Kõik','VPN-Kasutajad','eTervis-Ligipääs','Pilt-PACS',
  'Apteek-Ravimid','Labor-LIS','IT-Administraatorid','Arstid-Kardio',
  'Valvegraafik','Printerid-Tallinn','Personaliportaal','Õppejõud',
];

const AVATAR_COLORS = [
  '#2563eb','#7c3aed','#db2777','#ea580c','#0891b2',
  '#16a34a','#9333ea','#0d9488','#dc2626','#ca8a04','#4f46e5','#0284c7',
];

const PEOPLE = [
  {f:'Mart',l:'Tamm'},{f:'Kadri',l:'Mägi'},{f:'Jaan',l:'Saar'},
  {f:'Kati',l:'Kask'},{f:'Liis',l:'Kukk'},{f:'Tõnu',l:'Rebane'},
  {f:'Margus',l:'Ilves'},{f:'Pille',l:'Pärn'},{f:'Rein',l:'Koppel'},
  {f:'Kristiina',l:'Lepik'},{f:'Aivar',l:'Sepp'},{f:'Maarja',l:'Vaher'},
  {f:'Toomas',l:'Põder'},{f:'Triin',l:'Laur'},{f:'Urmas',l:'Kallas'},
  {f:'Eva',l:'Aru'},{f:'Priit',l:'Raudsepp'},{f:'Helena',l:'Männik'},
  {f:'Marko',l:'Org'},{f:'Anneli',l:'Sild'},{f:'Siim',l:'Kuusk'},
  {f:'Karin',l:'Lokk'},{f:'Tarmo',l:'Tomson'},{f:'Liisa',l:'Vares'},
  {f:'Raimo',l:'Karu'},{f:'Kristel',l:'Lind'},{f:'Indrek',l:'Laane'},
  {f:'Piret',l:'Truu'},{f:'Madis',l:'Hunt'},{f:'Külli',l:'Soosaar'},
];

const transliterate = (s) => s.toLowerCase()
  .replace(/õ/g,'o').replace(/ä/g,'a').replace(/ö/g,'o')
  .replace(/ü/g,'u').replace(/š/g,'s').replace(/ž/g,'z');

// Deterministic PRNG so data is stable across restarts
let seed = 42;
const rnd  = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const pad  = (n) => String(n).padStart(2,'0');

const MOCK_USERS = (() => {
  const users = [];
  PEOPLE.forEach((p, i) => {
    const dept  = pick(DEPARTMENTS);
    const title = pick(DEPT_TITLES[dept] || ['Töötaja']);
    const uname = transliterate(p.f)[0] + '.' + transliterate(p.l);

    const roll  = rnd();
    const disabled = roll > 0.86;
    const locked   = !disabled && roll > 0.78;
    const uac      = disabled ? 514 : 512;
    const lockT    = locked ? Date.now() - 25 * 60 * 1000 : 0;

    const daysAgo  = disabled ? 30 + Math.floor(rnd() * 60) : Math.floor(rnd() * 14);
    const lastLogon = (daysAgo === 0 || locked)
      ? new Date().toISOString()
      : new Date(Date.now() - daysAgo * 86400000).toISOString();

    const ou = (title.match(/arst|loog$|Kirurg|Günekoloog/)) ? OUS[1]
      : (title.match(/õde|Õde|Ämmaemand/)) ? OUS[2]
      : dept === 'IT-osakond' ? OUS[3]
      : dept === 'Personaliosakond' ? OUS[4]
      : OUS[0];

    const groups = ['Haigla-Kõik'];
    for (let g = 0; g < 1 + Math.floor(rnd() * 3); g++) {
      const avail = ALL_GROUPS.filter(x => !groups.includes(x));
      if (avail.length) groups.push(pick(avail));
    }

    const createdDay  = `${pad(1 + Math.floor(rnd() * 27))}.${pad(1 + Math.floor(rnd() * 11))}.202${Math.floor(rnd() * 5)}`;
    const pwdLastSet  = new Date(Date.now() - Math.floor(rnd() * 60) * 86400000).toISOString();

    users.push({
      sam: uname,
      displayName: p.f + ' ' + p.l,
      givenName: p.f,
      sn: p.l,
      userPrincipalName: uname + '@haigla.vmh.ee',
      mail: uname + '@haigla.ee',
      department: dept,
      title,
      manager: null,
      telephoneNumber: '+372 5' + Math.floor(1000000 + rnd() * 8999999),
      employeeID: 'EMP' + (4000 + i),
      ou,
      dn: 'CN=' + p.f + ' ' + p.l + ',' + ou,
      userAccountControl: uac,
      lockoutTime: lockT,
      lastLogon,
      pwdLastSet,
      pwNeverExpires: rnd() > 0.82,
      mustChangePw: rnd() > 0.88,
      groups,
      avatarColor: AVATAR_COLORS[i % AVATAR_COLORS.length],
      created: createdDay,
    });
  });

  // Assign managers
  const mgrs = users.filter(u => /juht|Vanem|loog$|arst|Kirurg/.test(u.title) && u.userAccountControl === 512);
  users.forEach(u => {
    const m = pick(mgrs.length ? mgrs : users);
    if (m && m.sam !== u.sam) u.manager = m.displayName;
  });

  return users;
})();

const MOCK_GROUPS = [
  { name:'Haigla-Kõik',      desc:'Kõik töötajad',              type:'Turberühm'  },
  { name:'VPN-Kasutajad',    desc:'Kaugligipääs (VPN)',          type:'Turberühm'  },
  { name:'eTervis-Ligipääs', desc:'Tervise infosüsteem',         type:'Turberühm'  },
  { name:'Pilt-PACS',        desc:'Radioloogia pildiarhiiv',     type:'Turberühm'  },
  { name:'Apteek-Ravimid',   desc:'Ravimite haldus',             type:'Turberühm'  },
  { name:'Labor-LIS',        desc:'Laboriinfosüsteem',           type:'Turberühm'  },
  { name:'IT-Administraatorid',desc:'Domeeni administraatorid',  type:'Turberühm'  },
  { name:'Arstid-Kardio',    desc:'Kardioloogia arstid',         type:'Jaotusrühm' },
  { name:'Valvegraafik',     desc:'Valvegraafiku ligipääs',      type:'Turberühm'  },
  { name:'Printerid-Tallinn',desc:'Tallinna printerid',          type:'Turberühm'  },
  { name:'Personaliportaal', desc:'HR iseteenindus',             type:'Turberühm'  },
  { name:'Õppejõud',         desc:'Residentide juhendajad',      type:'Jaotusrühm' },
];

function computeStatus(uac, lockoutTime) {
  const n = parseInt(uac) || 512;
  if (n & 0x0002) return 'disabled';
  if (lockoutTime && parseInt(lockoutTime) > 0) return 'locked';
  return 'active';
}

module.exports = {
  LDAP_URL, BASE_DN, BIND_USER, BIND_PASS, USERS_OU, GROUPS_OU, MOCK_AD,
  createClient, searchUsers, searchGroups, escapeLdap, computeStatus,
  MOCK_USERS, MOCK_GROUPS, DEPARTMENTS, OUS, ALL_GROUPS,
};
