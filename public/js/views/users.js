/* Users list + Create/Edit form */
'use strict';

Views.Users = {
  _state: { users:[], groups:[], departments:[], ous:[], q:'', dept:'', status:'', page:1, sel:new Set(), sort:'displayName' },

  async render(container, params) {
    const s = this._state;
    if (params?.q)   s.q    = params.q;
    if (params?.new) { this._renderList(container, []); this.openForm(null); return; }

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
    const s = this._state;
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

    const ouShort = (o) => (o?.match(/OU=([^,]+)/) || [])[1] || o || '';

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
        <button class="btn primary" id="ul-new">${icon('plus',16)} Uus kasutaja</button>
      </div>

      ${s.sel.size > 0 ? `<div class="bulkbar">
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
                <th style="width:40px">${checkbox(allSel)}</th>
                <th>Kuvatav nimi</th>
                <th>Kasutajanimi</th>
                <th>Osakond</th>
                <th>Ametinimetus</th>
                <th>Olek</th>
                <th>Viimane sisselogimine</th>
                <th style="width:130px;text-align:right">Toimingud</th>
              </tr>
            </thead>
            <tbody>
              ${pageItems.length === 0 ? `<tr><td colspan="8" class="loading-row">
                <div class="empty" style="padding:40px">
                  ${icon('search',40)}<div>Ühtegi kasutajat ei leitud.</div>
                </div></td></tr>` :
                pageItems.map(u => `<tr data-sam="${esc(u.sam)}${s.sel.has(u.sam)?' class="selected"':''}">
                  <td><div class="cbx-cell">${checkbox(s.sel.has(u.sam))}</div></td>
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
                  <td>
                    <div class="row-actions">
                      <button class="icon-act" title="Muuda" data-action="edit">${icon('edit',16)}</button>
                      <button class="icon-act" title="Lähtesta parool" data-action="reset">${icon('key',16)}</button>
                      <button class="icon-act" title="${u.status==='disabled'?'Luba':'Keela'}" data-action="toggle">
                        ${icon(u.status==='disabled'?'checkCircle':'ban',16)}
                      </button>
                      <button class="icon-act danger" title="Kustuta" data-action="delete">${icon('trash',16)}</button>
                    </div>
                  </td>
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
    document.getElementById('ul-new').addEventListener('click', () => self.openForm(null, container));

    document.getElementById('pg-prev')?.addEventListener('click', () => { s.page--; self._renderList(container); });
    document.getElementById('pg-next')?.addEventListener('click', () => { s.page++; self._renderList(container); });
    container.querySelectorAll('.pg[data-pg]').forEach(btn => {
      btn.addEventListener('click', () => { s.page = parseInt(btn.dataset.pg); self._renderList(container); });
    });

    // Checkbox header
    container.querySelector('thead .checkbox')?.addEventListener('click', () => {
      if (allSel) pageItems.forEach(u => s.sel.delete(u.sam));
      else pageItems.forEach(u => s.sel.add(u.sam));
      self._renderList(container);
    });

    // Row events
    container.querySelectorAll('tbody tr[data-sam]').forEach(row => {
      const sam = row.dataset.sam;
      row.querySelector('.cbx-cell .checkbox')?.addEventListener('click', (e) => {
        e.stopPropagation();
        s.sel.has(sam) ? s.sel.delete(sam) : s.sel.add(sam);
        self._renderList(container);
      });
      row.querySelector('[data-action="open"]')?.addEventListener('click', () => App.navigate('userDetail', { sam }));
      row.querySelector('[data-action="edit"]')?.addEventListener('click', () => {
        const u = s.users.find(x => x.sam === sam);
        if (u) self.openForm(u, container);
      });
      row.querySelector('[data-action="reset"]')?.addEventListener('click', () => self.doResetPassword(sam));
      row.querySelector('[data-action="toggle"]')?.addEventListener('click', () => self.doToggle(sam, container));
      row.querySelector('[data-action="delete"]')?.addEventListener('click', () => self.doDelete(sam, container));
    });

    // Bulk actions
    document.getElementById('bulk-enable')?.addEventListener('click', () => self.doBulk('enable', [...s.sel], container));
    document.getElementById('bulk-disable')?.addEventListener('click', () => self.doBulk('disable', [...s.sel], container));
    document.getElementById('bulk-delete')?.addEventListener('click', () => self.doBulk('delete', [...s.sel], container));
  },

  // ─── Form (create / edit) ──────────────────────────────────────
  async openForm(user, container) {
    const isEdit = !!user;
    const ovl    = document.getElementById('overlay');

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

    const depts    = this._state.departments.length ? this._state.departments : Object.keys(TITLES);
    const ous      = this._state.ous;
    const allUsers = this._state.users;
    const allGroups = this._state.groups;
    const curDept  = user?.department || depts[0] || '';

    const buildTitleField = (opts, dept, currentTitle) => {
      const userTitles = allUsers
        .filter(u => u.department === dept && u.title)
        .map(u => u.title);
      const suggestions = [...new Set([...opts, ...userTitles])].filter(Boolean).sort();
      return `
        <input class="input" id="f-title-custom" list="title-datalist"
          placeholder="Kirjuta või vali ametinimetus"
          value="${esc(currentTitle||'')}" autocomplete="off" />
        <datalist id="title-datalist">
          ${suggestions.map(t=>`<option value="${esc(t)}">`).join('')}
        </datalist>`;
    };

    // Fetch available domains
    let domains = ['varik.local'];
    try { const r = await API.getConfig(); domains = r.domains || domains; } catch {}
    const defDomain = domains[0];

    // Parse existing mail domain for edit mode
    const existingMailDomain = user?.mail?.split('@')[1] || defDomain;
    const existingMailUser   = user?.mail?.split('@')[0] || '';

    const translit = s => String(s).toLowerCase()
      .replace(/õ/g,'o').replace(/ä/g,'a').replace(/ö/g,'o')
      .replace(/ü/g,'u').replace(/š/g,'s').replace(/ž/g,'z').replace(/[^a-z]/g,'');

    // Prefix format options
    const PREFIX_OPTS = [
      { val:'1',    label:'m.',    hint:'1 täht' },
      { val:'2',    label:'ma.',   hint:'2 tähte' },
      { val:'full', label:'mari.', hint:'Täis eesnimi' },
    ];

    ovl.innerHTML = `
      <div class="scrim" id="form-scrim"></div>
      <div class="drawer" role="dialog" aria-modal="true">
        <div class="drawer-head">
          <div class="qa-ic">${icon(isEdit?'edit':'userPlus',18)}</div>
          <div style="flex:1">
            <h2>${isEdit ? 'Muuda kasutajat' : 'Uus kasutaja'}</h2>
            <div class="sub">${isEdit ? esc(user.displayName)+' · '+esc(user.sam) : 'Loo uus Active Directory konto'}</div>
          </div>
          <button class="x-btn" id="form-close">${icon('x',18)}</button>
        </div>
        <div class="drawer-body">
          <div class="form-grid">
            <div class="form-sec-title">Isikuandmed</div>
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
              <span class="hint">Genereeritakse ees- ja perekonnanimest automaatselt.</span>
            </div>

            <div class="form-sec-title">Konto</div>
            ${!isEdit ? `<div class="field full">
              <label>Kasutajanime formaat</label>
              <div style="display:flex;gap:6px;flex-wrap:wrap" id="f-prefix-wrap">
                ${PREFIX_OPTS.map(o=>`
                  <button type="button" class="btn${o.val==='1'?' primary':''} sm" data-prefix="${o.val}" id="fp-${o.val}"
                    style="font-family:monospace;min-width:80px">
                    ${esc(o.label)}perenimi <span style="opacity:.6;font-family:inherit;font-size:11px">(${esc(o.hint)})</span>
                  </button>`).join('')}
              </div>
            </div>` : ''}
            <div class="field">
              <label>Kasutajanimi (sAMAccountName) <span class="req">*</span></label>
              <input class="input mono" id="f-sam" value="${esc(user?.sam||'')}" ${isEdit?'readonly':''} placeholder="m.tamm" autocomplete="off" />
            </div>
            <div class="field">
              <label>Töötaja ID</label>
              <input class="input mono" id="f-empid" value="${esc(user?.employeeID||'')}" placeholder="EMP1234" autocomplete="off" />
            </div>
            <div class="field full">
              <label>E-post <span class="req">*</span></label>
              <div style="display:flex;gap:6px;align-items:center">
                <input class="input mono" id="f-mailuser" value="${esc(existingMailUser)}"
                  placeholder="m.tamm" style="flex:1" ${isEdit?'':'autocomplete="off"'} />
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

            <div class="form-sec-title">Organisatsioon</div>
            <div class="field">
              <label>Osakond <span class="req">*</span></label>
              <select class="select" id="f-dept">
                <option value="">— Vali osakond —</option>
                ${depts.map(d=>`<option value="${esc(d)}"${curDept===d?' selected':''}>${esc(d)}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label>Ametinimetus</label>
              <div id="f-title-wrap">
                ${buildTitleField(TITLES[curDept]||[], curDept, user?.title||'')}
              </div>
            </div>
            <div class="field">
              <label>Juht</label>
              <select class="select" id="f-manager">
                <option value="">— Puudub —</option>
                ${allUsers.filter(u=>u.sam!==user?.sam).map(u=>`<option value="${esc(u.displayName)}"${user?.manager===u.displayName?' selected':''}>${esc(u.displayName)}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label>OU asukoht</label>
              <select class="select" id="f-ou">
                ${ous.map(o=>`<option value="${esc(o)}"${user?.ou===o?' selected':''}>${esc((o.match(/OU=([^,]+)/)||[])[1]||o)}</option>`).join('')}
              </select>
            </div>

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
          <button class="btn primary" id="form-save">${icon('check',16)} ${isEdit?'Salvesta muudatused':'Loo kasutaja'}</button>
        </div>
      </div>`;

    const self = this;
    const close = () => { ovl.innerHTML = ''; };
    document.getElementById('form-scrim').addEventListener('click', close);
    document.getElementById('form-close').addEventListener('click', close);
    document.getElementById('form-cancel').addEventListener('click', close);

    // ── Prefix format ──
    let prefixMode = '1';
    let autoDisplay = !isEdit, autoSam = !isEdit, autoMailUser = !isEdit;

    document.querySelectorAll('[data-prefix]').forEach(btn => {
      btn.addEventListener('click', () => {
        prefixMode = btn.dataset.prefix;
        document.querySelectorAll('[data-prefix]').forEach(b => b.classList.remove('primary'));
        btn.classList.add('primary');
        syncName();
      });
    });

    function getPrefix(fn) {
      const t = translit(fn);
      if (prefixMode === '2')    return t.slice(0, 2);
      if (prefixMode === 'full') return t;
      return t[0] || '';
    }

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
      const pw = e.target.value;
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

    // ── Dept → title ──
    document.getElementById('f-dept').addEventListener('change', (e) => {
      document.getElementById('f-title-wrap').innerHTML = buildTitleField(TITLES[e.target.value]||[], e.target.value, '');
    });

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
      const titleV  = document.getElementById('f-title-custom')?.value.trim() || '';
      const empid   = document.getElementById('f-empid')?.value.trim() || '';
      const manager = document.getElementById('f-manager').value;
      const ou      = document.getElementById('f-ou').value;
      const enabled = document.getElementById('f-enabled').checked;

      // Collect selected groups
      const selGroups = [...document.querySelectorAll('[data-group]:checked')]
        .map(cb => cb.dataset.group);

      // Validation
      const missing = [];
      if (!fn)     missing.push('Eesnimi');
      if (!ln)     missing.push('Perekonnanimi');
      if (!sam)    missing.push('Kasutajanimi');
      if (!dept)   missing.push('Osakond');
      //if (!titleV) missing.push('Ametinimetus');
      if (!musr)   missing.push('E-post');
      if (missing.length) {
        App.toast('warn', 'Kohustuslikud väljad puuduvad', missing.join(', '));
        // Highlight empty required fields
        ['f-first','f-last','f-sam','f-dept','f-mailuser'].forEach(id => {
          const el = document.getElementById(id);
          if (el && !el.value.trim()) el.classList.add('invalid');
        });
        return;
      }
      if (!isEdit && pass.length < 8) {
        App.toast('warn','Parool liiga lühike','Vähemalt 8 tähemärki.');
        document.getElementById('f-pass')?.classList.add('invalid');
        return;
      }

      const btn = document.getElementById('form-save');
      btn.disabled = true;
      btn.textContent = 'Salvestamine…';

      try {
        if (isEdit) {
          await API.updateUser(sam, { givenName:fn, sn:ln, mail, department:dept, title:titleV, manager, ou, enabled, employeeID:empid||undefined });

          // Sync group membership
          const oldGroups = user.groups || [];
          const toAdd    = selGroups.filter(g => !oldGroups.includes(g));
          const toRemove = oldGroups.filter(g => !selGroups.includes(g) && g !== 'Haigla-Kõik');
          await Promise.allSettled([
            ...toAdd.map(g => API.addToGroup(sam, g)),
            ...toRemove.map(g => API.removeFromGroup(sam, g)),
          ]);

          App.toast('ok', 'Kasutaja uuendatud', fn + ' ' + ln);
        } else {
          await API.createUser({ username:sam, givenName:fn, sn:ln, mail, password:pass, department:dept, title:titleV, manager, ou, enabled });

          // Add to extra groups (Haigla-Kõik is added by server automatically)
          const extraGroups = selGroups.filter(g => g !== 'Haigla-Kõik');
          await Promise.allSettled(extraGroups.map(g => API.addToGroup(sam, g)));

          App.toast('ok', 'Kasutaja loodud', fn + ' ' + ln + ' · ' + sam);
        }
        close();
        if (container) await self.render(container, {});
      } catch (err) {
        App.toast('bad', 'Viga', err.message);
        btn.disabled = false;
        btn.innerHTML = `${icon('check',16)} ${isEdit?'Salvesta muudatused':'Loo kasutaja'}`;
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
      App.confirm('Keela konto?', `Kas soovite keelata kasutaja "${u.displayName}" konto?`, async () => {
        try {
          await API.disableUser(sam);
          u.status = 'disabled';
          App.toast('warn','Konto keelatud', u.displayName);
          this._renderList(container);
        } catch (err) { App.toast('bad','Viga', err.message); }
      }, { icon:'ban', confirmLabel:'Keela konto' });
    }
  },

  async doDelete(sam, container) {
    const u = this._state.users.find(x => x.sam === sam);
    App.confirm('Kustuta kasutaja?',
      `Kasutaja "${u?.displayName||sam}" kustutatakse jäädavalt. Seda ei saa tagasi võtta.`,
      async () => {
        try {
          await API.deleteUser(sam);
          this._state.users = this._state.users.filter(x => x.sam !== sam);
          this._state.sel.delete(sam);
          App.toast('bad','Kasutaja kustutatud', u?.displayName||sam);
          this._renderList(container);
        } catch (err) { App.toast('bad','Viga', err.message); }
      },
      { icon:'trash', confirmLabel:'Kustuta jäädavalt' }
    );
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
