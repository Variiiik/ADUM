/* Teenuste õiguste haldus — Services view */
'use strict';

Views.Services = {
  _services:       [],
  _selected:       null,
  _q:              '',
  _adAttribute:    'extensionAttribute1',
  _expandedGroups: new Set(),
  _loadingGroups:  new Set(),

  async render(container) {
    container.innerHTML = `<div class="content-inner"><div style="text-align:center;padding:60px"><div class="spinner" style="margin:auto"></div></div></div>`;
    try {
      const res = await API.getServices();
      this._services    = res.services    || [];
      this._adAttribute = res.adAttribute || 'extensionAttribute1';
      this._selected    = this._services[0] || null;
    } catch (err) {
      container.innerHTML = `<div class="content-inner"><div class="empty">${icon('alert',40)}<div>${esc(err.message)}</div></div></div>`;
      return;
    }
    this._q = '';
    this._expandedGroups = new Set();
    this._loadingGroups  = new Set();
    this._renderLayout(container);
  },

  _filtered() {
    const q = this._q.toLowerCase();
    if (!q) return this._services;
    return this._services.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.code || '').toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q)
    );
  },

  _renderLayout(container) {
    const isAdmin  = !!(App.state.user?.isAdmin);
    const filtered = this._filtered();
    const sel      = this._selected;

    container.innerHTML = `
      <div style="display:flex;height:100%;overflow:hidden">

        <!-- Left: service list -->
        <div style="width:264px;flex-shrink:0;border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;background:var(--surface)">
          <div style="padding:14px 12px 10px;border-bottom:1px solid var(--border);display:flex;flex-direction:column;gap:8px">
            <div style="position:relative">
              <span style="position:absolute;left:9px;top:50%;transform:translateY(-50%);color:var(--ink-3);pointer-events:none">${icon('search',14)}</span>
              <input id="svc-search" class="input" style="padding-left:30px;height:32px;font-size:13px" placeholder="Otsi teenust…" value="${esc(this._q)}" autocomplete="off" />
            </div>
            ${isAdmin ? `<button class="btn primary" id="svc-new-btn" style="height:32px;font-size:12px;gap:5px">${icon('plus',13)} Uus teenus</button>` : ''}
          </div>
          <div id="svc-list" style="flex:1;overflow-y:auto;padding:6px">
            ${filtered.length === 0
              ? `<div class="empty" style="padding:30px 10px;font-size:13px">${icon('briefcase',32)}<div>Teenuseid ei leitud</div></div>`
              : filtered.map(s => `
                <button class="svc-item" data-id="${esc(s.id)}" style="
                  display:block;width:100%;text-align:left;padding:9px 11px;border-radius:7px;border:none;
                  cursor:pointer;margin-bottom:2px;transition:background .1s;
                  background:${sel && sel.id === s.id ? 'var(--accent-weak)' : 'transparent'};
                  color:${sel && sel.id === s.id ? 'var(--accent)' : 'var(--ink)'}">
                  <div style="display:flex;align-items:center;gap:6px">
                    <span style="font-weight:500;font-size:13px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.name)}</span>
                    ${s.code ? `<span style="font-family:monospace;font-size:10.5px;background:var(--border);border-radius:4px;padding:1px 5px;color:var(--ink-2);flex-shrink:0">${esc(s.code)}</span>` : ''}
                  </div>
                  <div style="font-size:11.5px;color:var(--ink-3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.description) || '&nbsp;'}</div>
                  <div style="display:flex;gap:8px;margin-top:5px;font-size:11px;color:var(--ink-3);align-items:center;flex-wrap:wrap">
                    <span style="display:flex;align-items:center;gap:3px">${icon('users',10)} ${(s.owners||[]).length}</span>
                    <span style="display:flex;align-items:center;gap:3px">${icon('shield',10)} ${(s.rightsGroups||[]).length}</span>
                    ${!s.adLinked ? `<span style="display:flex;align-items:center;gap:2px;color:var(--warn)">${icon('info',9)} kohalik</span>` : ''}
                  </div>
                </button>`).join('')}
          </div>
        </div>

        <!-- Right: service detail -->
        <div id="svc-detail" style="flex:1;overflow-y:auto">
          ${sel ? this._renderDetail(sel, isAdmin) : `
            <div class="empty" style="padding:80px">
              ${icon('briefcase',48)}
              <div style="margin-top:12px;font-size:14px">Vali teenus vasakult</div>
              ${isAdmin ? `<button class="btn primary" id="svc-empty-new" style="margin-top:16px">${icon('plus',14)} Uus teenus</button>` : ''}
            </div>`}
        </div>
      </div>`;

    document.getElementById('svc-search')?.addEventListener('input', e => {
      this._q = e.target.value;
      this._renderLayout(container);
    });
    document.getElementById('svc-new-btn')?.addEventListener('click', () => this._openNewForm(container));
    document.getElementById('svc-empty-new')?.addEventListener('click', () => this._openNewForm(container));

    container.querySelectorAll('.svc-item').forEach(btn => {
      btn.addEventListener('click', () => {
        this._selected = this._services.find(s => s.id === btn.dataset.id) || null;
        this._expandedGroups = new Set();
        this._loadingGroups  = new Set();
        this._renderLayout(container);
      });
    });

    this._bindDetailEvents(container, isAdmin);
  },

  // ── Right panel HTML ──────────────────────────────────────────────────────────

  _renderDetail(svc, isAdmin) {
    const adBadge = svc.adLinked
      ? `<span class="badge" style="font-size:11px;background:#e3f2fd;color:#1565c0">AD-ühendatud</span>`
      : `<span class="badge" style="font-size:11px;background:#f3e5f5;color:#6a1b9a">Kohalik teenus</span>`;

    return `<div style="padding:24px 28px;max-width:860px">

      <!-- Header -->
      <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid var(--border)">
        <div style="width:46px;height:46px;border-radius:11px;background:var(--accent-weak);color:var(--accent);display:flex;align-items:center;justify-content:center;flex-shrink:0">
          ${icon('briefcase',20)}
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:3px">
            <h2 style="margin:0;font-size:17px;font-weight:600">${esc(svc.name)}</h2>
            ${svc.code ? `<span class="badge neutral" style="font-family:monospace;font-size:12px;letter-spacing:.5px">${esc(svc.code)}</span>` : `<span style="font-size:12px;color:var(--ink-3)">(kood puudub)</span>`}
            ${adBadge}
          </div>
          <div style="font-size:13px;color:var(--ink-3)">${esc(svc.description) || '<em>Kirjeldus puudub</em>'}</div>
          ${svc.adLinked ? `<div style="font-size:11px;color:var(--ink-3);margin-top:4px">AD atribuut: <span class="mono">${esc(this._adAttribute)}</span></div>` : ''}
        </div>
        ${isAdmin ? `
          <button class="btn" id="svc-edit-btn" style="font-size:12px;height:30px">${icon('edit',13)} Muuda</button>
          <button class="btn danger" id="svc-del-btn" style="font-size:12px;height:30px">${icon('trash',13)} Kustuta</button>
        ` : ''}
      </div>

      <!-- Omanikud -->
      <div class="card" style="margin-bottom:14px">
        <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px">
          <span style="display:flex;align-items:center;gap:6px;font-weight:500;font-size:13.5px;flex:1">
            ${icon('users',15)} Teenuse omanikud
            <span class="badge neutral" style="font-size:11px;font-weight:600">${(svc.ownerDetails||[]).length}</span>
          </span>
          ${isAdmin ? `<button class="btn" id="svc-add-owner-btn" style="font-size:12px;height:27px;gap:4px">${icon('plus',12)} Lisa omanik</button>` : ''}
        </div>
        <div style="padding:10px 16px">
          ${(svc.ownerDetails||[]).length === 0
            ? `<div style="font-size:13px;color:var(--ink-3);padding:6px 0">Omanikud määramata</div>`
            : (svc.ownerDetails||[]).map(u => `
              <div class="grp-item" style="padding:5px 0">
                ${avatar({ displayName: u.displayName, avatarColor: u.avatarColor || '#5e1d27' }, 30)}
                <div style="flex:1;min-width:0">
                  <div class="nm" style="font-size:13px">${esc(u.displayName)}</div>
                  <div class="ds">${esc(u.title||'')}${u.title?' · ':''}<span class="mono" style="font-size:11px">${esc(u.sam)}</span>
                    <span class="badge" style="font-size:10px;background:var(--accent-weak);color:var(--accent);margin-left:4px">O</span>
                  </div>
                </div>
                ${isAdmin ? `<button class="icon-act" data-action="remove-owner" data-sam="${esc(u.sam)}" title="Eemalda omanik">${icon('x',13)}</button>` : ''}
              </div>`).join('')}
        </div>
      </div>

      <!-- Tehniline isik -->
      <div class="card" style="margin-bottom:14px">
        <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px">
          <span style="display:flex;align-items:center;gap:6px;font-weight:500;font-size:13.5px;flex:1">
            ${icon('id',15)} Tehniline isik
          </span>
          ${isAdmin ? `<button class="btn" id="svc-set-tech-btn" style="font-size:12px;height:27px;gap:4px">
            ${svc.technicalPersonDetail ? icon('edit',12)+' Muuda' : icon('plus',12)+' Määra'}
          </button>` : ''}
        </div>
        <div style="padding:10px 16px">
          ${!svc.technicalPersonDetail
            ? `<div style="font-size:13px;color:var(--ink-3);padding:6px 0">Tehniline isik määramata</div>`
            : `<div class="grp-item" style="padding:5px 0">
                ${avatar({ displayName: svc.technicalPersonDetail.displayName, avatarColor: svc.technicalPersonDetail.avatarColor || '#5e1d27' }, 30)}
                <div style="flex:1;min-width:0">
                  <div class="nm" style="font-size:13px">${esc(svc.technicalPersonDetail.displayName)}</div>
                  <div class="ds">${esc(svc.technicalPersonDetail.title||'')}${svc.technicalPersonDetail.title?' · ':''}<span class="mono" style="font-size:11px">${esc(svc.technicalPersonDetail.sam)}</span>
                    <span class="badge" style="font-size:10px;background:#fff3e0;color:#e65100;margin-left:4px">T</span>
                  </div>
                </div>
                ${isAdmin ? `<button class="icon-act" id="svc-clear-tech-btn" title="Eemalda tehniline isik">${icon('x',13)}</button>` : ''}
              </div>`}
        </div>
      </div>

      <!-- Õiguste grupid -->
      <div class="card">
        <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px">
          <span style="display:flex;align-items:center;gap:6px;font-weight:500;font-size:13.5px;flex:1">
            ${icon('shield',15)} Teenuse õiguste grupid
            <span class="badge neutral" style="font-size:11px;font-weight:600">${(svc.rightsGroupDetails||[]).length}</span>
          </span>
          ${isAdmin
            ? svc.adLinked
              ? `<button class="btn" id="svc-add-group-btn" style="font-size:12px;height:27px;gap:4px">${icon('plus',12)} Lisa AD grupp</button>`
              : `<button class="btn" id="svc-create-group-btn" style="font-size:12px;height:27px;gap:4px">${icon('plus',12)} Loo grupp</button>`
            : ''}
        </div>
        <div id="svc-groups-list" style="padding:0 16px">
          ${(svc.rightsGroupDetails||[]).length === 0
            ? `<div style="font-size:13px;color:var(--ink-3);padding:14px 0">Õiguste grupid määramata</div>`
            : (svc.rightsGroupDetails||[]).map((g, i) => this._renderGroupRow(svc, g, isAdmin, i)).join('')}
        </div>
      </div>
    </div>`;
  },

  _renderGroupRow(svc, g, isAdmin, idx = 0) {
    const isExp     = this._expandedGroups.has(g.name);
    const isLoading = this._loadingGroups.has(g.name);
    const members   = g._members || [];

    return `
      <div class="svc-grp-row" data-gname="${esc(g.name)}" style="border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:10px;padding:10px 0;cursor:pointer" data-action="toggle-group">
          <div class="grp-ic" style="flex-shrink:0;position:relative">
            ${icon('shield',13)}
            <span style="position:absolute;bottom:-3px;right:-5px;font-size:9px;font-weight:700;color:var(--ink-2);line-height:1">${idx+1}</span>
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:500">${esc(g.name)}</div>
            <div style="font-size:11.5px;color:var(--ink-3)">
              ${g.type ? esc(g.type)+' · ' : ''}${g.memberCount||0} liiget
            </div>
          </div>
          <span style="color:var(--ink-3);display:flex;transition:transform .15s;transform:rotate(${isExp?'90':'0'}deg)">${icon('chevron',14)}</span>
          ${isAdmin && !svc.adLinked ? `<button class="icon-act" data-action="add-grp-member" data-gname="${esc(g.name)}" title="Lisa liige gruppi" style="margin-left:2px">${icon('plus',13)}</button>` : ''}
          ${isAdmin
            ? svc.adLinked
              ? `<button class="icon-act" data-action="remove-group" data-gname="${esc(g.name)}" title="Eemalda grupp">${icon('x',13)}</button>`
              : `<button class="icon-act danger" data-action="delete-group" data-gname="${esc(g.name)}" title="Kustuta grupp">${icon('trash',12)}</button>`
            : ''}
        </div>
        ${isExp ? `
          <div style="padding:0 0 12px 32px">
            ${isLoading
              ? `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:12px;color:var(--ink-3)"><div class="spinner" style="width:14px;height:14px"></div> Laen liikmeid…</div>`
              : members.length === 0
                ? `<div style="font-size:12px;color:var(--ink-3);padding:4px 0">Grupis ei ole liikmeid.</div>`
                : members.map(m => `
                  <div style="display:flex;align-items:center;gap:8px;padding:3px 0">
                    ${avatar({ displayName: m.displayName, avatarColor: m.avatarColor || '#5e1d27' }, 22)}
                    <span style="font-size:12.5px;flex:1">${esc(m.displayName)}</span>
                    ${m.department ? `<span style="font-size:11px;color:var(--ink-3)">${esc(m.department)}</span>` : ''}
                    ${isAdmin && !svc.adLinked ? `<button class="icon-act" data-action="remove-grp-member" data-gname="${esc(g.name)}" data-sam="${esc(m.sam)}" title="Eemalda grupist" style="flex-shrink:0">${icon('x',12)}</button>` : ''}
                  </div>`).join('')}
          </div>` : ''}
      </div>`;
  },

  // ── Event binding ─────────────────────────────────────────────────────────────

  _bindDetailEvents(container, isAdmin) {
    const sel = this._selected;
    if (!sel) return;

    document.getElementById('svc-edit-btn')?.addEventListener('click', () => this._openEditForm(container, sel));

    document.getElementById('svc-del-btn')?.addEventListener('click', () => {
      App.confirm('Kustuta teenus', `Teenus "${sel.name}" kustutatakse jäädavalt.`, async () => {
        try {
          await API.deleteService(sel.id);
          this._services = this._services.filter(s => s.id !== sel.id);
          this._selected = this._services[0] || null;
          this._expandedGroups = new Set();
          this._renderLayout(container);
          App.toast('ok', 'Teenus kustutatud', sel.name);
        } catch (err) { App.toast('bad', 'Viga', err.message); }
      });
    });

    // Owners
    document.getElementById('svc-add-owner-btn')?.addEventListener('click', () => {
      this._openUserPicker('Lisa omanik', async (sam) => {
        if (!sam) return;
        if ((sel.owners||[]).includes(sam)) { App.toast('warn', 'Juba omanik', 'See kasutaja on juba omanikuks määratud.'); return; }
        try {
          const r = await API.updateService(sel.id, { owners: [...(sel.owners||[]), sam] });
          this._applyUpdate(r.service, container);
          App.toast('ok', 'Omanik lisatud');
        } catch (err) { App.toast('bad', 'Viga', err.message); }
      });
    });
    container.querySelectorAll('[data-action="remove-owner"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const sam = btn.dataset.sam;
        App.confirm('Eemalda omanik', `Kas eemaldada ${sam} omanike hulgast?`, async () => {
          try {
            const r = await API.updateService(sel.id, { owners: (sel.owners||[]).filter(s => s !== sam) });
            this._applyUpdate(r.service, container);
            App.toast('ok', 'Omanik eemaldatud');
          } catch (err) { App.toast('bad', 'Viga', err.message); }
        }, { danger: false, icon: 'users', confirmLabel: 'Eemalda' });
      });
    });

    // Technical person
    document.getElementById('svc-set-tech-btn')?.addEventListener('click', () => {
      this._openUserPicker('Määra tehniline isik', async (sam) => {
        if (!sam) return;
        try {
          const r = await API.updateService(sel.id, { technicalPerson: sam });
          this._applyUpdate(r.service, container);
          App.toast('ok', 'Tehniline isik määratud');
        } catch (err) { App.toast('bad', 'Viga', err.message); }
      }, sel.technicalPerson);
    });
    document.getElementById('svc-clear-tech-btn')?.addEventListener('click', () => {
      App.confirm('Eemalda tehniline isik', 'Kas eemaldada tehniline isik?', async () => {
        try {
          const r = await API.updateService(sel.id, { technicalPerson: null });
          this._applyUpdate(r.service, container);
          App.toast('ok', 'Tehniline isik eemaldatud');
        } catch (err) { App.toast('bad', 'Viga', err.message); }
      }, { danger: false, icon: 'id', confirmLabel: 'Eemalda' });
    });

    // Rights groups — AD
    document.getElementById('svc-add-group-btn')?.addEventListener('click', () => {
      this._openGroupPicker('Lisa AD õiguste grupp', async (gname) => {
        if (!gname) return;
        if ((sel.rightsGroups||[]).includes(gname)) { App.toast('warn', 'Juba lisatud', 'See grupp on juba teenusega seotud.'); return; }
        try {
          const r = await API.updateService(sel.id, { rightsGroups: [...(sel.rightsGroups||[]), gname] });
          this._applyUpdate(r.service, container);
          App.toast('ok', 'AD grupp lisatud', gname);
        } catch (err) { App.toast('bad', 'Viga', err.message); }
      });
    });
    container.querySelectorAll('[data-action="remove-group"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const gname = btn.dataset.gname;
        App.confirm('Eemalda AD grupp', `Kas eemaldada grupp "${gname}" teenuse juurest?`, async () => {
          try {
            const r = await API.updateService(sel.id, { rightsGroups: (sel.rightsGroups||[]).filter(g => g !== gname) });
            this._expandedGroups.delete(gname);
            this._applyUpdate(r.service, container);
            App.toast('ok', 'AD grupp eemaldatud');
          } catch (err) { App.toast('bad', 'Viga', err.message); }
        }, { danger: false, icon: 'shield', confirmLabel: 'Eemalda' });
      });
    });

    // Rights groups — non-AD: create/delete
    document.getElementById('svc-create-group-btn')?.addEventListener('click', () => {
      this._openCreateGroupForm(container, sel);
    });
    container.querySelectorAll('[data-action="delete-group"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const gname = btn.dataset.gname;
        const memberCount = ((sel.groupMembers||{})[gname]||[]).length;
        const warn = memberCount ? ` Grupis on ${memberCount} liige${memberCount !== 1 ? 't' : ''}.` : '';
        App.confirm('Kustuta grupp', `Kas kustutada grupp "${gname}"?${warn}`, async () => {
          try {
            const r = await API.deleteServiceGroup(sel.id, gname);
            this._expandedGroups.delete(gname);
            this._applyUpdate(r.service, container);
            App.toast('ok', 'Grupp kustutatud');
          } catch (err) { App.toast('bad', 'Viga', err.message); }
        }, { icon: 'trash', confirmLabel: 'Kustuta' });
      });
    });

    // Non-AD group member management
    container.querySelectorAll('[data-action="add-grp-member"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const gname = btn.dataset.gname;
        const existing = new Set((sel.groupMembers||{})[gname] || []);
        this._openUserPicker(`Lisa liige gruppi "${gname}"`, async (sam) => {
          if (!sam) return;
          try {
            const r = await API.addServiceGroupMember(sel.id, gname, sam);
            this._expandedGroups.add(gname);
            this._applyUpdate(r.service, container);
            App.toast('ok', 'Liige lisatud gruppi', gname);
          } catch (err) { App.toast('bad', 'Viga', err.message); }
        }, null, sam => existing.has(sam));
      });
    });
    container.querySelectorAll('[data-action="remove-grp-member"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const { gname, sam } = btn.dataset;
        App.confirm('Eemalda grupist', `Kas eemaldada ${sam} grupist "${gname}"?`, async () => {
          try {
            const r = await API.removeServiceGroupMember(sel.id, gname, sam);
            this._applyUpdate(r.service, container);
            App.toast('ok', 'Liige eemaldatud grupist');
          } catch (err) { App.toast('bad', 'Viga', err.message); }
        }, { danger: false, icon: 'user', confirmLabel: 'Eemalda' });
      });
    });

    // Toggle group expansion
    container.querySelectorAll('[data-action="toggle-group"]').forEach(toggleEl => {
      toggleEl.addEventListener('click', () => {
        const gname = toggleEl.closest('.svc-grp-row').dataset.gname;
        this._toggleGroup(gname, container);
      });
    });
  },

  async _toggleGroup(gname, container) {
    const sel = this._selected;
    if (!sel) return;
    if (this._expandedGroups.has(gname)) {
      this._expandedGroups.delete(gname);
      this._rerenderGroups(container);
      return;
    }
    this._expandedGroups.add(gname);

    // Non-AD: members already embedded in rightsGroupDetails._members from enrichment
    if (!sel.adLinked) {
      this._rerenderGroups(container);
      return;
    }

    // AD: lazy-load from server
    this._loadingGroups.add(gname);
    this._rerenderGroups(container);
    try {
      const res = await API.getServiceGroupMembers(sel.id, gname);
      const gDetail = (sel.rightsGroupDetails || []).find(g => g.name === gname);
      if (gDetail) gDetail._members = res.members || [];
    } catch { /* leave empty */ }
    this._loadingGroups.delete(gname);
    this._rerenderGroups(container);
  },

  _rerenderGroups(container) {
    const sel     = this._selected;
    const isAdmin = !!(App.state.user?.isAdmin);
    const listEl  = document.getElementById('svc-groups-list');
    if (!listEl || !sel) return;
    const groups = sel.rightsGroupDetails || [];
    listEl.innerHTML = groups.length === 0
      ? `<div style="font-size:13px;color:var(--ink-3);padding:14px 0">Õiguste grupid määramata</div>`
      : groups.map((g, i) => this._renderGroupRow(sel, g, isAdmin, i)).join('');

    // Re-bind events inside group list
    listEl.querySelectorAll('[data-action="toggle-group"]').forEach(el =>
      el.addEventListener('click', () => this._toggleGroup(el.closest('.svc-grp-row').dataset.gname, container))
    );
    if (isAdmin) {
      listEl.querySelectorAll('[data-action="remove-group"]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const gname = btn.dataset.gname;
          App.confirm('Eemalda AD grupp', `Kas eemaldada grupp "${gname}" teenuse juurest?`, async () => {
            try {
              const r = await API.updateService(sel.id, { rightsGroups: (sel.rightsGroups||[]).filter(g => g !== gname) });
              this._expandedGroups.delete(gname);
              this._applyUpdate(r.service, container);
              App.toast('ok', 'AD grupp eemaldatud');
            } catch (err) { App.toast('bad', 'Viga', err.message); }
          }, { danger: false, icon: 'shield', confirmLabel: 'Eemalda' });
        });
      });
      listEl.querySelectorAll('[data-action="delete-group"]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const gname = btn.dataset.gname;
          App.confirm('Kustuta grupp', `Kas kustutada grupp "${gname}"?`, async () => {
            try {
              const r = await API.deleteServiceGroup(sel.id, gname);
              this._expandedGroups.delete(gname);
              this._applyUpdate(r.service, container);
              App.toast('ok', 'Grupp kustutatud');
            } catch (err) { App.toast('bad', 'Viga', err.message); }
          }, { icon: 'trash', confirmLabel: 'Kustuta' });
        });
      });
      listEl.querySelectorAll('[data-action="add-grp-member"]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const gname   = btn.dataset.gname;
          const existing = new Set((sel.groupMembers||{})[gname] || []);
          this._openUserPicker(`Lisa liige gruppi "${gname}"`, async (sam) => {
            if (!sam) return;
            try {
              const r = await API.addServiceGroupMember(sel.id, gname, sam);
              this._expandedGroups.add(gname);
              this._applyUpdate(r.service, container);
              App.toast('ok', 'Liige lisatud gruppi', gname);
            } catch (err) { App.toast('bad', 'Viga', err.message); }
          }, null, sam => existing.has(sam));
        });
      });
      listEl.querySelectorAll('[data-action="remove-grp-member"]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const { gname, sam } = btn.dataset;
          App.confirm('Eemalda grupist', `Kas eemaldada ${sam} grupist "${gname}"?`, async () => {
            try {
              const r = await API.removeServiceGroupMember(sel.id, gname, sam);
              this._applyUpdate(r.service, container);
              App.toast('ok', 'Liige eemaldatud grupist');
            } catch (err) { App.toast('bad', 'Viga', err.message); }
          }, { danger: false, icon: 'user', confirmLabel: 'Eemalda' });
        });
      });
    }
  },

  _applyUpdate(svc, container) {
    // For AD services: preserve lazily-loaded member cache across re-renders.
    // For non-AD services: _members comes fresh from server enrichment — don't overwrite.
    if (this._selected && svc.adLinked && svc.rightsGroupDetails) {
      svc.rightsGroupDetails.forEach(g => {
        const prev = (this._selected.rightsGroupDetails || []).find(p => p.name === g.name);
        if (prev?._members) g._members = prev._members;
      });
    }
    const idx = this._services.findIndex(s => s.id === svc.id);
    if (idx !== -1) this._services[idx] = svc;
    this._selected = svc;
    this._renderLayout(container);
  },

  // ── Modals ────────────────────────────────────────────────────────────────────

  _openNewForm(container) {
    const ovl = document.getElementById('overlay');
    ovl.innerHTML = `
      <div class="scrim" id="svc-form-scrim"></div>
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-body">
          <div class="modal-ic" style="background:var(--accent-weak);color:var(--accent)">${icon('briefcase',24)}</div>
          <h3>Uus teenus</h3>
          <div class="field" style="margin-bottom:12px">
            <label>Teenuse nimi <span style="color:var(--bad)">*</span></label>
            <input class="input" id="svc-form-name" type="text" placeholder="nt. ERP Süsteem" autocomplete="off" />
          </div>
          <div class="field" style="margin-bottom:12px">
            <label>Lühikood <span style="color:var(--bad)">*</span></label>
            <input class="input mono" id="svc-form-code" type="text" placeholder="nt. ERP või HIS-001" autocomplete="off" maxlength="20" style="text-transform:uppercase;letter-spacing:.5px" />
            <div style="font-size:11px;color:var(--ink-3);margin-top:4px">2–20 tähemärki: tähed, numbrid, sidekriips.</div>
          </div>
          <div class="field" style="margin-bottom:12px">
            <label>Kirjeldus</label>
            <input class="input" id="svc-form-desc" type="text" placeholder="Lühike kirjeldus (vabatahtlik)" autocomplete="off" />
          </div>
          <div class="field">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none">
              <input type="checkbox" id="svc-form-adlinked" checked style="width:15px;height:15px;cursor:pointer" />
              <span>AD-ühendatud teenus (grupid pärinevad Active Directory-st)</span>
            </label>
            <div id="svc-form-adlinked-hint" style="font-size:11px;color:var(--ink-3);margin-top:4px;padding-left:23px"></div>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn" id="svc-form-cancel">Loobu</button>
          <button class="btn primary" id="svc-form-save">Loo teenus</button>
        </div>
      </div>`;

    const close = () => { ovl.innerHTML = ''; };
    document.getElementById('svc-form-scrim').addEventListener('click', close);
    document.getElementById('svc-form-cancel').addEventListener('click', close);

    const updateHint = () => {
      const chk  = document.getElementById('svc-form-adlinked');
      const hint = document.getElementById('svc-form-adlinked-hint');
      if (!chk || !hint) return;
      hint.textContent = chk.checked
        ? 'Õiguste grupid valitakse Active Directory grupide hulgast.'
        : 'Õiguste grupid luuakse käsitsi ja salvestatakse kohalikult.';
    };
    document.getElementById('svc-form-adlinked')?.addEventListener('change', updateHint);
    updateHint();

    document.getElementById('svc-form-name')?.addEventListener('input', e => {
      const codeEl = document.getElementById('svc-form-code');
      if (!codeEl || codeEl.dataset.manual) return;
      const words = e.target.value.replace(/[^A-Za-z0-9\s]/g, '').trim().split(/\s+/).filter(Boolean);
      codeEl.value = words.map(w => w.slice(0,3)).join('').toUpperCase().slice(0,10);
    });
    document.getElementById('svc-form-code')?.addEventListener('input', e => {
      e.target.value = e.target.value.toUpperCase();
      e.target.dataset.manual = e.target.value ? '1' : '';
    });

    document.getElementById('svc-form-save').addEventListener('click', async () => {
      const name     = document.getElementById('svc-form-name').value.trim();
      const code     = document.getElementById('svc-form-code').value.trim().toUpperCase();
      const desc     = document.getElementById('svc-form-desc').value.trim();
      const adLinked = document.getElementById('svc-form-adlinked').checked;
      if (!name) { App.toast('warn', 'Nõutud', 'Sisesta teenuse nimi.'); return; }
      if (!code || !/^[A-Z0-9][A-Z0-9\-]{0,19}$/.test(code)) {
        App.toast('warn', 'Vigane kood', 'Kood peab olema 2–20 tähemärki (tähed, numbrid, sidekriips).'); return;
      }
      try {
        const r = await API.createService({ name, code, description: desc, adLinked });
        this._services.push(r.service);
        this._selected = r.service;
        close();
        this._expandedGroups = new Set();
        this._renderLayout(container);
        App.toast('ok', 'Teenus loodud', `${name} [${code}]`);
      } catch (err) { App.toast('bad', 'Viga', err.message); }
    });
    setTimeout(() => document.getElementById('svc-form-name')?.focus(), 50);
  },

  _openEditForm(container, svc) {
    const ovl = document.getElementById('overlay');
    ovl.innerHTML = `
      <div class="scrim" id="svc-edit-scrim"></div>
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-body">
          <div class="modal-ic" style="background:var(--accent-weak);color:var(--accent)">${icon('edit',24)}</div>
          <h3>Muuda teenust</h3>
          <div class="field" style="margin-bottom:12px">
            <label>Teenuse nimi <span style="color:var(--bad)">*</span></label>
            <input class="input" id="svc-edit-name" type="text" value="${esc(svc.name)}" autocomplete="off" />
          </div>
          <div class="field" style="margin-bottom:12px">
            <label>Lühikood <span style="color:var(--bad)">*</span></label>
            <input class="input mono" id="svc-edit-code" type="text" value="${esc(svc.code||'')}" autocomplete="off" maxlength="20" style="text-transform:uppercase;letter-spacing:.5px" />
            ${svc.adLinked ? `<div style="font-size:11px;color:var(--ink-3);margin-top:4px">Koodi muutmisel uuendatakse kõigi seotud kasutajate AD atribuut <span class="mono">${esc(this._adAttribute)}</span>.</div>` : ''}
          </div>
          <div class="field" style="margin-bottom:12px">
            <label>Kirjeldus</label>
            <input class="input" id="svc-edit-desc" type="text" value="${esc(svc.description||'')}" autocomplete="off" />
          </div>
          <div class="field">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none">
              <input type="checkbox" id="svc-edit-adlinked" ${svc.adLinked ? 'checked' : ''} style="width:15px;height:15px;cursor:pointer" />
              <span>AD-ühendatud teenus</span>
            </label>
            <div style="font-size:11px;color:var(--warn);margin-top:4px;padding-left:23px">
              Hoiatus: AD-ühenduse muutmine ei kustuta olemasolevaid gruppe ega liikmeid.
            </div>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn" id="svc-edit-cancel">Loobu</button>
          <button class="btn primary" id="svc-edit-save">Salvesta</button>
        </div>
      </div>`;
    const close = () => { ovl.innerHTML = ''; };
    document.getElementById('svc-edit-scrim').addEventListener('click', close);
    document.getElementById('svc-edit-cancel').addEventListener('click', close);
    document.getElementById('svc-edit-code')?.addEventListener('input', e => { e.target.value = e.target.value.toUpperCase(); });
    document.getElementById('svc-edit-save').addEventListener('click', async () => {
      const name     = document.getElementById('svc-edit-name').value.trim();
      const code     = document.getElementById('svc-edit-code').value.trim().toUpperCase();
      const desc     = document.getElementById('svc-edit-desc').value.trim();
      const adLinked = document.getElementById('svc-edit-adlinked').checked;
      if (!name) { App.toast('warn', 'Nõutud', 'Teenuse nimi ei tohi olla tühi.'); return; }
      if (!code || !/^[A-Z0-9][A-Z0-9\-]{0,19}$/.test(code)) {
        App.toast('warn', 'Vigane kood', 'Kood peab olema 2–20 tähemärki.'); return;
      }
      try {
        const r = await API.updateService(svc.id, { name, code, description: desc, adLinked });
        close();
        this._applyUpdate(r.service, container);
        App.toast('ok', 'Teenus uuendatud');
      } catch (err) { App.toast('bad', 'Viga', err.message); }
    });
    setTimeout(() => document.getElementById('svc-edit-name')?.focus(), 50);
  },

  _openCreateGroupForm(container, svc) {
    const ovl = document.getElementById('overlay');
    ovl.innerHTML = `
      <div class="scrim" id="svc-cgrp-scrim"></div>
      <div class="modal" role="dialog" aria-modal="true" style="max-width:420px">
        <div class="modal-body">
          <div class="modal-ic" style="background:var(--accent-weak);color:var(--accent)">${icon('shield',24)}</div>
          <h3>Loo grupp</h3>
          <div class="field">
            <label>Grupi nimi <span style="color:var(--bad)">*</span></label>
            <input class="input" id="svc-cgrp-name" type="text" placeholder="nt. Administraatorid" autocomplete="off" />
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn" id="svc-cgrp-cancel">Loobu</button>
          <button class="btn primary" id="svc-cgrp-save">Loo grupp</button>
        </div>
      </div>`;
    const close = () => { ovl.innerHTML = ''; };
    document.getElementById('svc-cgrp-scrim').addEventListener('click', close);
    document.getElementById('svc-cgrp-cancel').addEventListener('click', close);
    document.getElementById('svc-cgrp-save').addEventListener('click', async () => {
      const name = document.getElementById('svc-cgrp-name').value.trim();
      if (!name) { App.toast('warn', 'Nõutud', 'Grupi nimi on kohustuslik.'); return; }
      try {
        const r = await API.createServiceGroup(svc.id, { name });
        close();
        this._applyUpdate(r.service, container);
        App.toast('ok', 'Grupp loodud', name);
      } catch (err) { App.toast('bad', 'Viga', err.message); }
    });
    setTimeout(() => document.getElementById('svc-cgrp-name')?.focus(), 50);
  },

  // isExcluded(sam) → true if user should be greyed out / not selectable
  _openUserPicker(title, onSelect, currentSam, isExcluded) {
    const ovl = document.getElementById('overlay');
    ovl.innerHTML = `
      <div class="scrim" id="upick-scrim"></div>
      <div class="modal" role="dialog" aria-modal="true" style="max-width:460px">
        <div class="modal-body">
          <div class="modal-ic" style="background:var(--accent-weak);color:var(--accent)">${icon('users',24)}</div>
          <h3>${esc(title)}</h3>
          <div class="field">
            <div style="position:relative">
              <span style="position:absolute;left:9px;top:50%;transform:translateY(-50%);color:var(--ink-3);pointer-events:none">${icon('search',14)}</span>
              <input class="input" id="upick-q" type="text" placeholder="Otsi nime või kasutajatunnust…" style="padding-left:30px" autocomplete="off" />
            </div>
            <div id="upick-list" style="max-height:230px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;margin-top:6px">
              <div style="padding:12px;font-size:13px;color:var(--ink-3)">Laen kasutajaid…</div>
            </div>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn" id="upick-cancel">Loobu</button>
        </div>
      </div>`;
    const close = () => { ovl.innerHTML = ''; };
    document.getElementById('upick-scrim').addEventListener('click', close);
    document.getElementById('upick-cancel').addEventListener('click', close);

    let allUsers = [];

    const render = (q) => {
      const listEl = document.getElementById('upick-list');
      if (!listEl) return;
      const filtered = q
        ? allUsers.filter(u => u.displayName.toLowerCase().includes(q) || u.sam.toLowerCase().includes(q))
        : allUsers;
      listEl.innerHTML = filtered.slice(0, 60).map(u => {
        const excluded = isExcluded ? isExcluded(u.sam) : false;
        const isCurrent = currentSam === u.sam;
        return `<div class="upick-item" data-sam="${esc(u.sam)}" style="
          display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:4px;
          ${excluded ? 'opacity:.4;pointer-events:none' : 'cursor:pointer'}
          ${isCurrent ? 'background:var(--accent-weak)' : ''}">
          ${avatar({ displayName: u.displayName, avatarColor: u.avatarColor || '#5e1d27' }, 28)}
          <div style="flex:1;min-width:0">
            <div style="font-size:13px">${esc(u.displayName)}</div>
            <div style="font-size:11px;color:var(--ink-3)">${esc(u.department||'')}${u.department?' · ':''}<span class="mono">${esc(u.sam)}</span></div>
          </div>
          ${isCurrent ? `<span style="color:var(--accent)">${icon('check',14)}</span>` : ''}
        </div>`;
      }).join('') || `<div style="padding:12px;font-size:13px;color:var(--ink-3)">Kasutajaid ei leitud</div>`;

      listEl.querySelectorAll('.upick-item').forEach(item => {
        item.addEventListener('click', () => { close(); onSelect(item.dataset.sam); });
      });
    };

    API.getUsers().then(r => { allUsers = (r.users || []).filter(u => u.status !== 'disabled'); render(''); })
      .catch(() => {
        const listEl = document.getElementById('upick-list');
        if (listEl) listEl.innerHTML = `<div style="padding:12px;font-size:13px;color:var(--bad)">Kasutajate laadimine ebaõnnestus.</div>`;
      });

    document.getElementById('upick-q')?.addEventListener('input', e => render(e.target.value.toLowerCase()));
    setTimeout(() => document.getElementById('upick-q')?.focus(), 50);
  },

  _openGroupPicker(title, onSelect) {
    const ovl = document.getElementById('overlay');
    ovl.innerHTML = `
      <div class="scrim" id="gpick-scrim"></div>
      <div class="modal" role="dialog" aria-modal="true" style="max-width:460px">
        <div class="modal-body">
          <div class="modal-ic" style="background:var(--accent-weak);color:var(--accent)">${icon('shield',24)}</div>
          <h3>${esc(title)}</h3>
          <div class="field">
            <label class="label">Sisesta grupi nimi käsitsi</label>
            <div style="display:flex;gap:6px">
              <input class="input" id="gpick-manual" type="text" placeholder="nt. GRP_ERP_Users" autocomplete="off" style="flex:1" />
              <button class="btn btn-primary" id="gpick-manual-add">Lisa</button>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin:4px 0">
            <div style="flex:1;height:1px;background:var(--border)"></div>
            <span style="font-size:11px;color:var(--ink-3)">või vali AD grupist</span>
            <div style="flex:1;height:1px;background:var(--border)"></div>
          </div>
          <div class="field">
            <div style="position:relative">
              <span style="position:absolute;left:9px;top:50%;transform:translateY(-50%);color:var(--ink-3);pointer-events:none">${icon('search',14)}</span>
              <input class="input" id="gpick-q" type="text" placeholder="Otsi grupi nime…" style="padding-left:30px" autocomplete="off" />
            </div>
            <div id="gpick-list" style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;margin-top:6px">
              <div style="padding:12px;font-size:13px;color:var(--ink-3)">Laen gruppe…</div>
            </div>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn" id="gpick-cancel">Loobu</button>
        </div>
      </div>`;
    const close = () => { ovl.innerHTML = ''; };
    document.getElementById('gpick-scrim').addEventListener('click', close);
    document.getElementById('gpick-cancel').addEventListener('click', close);

    const manualInput = document.getElementById('gpick-manual');
    const manualAdd   = document.getElementById('gpick-manual-add');
    const doManualAdd = () => {
      const val = manualInput.value.trim();
      if (!val) return;
      close();
      onSelect(val);
    };
    manualAdd.addEventListener('click', doManualAdd);
    manualInput.addEventListener('keydown', e => { if (e.key === 'Enter') doManualAdd(); });

    const existing = new Set(this._selected?.rightsGroups || []);
    let allGroups = [];

    const render = (q) => {
      const listEl = document.getElementById('gpick-list');
      if (!listEl) return;
      const filtered = (q
        ? allGroups.filter(g => g.name.toLowerCase().includes(q) || (g.desc||'').toLowerCase().includes(q))
        : allGroups).filter(g => !existing.has(g.name));
      listEl.innerHTML = filtered.slice(0, 60).map(g => `
        <div class="gpick-item" data-gname="${esc(g.name)}" style="display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer;border-radius:4px">
          <div class="grp-ic" style="flex-shrink:0;width:28px;height:28px">${icon('shield',13)}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px">${esc(g.name)}</div>
            <div style="font-size:11px;color:var(--ink-3)">${esc(g.desc||'')}${g.desc?' · ':''}${g.memberCount||0} liiget</div>
          </div>
        </div>`).join('') || `<div style="padding:12px;font-size:13px;color:var(--ink-3)">Gruppe ei leitud</div>`;

      listEl.querySelectorAll('.gpick-item').forEach(item => {
        item.addEventListener('click', () => { close(); onSelect(item.dataset.gname); });
      });
    };

    API.getGroups().then(r => { allGroups = r.groups || []; render(''); })
      .catch(() => {
        const listEl = document.getElementById('gpick-list');
        if (listEl) listEl.innerHTML = `<div style="padding:12px;font-size:13px;color:var(--bad)">Gruppide laadimine ebaõnnestus.</div>`;
      });

    document.getElementById('gpick-q')?.addEventListener('input', e => render(e.target.value.toLowerCase()));
    setTimeout(() => document.getElementById('gpick-manual')?.focus(), 50);
  },
};
