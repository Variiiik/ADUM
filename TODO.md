# ADUM — TODO

## Tehniline võlg

- [ ] **Vii seaded andmebaasi** (`settings.json` → MySQL)
  - Üks rida tabelis: `settings (id TINYINT PK, data JSON, logo MEDIUMBLOB)`
  - `routes/settings.js` `load()`/`save()` vahetab `fs` välja DB-päringutega
  - Logo `logo.dat` faili pole enam vaja
  - Frontendis muutusi pole — API jääb samaks
  - Kasu: PM2 klaster ei tekita race condition-it, üks backup kogu andmebaasist

## Funktsionaalsus

- [ ] **Homefolder tegelik loomine** — praegu on seadistus olemas, aga kasutaja loomisel ei looda kodukataloogi automaatselt
