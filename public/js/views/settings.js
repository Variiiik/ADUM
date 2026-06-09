/* Settings view — LDAP, Email, SMS, Templates */
'use strict';

Views.Settings = {
  _tab: 'ldap',
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
      { id:'ldap',      label:'LDAP liidestus',  ic:'sliders'   },
      { id:'email',     label:'E-posti seaded',  ic:'mail'      },
      { id:'sms',       label:'SMS liidestus',   ic:'phone'     },
      { id:'templates', label:'Kirja mallid',    ic:'briefcase' },
      { id:'log',       label:'Süsteemi logi',   ic:'audit'     },
    ];

    let body = '';
    if (tab === 'ldap') {
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
      const tt   = this._tmplTab;
      const TMPL_TABS = [
        { id:'welcome',        label:'Tervitusmeil'    },
        { id:'passwordReset',  label:'Parooli lähtestamine' },
        { id:'accountDisabled',label:'Konto keelamine' },
        { id:'accountEnabled', label:'Konto lubamine'  },
      ];
      const VARS = {
        welcome:         ['{{displayName}}','{{username}}','{{password}}','{{department}}'],
        passwordReset:   ['{{displayName}}','{{username}}','{{password}}'],
        accountDisabled: ['{{displayName}}','{{username}}'],
        accountEnabled:  ['{{displayName}}','{{username}}'],
      };
      const cur = tmpl[tt] || { subject:'', body:'' };
      body = `
        <div class="template-tabs">
          ${TMPL_TABS.map(t=>`<button class="tmpl-tab${t.id===tt?' active':''}" data-tmpl="${t.id}">${esc(t.label)}</button>`).join('')}
        </div>
        <form id="st-tmpl-form">
          <div style="margin-bottom:12px">
            <div class="hint" style="margin-bottom:8px">Saadaolevad muutujad:</div>
            <div class="vars-hint">
              ${(VARS[tt]||[]).map(v=>`<span class="var-chip">${esc(v)}</span>`).join('')}
            </div>
          </div>
          <div class="settings-section">
            <div class="field" style="margin-bottom:14px">
              <label>Teema (Subject)</label>
              <input class="input" id="st-subject" value="${esc(cur.subject||'')}" placeholder="Kirja teema" />
            </div>
            <div class="field">
              <label>Kirja sisu (Body)</label>
              <textarea class="textarea" id="st-body" rows="12" placeholder="Kirja sisu…">${esc(cur.body||'')}</textarea>
              <span class="hint">Kasutage muutujaid nagu {{displayName}} dünaamilise sisu jaoks.</span>
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

    // Template sub-tabs
    container.querySelectorAll('[data-tmpl]').forEach(btn => {
      btn.addEventListener('click', () => { self._tmplTab = btn.dataset.tmpl; self._renderSettings(container); });
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
      const data = {
        [self._tmplTab]: {
          subject: document.getElementById('st-subject').value.trim(),
          body:    document.getElementById('st-body').value,
        }
      };
      await self._save('templates', data, container);
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
