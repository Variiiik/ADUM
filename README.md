# AD Kasutajahaldus

Active Directory kasutajate haldamise veebirakendus. Mõeldud haigla IT- ja personaliosakonnale — võimaldab hallata AD kontosid ilma `dsa.msc` avamata.

---

## Funktsioonid

| Funktsioon | Kirjeldus |
|---|---|
| **Kasutajate haldus** | Loomine, muutmine, kustutamine, otsimine ja filtreerimine |
| **Konto toimingud** | Luba/keela, ava lukk, lähtesta parool |
| **Grupihaldu** | Kasutaja lisamine/eemaldamine gruppidest loomisel ja profiilis |
| **Auditilogi** | Kõik toimingud logitakse ajatempliga, eksporditav CSV-na |
| **Seaded** | LDAP, e-post, SMS ja kirja mallid veebiliidesest |
| **Mock-režiim** | Täielikult kasutatav ilma päris AD-ta — arendusteks |
| **Kohalik admin** | Sisselogimine töötab ka AD mahavõtmisel |
| **Turvaline** | CSRF, rate limiting, LDAPS, session httpOnly, Helmet CSP |

---

## Nõuded

- **Node.js** 18 või uuem
- **Active Directory** (Windows Server 2016+) — või mock-režiim arenduseks
- LDAPS (port 636) juurdepääs DC-le — AD nõuab TLS-i kasutajaandmete muutmiseks
- Teenuskonto AD-s kirjutamisõigustega (vt [AD seadistus](#ad-seadistus))

---

## Kiirkäivitus

```bash
git clone <repo>
cd ad-usermanager
npm install
cp .env.example .env
# Muutke .env faili (vt allpool)
npm run dev
```

Avage brauser: `http://localhost:3001`

**Mock-režiimi sisselogimine:** `admin` / `admin123`

---

## Konfiguratsioon (.env)

```env
# ── LDAP / Active Directory ──────────────────────────────────────────────────
LDAP_URL=ldaps://192.168.1.10:636        # ldap:// (389) või ldaps:// (636 TLS)
LDAP_TLS_VERIFY=false                    # false = lubab ise-allkirjastatud serte (sisevõrk)
LDAP_BASE_DN=DC=varik,DC=local           # Domeeni juur
LDAP_BIND_DN=CN=svc-ad,OU=Bind,OU=Main,DC=varik,DC=local  # Teenuskonto DN
LDAP_BIND_PASS=SalajaneParool           # Teenuskonto parool
LDAP_USERS_OU=OU=Users,OU=Main,DC=varik,DC=local          # Kasutajate OU (lugemine + loomine)
LDAP_GROUPS_OU=OU=Groups,OU=Main,DC=varik,DC=local        # Gruppide OU

# ── Juurdepääsu kontroll ──────────────────────────────────────────────────────
LDAP_ADMIN_GROUP=ADUM_admin              # AD grupp kellel on rakendusele ligipääs
                                         # Tühjaks jättes saavad kõik AD kasutajad sisse logida
LDAP_UPN_SUFFIX=varik.local             # UPN sufiks (kui erineb BASE_DN-st, muidu tühi)
LDAP_EXTRA_DOMAINS=varik.ee,test.varik.local  # Lisadomeenid e-posti valikule (komaga eraldatud)

# ── Rakendus ──────────────────────────────────────────────────────────────────
PORT=3001
NODE_ENV=production                      # production | development
HTTPS=false                              # true = küpsis ainult HTTPS üle (reverse proxy taga)
SESSION_SECRET=<64-char-random-string>   # Sessiooni allkirjastamisvõti

# ── Kohalik admin (AD-st sõltumatu) ──────────────────────────────────────────
LOCAL_ADMIN_USER=localadmin              # Kohalik admini kasutajanimi
LOCAL_ADMIN_PASS=TugEvParool123!        # Kohalik admini parool

# ── Arendus ───────────────────────────────────────────────────────────────────
MOCK_AD=false                            # true = mock-andmed, false = päris AD
LDAP_DEBUG=false                         # true = LDAP päringute detailne logi konsoolis
```

### SESSION_SECRET genereerimine

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Käivitamine

```bash
# Arendus (nodemon — automaatne taaskäivitus)
npm run dev

# Tootmine
npm start
```

---

## AD seadistus

### Teenuskonto loomine

```powershell
# Käivita DC-l administraatorina

# Loo OU teenuskontodele (kui pole olemas)
New-ADOrganizationalUnit -Name "Bind" -Path "OU=Main,DC=varik,DC=local"

# Loo teenuskonto
New-ADUser -Name "svc-admanager" `
  -SamAccountName "svc-admanager" `
  -UserPrincipalName "svc-admanager@varik.local" `
  -Path "OU=Bind,OU=Main,DC=varik,DC=local" `
  -AccountPassword (ConvertTo-SecureString "SalajaneParool" -AsPlainText -Force) `
  -PasswordNeverExpires $true `
  -Enabled $true
```

### Vajalikud õigused

```powershell
$svc      = "CN=svc-admanager,OU=Bind,OU=Main,DC=varik,DC=local"
$usersOU  = "OU=Users,OU=Main,DC=varik,DC=local"
$groupsOU = "OU=Groups,OU=Main,DC=varik,DC=local"

# Kasutajate OU — lugemine, loomine, muutmine, parooli lähtestamine
dsacls $usersOU /G "${svc}:GR"                      # Read
dsacls $usersOU /G "${svc}:CCDC;user"               # Create/Delete user objects
dsacls $usersOU /G "${svc}:WP"                      # Write all properties
dsacls $usersOU /G "${svc}:CA;Reset Password;user"  # Reset password

# Gruppide OU — liikmete muutmine
dsacls $groupsOU /G "${svc}:WP;member;group"        # Write members
```

### LDAP admin grupp

```powershell
# Loo grupp rakenduse kasutajatele
New-ADGroup -Name "ADUM_admin" `
  -GroupScope Global `
  -GroupCategory Security `
  -Path "OU=Groups,OU=Main,DC=varik,DC=local"

# Lisa IT admin(id) gruppi
Add-ADGroupMember -Identity "ADUM_admin" -Members "Klaus.Varik"
```

### LDAPS aktiveerimine

LDAPS (port 636) vajab DC-l kehtivat sertifikaati. Lihtsaim viis:

```powershell
# Installi Active Directory Certificate Services roll DC-le
Install-WindowsFeature AD-Certificate -IncludeManagementTools

# Seejärel taaskäivita — DC genereerib automaatselt ise-allkirjastatud serdi LDAPS jaoks
Restart-Computer
```

Kontrolli kas LDAPS töötab:
```powershell
Test-NetConnection -ComputerName 192.168.1.10 -Port 636
```

---

## Arhitektuur

```
ad-usermanager/
├── server.js               # Express server, turvamiddleware, marsruutimine
├── config/
│   └── ldap.js             # LDAP klient, helper-funktsioonid, mock-andmed
├── middleware/
│   └── auth.js             # requireAuth, requireAdmin middleware
├── lib/
│   └── audit.js            # Auditilogi (500 kirjet, ringpuhver)
├── routes/
│   ├── auth.js             # /api/auth/* — sisselogimine, väljalogimine
│   ├── users.js            # /api/users/* — kasutajate CRUD
│   ├── groups.js           # /api/groups — gruppide nimekiri
│   └── settings.js         # /api/settings/* — LDAP/email/SMS seaded
└── public/
    ├── index.html          # SPA kest
    ├── css/app.css         # Disainisüsteem (CSS muutujad, komponendid)
    └── js/
        ├── api.js          # Fetch-wrapper, CSRF tokenid
        ├── app.js          # Peamine rakendus: router, login, sidebar, toasts
        └── views/
            ├── dashboard.js
            ├── users.js
            ├── userDetail.js
            ├── groups.js
            ├── auditLog.js
            └── settings.js
```

### Backend API

| Meetod | URL | Kirjeldus |
|---|---|---|
| POST | `/api/auth/login` | Sisselogimine |
| POST | `/api/auth/logout` | Väljalogimine |
| GET | `/api/auth/me` | Praegune sessioon |
| GET | `/api/users` | Kasutajate nimekiri (`?q=&dept=&status=`) |
| GET | `/api/users/:sam` | Üks kasutaja |
| POST | `/api/users` | Loo kasutaja |
| PUT | `/api/users/:sam` | Muuda kasutajat |
| DELETE | `/api/users/:sam` | Kustuta kasutaja |
| POST | `/api/users/:sam/reset-password` | Lähtesta parool |
| POST | `/api/users/:sam/enable` | Luba konto |
| POST | `/api/users/:sam/disable` | Keela konto |
| POST | `/api/users/:sam/unlock` | Ava lukk |
| POST | `/api/users/:sam/groups/add` | Lisa gruppi |
| POST | `/api/users/:sam/groups/remove` | Eemalda grupist |
| GET | `/api/groups` | Gruppide nimekiri |
| GET | `/api/audit` | Auditilogi |
| GET | `/api/settings` | Rakenduse seaded |
| PUT | `/api/settings` | Uuenda seadeid |
| POST | `/api/settings/test-ldap` | Testi LDAP ühendust |
| GET | `/api/config` | Avalik konfig (domeenid) |

---

## Turvalisus

| Mehhanism | Rakendus |
|---|---|
| **CSRF** | Iga muutev päring nõuab `X-CSRF-Token` päist |
| **Rate limiting** | Login: max 10 katset / 15 minutit |
| **Session** | httpOnly, sameSite: strict, 8h TTL, `session.regenerate()` login |
| **Helmet** | CSP, HSTS, X-Frame-Options, Referrer-Policy |
| **LDAP injection** | Kõik filtrid läbivad `escapeLdap()` |
| **LDAPS** | Paroolid edastatakse ainult TLS-krüpteeritud ühenduse kaudu |
| **Kohalik admin** | AD mahavõtmisel tagavarasüsteem — kasuta tugevat parooli |
| **Auditilogi** | Kõik toimingud, sisselogimised ja ebaõnnestumised logitakse |

---

## Veaotsing

### Ei saa sisse logida — vale kasutajanimi/parool
- Kontrolli kas `LDAP_ADMIN_GROUP` grupp on AD-s olemas ja kasutaja on seal
- Lülita sisse `LDAP_DEBUG=true` — vaata nodemon konsooli

### Strong Auth Required
- AD nõuab LDAPS-i: muuda `LDAP_URL=ldaps://...` ja port `636`

### Insufficient Access Rights
- Teenuskontol puuduvad õigused — käivita [AD seadistuse](#ad-seadistus) PowerShell käsud

### Unwilling To Perform (kasutaja loomine)
- AD nõuab 3-sammulist loomist: disabled → set password → enable
- Kood teeb seda automaatselt, aga parool peab olema vähemalt 8 tähemärki ja vastama domeeni paroolipoliitikale

### Kasutajaid ei kuvata
- Kontrolli `LDAP_USERS_OU` — peab vastama täpselt AD OU teekonnale
- Lülita sisse `LDAP_DEBUG=true` — konsoolis kuvatakse kirjete arv

### Port 3000/3001 on kasutusel
```bash
# Windows
netstat -ano | findstr :3001
taskkill /PID <pid> /F
```

---

## Mock-režiim

Arenduseks ja testimiseks ilma päris AD-ta:

```env
MOCK_AD=true
MOCK_ADMIN_USER=admin
MOCK_ADMIN_PASS=admin123
```

Mock sisaldab 30 Eesti haiglatöötajat koos realistlike andmetega (Mart Tamm, Kadri Mägi jt), osakondadega (Kardioloogia, Kiirabi, IT-osakond jt) ja gruppidega.

---

## Litsents

Sisemine tarkvara — Viljandi Haigla IT-osakond.
