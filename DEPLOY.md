# ADUM — Paigaldus Debian 13 serverile

## Eeldused

- Debian 13 (Trixie) server, minimaalselt 1 GB RAM, 10 GB kettaruumi
- SSH juurdepääs root- või sudo-kasutajana
- Domeeninimi (nt `adum.haigla.vmh.ee`) suunatud serveri IP-le
- Active Directory domeenikontroller on serverist LDAP(S) kaudu ligipääsetav

---

## 1. Süsteemi ettevalmistus

```bash
apt update && apt upgrade -y
apt install -y curl wget gnupg2 ca-certificates lsb-release ufw git
```

---

## 2. Node.js 22 paigaldus

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node --version   # peaks näitama v22.x.x
```

---

## 3. MariaDB paigaldus ja seadistus

```bash
apt install -y mariadb-server
systemctl enable --now mariadb
mysql_secure_installation   # järgi juhiseid: sea root parool, eemalda anonüümsed kasutajad
```

Loo andmebaas ja kasutaja:

```bash
mysql -u root -p
```

```sql
CREATE DATABASE adum CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'adum'@'localhost' IDENTIFIED BY 'MUUDA_SIIA_TUGEV_PAROOL';
GRANT ALL PRIVILEGES ON adum.* TO 'adum'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

---

## 4. PM2 protsessihaldur

```bash
npm install -g pm2
pm2 startup systemd -u root --hp /root   # genereerib systemd ühiku
# käivita väljastatud käsk (algab: systemctl enable pm2-root)
```

---

## 5. Nginx pöördpuhverserver

```bash
apt install -y nginx
```

Loo konfiguratsioonifail:

```bash
nano /etc/nginx/sites-available/adum
```

Sisu (asenda `adum.haigla.vmh.ee` oma domeeniga):

```nginx
server {
    listen 80;
    server_name adum.haigla.vmh.ee;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name adum.haigla.vmh.ee;

    ssl_certificate     /etc/letsencrypt/live/adum.haigla.vmh.ee/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/adum.haigla.vmh.ee/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_session_cache   shared:SSL:10m;

    # Edasta päringud Node.js rakendusele
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        'upgrade';
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
        client_max_body_size 2M;
    }
}
```

Aktiveeri:

```bash
ln -s /etc/nginx/sites-available/adum /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

---

## 6. Let's Encrypt SSL sertifikaat

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d adum.haigla.vmh.ee
# Uuendus toimub automaatselt — kontrolli:
systemctl status certbot.timer
```

---

## 7. Rakenduse paigaldus

```bash
# Loo rakenduse kasutaja (ei vaja shell-juurdepääsu)
useradd --system --no-create-home --shell /usr/sbin/nologin adum

# Paigalduskoht
mkdir -p /opt/adum
cd /opt/adum

# Kopeeri rakendus siia (git clone või scp)
# Näide git kloonimisel:
# git clone https://github.com/sinu-repo/ad-usermanager.git .

# Installi sõltuvused (ilma devDependencies)
npm ci --omit=dev

# Sea failide omanik
chown -R adum:adum /opt/adum
chmod 750 /opt/adum/config
```

---

## 8. Keskkonna seadistus

```bash
cp /opt/adum/.env.example /opt/adum/.env
nano /opt/adum/.env
```

Täida kõik väljad (vt `.env.example` kommentaarid). Olulisimad:

| Muutuja | Kirjeldus |
|---|---|
| `SESSION_SECRET` | Vähemalt 64-märgiline juhuslik string |
| `DB_USER` / `DB_PASS` | MariaDB kasutaja, loodud punktis 3 |
| `LDAP_URL` | `ldaps://dc01.haigla.vmh.ee:636` (LDAPS soovituslik) |
| `LDAP_BIND_DN` | Teenusekonto täis-DN |
| `LDAP_BIND_PASS` | Teenusekonto parool |
| `HTTPS` | `true` (kuna Nginx teeb SSL-i) |
| `TRUST_PROXY` | `true` (kuna Nginx on pöördpuhverserver) |
| `NODE_ENV` | `production` |
| `MOCK_AD` | `false` |

Genereeri tugev SESSION_SECRET:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Kaitse `.env` faili:

```bash
chown adum:adum /opt/adum/.env
chmod 600 /opt/adum/.env
```

---

## 9. PM2 käivitus

```bash
# Loo logi kataloog
mkdir -p /var/log/adum
chown adum:adum /var/log/adum

cd /opt/adum
pm2 start ecosystem.config.js --env production
pm2 save   # salvesta protsessid automaatkäivituseks
pm2 logs adum --lines 50   # kontrolli logisid
```

---

## 10. Tulemüür

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status
```

Kui AD domeenikontroller asub eraldi võrgus, lisa ka LDAP(S) väljaminev liiklus:

```bash
ufw allow out to <DC_IP> port 636 proto tcp   # LDAPS
# või: ufw allow out to <DC_IP> port 389 proto tcp  # LDAP (krüptimata)
```

---

## 11. Kontrollimine

```bash
# Rakenduse olek
pm2 status

# Logid reaalajas
pm2 logs adum

# MariaDB ühendus
mysql -u adum -p adum -e "SHOW TABLES;"

# Nginx olek
systemctl status nginx

# SSL sertifikaat
certbot certificates
```

Ava brauseris `https://adum.haigla.vmh.ee` — peaksid nägema sisselogimislehte.

---

## 12. Uuendamine

```bash
cd /opt/adum
# Kopeeri uued failid / git pull
npm ci --omit=dev
pm2 reload adum    # nullseiskuta taaskäivitus
```

---

## Levinud probleemid

**LDAPS sertifikaadi viga:** Sea `.env`-is `LDAP_TLS_VERIFY=false` testimiseks, tootmises lisa AD sertifikaat usaldusväärsete sertifikaatide hulka:

```bash
cp dc01-cert.crt /usr/local/share/ca-certificates/
update-ca-certificates
```

**MariaDB ühenduse viga:** Kontrolli, et kasutajal on õigused:

```bash
mysql -u adum -p -e "SHOW GRANTS;"
```

**Sessiooni tabel puudub:** Rakendus loob selle automaatselt käivitamisel (`sessions` tabel).

**Port 3000 ei vasta:** `pm2 logs adum` — vaata veateadet.
