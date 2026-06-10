/* Settings view — LDAP, Email, SMS, Templates */
'use strict';

Views.Settings = {
  _tab: 'ldap',
  _tmplChan: 'email',
  _tmplTab: 'welcome',
  _settings: null,
  _auditEntries: [],

  async render(container) {
    container.innerHTML = `<div class="content-inner"><div style="text-align:center;padding:60px"><div class="spinner" style="margin:auto"></div></div></div>`;
    try {
      const [settingsRes, auditRes] = await Promise.all([
        API.getSettings(),
        API.getAudit(200),
      ]);
      this._settings     = settingsRes.settings;
      this._auditEntries = auditRes.entries || [];
    } catch (err) {
      container.innerHTML = `<div class="content-inner"><div class="empty">${icon('alert',40)}<div>${esc(err.message)}</div></div></div>`;
      return;
    }
    this._renderSettings(container);
  },

  _renderSettings(container) {
    const s   = this._settings || {};
    const tab = this._tab;
    const self = this;

    const tabs = [
      { id:'appearance',label:'Kujundus',        ic:'sun'       },
      { id:'ui',        label:'Kasutajaliides',  ic:'id'        },
      { id:'roles',     label:'Rollid',          ic:'users'     },
      { id:'services',  label:'Teenused',        ic:'briefcase' },
      { id:'ldap',      label:'LDAP liidestus',  ic:'sliders'   },
      { id:'email',     label:'E-posti seaded',  ic:'mail'      },
      { id:'sms',       label:'SMS liidestus',   ic:'phone'     },
      { id:'templates', label:'Kirja mallid',    ic:'briefcase' },
      { id:'log',       label:'Süsteemi logi',   ic:'audit'     },
    ];

    const COLOR_PRESETS = [
      { id:'burgundy', label:'Burgundia', accent:'#b02a37', navy:'#5e1d27', navy2:'#4a141d', navy3:'#74303c' },
      { id:'blue',     label:'Sinine',    accent:'#2563eb', navy:'#1e3a8a', navy2:'#1e3799', navy3:'#1d4ed8' },
      { id:'teal',     label:'Roheline',  accent:'#0d9488', navy:'#134e4a', navy2:'#0f3d3a', navy3:'#1a5c58' },
      { id:'violet',   label:'Lilla',     accent:'#7c3aed', navy:'#3b1a6b', navy2:'#2e1357', navy3:'#552a9e' },
      { id:'emerald',  label:'Smaragd',   accent:'#16a34a', navy:'#064e3b', navy2:'#053d2f', navy3:'#0a6b52' },
      { id:'slate',    label:'Hallsinine',accent:'#475569', navy:'#1e293b', navy2:'#0f172a', navy3:'#334155' },
    ];

    let body = '';
    if (tab === 'appearance') {
      const ap = s.appearance || {};
      const curAccent = ap.accentColor || '#b02a37';
      const matchedPreset = COLOR_PRESETS.find(p => p.accent === curAccent);
      body = `
        <form id="st-ap-form">
          <div class="form-sec-title">Süsteemi info</div>
          <div class="form-grid" style="margin-bottom:20px">
            <div class="field">
              <label>Süsteemi nimi</label>
              <input class="input" id="ap-sysname" value="${esc(ap.systemName||'AD Kasutajahaldus')}" placeholder="AD Kasutajahaldus" />
              <span class="hint">Näidatakse sisselogimislehel ja külgmenüüs</span>
            </div>
            <div class="field">
              <label>Asutus / organisatsioon</label>
              <input class="input" id="ap-orgname" value="${esc(ap.orgName||'Viljandi Haigla')}" placeholder="Viljandi Haigla" />
              <span class="hint">Alampealkiri logo all</span>
            </div>
          </div>

          <div class="form-sec-title">Logo</div>
          <div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:12px;flex-wrap:wrap">
            <div id="ap-logo-preview-wrap" style="${ap.logoEnabled ? '' : 'display:none'}">
              <img id="ap-logo-preview" src="/api/settings/logo?v=${ap.logoVersion||0}" alt="Logo"
                style="width:72px;height:72px;object-fit:contain;border-radius:12px;border:1px solid var(--border);background:var(--surface-2);padding:4px" />
            </div>
            <div id="ap-logo-placeholder" style="${ap.logoEnabled ? 'display:none' : 'display:flex'};width:72px;height:72px;border-radius:12px;border:2px dashed var(--border);background:var(--surface-2);align-items:center;justify-content:center;color:var(--ink-3)">
              ${icon('upload',24)}
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;justify-content:center">
              <label class="btn sm" style="cursor:pointer">
                ${icon('upload',14)} Laadi logo
                <input type="file" id="ap-logo-input" accept="image/png,image/jpeg,image/svg+xml,image/webp" style="display:none" />
              </label>
              <button type="button" class="btn sm" id="ap-logo-remove" style="${ap.logoEnabled ? '' : 'display:none'}">
                ${icon('trash',14)} Eemalda logo
              </button>
              <span class="hint">PNG, SVG, WebP</span>
            </div>
          </div>
          <!-- Inline resize panel -->
          <div id="ap-resize-panel" style="display:none;background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px">
            <div style="font-weight:600;font-size:13px;margin-bottom:12px">${icon('sliders',14)} Kohanda logo suurust</div>
            <div style="display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap">
              <div style="flex-shrink:0">
                <canvas id="ap-resize-canvas" style="border-radius:10px;border:1px solid var(--border);display:block;max-width:180px;max-height:180px;background:var(--surface-3)"></canvas>
              </div>
              <div style="flex:1;min-width:180px;display:flex;flex-direction:column;gap:10px">
                <div style="font-size:12px;color:var(--ink-3)">Orig: <span id="ap-resize-orig" style="font-family:monospace"></span></div>
                <div style="font-size:12px;color:var(--ink-3)">Väljund: <span id="ap-resize-out" style="font-family:monospace;font-weight:600;color:var(--ink)"></span></div>
                <div>
                  <label style="font-size:13px;font-weight:500;display:block;margin-bottom:6px">Maksimaalne laius (px)</label>
                  <div style="display:flex;align-items:center;gap:10px">
                    <input type="range" id="ap-resize-slider" min="32" max="512" value="256" style="flex:1" />
                    <span id="ap-resize-slider-val" style="font-size:13px;font-family:monospace;min-width:36px;text-align:right">256</span>
                  </div>
                </div>
                <div style="display:flex;gap:8px;margin-top:4px">
                  <button type="button" class="btn primary sm" id="ap-resize-confirm">${icon('upload',14)} Laadi üles</button>
                  <button type="button" class="btn sm"          id="ap-resize-cancel">${icon('x',14)} Tühista</button>
                </div>
              </div>
            </div>
          </div>

          <div class="form-sec-title" style="margin-top:20px">Värvitema</div>
          <div style="margin-bottom:20px">
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;align-items:center">
              ${COLOR_PRESETS.map(p => {
                const isActive = p.accent === curAccent;
                return `<button type="button" class="color-swatch${isActive?' selected':''}"
                  style="background:${p.accent}" title="${esc(p.label)}"
                  data-accent="${p.accent}" data-navy="${p.navy}" data-navy2="${p.navy2}" data-navy3="${p.navy3}">
                  ${isActive ? `<span style="width:10px;height:10px;border-radius:50%;background:#fff;display:block;margin:auto;opacity:.9"></span>` : ''}
                </button>`;
              }).join('')}
              <span style="font-size:12px;color:var(--ink-3);margin-left:4px">${COLOR_PRESETS.find(p=>p.accent===curAccent)?.label||'Kohandatud'}</span>
            </div>
            <div>
              <div style="font-size:13px;font-weight:500;color:var(--ink-2);margin-bottom:8px">Kohandatud rõhuvärv</div>
              <div style="display:flex;align-items:center;gap:10px">
                <input type="color" id="ap-custom-color" value="${esc(curAccent)}" style="width:40px;height:36px;border-radius:8px;border:1px solid var(--border);cursor:pointer;padding:2px;background:var(--surface);flex-shrink:0" />
                <input class="input mono" id="ap-custom-hex" value="${esc(curAccent)}" style="width:100px" placeholder="#b02a37" maxlength="7" />
              </div>
              <span class="hint" style="margin-top:5px;display:block">Ainult rõhuvärv (nupud, märgendid, aktiivne menüü). Külgmenüü toon tuleneb eelvalikust.</span>
            </div>
          </div>

          <div class="form-sec-title" style="margin-top:20px">Eelvaade</div>
          <div id="ap-preview" style="border-radius:12px;overflow:hidden;border:1px solid var(--border);margin-bottom:24px;max-width:320px">
            <div id="ap-prev-sb" style="background:${esc(ap.navyColor||'#5e1d27')};padding:16px;display:flex;align-items:center;gap:10px">
              <div id="ap-prev-logo" style="width:34px;height:34px;border-radius:9px;background:${esc(curAccent)};display:grid;place-items:center;flex-shrink:0;color:#fff">
                ${ap.logoEnabled
                  ? `<img src="/api/settings/logo?v=${ap.logoVersion||0}" style="width:34px;height:34px;object-fit:contain;border-radius:9px" />`
                  : icon('shield',16)}
              </div>
              <div>
                <div id="ap-prev-name" style="color:#fff;font-size:13.5px;font-weight:600">${esc(ap.systemName||'AD Kasutajahaldus')}</div>
                <div id="ap-prev-org"  style="color:#8595b3;font-size:11.5px">${esc(ap.orgName||'Viljandi Haigla')}</div>
              </div>
            </div>
            <div style="background:var(--surface-2);padding:10px 14px;display:flex;gap:8px;align-items:center">
              <div id="ap-prev-btn" style="background:${esc(curAccent)};color:#fff;border-radius:7px;padding:6px 14px;font-size:12px;font-weight:600">Nupp</div>
              <div id="ap-prev-badge" style="background:${esc(curAccent)}22;color:${esc(curAccent)};border-radius:99px;padding:3px 10px;font-size:12px">Märgend</div>
            </div>
          </div>

          <input type="hidden" id="ap-accent"  value="${esc(curAccent)}" />
          <input type="hidden" id="ap-navy"    value="${esc(ap.navyColor||'#5e1d27')}" />
          <input type="hidden" id="ap-navy2"   value="${esc(ap.navyColor2||'#4a141d')}" />
          <input type="hidden" id="ap-navy3"   value="${esc(ap.navyColor3||'#74303c')}" />

          <div style="display:flex;justify-content:flex-end;margin-top:4px">
            <button type="submit" class="btn primary">${icon('check',16)} Salvesta kujundus</button>
          </div>
        </form>`;
    } else if (tab === 'ui') {
      const u = s.ui || {};
      const PREFIX_OPTS = [
        { val:'1',    ex:'m.tamm',    label:'1 täht' },
        { val:'2',    ex:'ma.tamm',   label:'2 tähte' },
        { val:'full', ex:'mari.tamm', label:'Täis eesnimi' },
      ];
      body = `
        <form id="st-ui-form">
          <div class="form-grid">
            <div class="form-sec-title">Kasutajanime vorming</div>
            <div class="field full">
              <label>Eesnime prefix uue kasutaja loomisel</label>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:2px" id="su-prefix-wrap">
                ${PREFIX_OPTS.map(o=>`
                  <button type="button" class="btn${(u.usernamePrefix||'1')===o.val?' primary':''} sm" data-prefix="${o.val}">
                    <span style="font-family:monospace">${esc(o.ex)}</span>
                    <span style="opacity:.65;font-size:11px">${esc(o.label)}</span>
                  </button>`).join('')}
              </div>
              <span class="hint">Kasutajanimi genereeritakse automaatselt — administraator valib vormingu siin.</span>
              <input type="hidden" id="su-prefix" value="${esc(u.usernamePrefix||'1')}" />
            </div>

            <div class="form-sec-title">Väljad</div>
            <div class="field full">
              <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border:1px solid var(--border);border-radius:9px;background:var(--surface-2)">
                <div>
                  <div style="font-weight:600;font-size:13.5px">Näita "Juht" välja</div>
                  <div class="hint">Kuva otsese juhi valik kasutaja loomisel ja muutmisel</div>
                </div>
                <label class="switch" style="margin-left:auto">
                  <input type="checkbox" id="su-manager" ${u.showManager!==false?'checked':''} />
                  <span class="track"></span>
                </label>
              </div>
            </div>
          </div>
          <div style="display:flex;justify-content:flex-end;margin-top:20px">
            <button type="submit" class="btn primary">${icon('check',16)} Salvesta kasutajaliidese seaded</button>
          </div>
        </form>`;
    } else if (tab === 'roles') {
      const r = s.roles || {};
      body = `
        <form id="st-roles-form">
          <div style="display:flex;align-items:flex-start;gap:9px;padding:12px 16px;background:var(--accent-weak);color:var(--accent);border-radius:9px;margin-bottom:20px;font-size:13px">
            ${icon('info',15)} <span>Siia seadistate, millised AD grupid annavad kasutajale millise rolli. Muudatused rakenduvad järgmisest sisselogimisest.</span>
          </div>
          <div class="form-grid">
            <div class="form-sec-title">HR roll — kontotaotluste esitamine</div>
            <div class="field full">
              <label>HR grupi nimi (AD)</label>
              <input class="input mono" id="sr-hrgroup" value="${esc(r.hrGroup||'AD-HR')}" placeholder="AD-HR" />
              <span class="hint">Selles AD grupis olevad kasutajad saavad logida sisse ja esitada kontotaotlusi. Administraatorid kinnitavad need.</span>
            </div>

            <div class="form-sec-title" style="margin-top:8px">Admin roll — täisõigused</div>
            <div class="field full">
              <label>Admin grupi nimi (AD)</label>
              <input class="input mono" id="sr-admingroup" value="${esc(r.adminGroup||'')}" placeholder="IT-Administraatorid" />
              <span class="hint">Täiendav AD grupp täisõigustega administraatoritele. Tühi = kõik autentitud kasutajad on administraatorid (kasutage ainult siis, kui <code>LDAP_ADMIN_GROUP</code> pole seadistatud).</span>
            </div>

            <div class="form-sec-title" style="margin-top:8px">Mock režiim — testimine</div>
            <div class="field full">
              <div style="padding:12px 16px;border:1px solid var(--border);border-radius:9px;background:var(--surface-2);font-size:13px">
                <div style="font-weight:600;margin-bottom:8px">Test HR kasutaja (mock)</div>
                <div class="hint" style="margin-bottom:6px">Kasutajanimi: <code>p.personalijuht</code> &nbsp;·&nbsp; Parool: <code>Password1!</code></div>
                <div class="hint">See kasutaja on grupis <code>AD-HR</code> ja saab esitada kontotaotlusi.</div>
              </div>
            </div>
          </div>
          <div style="display:flex;justify-content:flex-end;margin-top:20px">
            <button type="submit" class="btn primary">${icon('check',16)} Salvesta rollid</button>
          </div>
        </form>`;
    } else if (tab === 'services') {
      const sv = s.services || {};
      body = `
        <form id="st-svc-form">
          <div style="display:flex;align-items:flex-start;gap:9px;padding:12px 16px;background:var(--accent-weak);color:var(--accent);border-radius:9px;margin-bottom:20px;font-size:13px">
            ${icon('info',15)} <span>Teenuste moodul salvestab kasutaja teenuserolli (O/T/L) valitud AD atribuuti. Väli peab AD skeemis juba eksisteerima.</span>
          </div>
          <div class="form-grid">
            <div class="form-sec-title">AD atribuut</div>
            <div class="field full">
              <label>Atribuudi nimi</label>
              <input class="input mono" id="sv-adattr" value="${esc(sv.adAttribute||'extensionAttribute1')}" placeholder="extensionAttribute1" autocomplete="off" />
              <span class="hint">Kasutatakse AD kasutajate atribuudi täitmiseks teenusekoodide ja rollidega (nt <code>ERP:O;HIS:L</code>). Tavaliselt <code>extensionAttribute1</code>…<code>extensionAttribute15</code>.</span>
            </div>
          </div>
          <div style="display:flex;justify-content:flex-end;margin-top:20px">
            <button type="submit" class="btn primary">${icon('check',16)} Salvesta</button>
          </div>
        </form>`;
    } else if (tab === 'ldap') {
      const l = s.ldap || {};
      body = `
        <form id="st-ldap-form">
          <div class="form-grid">
            <div class="form-sec-title">Serveri ühendus</div>
            <div class="field">
              <label>LDAP URL</label>
              <input class="input" id="sl-url" value="${esc(l.url||'')}" placeholder="ldap://dc01.haigla.vmh.ee" />
              <span class="hint">ldap:// või ldaps:// protokoll</span>
            </div>
            <div class="field">
              <label>Port</label>
              <input class="input" id="sl-port" type="number" value="${esc(l.port||389)}" min="1" max="65535" />
              <span class="hint">389 (LDAP) või 636 (LDAPS)</span>
            </div>
            <div class="field full">
              <label>Konto olek</label>
              <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border:1px solid var(--border);border-radius:9px;background:var(--surface-2)">
                <div>
                  <div style="font-weight:600;font-size:13.5px">TLS/SSL šifreerimine</div>
                  <div class="hint">Kasutage ldaps:// protokolliga</div>
                </div>
                <label class="switch" style="margin-left:auto">
                  <input type="checkbox" id="sl-tls" ${l.tls?'checked':''} />
                  <span class="track"></span>
                </label>
              </div>
            </div>

            <div class="form-sec-title">Kataloog</div>
            <div class="field">
              <label>Base DN</label>
              <input class="input mono" id="sl-basedn" value="${esc(l.baseDN||'')}" placeholder="DC=haigla,DC=vmh,DC=ee" />
            </div>
            <div class="field">
              <label>Kasutajate OU</label>
              <input class="input mono" id="sl-usersou" value="${esc(l.usersOU||'')}" placeholder="OU=Users,DC=haigla,DC=vmh,DC=ee" />
            </div>

            <div class="form-sec-title">Teenuskonto</div>
            <div class="field full">
              <label>Bind DN</label>
              <input class="input mono" id="sl-binddn" value="${esc(l.bindDN||'')}" placeholder="CN=svc-admanager,OU=Service Accounts,DC=haigla,DC=vmh,DC=ee" />
            </div>
            <div class="field">
              <label>Bind parool</label>
              <input class="input" id="sl-bindpass" type="password" value="${esc(l.bindPass||'')}" placeholder="Teenuskonto parool" autocomplete="new-password" />
            </div>
            <div class="field">
              <label>Otsingu ajalimit</label>
              <input class="input" id="sl-timeout" type="number" value="${esc(l.timeout||5000)}" />
              <span class="hint">Millisekundites</span>
            </div>
          </div>
          <div style="display:flex;gap:10px;margin-top:20px;align-items:center">
            <button type="button" class="btn" id="sl-test">${icon('sliders',16)} Testi ühendust</button>
            <div id="sl-test-result" style="font-size:13px"></div>
            <span style="flex:1"></span>
            <button type="submit" class="btn primary">${icon('check',16)} Salvesta LDAP seaded</button>
          </div>
        </form>`;
    } else if (tab === 'email') {
      const e = s.email || {};
      body = `
        <form id="st-email-form">
          <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border:1px solid var(--border);border-radius:9px;background:var(--surface-2);margin-bottom:16px">
            <div style="flex:1">
              <div style="font-weight:600;font-size:13.5px">E-posti integratsioon lubatud</div>
              <div class="hint">Saada automaatseid teavitusi kasutajatele</div>
            </div>
            <label class="switch">
              <input type="checkbox" id="se-enabled" ${e.enabled?'checked':''} />
              <span class="track"></span>
            </label>
          </div>
          <div class="form-grid">
            <div class="form-sec-title">SMTP server</div>
            <div class="field">
              <label>SMTP host</label>
              <input class="input" id="se-host" value="${esc(e.host||'')}" placeholder="smtp.haigla.ee" />
            </div>
            <div class="field">
              <label>Port</label>
              <input class="input" type="number" id="se-port" value="${esc(e.port||587)}" />
              <span class="hint">587 (TLS/STARTTLS) · 465 (SSL) · 25</span>
            </div>
            <div class="field full">
              <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border:1px solid var(--border);border-radius:9px;background:var(--surface-2)">
                <div><div style="font-weight:600;font-size:13.5px">SSL/TLS</div><div class="hint">Kasutage portiga 465</div></div>
                <label class="switch" style="margin-left:auto">
                  <input type="checkbox" id="se-secure" ${e.secure?'checked':''} />
                  <span class="track"></span>
                </label>
              </div>
            </div>

            <div class="form-sec-title">Autentimine</div>
            <div class="field">
              <label>Kasutajanimi</label>
              <input class="input" id="se-user" value="${esc(e.user||'')}" placeholder="noreply@haigla.ee" />
            </div>
            <div class="field">
              <label>Parool</label>
              <input class="input" id="se-pass" type="password" value="${esc(e.pass||'')}" placeholder="SMTP parool" autocomplete="new-password" />
            </div>

            <div class="form-sec-title">Saatja</div>
            <div class="field">
              <label>Saatja nimi</label>
              <input class="input" id="se-fromname" value="${esc(e.fromName||'AD Kasutajahaldus')}" placeholder="AD Kasutajahaldus" />
            </div>
            <div class="field">
              <label>Saatja e-post</label>
              <input class="input" id="se-from" type="email" value="${esc(e.from||'')}" placeholder="noreply@haigla.ee" />
            </div>
          </div>
          <div style="display:flex;gap:10px;margin-top:20px;align-items:center">
            <button type="button" class="btn" id="se-test">${icon('mail',16)} Saada testmeil</button>
            <div id="se-test-result" style="font-size:13px"></div>
            <span style="flex:1"></span>
            <button type="submit" class="btn primary">${icon('check',16)} Salvesta e-posti seaded</button>
          </div>
        </form>`;
    } else if (tab === 'sms') {
      const sm = s.sms || {};
      body = `
        <form id="st-sms-form">
          <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border:1px solid var(--border);border-radius:9px;background:var(--surface-2);margin-bottom:16px">
            <div style="flex:1">
              <div style="font-weight:600;font-size:13.5px">SMS integratsioon lubatud</div>
              <div class="hint">Saada SMS teavitusi mobiiltelefonile</div>
            </div>
            <label class="switch">
              <input type="checkbox" id="ss-enabled" ${sm.enabled?'checked':''} />
              <span class="track"></span>
            </label>
          </div>
          <div class="form-grid">
            <div class="form-sec-title">Teenusepakkuja</div>
            <div class="field">
              <label>SMS pakkuja</label>
              <select class="select" id="ss-provider">
                <option value="twilio"${sm.provider==='twilio'?' selected':''}>Twilio</option>
                <option value="vonage"${sm.provider==='vonage'?' selected':''}>Vonage (Nexmo)</option>
                <option value="aws-sns"${sm.provider==='aws-sns'?' selected':''}>AWS SNS</option>
                <option value="other"${sm.provider==='other'?' selected':''}>Muu</option>
              </select>
            </div>
            <div class="field">
              <label>Saatja number / ID</label>
              <input class="input" id="ss-from" value="${esc(sm.from||'')}" placeholder="+37250000000" />
            </div>
            <div class="form-sec-title">API võtmed</div>
            <div class="field">
              <label>API võti (Account SID)</label>
              <input class="input mono" id="ss-key" type="password" value="${esc(sm.apiKey||'')}" placeholder="API võti" autocomplete="new-password" />
            </div>
            <div class="field">
              <label>API saladus (Auth Token)</label>
              <input class="input mono" id="ss-secret" type="password" value="${esc(sm.apiSecret||'')}" placeholder="API saladus" autocomplete="new-password" />
            </div>
          </div>
          <div style="margin-top:20px;padding:14px 16px;background:var(--warn-bg);color:var(--warn-ink);border-radius:9px;font-size:13px">
            ${icon('alert',15)} SMS integratsioon nõuab lisateeki (nt <code>twilio</code>). Installige see käsuga <code>npm install twilio</code>.
          </div>
          <div style="display:flex;gap:10px;margin-top:16px;align-items:center">
            <span style="flex:1"></span>
            <button type="submit" class="btn primary">${icon('check',16)} Salvesta SMS seaded</button>
          </div>
        </form>`;
    } else if (tab === 'templates') {
      const tmpl = s.templates || {};
      const chan = this._tmplChan;
      const tt   = this._tmplTab;

      const EMAIL_TABS = [
        { id:'welcome',         label:'Uus konto'            },
        { id:'passwordReset',   label:'Parooli lähtestamine' },
        { id:'accountDisabled', label:'Konto keelamine'      },
        { id:'accountEnabled',  label:'Konto lubamine'       },
      ];
      const SMS_TABS = [
        { id:'newAccount',    label:'Uus konto'            },
        { id:'passwordReset', label:'Parooli lähtestamine' },
      ];
      const EMAIL_VARS = {
        welcome:         ['{{displayName}}','{{username}}','{{department}}'],
        passwordReset:   ['{{displayName}}','{{username}}'],
        accountDisabled: ['{{displayName}}','{{username}}'],
        accountEnabled:  ['{{displayName}}','{{username}}'],
      };
      const SMS_VARS = {
        newAccount:    ['{{displayName}}','{{username}}','{{password}}','{{department}}'],
        passwordReset: ['{{displayName}}','{{username}}','{{password}}'],
      };

      const isEmail  = chan === 'email';
      const curTabs  = isEmail ? EMAIL_TABS : SMS_TABS;
      const curVars  = isEmail ? EMAIL_VARS : SMS_VARS;
      const chanData = tmpl[chan] || {};
      const validIds = curTabs.map(t => t.id);
      const activeTT = validIds.includes(tt) ? tt : validIds[0];
      const cur = chanData[activeTT] || (isEmail ? { enabled:true, subject:'', body:'' } : { enabled:true, body:'' });

      body = `
        <div style="display:flex;gap:8px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border)">
          <button class="btn${isEmail?' primary':''} sm" data-tmpl-chan="email">${icon('mail',14)} E-post</button>
          <button class="btn${!isEmail?' primary':''} sm" data-tmpl-chan="sms">${icon('phone',14)} SMS</button>
        </div>
        ${isEmail ? `<div style="display:flex;align-items:center;gap:9px;padding:10px 14px;background:var(--bad-bg);color:var(--bad-ink);border-radius:9px;margin-bottom:14px;font-size:13px">
          ${icon('alert',15)} <span><strong>Turvapiirang:</strong> E-kirja teel ei tohi parooli saata. Parool edastatakse ainult SMS-iga.</span>
        </div>` : `<div style="display:flex;align-items:center;gap:9px;padding:10px 14px;background:var(--ok-bg);color:var(--ok-ink);border-radius:9px;margin-bottom:14px;font-size:13px">
          ${icon('phone',15)} <span>SMS mallides on lubatud <strong>{{password}}</strong> muutuja.</span>
        </div>`}
        <div class="template-tabs" style="margin-bottom:14px">
          ${curTabs.map(t => {
            const isActive = t.id === activeTT;
            const tEnabled = (chanData[t.id] || {}).enabled !== false;
            return `<button class="tmpl-tab${isActive?' active':''}" data-tmpl="${esc(t.id)}">
              ${esc(t.label)}<span style="display:inline-block;width:7px;height:7px;border-radius:50%;margin-left:6px;vertical-align:middle;background:${tEnabled?'var(--ok-ink)':'var(--ink-3)'}"></span>
            </button>`;
          }).join('')}
        </div>
        <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border:1px solid var(--border);border-radius:9px;background:var(--surface-2);margin-bottom:14px">
          <div style="flex:1">
            <div style="font-weight:600;font-size:13.5px">Mall aktiivne</div>
            <div class="hint">${isEmail ? 'Kui keelatud, siis e-kirja ei saadeta' : 'Kui keelatud, siis SMS-i ei saadeta'}</div>
          </div>
          <label class="switch">
            <input type="checkbox" id="st-enabled" ${cur.enabled!==false?'checked':''} />
            <span class="track"></span>
          </label>
        </div>
        <form id="st-tmpl-form">
          <input type="hidden" id="st-chan" value="${esc(chan)}" />
          <input type="hidden" id="st-key"  value="${esc(activeTT)}" />
          <div style="margin-bottom:12px">
            <div class="hint" style="margin-bottom:8px">Saadaolevad muutujad:</div>
            <div class="vars-hint">
              ${(curVars[activeTT]||[]).map(v=>`<span class="var-chip">${esc(v)}</span>`).join('')}
            </div>
          </div>
          <div class="settings-section">
            ${isEmail ? `<div class="field" style="margin-bottom:14px">
              <label>Teema (Subject)</label>
              <input class="input" id="st-subject" value="${esc(cur.subject||'')}" placeholder="Kirja teema" />
            </div>` : ''}
            <div class="field">
              <label>${isEmail ? 'Kirja sisu' : 'SMS sisu'}</label>
              <textarea class="textarea" id="st-body" rows="${isEmail?12:6}" placeholder="${isEmail?'Kirja sisu…':'SMS sisu…'}">${esc(cur.body||'')}</textarea>
              <span class="hint">${isEmail
                ? 'Muutujad: {{displayName}}, {{username}}, {{department}}. Parooli muutujat ei tohi kasutada!'
                : 'Muutujad: {{displayName}}, {{username}}, {{password}}, {{department}}'}</span>
            </div>
          </div>
          <div style="display:flex;justify-content:flex-end;margin-top:16px">
            <button type="submit" class="btn primary">${icon('check',16)} Salvesta mall</button>
          </div>
        </form>`;
    } else if (tab === 'log') {
      const entries = this._auditEntries;

      const LOG_CATEGORIES = {
        LOGIN:          { label:'Sisselogimine', c:'var(--ok-ink)',   bg:'var(--ok-bg)'      },
        LOGOUT:         { label:'Väljalogimine', c:'var(--ink-3)',    bg:'var(--surface-3)'  },
        CREATE_USER:    { label:'Kasutaja loodud',c:'var(--ok-ink)',  bg:'var(--ok-bg)'      },
        MODIFY_USER:    { label:'Kasutaja muudetud',c:'var(--accent)',bg:'var(--accent-weak)'},
        DELETE_USER:    { label:'Kasutaja kustutatud',c:'var(--bad-ink)',bg:'var(--bad-bg)'  },
        RESET_PASSWORD: { label:'Parool lähtestatud',c:'var(--accent)',bg:'var(--accent-weak)'},
        ENABLE_USER:    { label:'Konto lubatud', c:'var(--ok-ink)',   bg:'var(--ok-bg)'      },
        DISABLE_USER:   { label:'Konto keelatud',c:'var(--bad-ink)',  bg:'var(--bad-bg)'     },
        UNLOCK_USER:    { label:'Konto avatud',  c:'var(--ok-ink)',   bg:'var(--ok-bg)'      },
        GROUP_ADD:      { label:'Gruppi lisatud',c:'var(--accent)',   bg:'var(--accent-weak)'},
        GROUP_REMOVE:   { label:'Grupist eemaldatud',c:'var(--warn-ink)',bg:'var(--warn-bg)' },
        UPDATE_SETTINGS:{ label:'Seaded uuendatud',c:'var(--accent)', bg:'var(--accent-weak)'},
        TEST_LDAP:      { label:'LDAP test',     c:'var(--ink-2)',    bg:'var(--surface-3)'  },
      };

      function fmtDT(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        return isNaN(d) ? '—' : d.toLocaleDateString('et-EE') + ' ' +
          d.toLocaleTimeString('et-EE',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      }

      function exportLog() {
        const rows = [['Aeg','Toimingut teinud','Toiming','Sihtmärk','Tulemus','Üksikasjad']];
        entries.forEach(e => rows.push([
          fmtDT(e.timestamp), e.actor, e.actionLabel||e.action,
          e.target, e.result, e.details||''
        ]));
        const csv = rows.map(r => r.map(v => '"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
        const a = document.createElement('a');
        a.href = 'data:text/csv;charset=utf-8,﻿' + encodeURIComponent(csv);
        a.download = 'systeemi_logi_' + new Date().toISOString().slice(0,10) + '.csv';
        a.click();
      }

      // Store export fn for later binding
      this._exportLog = exportLog;

      body = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <span style="font-size:13px;color:var(--ink-3)">${entries.length} kirjet (viimased 200)</span>
          <button class="btn" id="st-log-export">${icon('download',16)} Ekspordi CSV</button>
        </div>
        <div class="card">
          <div class="tbl-wrap">
            <table class="tbl">
              <thead>
                <tr>
                  <th style="width:155px">Aeg</th>
                  <th>Toiming</th>
                  <th>Kasutaja</th>
                  <th>Sihtmärk</th>
                  <th>Tulemus</th>
                  <th>Üksikasjad</th>
                </tr>
              </thead>
              <tbody>
                ${entries.length === 0
                  ? `<tr><td colspan="6"><div class="empty" style="padding:30px">${icon('audit',32)}<div>Logi on tühi.</div></div></td></tr>`
                  : entries.map(e => {
                      const cat = LOG_CATEGORIES[e.action] || { label:e.action, c:'var(--ink-2)', bg:'var(--surface-3)' };
                      const resultBadge = e.result === 'success'
                        ? '<span class="badge ok"><span class="dot"></span>Õnnestus</span>'
                        : e.result === 'failure'
                        ? '<span class="badge bad"><span class="dot"></span>Ebaõnnestus</span>'
                        : '<span class="badge warn"><span class="dot"></span>Hoiatus</span>';
                      return `<tr>
                        <td style="font-size:12px;white-space:nowrap" class="muted">${esc(fmtDT(e.timestamp))}</td>
                        <td>
                          <span class="badge" style="background:${cat.bg};color:${cat.c}">
                            <span class="dot"></span>${esc(cat.label)}
                          </span>
                        </td>
                        <td><span class="mono">${esc(e.actor)}</span></td>
                        <td>${esc(e.target)}</td>
                        <td>${resultBadge}</td>
                        <td class="muted" style="font-size:12px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(e.details||'')}">${esc(e.details||'—')}</td>
                      </tr>`;
                    }).join('')}
              </tbody>
            </table>
          </div>
        </div>`;
    }

    container.innerHTML = `<div class="content-inner" style="max-width:860px">
      <div class="settings-tabs">
        ${tabs.map(t=>`<button class="settings-tab${t.id===tab?' active':''}" data-stab="${t.id}">
          ${icon(t.ic,15)} ${esc(t.label)}
        </button>`).join('')}
      </div>
      <div id="settings-body">${body}</div>
    </div>`;

    // Tab navigation
    container.querySelectorAll('[data-stab]').forEach(btn => {
      btn.addEventListener('click', () => { self._tab = btn.dataset.stab; self._renderSettings(container); });
    });

    // Template channel tabs (E-post / SMS)
    container.querySelectorAll('[data-tmpl-chan]').forEach(btn => {
      btn.addEventListener('click', () => {
        self._tmplChan = btn.dataset.tmplChan;
        self._tmplTab  = self._tmplChan === 'sms' ? 'newAccount' : 'welcome';
        self._renderSettings(container);
      });
    });

    // Template sub-tabs
    container.querySelectorAll('[data-tmpl]').forEach(btn => {
      btn.addEventListener('click', () => { self._tmplTab = btn.dataset.tmpl; self._renderSettings(container); });
    });

    // ── Appearance form ──
    const apForm = document.getElementById('st-ap-form');
    if (apForm) {
      // Live preview updater
      function apUpdatePreview() {
        const accent = document.getElementById('ap-accent').value || '#b02a37';
        const navy   = document.getElementById('ap-navy').value   || '#5e1d27';
        const name   = document.getElementById('ap-sysname').value || 'AD Kasutajahaldus';
        const org    = document.getElementById('ap-orgname').value || 'Viljandi Haigla';
        const el = id => document.getElementById(id);
        if (el('ap-prev-sb'))    el('ap-prev-sb').style.background = navy;
        if (el('ap-prev-logo'))  el('ap-prev-logo').style.background = accent;
        if (el('ap-prev-btn'))   { el('ap-prev-btn').style.background = accent; }
        if (el('ap-prev-badge')) { el('ap-prev-badge').style.background = accent + '22'; el('ap-prev-badge').style.color = accent; }
        if (el('ap-prev-name'))  el('ap-prev-name').textContent = name;
        if (el('ap-prev-org'))   el('ap-prev-org').textContent = org;
      }

      const COLOR_PRESETS_LOCAL = [
        { id:'burgundy', label:'Burgundia', accent:'#b02a37', navy:'#5e1d27', navy2:'#4a141d', navy3:'#74303c' },
        { id:'blue',     label:'Sinine',    accent:'#2563eb', navy:'#1e3a8a', navy2:'#1e3799', navy3:'#1d4ed8' },
        { id:'teal',     label:'Roheline',  accent:'#0d9488', navy:'#134e4a', navy2:'#0f3d3a', navy3:'#1a5c58' },
        { id:'violet',   label:'Lilla',     accent:'#7c3aed', navy:'#3b1a6b', navy2:'#2e1357', navy3:'#552a9e' },
        { id:'emerald',  label:'Smaragd',   accent:'#16a34a', navy:'#064e3b', navy2:'#053d2f', navy3:'#0a6b52' },
        { id:'slate',    label:'Hallsinine',accent:'#475569', navy:'#1e293b', navy2:'#0f172a', navy3:'#334155' },
      ];
      function _presetLabel(hex) {
        return (COLOR_PRESETS_LOCAL.find(p => p.accent === hex) || {}).label || 'Kohandatud';
      }

      // Preset swatch clicks
      apForm.querySelectorAll('.color-swatch').forEach(sw => {
        sw.addEventListener('click', () => {
          apForm.querySelectorAll('.color-swatch').forEach(s => {
            s.classList.remove('selected');
            s.innerHTML = '';
          });
          sw.classList.add('selected');
          sw.innerHTML = '<span style="width:10px;height:10px;border-radius:50%;background:#fff;display:block;margin:auto;opacity:.9"></span>';
          const accent = sw.dataset.accent;
          document.getElementById('ap-accent').value  = accent;
          document.getElementById('ap-navy').value    = sw.dataset.navy;
          document.getElementById('ap-navy2').value   = sw.dataset.navy2;
          document.getElementById('ap-navy3').value   = sw.dataset.navy3;
          document.getElementById('ap-custom-color').value = accent;
          document.getElementById('ap-custom-hex').value   = accent;
          // update label next to swatches
          const lbl = sw.parentElement?.querySelector('span:last-child');
          if (lbl) lbl.textContent = _presetLabel(accent);
          apUpdatePreview();
        });
      });

      function _deselectSwatches() {
        apForm.querySelectorAll('.color-swatch').forEach(s => { s.classList.remove('selected'); s.innerHTML = ''; });
        const lbl = apForm.querySelector('.color-swatch')?.parentElement?.querySelector('span:last-child');
        if (lbl) lbl.textContent = 'Kohandatud';
      }

      // Custom color picker
      document.getElementById('ap-custom-color')?.addEventListener('input', (e) => {
        const hex = e.target.value;
        document.getElementById('ap-custom-hex').value = hex;
        document.getElementById('ap-accent').value = hex;
        _deselectSwatches();
        apUpdatePreview();
      });
      document.getElementById('ap-custom-hex')?.addEventListener('input', (e) => {
        const hex = e.target.value;
        if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
          document.getElementById('ap-custom-color').value = hex;
          document.getElementById('ap-accent').value = hex;
          _deselectSwatches();
          apUpdatePreview();
        }
      });

      // System name / org live preview
      document.getElementById('ap-sysname')?.addEventListener('input', apUpdatePreview);
      document.getElementById('ap-orgname')?.addEventListener('input', apUpdatePreview);

      // ── Logo upload with inline resize ──
      let _logoResizeImg = null;

      function _drawResizeCanvas() {
        if (!_logoResizeImg) return;
        const slider = document.getElementById('ap-resize-slider');
        const maxW = parseInt(slider.value);
        const img  = _logoResizeImg;
        const scale = Math.min(maxW / img.width, maxW / img.height, 1);
        const w = Math.max(1, Math.round(img.width  * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.getElementById('ap-resize-canvas');
        canvas.width  = w;
        canvas.height = h;
        canvas.style.width  = Math.min(w, 180) + 'px';
        canvas.style.height = Math.min(h, 180) + 'px';
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const outEl = document.getElementById('ap-resize-out');
        const valEl = document.getElementById('ap-resize-slider-val');
        if (outEl) outEl.textContent = w + '×' + h + ' px';
        if (valEl) valEl.textContent = maxW;
      }

      async function _doLogoUpload(dataUrl) {
        try {
          const res = await API.uploadLogo(dataUrl);
          self._settings = res.settings;
          const newA = res.settings.appearance || {};
          App.state.appearance = newA;
          App.applyAppearance(newA);
          localStorage.setItem('appearance', JSON.stringify(newA));
          App.renderSidebar();
          App.toast('ok', 'Logo üles laetud', '');
          self._renderSettings(container);
        } catch (err) {
          App.toast('bad', 'Logo laadimine ebaõnnestus', err.message);
        }
      }

      document.getElementById('ap-logo-input')?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();

        if (file.type === 'image/svg+xml') {
          // SVG: read as dataURL and upload directly (no canvas resize)
          reader.onload = (ev) => _doLogoUpload(ev.target.result);
          reader.readAsDataURL(file);
          return;
        }

        // Raster image → show resize panel
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            _logoResizeImg = img;
            const origEl  = document.getElementById('ap-resize-orig');
            const slider  = document.getElementById('ap-resize-slider');
            if (origEl) origEl.textContent = img.width + '×' + img.height + ' px';
            if (slider) {
              slider.max   = Math.min(img.width, 512);
              slider.value = Math.min(img.width, 256);
            }
            _drawResizeCanvas();
            const panel = document.getElementById('ap-resize-panel');
            if (panel) panel.style.display = '';
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      });

      document.getElementById('ap-resize-slider')?.addEventListener('input', _drawResizeCanvas);

      document.getElementById('ap-resize-confirm')?.addEventListener('click', () => {
        const canvas = document.getElementById('ap-resize-canvas');
        if (!canvas) return;
        const dataUrl = canvas.toDataURL('image/png', 0.95);
        document.getElementById('ap-resize-panel').style.display = 'none';
        _logoResizeImg = null;
        _doLogoUpload(dataUrl);
      });

      document.getElementById('ap-resize-cancel')?.addEventListener('click', () => {
        document.getElementById('ap-resize-panel').style.display = 'none';
        _logoResizeImg = null;
        const inp = document.getElementById('ap-logo-input');
        if (inp) inp.value = '';
      });

      // Logo remove
      document.getElementById('ap-logo-remove')?.addEventListener('click', async () => {
        try {
          const res = await API.deleteLogo();
          self._settings = res.settings;
          const newA = res.settings.appearance || {};
          App.state.appearance = newA;
          App.applyAppearance(newA);
          localStorage.setItem('appearance', JSON.stringify(newA));
          App.renderSidebar();
          App.toast('ok', 'Logo eemaldatud', '');
          self._renderSettings(container);
        } catch (err) {
          App.toast('bad', 'Logo eemaldamine ebaõnnestus', err.message);
        }
      });

      // Appearance form submit
      apForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
          systemName:  document.getElementById('ap-sysname').value.trim()  || 'AD Kasutajahaldus',
          orgName:     document.getElementById('ap-orgname').value.trim()  || 'Viljandi Haigla',
          accentColor: document.getElementById('ap-accent').value,
          navyColor:   document.getElementById('ap-navy').value,
          navyColor2:  document.getElementById('ap-navy2').value,
          navyColor3:  document.getElementById('ap-navy3').value,
        };
        try {
          const res = await API.updateSettings('appearance', data);
          self._settings = res.settings;
          const newA = res.settings.appearance || {};
          App.state.appearance = newA;
          App.applyAppearance(newA);
          localStorage.setItem('appearance', JSON.stringify(newA));
          App.renderSidebar();
          App.toast('ok', 'Kujundus salvestatud', '');
        } catch (err) {
          App.toast('bad', 'Salvestamine ebaõnnestus', err.message);
        }
      });
    }

    // ── UI form ──
    const uiForm = document.getElementById('st-ui-form');
    if (uiForm) {
      uiForm.querySelectorAll('[data-prefix]').forEach(btn => {
        btn.addEventListener('click', () => {
          uiForm.querySelectorAll('[data-prefix]').forEach(b => b.classList.remove('primary'));
          btn.classList.add('primary');
          document.getElementById('su-prefix').value = btn.dataset.prefix;
        });
      });
      uiForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
          usernamePrefix: document.getElementById('su-prefix').value || '1',
          showManager:    document.getElementById('su-manager').checked,
        };
        await self._save('ui', data, container);
      });
    }

    // ── Services form ──
    document.getElementById('st-svc-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = { adAttribute: document.getElementById('sv-adattr').value.trim() || 'extensionAttribute1' };
      await self._save('services', data, container);
    });

    // ── Roles form ──
    document.getElementById('st-roles-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {
        hrGroup:    document.getElementById('sr-hrgroup').value.trim(),
        adminGroup: document.getElementById('sr-admingroup').value.trim(),
      };
      await self._save('roles', data, container);
    });

    // ── LDAP form ──
    document.getElementById('st-ldap-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {
        url:      document.getElementById('sl-url').value.trim(),
        port:     parseInt(document.getElementById('sl-port').value),
        tls:      document.getElementById('sl-tls').checked,
        baseDN:   document.getElementById('sl-basedn').value.trim(),
        usersOU:  document.getElementById('sl-usersou').value.trim(),
        bindDN:   document.getElementById('sl-binddn').value.trim(),
        bindPass: document.getElementById('sl-bindpass').value,
        timeout:  parseInt(document.getElementById('sl-timeout').value)||5000,
      };
      await self._save('ldap', data, container);
    });
    document.getElementById('sl-test')?.addEventListener('click', async () => {
      const res = document.getElementById('sl-test-result');
      res.textContent = 'Testin…';
      try {
        const r = await API.testLdap({
          bindDN:   document.getElementById('sl-binddn').value.trim(),
          bindPass: document.getElementById('sl-bindpass').value,
        });
        res.className = 'badge ok'; res.textContent = r.message;
      } catch (err) {
        res.className = 'badge bad'; res.textContent = err.message;
      }
    });

    // ── Email form ──
    document.getElementById('st-email-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {
        enabled:  document.getElementById('se-enabled').checked,
        host:     document.getElementById('se-host').value.trim(),
        port:     parseInt(document.getElementById('se-port').value)||587,
        secure:   document.getElementById('se-secure').checked,
        user:     document.getElementById('se-user').value.trim(),
        pass:     document.getElementById('se-pass').value,
        fromName: document.getElementById('se-fromname').value.trim(),
        from:     document.getElementById('se-from').value.trim(),
      };
      await self._save('email', data, container);
    });
    document.getElementById('se-test')?.addEventListener('click', async () => {
      const res = document.getElementById('se-test-result');
      res.textContent = 'Testin…';
      try {
        const r = await API.testEmail();
        res.className = r.ok ? 'badge ok' : 'badge warn';
        res.textContent = r.message;
      } catch (err) {
        res.className = 'badge bad'; res.textContent = err.message;
      }
    });

    // ── SMS form ──
    document.getElementById('st-sms-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {
        enabled:   document.getElementById('ss-enabled').checked,
        provider:  document.getElementById('ss-provider').value,
        from:      document.getElementById('ss-from').value.trim(),
        apiKey:    document.getElementById('ss-key').value,
        apiSecret: document.getElementById('ss-secret').value,
      };
      await self._save('sms', data, container);
    });

    // ── Template form ──
    document.getElementById('st-tmpl-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const chan = document.getElementById('st-chan').value;
      const key  = document.getElementById('st-key').value;
      const tplData = {
        enabled: document.getElementById('st-enabled').checked,
        body:    document.getElementById('st-body').value,
      };
      if (chan === 'email') {
        tplData.subject = document.getElementById('st-subject')?.value?.trim() || '';
      }
      await self._save('templates', { [chan]: { [key]: tplData } }, container);
    });

    // ── Log tab ──
    document.getElementById('st-log-export')?.addEventListener('click', () => {
      if (self._exportLog) self._exportLog();
    });
  },

  async _save(section, data, container) {
    try {
      const res = await API.updateSettings(section, data);
      this._settings = res.settings;
      App.toast('ok','Seaded salvestatud', section + ' uuendatud');
    } catch (err) {
      App.toast('bad','Salvestamine ebaõnnestus', err.message);
    }
  },
};
