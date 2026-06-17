# ADUM — AD Kasutajahaldus

Active Directory kasutajate ja teenuste õiguste haldamise veebirakendus.  
Mõeldud haigla IT- ja personaliosakonnale — võimaldab hallata AD kontosid ilma `dsa.msc` avamata.

---

## Funktsioonid

### Kasutajate haldus
| Funktsioon | Kirjeldus |
|---|---|
| Loomine | Eesnimi, perekonnanimi, kasutajanimi, e-post, osakond, ametinimetus, juht, telefon, dokumendi NR / ringkäigu lehe NR, OU valik, meilisüsteemi valik |
| Muutmine | Kõik andmeväljad, grupikuuluvused |
| Kustutamine | Koos ringkäigu kontrollnimekirjaga — näitab kohalikud teenused ja nõuab linnukesi enne kustutamist |
| Otsimine | Nimi, kasutajanimi, e-post, osakond, olek |
| Konto toimingud | Luba/keela (koos kohalike teenuste kontrolliga), ava lukk, lähtesta parool |
| Parooligeneraator | Eesti sõnadest koosnev fraas (`SõnaSõnaSõna123#`), klassikaline juhuslik parool |
| Profiilipilt | Üleslaadimine ja kustutamine |
| SMS | Uue konto ja parooli vahetamise teavitused (Twilio) |

### Meilihaldus
| Funktsioon | Kirjeldus |
|---|---|
| Hübriid meilindus | Kasutaja kuuluvus AD gruppi määrab meilisüsteemi (Microsoft 365 või Postfix) |
| Meilisüsteemi badge | Kasutaja detailvaates näidatakse selgelt kumb süsteem on aktiivsed |
| E-posti aliased | Kasutajale saab lisada/eemaldada täiendavaid e-posti aadresse (andmebaasis) |
| Automaatne grupp | Uue kasutaja loomisel Outlook-valikuga lisatakse automaatselt outlookGroup gruppi |

### Kodukataloog (Homefolder)
| Funktsioon | Kirjeldus |
|---|---|
| Seadistatav | Draivitäht ja UNC tee `%username%` asendusega |
| Seadistus | Administraatori seadetes lubatav/keelatav |

### Teenuste õiguste haldus
| Funktsioon | Kirjeldus |
|---|---|
| Teenused | AD-ga lingitud (grupiliikmelisus) ja kohalikud (manuaalsed) teenused |
| Õiguste grupid | Iga teenuse all nummerdatud grupid koos globaalse indeksiga |
| Globaalne indekseerimine | Kõik grupid üle kõigi teenuste saavad unikaalse indeksi — kasulik AD `extensionAttribute1` väärtuste tõlgendamiseks |
| Indeksitabel | Eksporditav CSV/prinditav referentsstabel: indeks → teenus → grupp |
| AD atribuut | Koodformaadis rollid: `RAP:OT` (omanik + tehniline), `ERP:1L` (1. grupi liige) |
| Sünkroonimine | Lisa/eemalda liige → AD atribuut uuendatakse automaatselt |

### Taotluste töövoog (HR ↔ Admin)
| Tüüp | Kirjeldus |
|---|---|
| Uus konto | HR esitab, admin kinnitab ja loob konto |
| Muutmine | HR esitab muutmistaotluse, admin kinnitab ja rakendab |
| Keelamine | HR taotleb konto keelamist |
| Kustutamine | HR taotleb konto kustutamist |

### Rollid
| Roll | Ligipääs |
|---|---|
| **Admin** | Täielik ligipääs — kõik toimingud otse |
| **HR** | Kasutajad ja teenused lugemisõigusega, taotluste esitamine |
| **Kohalik admin** | AD-st sõltumatu varusisselogimine |

### Tehniline
- CSRF kaitse, rate limiting, Helmet CSP, LDAPS tugi
- Sessioonid MySQL-is (`express-mysql-session`) — ei leki mälu
- Auditilogi kõigi toimingute kohta
- Mock-režiim arenduseks ilma AD-ta

---

## Nõuded

