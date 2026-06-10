/* Users list + Create/Edit form */
'use strict';

Views.Users = {
  _state: { users:[], groups:[], departments:[], ous:[], q:'', dept:'', status:'', page:1, sel:new Set(), sort:'displayName' },
  _requestMode: false, // set true by Requests view when HR clicks "Esita uus taotlus"

  async render(container, params) {
    const s = this._state;
    // Reset filters on every navigation; explicit params override the reset
    s.q      = params?.q      || '';
    s.status = params?.status || '';
    s.dept   = params?.dept   || '';
    s.page   = 1;
    s.sel    = new Set();
    if (params?.new) {
      this._renderList(container, []);
      this.openForm(null, container, this._requestMode);
      this._requestMode = false;
      return;
    }

    container.innerHTML = `<div class="content-inner"><div style="text-align:center;padding:60px"><div class="spinner" style="margin:auto"></div></div></div>`;

    try {
      const [usersRes, groupsRes] = await Promise.all([API.getUsers(), API.getGroups().catch(()=>({groups:[]}))]);

      s.users  = usersRes.users  || [];
      s.groups = groupsRes.groups || [];
      const depts = [...new Set(s.users.map(u=>u.department).filter(Boolean))].sort();
      const ous   = [...new Set(s.users.map(u=>u.ou).filter(Boolean))];
      s.departments = depts;
      s.ous = ous;
    } catch (err) {
      container.innerHTML = `<div class="content-inner"><div class="empty">${icon('alert')}<div>${esc(err.message)}</div></div></div>`;
      return;
    }
    this._renderList(container, s.users);
  },

  _renderList(container, users) {
    const s       = this._state;
    const isAdmin = !!(App.state.user?.isAdmin);
    const PER = 12;

    const filtered = (users||s.users).filter(u => {
      if (s.q) {
        const q = s.q.toLowerCase();
        if (!(u.displayName?.toLowerCase().includes(q) || u.sam?.toLowerCase().includes(q) || u.mail?.toLowerCase().includes(q))) return false;
      }
      if (s.dept   && u.department !== s.dept)   return false;
      if (s.status && u.status     !== s.status) return false;
      return true;
    });

    const pages    = Math.max(1, Math.ceil(filtered.length / PER));
    s.page         = Math.min(s.page, pages);
    const pageItems = filtered.slice((s.page-1)*PER, s.page*PER);
    const allSel   = pageItems.length > 0 && pageItems.every(u => s.sel.has(u.sam));

    container.innerHTML = `<div class="content-inner">
      <div class="toolbar">
        <div class="filters">
          <div class="filter-search">
            ${icon('search',16)}
            <input id="ul-search" placeholder="Otsi nime, kasutajanime, e-posti…" value="${esc(s.q)}" autocomplete="off" />
          </div>
          <select class="select sel-sm" id="ul-dept">
            <option value="">Kõik osakonnad</option>
            ${s.departments.map(d=>`<option value="${esc(d)}"${s.dept===d?' selected':''}>${esc(d)}</option>`).join('')}
          </select>
          <select class="select sel-sm" id="ul-status">
            <option value="">Kõik olekud</option>
            <option value="active"${s.status==='active'?' selected':''}>Aktiivne</option>
            <option value="disabled"${s.status==='disabled'?' selected':''}>Keelatud</option>
            <option value="locked"${s.status==='locked'?' selected':''}>Lukustatud</option>
          </select>
          ${(s.q||s.dept||s.status)?`<button class="btn ghost sm" id="ul-clear">${icon('x',14)} Tühjenda</button>`:''}
        </div>
        <div style="flex:1"></div>
        <button class="btn primary" id="ul-new">
          ${icon(isAdmin ? 'plus' : 'clipboard', 16)} ${isAdmin ? 'Uus kasutaja' : 'Esita konto taotlus'}
        </button>
      </div>

      ${isAdmin && s.sel.size > 0 ? `<div class="bulkbar">
        <span class="ct">${s.sel.size} valitud</span>
        <span class="sp"></span>
        <button class="btn" id="bulk-enable">${icon('checkCircle',15)} Luba</button>
        <button class="btn" id="bulk-disable">${icon('ban',15)} Keela</button>
        <button class="btn danger" id="bulk-delete">${icon('trash',15)} Kustuta</button>
      </div>` : ''}

      <div class="card">
        <div class="tbl-wrap">
          <table class="tbl">
            <thead>
              <tr>
                ${isAdmin ? `<th style="width:40px">${checkbox(allSel)}</th>` : ''}
                <th>Kuvatav nimi</th>
                <th>Kasutajanimi</th>
                <th>Osakond</th>
                <th>Ametinimetus</th>
                <th>Olek</th>
                <th>Viimane sisselogimine</th>
                ${isAdmin ? '<th style="width:130px;text-align:right">Toimingud</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${pageItems.length === 0 ? `<tr><td colspan="${isAdmin?8:6}" class="loading-row">
                <div class="empty" style="padding:40px">
                  ${icon('search',40)}<div>Ühtegi kasutajat ei leitud.</div>
                </div></td></tr>` :
                pageItems.map(u => `<tr data-sam="${esc(u.sam)}${s.sel.has(u.sam)?' class="selected"':''}">
                  ${isAdmin ? `<td><div class="cbx-cell">${checkbox(s.sel.has(u.sam))}</div></td>` : ''}
                  <td>
                    <div class="cell-user" style="cursor:pointer" data-action="open">
                      ${avatar(u, 34)}
                      <div>
                        <div class="nm">${esc(u.displayName)}</div>
                        <div class="sub">${esc(u.mail)}</div>
                      </div>
                    </div>
                  </td>
                  <td><span class="mono">${esc(u.sam)}</span></td>
                  <td>${esc(u.department)}</td>
                  <td class="muted">${esc(u.title)}</td>
                  <td>${statusBadge(u.status)}</td>
                  <td class="muted">${esc(fmtDate(u.lastLogon))}</td>
                  ${isAdmin ? `<td>
                    <div class="row-actions">
                      <button class="icon-act" title="Muuda" data-action="edit">${icon('edit',16)}</button>
                      <button class="icon-act" title="Lähtesta parool" data-action="reset">${icon('key',16)}</button>
                      <button class="icon-act" title="${u.status==='disabled'?'Luba':'Keela'}" data-action="toggle">
                        ${icon(u.status==='disabled'?'checkCircle':'ban',16)}
                      </button>
                      <button class="icon-act danger" title="Kustuta" data-action="delete">${icon('trash',16)}</button>
                    </div>
                  </td>` : ''}
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${filtered.length > 0 ? `<div class="pager">
          <span>Näitan ${(s.page-1)*PER+1}–${Math.min(s.page*PER,filtered.length)} / ${filtered.length}</span>
          <div class="pages">
            <button class="pg" ${s.page===1?'disabled':''} id="pg-prev">${icon('chevronL',14)}</button>
            ${Array.from({length:Math.min(pages,7)},(_,i)=>i+1).map(p=>`<button class="pg${p===s.page?' active':''}" data-pg="${p}">${p}</button>`).join('')}
            <button class="pg" ${s.page===pages?'disabled':''} id="pg-next">${icon('chevron',14)}</button>
          </div>
        </div>` : ''}
      </div>
    </div>`;

    // ── Events ──
    const self = this;

    document.getElementById('ul-search').addEventListener('input', (e) => { s.q = e.target.value; s.page=1; self._renderList(container); });
    document.getElementById('ul-dept').addEventListener('change', (e) => { s.dept = e.target.value; s.page=1; self._renderList(container); });
    document.getElementById('ul-status').addEventListener('change', (e) => { s.status = e.target.value; s.page=1; self._renderList(container); });
    document.getElementById('ul-clear')?.addEventListener('click', () => { s.q=''; s.dept=''; s.status=''; s.page=1; self._renderList(container); });
    document.getElementById('ul-new').addEventListener('click', () => self.openForm(null, container, !isAdmin));

    document.getElementById('pg-prev')?.addEventListener('click', () => { s.page--; self._renderList(container); });
    document.getElementById('pg-next')?.addEventListener('click', () => { s.page++; self._renderList(container); });
    container.querySelectorAll('.pg[data-pg]').forEach(btn => {
      btn.addEventListener('click', () => { s.page = parseInt(btn.dataset.pg); self._renderList(container); });
    });

    if (isAdmin) {
      // Checkbox header
      container.querySelector('thead .checkbox')?.addEventListener('click', () => {
        if (allSel) pageItems.forEach(u => s.sel.delete(u.sam));
        else pageItems.forEach(u => s.sel.add(u.sam));
        self._renderList(container);
      });
    }

    // Row events
    container.querySelectorAll('tbody tr[data-sam]').forEach(row => {
      const sam = row.dataset.sam;
      if (isAdmin) {
        row.querySelector('.cbx-cell .checkbox')?.addEventListener('click', (e) => {
          e.stopPropagation();
          s.sel.has(sam) ? s.sel.delete(sam) : s.sel.add(sam);
          self._renderList(container);
        });
      }
      row.querySelector('[data-action="open"]')?.addEventListener('click', () => App.navigate('userDetail', { sam }));
      if (isAdmin) {
        row.querySelector('[data-action="edit"]')?.addEventListener('click', () => {
          const u = s.users.find(x => x.sam === sam);
          if (u) self.openForm(u, container);
        });
        row.querySelector('[data-action="reset"]')?.addEventListener('click', () => self.doResetPassword(sam));
        row.querySelector('[data-action="toggle"]')?.addEventListener('click', () => self.doToggle(sam, container));
        row.querySelector('[data-action="delete"]')?.addEventListener('click', () => self.doDelete(sam, container));
      }
    });

    // Bulk actions (admin only)
    document.getElementById('bulk-enable')?.addEventListener('click', () => self.doBulk('enable', [...s.sel], container));
    document.getElementById('bulk-disable')?.addEventListener('click', () => self.doBulk('disable', [...s.sel], container));
    document.getElementById('bulk-delete')?.addEventListener('click', () => self.doBulk('delete', [...s.sel], container));
  },

  // ─── Form (create / edit / submit request) ────────────────────
  async openForm(user, container, requestMode) {
    const isEdit    = !!user;
    const isRequest = !isEdit && !!requestMode;
    const ovl       = document.getElementById('overlay');

    const TITLES = {
      'Kardioloogia':['Kardioloog','Vanemõde','Õde','Resident'],
      'Kiirabi':['Kiirabiarst','Parameedik','Erakorralise meditsiini õde'],
      'Radioloogia':['Radioloog','Radioloogiatehnik','Vanemõde'],
      'IT-osakond':['Süsteemiadministraator','IT-tugispetsialist','Arendaja','IT-juht'],
      'Kirurgia':['Kirurg','Operatsiooniõde','Vanemõde','Resident'],
      'Pediaatria':['Lastearst','Lasteõde','Vanemõde'],
      'Neuroloogia':['Neuroloog','Õde','Resident'],
      'Sünnitusosakond':['Günekoloog','Ämmaemand','Vanemõde'],
      'Apteek':['Proviisor','Farmatseut','Apteegijuht'],
      'Laboratoorium':['Laboriarst','Laborant','Bioanalüütik'],
      'Personaliosakond':['Personalijuht','Personalispetsialist'],
      'Anestesioloogia':['Anestesioloog','Anesteesiaõde','Resident'],
      'Onkoloogia':['Onkoloog','Õde','Vanemõde'],
    };

    const allUsers  = this._state.users;
    const allGroups = this._state.groups;

    // ── Async init: settings, OU tree, domains ──
    let domains      = ['varik.local'];
    let uiSettings   = { usernamePrefix: '1', showManager: true };
    let ouTreeData   = null;
    let smsEnabled   = false;

    try {
      const [cfgRes, settingsRes, ousRes] = await Promise.all([
        API.getConfig(),
        API.getSettings(),
        API.getOus(),
      ]);
      domains    = cfgRes.domains || domains;
      uiSettings = { ...uiSettings, ...(settingsRes.settings?.ui || {}) };
      smsEnabled = !!(settingsRes.settings?.sms?.enabled);
      ouTreeData = ousRes.tree || null;
    } catch { /* use defaults */ }

    const defDomain        = domains[0];
    const existingMailDomain = user?.mail?.split('@')[1] || defDomain;
    const existingMailUser   = user?.mail?.split('@')[0] || '';
    const prefixMode         = uiSettings.usernamePrefix || '1';
    const showManager        = uiSettings.showManager !== false;

    // ── Transliteration ──
    const translit = s => String(s).toLowerCase()
      .replace(/õ/g,'o').replace(/ä/g,'a').replace(/ö/g,'o')
      .replace(/ü/g,'u').replace(/š/g,'s').replace(/ž/g,'z').replace(/[^a-z]/g,'');

    function getPrefix(fn) {
      const t = translit(fn);
      if (prefixMode === '2')    return t.slice(0, 2);
      if (prefixMode === 'full') return t;
      return t[0] || '';
    }

    // ── OU tree renderer ──
    const FOLDER_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
    const DOT_ICON    = `<svg width="7" height="7" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="5"/></svg>`;

    function renderOuNode(node, depth, selDn, isRoot) {
      if (!node) return '';
      const hasKids = Array.isArray(node.children) && node.children.length > 0;
      const isSel   = selDn && node.dn.toLowerCase() === selDn.toLowerCase();
      const pad     = depth * 18;

      if (isRoot) {
        return `<div class="ou-node">
          <div class="ou-row ou-root-row" style="padding-left:${pad}px">
            <button type="button" class="ou-toggle open">${icon('chevron',12)}</button>
            ${icon('building',14)}
            <span class="ou-label">${esc(node.name)}</span>
          </div>
          <div class="ou-kids open">
            ${(node.children||[]).map(c=>renderOuNode(c, depth+1, selDn, false)).join('')}
          </div>
        </div>`;
      }

      return `<div class="ou-node">
        <div class="ou-row${isSel?' sel':''}" style="padding-left:${pad}px" data-dn="${esc(node.dn)}">
          ${hasKids
            ? `<button type="button" class="ou-toggle">${icon('chevron',12)}</button>`
            : `<span class="ou-leaf">${DOT_ICON}</span>`}
          <span class="ou-icon" style="color:${isSel?'var(--accent)':'var(--ink-3)'};display:flex;align-items:center;flex-shrink:0">${FOLDER_ICON}</span>
          <span class="ou-label">${esc(node.name)}</span>
        </div>
        ${hasKids ? `<div class="ou-kids">
          ${(node.children||[]).map(c=>renderOuNode(c, depth+1, selDn, false)).join('')}
        </div>` : ''}
      </div>`;
    }

    const buildTitleField = (opts, dept, currentTitle) => {
      const userTitles  = allUsers.filter(u => u.department === dept && u.title).map(u => u.title);
      const suggestions = [...new Set([...opts, ...userTitles])].filter(Boolean).sort();
      return `
        <input class="input" id="f-title-custom" list="title-datalist"
          placeholder="Kirjuta või vali ametinimetus"
          value="${esc(currentTitle||'')}" autocomplete="off" />
        <datalist id="title-datalist">
          ${suggestions.map(t=>`<option value="${esc(t)}">`).join('')}
        </datalist>`;
    };

    const initOuDn   = user?.ou || '';
    const initDept   = user?.department || '';
    const ouTreeHtml = ouTreeData
      ? renderOuNode(ouTreeData, 0, initOuDn, true)
      : `<div class="ou-empty">OU struktuur pole saadaval</div>`;

    const prefixLabels = { '1':'1 täht (m.tamm)', '2':'2 tähte (ma.tamm)', 'full':'Täis eesnimi (mari.tamm)' };

    ovl.innerHTML = `
      <div class="scrim" id="form-scrim"></div>
      <div class="drawer" role="dialog" aria-modal="true">
        <div class="drawer-head">
          <div class="qa-ic">${icon(isEdit?'edit':isRequest?'clipboard':'userPlus',18)}</div>
          <div style="flex:1">
            <h2>${isEdit ? 'Muuda kasutajat' : isRequest ? 'Esita konto taotlus' : 'Uus kasutaja'}</h2>
            <div class="sub">${isEdit ? esc(user.displayName)+' · '+esc(user.sam) : isRequest ? 'Taotlus saadetakse administraatorile kinnitamiseks' : 'Loo uus Active Directory konto'}</div>
          </div>
          <button class="x-btn" id="form-close">${icon('x',18)}</button>
        </div>
        <div class="drawer-body">
          <div class="form-grid">

            <!-- ══ Isikuandmed ══ -->
            <div class="form-sec-title">Isikuandmed</div>
            <div class="field full">
              <label>Dokumendi NR / Ringkäigu lehe NR</label>
              <input class="input mono" id="f-docnr" value="${esc(user?.employeeNumber||'')}" placeholder="D-2024-001" autocomplete="off" />
            </div>
            <div class="field">
              <label>Eesnimi <span class="req">*</span></label>
              <input class="input" id="f-first" value="${esc(user?.givenName||'')}" placeholder="Mari" autocomplete="off" />
            </div>
            <div class="field">
              <label>Perekonnanimi <span class="req">*</span></label>
              <input class="input" id="f-last" value="${esc(user?.sn||'')}" placeholder="Tamm" autocomplete="off" />
            </div>
            <div class="field full">
              <label>Kuvatav nimi</label>
              <input class="input" id="f-display" value="${esc(user?.displayName||'')}" placeholder="Mari Tamm" />
              <span class="hint">Genereeritakse automaatselt.</span>
            </div>

            <!-- ══ Konto ══ -->
            <div class="form-sec-title">Konto</div>
            <div class="field">
              <label>Kasutajanimi (sAMAccountName) <span class="req">*</span></label>
              <input class="input mono" id="f-sam" value="${esc(user?.sam||'')}" ${isEdit?'readonly':''} placeholder="m.tamm" autocomplete="off" />
              ${!isEdit ? `<span class="hint">Vorming: ${esc(prefixLabels[prefixMode]||prefixMode)}</span>` : ''}
            </div>
            <div class="field">
              <label>Töötaja ID</label>
              <input class="input mono" id="f-empid" value="${esc(user?.employeeID||'')}" placeholder="EMP1234" autocomplete="off" />
            </div>
            <div class="field full">
              <label>E-post <span class="req">*</span></label>
              <div style="display:flex;gap:6px;align-items:center">
                <input class="input mono" id="f-mailuser" value="${esc(existingMailUser)}"
                  placeholder="m.tamm" style="flex:1" autocomplete="off" />
                <span style="color:var(--ink-3);font-size:15px;flex-shrink:0;padding:0 2px">@</span>
                <select class="select" id="f-domain" style="flex:1;max-width:260px">
                  ${domains.map(d=>`<option value="${esc(d)}"${d===existingMailDomain?' selected':''}>${esc(d)}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="field full">
              <label>${isEdit ? 'Uus parool' : 'Esmane parool'} ${isEdit?'':'<span class="req">*</span>'}</label>
              <div class="input-group">
                <input class="input mono" id="f-pass" type="text"
                  placeholder="${isEdit?'Jäta tühjaks muutmata jätmiseks':'••••••••••••'}" />
                <button class="btn" id="f-gen">${icon('refresh',15)} Genereeri</button>
              </div>
              <div class="pwbar" id="f-pwbar"></div>
              <span class="hint" id="f-pwhint"></span>
            </div>
            <div class="field">
              <label>Telefon</label>
              <input class="input" id="f-phone" value="${esc(user?.telephoneNumber||'')}" placeholder="+372 5000 0000" autocomplete="off" />
            </div>
            ${!isEdit ? `<div class="field">
              <label style="visibility:hidden">SMS</label>
              <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border:1px solid var(--border);border-radius:9px;background:var(--surface-2);height:100%">
                <div style="flex:1">
                  <div style="font-weight:600;font-size:13px">Saada parool SMS-iga</div>
                  ${smsEnabled
                    ? '<div class="hint">Saadetakse telefoninumbrile</div>'
                    : '<div class="hint" style="color:var(--warn-ink)">SMS pole seadistatud</div>'}
                </div>
                <label class="switch">
                  <input type="checkbox" id="f-sms" ${!smsEnabled?'disabled':''} />
                  <span class="track"></span>
                </label>
              </div>
            </div>` : ''}

            <!-- ══ Organisatsioon ══ -->
            <div class="form-sec-title">Organisatsioon</div>
            <div class="field full">
              <label>AD asukoht <span class="req">*</span></label>
              <div class="ou-selected-info" id="f-ou-info" style="${initDept?'':'display:none'}">
                ${icon('briefcase',13)} Osakond: <strong id="f-ou-dept-name">${esc(initDept)}</strong>
                <span style="color:var(--ink-3);font-size:11px;margin-left:8px" id="f-ou-path-short"></span>
              </div>
              <div class="ou-tree-wrap" id="f-ou-tree">
                ${ouTreeHtml}
              </div>
              <span class="hint">Vali OU, kuhu kasutaja luuakse. Osakond täidetakse automaatselt.</span>
            </div>
            <!-- Peidetud väljad vormi jaoks -->
            <input type="hidden" id="f-ou" value="${esc(initOuDn)}" />
            <input type="hidden" id="f-dept" value="${esc(initDept)}" />

            <div class="field full">
              <label>Ametinimetus</label>
              <div id="f-title-wrap">
                ${buildTitleField(TITLES[initDept]||[], initDept, user?.title||'')}
              </div>
            </div>
            ${showManager ? `<div class="field full" id="f-manager-field">
              <label>Juht</label>
              <select class="select" id="f-manager">
                <option value="">— Puudub —</option>
                ${allUsers.filter(u=>u.sam!==user?.sam).map(u=>`<option value="${esc(u.displayName)}"${user?.manager===u.displayName?' selected':''}>${esc(u.displayName)}</option>`).join('')}
              </select>
            </div>` : ''}

            <!-- ══ Grupikuuluvused ══ -->
            ${allGroups.length ? `<div class="field full">
              <label>Grupikuuluvused</label>
              <div style="display:flex;flex-wrap:wrap;gap:8px;padding:10px;border:1px solid var(--border);border-radius:9px;background:var(--surface-2);max-height:160px;overflow-y:auto" id="f-groups-wrap">
                ${allGroups.map(g => {
                  const checked = user ? user.groups?.includes(g.name) : g.name === 'Haigla-Kõik';
                  const locked  = g.name === 'Haigla-Kõik';
                  return `<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:${locked?'default':'pointer'};min-width:160px">
                    <input type="checkbox" data-group="${esc(g.name)}" ${checked?'checked':''} ${locked?'disabled':''} />
                    <span>${esc(g.name)}</span>
                    ${locked?'<span style="font-size:11px;color:var(--ink-3)">(alati)</span>':''}
                  </label>`;
                }).join('')}
              </div>
            </div>` : ''}

            <!-- ══ Konto olek ══ -->
            <div class="field full">
              <label>Konto olek</label>
              <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border:1px solid var(--border);border-radius:9px;background:var(--surface-2)">
                <div>
                  <div style="font-weight:600;font-size:13.5px" id="f-enabled-lbl">${(user?.status||'active')!=='disabled' ? 'Konto lubatud' : 'Konto keelatud'}</div>
                  <div class="hint">${(user?.status||'active')!=='disabled' ? 'Kasutaja saab sisse logida' : 'Sisselogimine on blokeeritud'}</div>
                </div>
                <label class="switch">
                  <input type="checkbox" id="f-enabled" ${(user?.status||'active')!=='disabled'?'checked':''} />
                  <span class="track"></span>
                </label>
              </div>
            </div>

          </div>
        </div>
        <div class="drawer-foot">
          <span class="sp"></span>
          <button class="btn" id="form-cancel">Loobu</button>
          <button class="btn primary" id="form-save">${icon(isRequest?'clipboard':'check',16)} ${isEdit?'Salvesta muudatused':isRequest?'Saada taotlus':'Loo kasutaja'}</button>
        </div>
      </div>`;

    const self  = this;
    const close = () => { ovl.innerHTML = ''; };
    document.getElementById('form-scrim').addEventListener('click', close);
    document.getElementById('form-close').addEventListener('click', close);
    document.getElementById('form-cancel').addEventListener('click', close);

    // ── Auto-generate name / username ──
    let autoDisplay = !isEdit, autoSam = !isEdit, autoMailUser = !isEdit;

    function syncName() {
      const fn = document.getElementById('f-first').value;
      const ln = document.getElementById('f-last').value;
      if (autoDisplay) document.getElementById('f-display').value = [fn, ln].filter(Boolean).join(' ');
      if (autoSam && fn && ln) {
        const u = getPrefix(fn) + '.' + translit(ln);
        document.getElementById('f-sam').value = u.slice(0, 20);
        if (autoMailUser) document.getElementById('f-mailuser').value = u.slice(0, 20);
      }
    }

    document.getElementById('f-first').addEventListener('input', syncName);
    document.getElementById('f-last').addEventListener('input', syncName);
    document.getElementById('f-display').addEventListener('input', () => { autoDisplay = false; });
    document.getElementById('f-sam').addEventListener('input', () => { autoSam = false; if (!isEdit) autoMailUser = false; });
    document.getElementById('f-mailuser')?.addEventListener('input', () => { autoMailUser = false; });

    // ── Password ──
    document.getElementById('f-pass').addEventListener('input', (e) => {
      const pw  = e.target.value;
      const bar = document.getElementById('f-pwbar');
      const hint = document.getElementById('f-pwhint');
      let s = 0;
      if (pw.length>=8) s++; if (pw.length>=12) s++;
      if (/[A-Z]/.test(pw)&&/[a-z]/.test(pw)) s++;
      if (/[0-9]/.test(pw)) s++;
      if (/[^A-Za-z0-9]/.test(pw)) s++;
      const cols = ['','var(--bad)','var(--warn)','var(--warn)','var(--accent)','var(--ok)'];
      const lbls = ['','Nõrk','Nõrk','Keskmine','Tugev','Väga tugev'];
      bar.innerHTML = pw ? `<i style="width:${Math.min(s,5)*20}%;background:${cols[s]}"></i>` : '';
      hint.textContent = pw ? 'Tugevus: ' + lbls[s] : '';
    });
    document.getElementById('f-gen').addEventListener('click', () => {
      const p = genPassword();
      document.getElementById('f-pass').value = p;
      document.getElementById('f-pass').dispatchEvent(new Event('input'));
    });

    // ── OU tree interactions ──
    const treeEl = document.getElementById('f-ou-tree');

    function setOuSelection(dn) {
      // Highlight selected row — reset all icons to neutral, set selected
      treeEl.querySelectorAll('.ou-row.sel').forEach(r => {
        r.classList.remove('sel');
        const ic = r.querySelector('.ou-icon');
        if (ic) ic.style.color = 'var(--ink-3)';
      });
      const row = treeEl.querySelector(`.ou-row[data-dn="${CSS.escape(dn)}"]`);
      if (row) {
        row.classList.add('sel');
        const ic = row.querySelector('.ou-icon');
        if (ic) ic.style.color = 'var(--accent)';
      }

      // Extract leaf OU name from DN (first part)
      const leafName = (dn.split(',')[0].split('=')[1] || '').trim();
      // Extract short path (first 2 OU segments)
      const ouParts = dn.split(',').filter(p=>p.toUpperCase().startsWith('OU=')).map(p=>p.split('=')[1]);
      const pathShort = ouParts.slice(0, 2).reverse().join(' › ');

      // Update hidden fields
      document.getElementById('f-ou').value   = dn;
      document.getElementById('f-dept').value = leafName;

      // Update info banner
      const info = document.getElementById('f-ou-info');
      info.style.display = '';
      document.getElementById('f-ou-dept-name').textContent = leafName;
      const pathEl = document.getElementById('f-ou-path-short');
      if (pathEl) pathEl.textContent = pathShort;

      // Update title suggestions
      document.getElementById('f-title-wrap').innerHTML =
        buildTitleField(TITLES[leafName]||[], leafName, '');

      // Remove invalid marker
      document.getElementById('f-ou-tree').classList.remove('invalid');
    }

    // Expand/collapse toggles
    treeEl.addEventListener('click', (e) => {
      const toggleBtn = e.target.closest('.ou-toggle');
      const rowEl     = e.target.closest('.ou-row[data-dn]');

      if (toggleBtn && !toggleBtn.closest('.ou-root-row')) {
        e.stopPropagation();
        const node     = toggleBtn.closest('.ou-node');
        const kidsEl   = node?.querySelector(':scope > .ou-kids');
        if (kidsEl) {
          const open = toggleBtn.classList.toggle('open');
          kidsEl.classList.toggle('open', open);
        }
        return;
      }

      if (rowEl && !rowEl.classList.contains('ou-root-row')) {
        if (e.target.closest('.ou-toggle')) return;
        const dn = rowEl.dataset.dn;
        if (dn) setOuSelection(dn);

        // Auto-expand children if this node has them
        const node   = rowEl.closest('.ou-node');
        const kidsEl = node?.querySelector(':scope > .ou-kids');
        const toggle = rowEl.querySelector('.ou-toggle');
        if (kidsEl && !toggle?.classList.contains('open')) {
          toggle?.classList.add('open');
          kidsEl.classList.add('open');
        }
      }
    });

    // If editing, pre-select the existing OU and expand its parents
    if (initOuDn && treeEl) {
      const row = treeEl.querySelector(`.ou-row[data-dn="${CSS.escape(initOuDn)}"]`);
      if (row) {
        row.classList.add('sel');
        // Expand parents
        let parent = row.parentElement;
        while (parent && parent !== treeEl) {
          if (parent.classList.contains('ou-kids')) {
            parent.classList.add('open');
            const toggle = parent.previousElementSibling?.querySelector('.ou-toggle');
            if (toggle) toggle.classList.add('open');
          }
          parent = parent.parentElement;
        }
      }
    }

    // ── Konto olek toggle ──
    document.getElementById('f-enabled').addEventListener('change', (e) => {
      document.getElementById('f-enabled-lbl').textContent = e.target.checked ? 'Konto lubatud' : 'Konto keelatud';
    });

    // ── Save ──
    document.getElementById('form-save').addEventListener('click', async () => {
      const fn      = document.getElementById('f-first').value.trim();
      const ln      = document.getElementById('f-last').value.trim();
      const sam     = document.getElementById('f-sam').value.trim();
      const musr    = document.getElementById('f-mailuser').value.trim();
      const domain  = document.getElementById('f-domain').value;
      const mail    = musr ? `${musr}@${domain}` : '';
      const pass    = document.getElementById('f-pass').value;
      const dept    = document.getElementById('f-dept').value;
      const ou      = document.getElementById('f-ou').value;
      const titleV  = document.getElementById('f-title-custom')?.value.trim() || '';
      const empid   = document.getElementById('f-empid')?.value.trim() || '';
      const docnr   = document.getElementById('f-docnr')?.value.trim() || '';
      const manager = document.getElementById('f-manager')?.value || '';
      const phone   = document.getElementById('f-phone')?.value.trim() || '';
      const enabled = document.getElementById('f-enabled').checked;
      const sendSms = !isEdit && !!(document.getElementById('f-sms')?.checked);

      // Collect selected groups
      const selGroups = [...document.querySelectorAll('[data-group]:checked')]
        .map(cb => cb.dataset.group);

      // Validation
      const missing = [];
      if (!fn)   missing.push('Eesnimi');
      if (!ln)   missing.push('Perekonnanimi');
      if (!sam)  missing.push('Kasutajanimi');
      if (!dept) missing.push('AD asukoht');
      if (!musr) missing.push('E-post');

      if (missing.length) {
        App.toast('warn', 'Kohustuslikud väljad puuduvad', missing.join(', '));
        if (!fn)   document.getElementById('f-first')?.classList.add('invalid');
        if (!ln)   document.getElementById('f-last')?.classList.add('invalid');
        if (!sam)  document.getElementById('f-sam')?.classList.add('invalid');
        if (!dept) document.getElementById('f-ou-tree')?.classList.add('invalid');
        if (!musr) document.getElementById('f-mailuser')?.classList.add('invalid');
        return;
      }
      if (!isEdit && pass.length < 8) {
        App.toast('warn','Parool liiga lühike','Vähemalt 8 tähemärki.');
        document.getElementById('f-pass')?.classList.add('invalid');
        return;
      }
      if (sendSms && !phone) {
        App.toast('warn','Telefoninumber puudub','SMS saatmiseks sisesta telefoninumber.');
        document.getElementById('f-phone')?.classList.add('invalid');
        return;
      }

      const btn = document.getElementById('form-save');
      btn.disabled = true;
      btn.textContent = 'Salvestamine…';

      try {
        if (isEdit) {
          await API.updateUser(sam, { givenName:fn, sn:ln, mail, department:dept, title:titleV,
            manager, ou, enabled, employeeID:empid||undefined, employeeNumber:docnr||undefined,
            telephoneNumber:phone||undefined });

          // Sync group membership
          const oldGroups = user.groups || [];
          const toAdd     = selGroups.filter(g => !oldGroups.includes(g));
          const toRemove  = oldGroups.filter(g => !selGroups.includes(g) && g !== 'Haigla-Kõik');
          await Promise.allSettled([
            ...toAdd.map(g => API.addToGroup(sam, g)),
            ...toRemove.map(g => API.removeFromGroup(sam, g)),
          ]);

          App.toast('ok', 'Kasutaja uuendatud', fn + ' ' + ln);
        } else if (isRequest) {
          // HR mode: submit a request instead of creating directly
          await API.submitRequest({
            username:sam, givenName:fn, sn:ln, mail, password:pass,
            department:dept, title:titleV, manager, ou, enabled,
            telephoneNumber:phone||undefined, employeeNumber:docnr||undefined, sendSms,
          });
          App.toast('ok', 'Taotlus esitatud', `${fn} ${ln} · ${sam} — ootel kinnitust`);
          close();
          App.navigate('requests');
          return;
        } else {
          const result = await API.createUser({
            username:sam, givenName:fn, sn:ln, mail, password:pass,
            department:dept, title:titleV, manager, ou, enabled,
            telephoneNumber:phone||undefined, employeeNumber:docnr||undefined, sendSms,
          });

          // Add to extra groups (Haigla-Kõik lisatakse serveris automaatselt)
          const extraGroups = selGroups.filter(g => g !== 'Haigla-Kõik');
          await Promise.allSettled(extraGroups.map(g => API.addToGroup(sam, g)));

          // SMS tagasiside
          if (sendSms) {
            const sms = result.sms;
            if (sms?.ok) {
              const msg = sms.simulated ? 'SMS simuleeritud (mock režiim)' : `Saadetud → ${phone}`;
              App.toast('ok', 'SMS saadetud', msg);
            } else {
              App.toast('warn', 'SMS saatmine ebaõnnestus', sms?.reason || 'Tundmatu viga');
            }
          }

          App.toast('ok', 'Kasutaja loodud', fn + ' ' + ln + ' · ' + sam);
        }
        close();
        if (container) await self.render(container, {});
      } catch (err) {
        App.toast('bad', 'Viga', err.message);
        btn.disabled = false;
        btn.innerHTML = `${icon(isRequest?'clipboard':'check',16)} ${isEdit?'Salvesta muudatused':isRequest?'Saada taotlus':'Loo kasutaja'}`;
      }
    });
  },

  // ─── Actions ───────────────────────────────────────────────────
  async doResetPassword(sam) {
    App.confirm(
      'Lähtesta parool',
      `Sisestage uus parool kasutajale "${sam}".`,
      async (pw) => {
        if (!pw || pw.length < 8) { App.toast('warn','Parool liiga lühike','Vähemalt 8 tähemärki.'); return; }
        try {
          await API.resetPassword(sam, pw);
          App.toast('ok','Parool lähtestatud', sam);
        } catch (err) { App.toast('bad','Viga', err.message); }
      },
      { icon:'key', danger:false, confirmLabel:'Lähtesta', cancelLabel:'Loobu',
        inputLabel:'Uus parool', inputType:'text', inputPlaceholder:'Uus parool', inputBtn:'Genereeri' }
    );
  },

  async doToggle(sam, container) {
    const u = this._state.users.find(x => x.sam === sam);
    if (!u) return;
    if (u.status === 'disabled') {
      try {
        await API.enableUser(sam);
        u.status = 'active';
        App.toast('ok','Konto lubatud', u.displayName);
        this._renderList(container);
      } catch (err) { App.toast('bad','Viga', err.message); }
    } else {
      await this._openServiceChecklist('disable', u, container);
    }
  },

  async doDelete(sam, container) {
    const u = this._state.users.find(x => x.sam === sam);
    if (!u) return;
    await this._openServiceChecklist('delete', u, container);
  },

  async _openServiceChecklist(action, u, container) {
    const self = this;
    let userSvcs = [], allSvcs = [];
    try {
      const [r1, r2] = await Promise.all([API.getUserServices(u.sam), API.getServices()]);
      userSvcs = r1.services  || [];
      allSvcs  = r2.services  || [];
    } catch { /* proceed without checklist data */ }

    Views.UserDetail._userSvcs  = userSvcs;
    Views.UserDetail._services  = allSvcs;

    if (action === 'disable') {
      Views.UserDetail._openDisableChecklist(u, () => {
        u.status = 'disabled';
        self._renderList(container);
      });
    } else {
      Views.UserDetail._openDeleteChecklist(u, () => {
        self._state.users = self._state.users.filter(x => x.sam !== u.sam);
        self._state.sel.delete(u.sam);
        App.toast('bad', 'Kasutaja kustutatud', u.displayName);
        self._renderList(container);
      });
    }
  },

  async doBulk(action, sams, container) {
    const labels = { enable:'Luba kontod', disable:'Keela kontod', delete:'Kustuta kontod' };
    App.confirm(`${labels[action]}?`,
      `${sams.length} kontot rakendatakse toiming "${action}". Kustutamine on pöördumatu.`,
      async () => {
        try {
          await Promise.all(sams.map(sam => {
            if (action==='enable')  return API.enableUser(sam);
            if (action==='disable') return API.disableUser(sam);
            if (action==='delete')  return API.deleteUser(sam);
          }));
          if (action==='delete') this._state.users = this._state.users.filter(u => !sams.includes(u.sam));
          else this._state.users.forEach(u => { if (sams.includes(u.sam)) u.status = action==='enable'?'active':'disabled'; });
          this._state.sel.clear();
          App.toast(action==='delete'?'bad':'ok', `${sams.length} kasutajat uuendatud`);
          this._renderList(container);
        } catch (err) { App.toast('bad','Viga', err.message); }
      },
      { icon: action==='delete'?'trash':'ban', confirmLabel: labels[action] }
    );
  },
};

function fmtDate(iso) {
  if (!iso) return 'Mitte kunagi';
  const d = new Date(iso);
  if (isNaN(d)) return 'Mitte kunagi';
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff === 0) return 'Täna';
  if (diff === 1) return 'Eile';
  return d.toLocaleDateString('et-EE');
}
window.fmtDate = fmtDate;