- **Node.js** 22 või uuem
- **MySQL / MariaDB** 10.6 või uuem
- **Active Directory** (Windows Server 2016+) — või mock-režiim
- LDAPS (port 636) juurdepääs domeenikontrollerile
- Teenuskonto AD-s kirjutamisõigustega

---

## Kiirkäivitus (arendus)

```bash
git clone <repo>
cd ad-usermanager
npm install
cp .env.example .env
# Muuda .env — mock-režiimiks piisab MOCK_AD=true
npm run dev
```

Ava brauser: `http://localhost:3000`  
Mock-sisselogimine: `admin` / `admin123`

---

## Konfiguratsioon (.env)

Kopeeri `.env.example` → `.env` ja täida väljad. Kommentaarid on `.env.example`-s.

| Muutuja | Näide | Kirjeldus |
|---|---|---|
| `SESSION_SECRET` | *(48-baidi hex)* | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `DB_HOST` / `DB_USER` / `DB_PASS` | `localhost` / `adum` / `…` | MariaDB ühendus |
| `LDAP_URL` | `ldaps://dc01.haigla.ee:636` | LDAPS soovitatav |
| `LDAP_BIND_DN` | `CN=svc-admanager,OU=…` | Teenuskonto täis-DN |
| `LDAP_ADMIN_GROUP` | `ADUM-Admins` | AD grupp administraatoritele |
| `LDAP_HR_GROUP` | `ADUM-HR` | AD grupp HR kasutajatele |
| `HTTPS` | `true` | Sea `true` kui Nginx teeb SSL-i |
| `TRUST_PROXY` | `true` | Sea `true` pöördpuhverserveri taga |
| `MOCK_AD` | `false` | `true` = mock-andmed arenduseks |

---

## Tootmispaigaldus

Vt **[DEPLOY.md](DEPLOY.md)** — samm-sammuline juhend Debian 13 serverile:  
Node.js 22, MariaDB, PM2, Nginx pöördpuhverserver, Let's Encrypt SSL, tulemüür.

```bash
npm ci --omit=dev
pm2 start ecosystem.config.js --env production
```

---

## AD seadistus

### Teenuskonto loomine

```powershell
New-ADUser -Name "svc-admanager" `
  -SamAccountName "svc-admanager" `
  -UserPrincipalName "svc-admanager@haigla.ee" `
  -Path "OU=Service Accounts,DC=haigla,DC=ee" `
  -AccountPassword (ConvertTo-SecureString "TugEvParool123!" -AsPlainText -Force) `
  -PasswordNeverExpires $true -Enabled $true
```

### Vajalikud õigused

```powershell
$svc      = "CN=svc-admanager,OU=Service Accounts,DC=haigla,DC=ee"
$usersOU  = "OU=Kasutajad,DC=haigla,,DC=ee"
$groupsOU = "OU=Grupid,DC=haigla,,DC=ee"

dsacls $usersOU /G "${svc}:GR"                      # Lugemine
dsacls $usersOU /G "${svc}:CCDC;user"               # Loo/kustuta kasutajad
dsacls $usersOU /G "${svc}:WP"                      # Muuda atribuute
dsacls $usersOU /G "${svc}:CA;Reset Password;user"  # Lähtesta parool
dsacls $groupsOU /G "${svc}:WP;member;group"        # Muuda grupiliikmeid
```

### LDAPS aktiveerimine

```powershell
Install-WindowsFeature AD-Certificate -IncludeManagementTools
Restart-Computer
Test-NetConnection -ComputerName dc01.haigla.ee -Port 636
```

### Rakenduse AD grupid

```powershell
New-ADGroup -Name "ADUM-Admins" -GroupScope Global -GroupCategory Security `
  -Path "OU=Grupid,DC=haigla,DC=ee"
New-ADGroup -Name "ADUM-HR" -GroupScope Global -GroupCategory Security `
  -Path "OU=Grupid,DC=haigla,DC=ee"

Add-ADGroupMember -Identity "ADUM-Admins" -Members "mari.tamm"
Add-ADGroupMember -Identity "ADUM-HR"     -Members "jaan.kask"
```

---

## Arhitektuur

```
ad-usermanager/
├── server.js               # Express server, turvamiddleware, marsruutimine
├── ecosystem.config.js     # PM2 tootmiskonf
├── config/
│   ├── ldap.js             # LDAP klient, helperfunktsioonid, mock-andmed
│   └── settings.json       # Veebirakendusest muudetavad seaded
├── lib/
│   ├── db.js               # MySQL ühenduspool
│   ├── migrate.js          # Andmebaasi migratsioon (automaatne käivitusel)
│   ├── audit.js            # Auditilogi
│   ├── requests.js         # Taotluste salvestus
│   └── adServiceSync.js    # Teenuste AD atribuutide sünk
├── middleware/
│   └── auth.js             # requireAuth, requireAdmin, requireHROrAdmin
├── routes/
│   ├── auth.js             # /api/auth/*
│   ├── users.js            # /api/users/* (sh meilihaldus)
│   ├── groups.js           # /api/groups
│   ├── services.js         # /api/services/*
│   ├── requests.js         # /api/requests/*
│   └── settings.js         # /api/settings/*
└── public/
    ├── index.html
    ├── css/app.css
    └── js/
        ├── api.js          # Fetch-wrapper, CSRF tokenid
        ├── app.js          # Router, login, sidebar, toasts, parooligeneraatorid
        └── views/
            ├── dashboard.js
            ├── users.js
            ├── userDetail.js
            ├── services.js
            ├── requests.js
            ├── groups.js
            ├── auditLog.js
            └── settings.js
```

### API lühiülevaade

| Meetod | URL | Kirjeldus |
|---|---|---|
| POST | `/api/auth/login` | Sisselogimine |
| POST | `/api/auth/logout` | Väljalogimine |
| GET | `/api/users` | Kasutajate nimekiri (`?q=&dept=&status=`) |
| POST | `/api/users` | Loo kasutaja (admin) |
| PUT | `/api/users/:sam` | Muuda kasutajat |
| DELETE | `/api/users/:sam` | Kustuta kasutaja |
| POST | `/api/users/:sam/reset-password` | Lähtesta parool |
| POST | `/api/users/:sam/enable` | Luba konto |
| POST | `/api/users/:sam/disable` | Keela konto |
| POST | `/api/users/:sam/unlock` | Ava lukk |
| GET | `/api/users/:sam/mail` | Kasutaja meiliteave ja aliased |
| POST | `/api/users/:sam/mail/aliases` | Lisa e-posti alias |
| DELETE | `/api/users/:sam/mail/aliases/:alias` | Eemalda alias |
| GET | `/api/services` | Teenuste nimekiri |
| GET | `/api/services/user/:sam` | Kasutaja teenused ja rollid |
| GET | `/api/services/group-index-table` | Globaalne grupiindeksite tabel |
| POST | `/api/services` | Loo teenus |
| PUT | `/api/services/:id` | Muuda teenust |
| DELETE | `/api/services/:id` | Kustuta teenus |
| POST | `/api/services/:id/groups` | Lisa grupp kohalikule teenusele |
| DELETE | `/api/services/:id/groups/:gname` | Kustuta grupp |
| GET | `/api/requests` | Taotluste nimekiri |
| POST | `/api/requests` | Esita taotlus |
| POST | `/api/requests/:id/approve` | Kinnita (admin) |
| POST | `/api/requests/:id/reject` | Lükka tagasi (admin) |
| GET | `/api/audit` | Auditilogi |
| GET | `/api/settings` | Seaded |
| PUT | `/api/settings` | Uuenda seadeid |

---

## Veaotsing

**Ei saa sisse logida** — lülita `LDAP_DEBUG=true`, vaata konsooli.

**Strong Auth Required** — AD nõuab LDAPS-i: `LDAP_URL=ldaps://...` port 636.

**Insufficient Access Rights** — teenuskontol puuduvad õigused, käivita AD seadistuse skriptid.

**Unwilling To Perform** — parool ei vasta domeeni paroolipoliitikale (min 8 märki, keerukus).

**Sessiooni tabel puudub** — rakendus loob `sessions` tabeli MariaDB-s automaatselt käivitusel.

---

## Litsents

Vaata [LICENSE](LICENSE).
