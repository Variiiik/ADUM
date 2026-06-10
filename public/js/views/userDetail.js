/* User detail view */
'use strict';

Views.UserDetail = {
  _tab:      'general',
  _user:     null,
  _groups:   [],
  _services: [],   // all services (for the services tab picker)
  _userSvcs: [],   // services the user belongs to

  async render(container, sam) {
    if (!sam) { App.navigate('users'); return; }
    container.innerHTML = `<div class="content-inner"><div style="text-align:center;padding:60px"><div class="spinner" style="margin:auto"></div></div></div>`;

    try {
      const [userRes, groupsRes, svcsRes, userSvcsRes, auditRes] = await Promise.all([
        API.getUser(sam),
        API.getGroups(),
        API.getServices(),
        API.getUserServices(sam),
        API.getAuditForUser(sam),
      ]);
      this._user          = userRes.user;
      this._groups        = groupsRes.groups    || [];
      this._services      = svcsRes.services    || [];
      this._userSvcs      = userSvcsRes.services || [];
      this._auditEntries  = auditRes.entries    || [];
    } catch (err) {
      container.innerHTML = `<div class="content-inner"><div class="empty">${icon('alert',40)}<div>${esc(err.message)}</div><button class="btn mt16" id="ud-back">Tagasi nimekirja</button></div></div>`;
      container.getElementById?.('ud-back')?.addEventListener('click', () => App.navigate('users'));
      return;
    }
    this._renderDetail(container);
  },

  _renderDetail(container) {
    const u       = this._user;
    const tab     = this._tab;
    const self    = this;
    const isAdmin = !!(App.state.user?.isAdmin);
    const isHR    = !!(App.state.user?.isHR);

    function fmtDT(iso) {
      if (!iso) return '—';
      const d = new Date(iso);
      if (isNaN(d)) return '—';
      return d.toLocaleDateString('et-EE') + ' ' + d.toLocaleTimeString('et-EE',{hour:'2-digit',minute:'2-digit'});
    }

    const svcCount = this._userSvcs.length;
    const tabDefs = [
      { id:'general',  label:'Üldinfo',        cnt: null },
      { id:'groups',   label:'Grupikuuluvused', cnt: u.groups.length },
      { id:'services', label:'Teenused',        cnt: svcCount || null },
      { id:'account',  label:'Konto seaded',    cnt: null },
      { id:'activity', label:'Tegevuslogi',     cnt: null },
    ];

    let tabContent = '';

    if (tab === 'general') {
      tabContent = `<div class="kv">
        <div class="k">Eesnimi</div><div class="v">${esc(u.givenName)}</div>
        <div class="k">Perekonnanimi</div><div class="v">${esc(u.sn)}</div>
        <div class="k">Kasutajanimi</div><div class="v"><span class="mono">${esc(u.sam)}</span></div>
        <div class="k">E-post</div><div class="v">${esc(u.mail)}</div>
        <div class="k">Telefon</div><div class="v">${esc(u.telephoneNumber||'—')}</div>
        <div class="k">Osakond</div><div class="v">${esc(u.department)}</div>
        <div class="k">Ametinimetus</div><div class="v">${esc(u.title)}</div>
        <div class="k">Juht</div><div class="v">${esc(u.manager||'—')}</div>
        <div class="k">Isikukood</div><div class="v"><span class="mono">${esc(u.employeeID||'—')}</span></div>
        ${u.employeeNumber ? `<div class="k">Dokumendi NR</div><div class="v"><span class="mono">${esc(u.employeeNumber)}</span></div>` : ''}
        <div class="k">OU asukoht</div><div class="v"><span class="mono" style="font-size:11.5px">${esc(u.ou)}</span></div>
      </div>`;

    } else if (tab === 'groups') {
      const available = this._groups.filter(g => !u.groups.includes(g.name));
      tabContent = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <span class="muted" style="font-size:13px">${u.groups.length} grupikuuluvust</span>
          ${isAdmin ? `<button class="btn sm primary" id="ud-add-group">${icon('plus',14)} Lisa gruppi</button>` : ''}
        </div>
        <div id="ud-group-picker" style="display:none" class="card" style="background:var(--surface-2);padding:6px;margin-bottom:12px">
          ${available.length === 0
            ? '<div class="muted" style="padding:10px;font-size:13px">Kõikidesse gruppidesse on juba lisatud.</div>'
            : available.map(g=>`<button class="qa-btn" data-gname="${esc(g.name)}" id="gp-${esc(g.name)}" style="margin-bottom:4px">
                <div class="grp-ic">${icon('shield',16)}</div>
                <div><div class="qt">${esc(g.name)}</div><div class="qs">${esc(g.desc)}</div></div>
                <span class="chev">${icon('plus',16)}</span>
              </button>`).join('')}
        </div>
        ${u.groups.map(gname => {
          const g = self._groups.find(x=>x.name===gname) || { name:gname, desc:'Turberühm', type:'Turberühm' };
          return `<div class="grp-item">
            <div class="grp-ic">${icon('shield',16)}</div>
            <div style="flex:1">
              <div class="nm">${esc(g.name)}</div>
              <div class="ds">${esc(g.desc)} · ${esc(g.type)}</div>
            </div>
            ${isAdmin && gname!=='Haigla-Kõik' ? `<button class="icon-act danger" title="Eemalda grupist" data-rm-group="${esc(gname)}">${icon('x',16)}</button>` : ''}
          </div>`;
        }).join('')}`;

    } else if (tab === 'services') {
      tabContent = self._renderServicesTab(u, isAdmin);

    } else if (tab === 'account') {
      tabContent = `<div class="kv">
        <div class="k">Konto olek</div><div class="v">${statusBadge(u.status)}</div>
        <div class="k">Parool viimati muudetud</div><div class="v">${esc(fmtDate(u.pwdLastSet))}</div>
        <div class="k">Parool ei aegu</div><div class="v">${u.pwNeverExpires?'Jah':'Ei'}</div>
        <div class="k">Peab parooli vahetama</div><div class="v">${u.mustChangePw?'Jah':'Ei'}</div>
        <div class="k">Viimane sisselogimine</div><div class="v">${esc(fmtDate(u.lastLogon))}</div>
        <div class="k">Konto lukustatud</div><div class="v">${u.status==='locked'?'<span class="badge warn"><span class="dot"></span>Jah</span>':'Ei'}</div>
      </div>`;

    } else if (tab === 'activity') {
      tabContent = self._renderActivityTab();
    }

    container.innerHTML = `<div class="content-inner">
      <div class="card detail-head">
        ${avatar(u, 76)}
        <div class="meta">
          <h2>${esc(u.displayName)}</h2>
          <div class="role">${esc(u.title)} · ${esc(u.department)}</div>
          <div class="chips">
            ${statusBadge(u.status)}
            ${u.mail ? `<span class="chip">${icon('mail',14)} ${esc(u.mail)}</span>` : ''}
            ${u.telephoneNumber ? `<span class="chip">${icon('phone',14)} ${esc(u.telephoneNumber)}</span>` : ''}
            ${u.employeeID ? `<span class="chip">${icon('id',14)} ${esc(u.employeeID)}</span>` : ''}
          </div>
        </div>
        ${isAdmin ? `<button class="btn" id="ud-edit">${icon('edit',16)} Muuda</button>` : ''}
        ${isHR && !isAdmin ? `<button class="btn" id="ud-hr-modify">${icon('edit',16)} Esita muutmistaotlus</button>` : ''}
      </div>

      <div class="detail-grid">
        <div class="card">
          <div class="tabs">
            ${tabDefs.map(t=>`<button class="tab${t.id===tab?' active':''}" data-tab="${t.id}">
              ${esc(t.label)}${t.cnt!=null?` (${t.cnt})`:''}
            </button>`).join('')}
          </div>
          <div class="card-pad">${tabContent}</div>
        </div>

        <div style="display:flex;flex-direction:column;gap:16px">
          ${isAdmin ? `<div class="card card-pad">
            <h3 class="sec-title">Konto toimingud</h3>
            <div class="action-list">
              <button class="btn" id="ud-reset">${icon('key',16)} Lähtesta parool</button>
              ${u.status==='locked' ? `<button class="btn" id="ud-unlock">${icon('unlock',16)} Ava lukk</button>` : ''}
              <button class="btn" id="ud-toggle">
                ${icon(u.status==='disabled'?'checkCircle':'ban',16)}
                ${u.status==='disabled' ? 'Luba konto' : 'Keela konto'}
              </button>
              <button class="btn danger" id="ud-delete">${icon('trash',16)} Kustuta kasutaja</button>
            </div>
          </div>` : ''}
          ${isHR && !isAdmin ? `<div class="card card-pad">
            <h3 class="sec-title">HR toimingud</h3>
            <p style="font-size:12px;color:var(--ink-3);margin:0 0 10px">Taotlused saadetakse administraatorile kinnitamiseks.</p>
            <div class="action-list">
              <button class="btn" id="ud-hr-disable">
                ${icon('ban',16)} ${u.status==='disabled' ? 'Taotle konto lubamist' : 'Taotle konto keelamist'}
              </button>
              <button class="btn danger" id="ud-hr-delete">${icon('trash',16)} Taotle kustutamist</button>
            </div>
          </div>` : ''}

          <div class="card card-pad">
            <h3 class="sec-title">Kokkuvõte</h3>
            <div style="display:flex;flex-direction:column;gap:12px">
              <div style="display:flex;justify-content:space-between"><span class="muted" style="font-size:13px">Grupikuuluvusi</span><b>${u.groups.length}</b></div>
              <div style="display:flex;justify-content:space-between"><span class="muted" style="font-size:13px">Teenuseid</span><b>${svcCount}</b></div>
              <div style="display:flex;justify-content:space-between"><span class="muted" style="font-size:13px">Viimane sisselogimine</span><b style="font-size:13px">${esc(fmtDate(u.lastLogon))}</b></div>
            </div>
          </div>
        </div>
      </div>
    </div>`;

    // Tab switching
    container.querySelectorAll('.tab[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        self._tab = btn.dataset.tab;
        self._renderDetail(container);
      });
    });

    // Edit
    if (isAdmin) {
      document.getElementById('ud-edit')?.addEventListener('click', () => Views.Users.openForm(u, null));
    }

    // Reset password
    document.getElementById('ud-reset')?.addEventListener('click', () => {
      App.confirm('Lähtesta parool', `Sisestage uus parool kasutajale "${u.displayName}".`,
        async (pw) => {
          if (!pw || pw.length < 8) { App.toast('warn','Parool liiga lühike'); return; }
          try {
            const r = await API.resetPassword(u.sam, pw);
            App.toast('ok', 'Parool lähtestatud', u.displayName);
            if (r.sms) {
              if (r.sms.simulated) {
                App.toast('ok', 'SMS simuleeritud (mock)', 'SMS saadeti simuleeritult.');
              } else if (r.sms.ok) {
                App.toast('ok', 'SMS saadetud', 'Uus parool edastati kasutajale SMS-iga.');
              } else {
                App.toast('warn', 'SMS ei saadetud', r.sms.reason || 'Teadmata põhjus');
              }
            }
          } catch (err) { App.toast('bad','Viga', err.message); }
        },
        { icon:'key', danger:false, confirmLabel:'Lähtesta',
          inputLabel:'Uus parool', inputType:'text', inputPlaceholder:'Uus parool', inputBtn:'Genereeri' }
      );
    });

    // Unlock
    document.getElementById('ud-unlock')?.addEventListener('click', async () => {
      try {
        await API.unlockUser(u.sam);
        u.status = 'active'; u.lockoutTime = 0;
        App.toast('ok','Konto avatud', u.displayName);
        self._renderDetail(container);
      } catch (err) { App.toast('bad','Viga', err.message); }
    });

    // Toggle enable/disable
    document.getElementById('ud-toggle')?.addEventListener('click', () => {
      if (u.status === 'disabled') {
        App.confirm('Luba konto?', `Lubada kasutaja "${u.displayName}" konto?`, async () => {
          try { await API.enableUser(u.sam); u.status='active'; App.toast('ok','Konto lubatud',u.displayName); self._renderDetail(container); }
          catch (err) { App.toast('bad','Viga',err.message); }
        }, { icon:'checkCircle', danger:false, confirmLabel:'Luba konto' });
      } else {
        self._openDisableChecklist(u, () => { u.status = 'disabled'; self._renderDetail(container); });
      }
    });

    // Delete
    document.getElementById('ud-delete')?.addEventListener('click', () => {
      self._openDeleteChecklist(u, () => App.navigate('users'));
    });

    // HR request buttons
    document.getElementById('ud-hr-modify')?.addEventListener('click', () => {
      self._openHrModifyForm(u, container);
    });
    document.getElementById('ud-hr-disable')?.addEventListener('click', () => {
      const isDisabled = u.status === 'disabled';
      const action     = isDisabled ? 'lubamist' : 'keelamist';
      App.confirm(
        `Taotle konto ${action}`,
        `Esita taotlus kasutaja "${u.displayName}" konto ${action}ks. Admin kinnitab muutuse.`,
        async (reason) => {
          try {
            await API.submitDisableRequest(u.sam, reason || '');
            App.toast('ok', 'Taotlus esitatud', `Konto ${action} taotlus saadetud adminile.`);
          } catch (err) { App.toast('bad', 'Viga', err.message); }
        },
        { icon: isDisabled ? 'checkCircle' : 'ban', danger: !isDisabled, confirmLabel: 'Esita taotlus',
          inputLabel: 'Põhjus (vabatahtlik)', inputPlaceholder: 'Selgitage lühidalt...' }
      );
    });
    document.getElementById('ud-hr-delete')?.addEventListener('click', () => {
      App.confirm(
        'Taotle kasutaja kustutamist',
        `Esita taotlus kasutaja "${u.displayName}" (${u.sam}) kustutamiseks. Admin kinnitab muutuse.`,
        async (reason) => {
          try {
            await API.submitDeleteRequest(u.sam, reason || '');
            App.toast('warn', 'Taotlus esitatud', 'Kustutamise taotlus saadetud adminile.');
          } catch (err) { App.toast('bad', 'Viga', err.message); }
        },
        { icon: 'trash', confirmLabel: 'Esita taotlus',
          inputLabel: 'Põhjus', inputPlaceholder: 'Miks kasutaja konto tuleks kustutada?' }
      );
    });

    // Groups tab events
    document.getElementById('ud-add-group')?.addEventListener('click', () => {
      const picker = document.getElementById('ud-group-picker');
      if (picker) picker.style.display = picker.style.display==='none' ? '' : 'none';
    });
    container.querySelectorAll('[data-gname]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await API.addToGroup(u.sam, btn.dataset.gname);
          u.groups.push(btn.dataset.gname);
          App.toast('ok','Gruppi lisatud', btn.dataset.gname);
          self._renderDetail(container);
        } catch (err) { App.toast('bad','Viga',err.message); }
      });
    });
    container.querySelectorAll('[data-rm-group]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const gname = btn.dataset.rmGroup;
        try {
          await API.removeFromGroup(u.sam, gname);
          u.groups = u.groups.filter(g=>g!==gname);
          App.toast('warn','Grupist eemaldatud', gname);
          self._renderDetail(container);
        } catch (err) { App.toast('bad','Viga',err.message); }
      });
    });

    // Activity tab events
    if (tab === 'activity') {
      document.getElementById('ud-audit-refresh')?.addEventListener('click', async () => {
        const btn = document.getElementById('ud-audit-refresh');
        if (btn) { btn.disabled = true; btn.innerHTML = `<div class="spinner" style="width:13px;height:13px;display:inline-block"></div>`; }
        try {
          const res = await API.getAuditForUser(u.sam);
          self._auditEntries = res.entries || [];
        } catch { /* keep existing */ }
        self._renderDetail(container);
      });
    }

    // Services tab events
    if (tab === 'services') {
      self._bindServicesTabEvents(container, u, isAdmin);
    }
  },

  // ── Activity tab ─────────────────────────────────────────────────────────────

  _renderActivityTab() {
    const entries = this._auditEntries || [];

    const ACTION_STYLE = {
      LOGIN:           { bg:'var(--ok-bg)',       c:'var(--ok-ink)',  ic:'checkCircle' },
      LOGOUT:          { bg:'var(--surface-3)',   c:'var(--ink-3)',   ic:'logout'      },
      CREATE_USER:     { bg:'var(--ok-bg)',       c:'var(--ok-ink)',  ic:'userPlus'    },
      MODIFY_USER:     { bg:'var(--accent-weak)', c:'var(--accent)',  ic:'edit'        },
      DELETE_USER:     { bg:'var(--bad-bg)',      c:'var(--bad-ink)', ic:'trash'       },
      RESET_PASSWORD:  { bg:'var(--accent-weak)', c:'var(--accent)',  ic:'key'         },
      ENABLE_USER:     { bg:'var(--ok-bg)',       c:'var(--ok-ink)',  ic:'checkCircle' },
      DISABLE_USER:    { bg:'var(--bad-bg)',      c:'var(--bad-ink)', ic:'ban'         },
      UNLOCK_USER:     { bg:'var(--ok-bg)',       c:'var(--ok-ink)',  ic:'unlock'      },
      GROUP_ADD:       { bg:'var(--accent-weak)', c:'var(--accent)',  ic:'group'       },
      GROUP_REMOVE:    { bg:'var(--warn-bg)',      c:'var(--warn-ink)',ic:'group'      },
      SMS_SENT:        { bg:'var(--ok-bg)',       c:'var(--ok-ink)',  ic:'phone'       },
      UPDATE_SERVICE:  { bg:'var(--accent-weak)', c:'var(--accent)',  ic:'briefcase'   },
    };

    function fmtDT(iso) {
      if (!iso) return '—';
      const d = new Date(iso);
      if (isNaN(d)) return '—';
      return d.toLocaleDateString('et-EE') + ' ' + d.toLocaleTimeString('et-EE',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    }

    const rows = entries.map(e => {
      const st = ACTION_STYLE[e.action] || { bg:'var(--surface-3)', c:'var(--ink-2)', ic:'info' };
      const resultBadge = e.result === 'success'
        ? '<span class="badge ok" style="font-size:10.5px"><span class="dot"></span>Õnnestus</span>'
        : e.result === 'failure'
        ? '<span class="badge bad" style="font-size:10.5px"><span class="dot"></span>Ebaõnnestus</span>'
        : '<span class="badge warn" style="font-size:10.5px"><span class="dot"></span>Hoiatus</span>';

      return `<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
        <div class="feed-ic" style="background:${st.bg};color:${st.c};flex-shrink:0;margin-top:2px">${icon(st.ic,13)}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span style="font-size:13px;font-weight:500">${esc(e.actionLabel||e.action)}</span>
            ${resultBadge}
          </div>
          ${e.details ? `<div style="font-size:11.5px;color:var(--ink-3);margin-top:2px">${esc(e.details)}</div>` : ''}
          <div style="font-size:11px;color:var(--ink-3);margin-top:2px">
            <span class="mono">${esc(e.actor)}</span> · ${esc(fmtDT(e.timestamp))}
          </div>
        </div>
      </div>`;
    }).join('');

    return `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span class="muted" style="font-size:13px">${entries.length} kannet</span>
        <button class="btn sm" id="ud-audit-refresh" style="font-size:12px;height:26px">${icon('refresh',13)} Uuenda</button>
      </div>
      <div id="ud-audit-list" style="max-height:420px;overflow-y:auto">
        ${rows || `<div class="empty" style="padding:30px">${icon('audit',32)}<div style="margin-top:8px;font-size:13px">Auditikandeid ei leitud</div></div>`}
      </div>`;
  },

  // ── Services tab ──────────────────────────────────────────────────────────────

  _renderServicesTab(u, isAdmin) {
    const userSvcs = this._userSvcs;

    const ROLE_LABEL = { O: 'Omanik', T: 'Tehniline isik', L: 'Liige' };
    const ROLE_STYLE = {
      O: 'background:var(--accent-weak);color:var(--accent)',
      T: 'background:#fff3e0;color:#e65100',
      L: 'background:#e8f5e9;color:#388e3c',
    };

    const svcRows = userSvcs.map(svc => {
      const roleBadges = (svc.userRoles || []).map(r =>
        `<span class="badge" style="font-size:10.5px;${ROLE_STYLE[r]||''}">${ROLE_LABEL[r]||r}</span>`
      ).join('');
      const groupBadges = (svc.userGroups || []).map(g =>
        `<span class="badge neutral" style="font-size:10.5px">${icon('shield',10)} ${esc(g)}</span>`
      ).join('');

      return `<div class="grp-item" style="align-items:flex-start;padding:8px 0" data-svc-id="${esc(svc.id)}">
        <div style="width:34px;height:34px;border-radius:8px;background:var(--accent-weak);color:var(--accent);display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">
          ${icon('briefcase',14)}
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span class="nm" style="font-size:13px">${esc(svc.name)}</span>
            ${svc.code ? `<span style="font-family:monospace;font-size:10.5px;background:var(--border);border-radius:4px;padding:1px 5px;color:var(--ink-2)">${esc(svc.code)}</span>` : ''}
            ${svc.adLinked ? '' : `<span style="font-size:10.5px;color:#6a1b9a">kohalik</span>`}
          </div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">
            ${roleBadges}${groupBadges}
          </div>
        </div>
      </div>`;
    });

    const hasAnyNonAdSvc = this._services.some(s => !s.adLinked && (s.rightsGroups||[]).length > 0);
    const hasAnySvc      = this._services.length > 0;

    return `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <span class="muted" style="font-size:13px">${userSvcs.length} teenust</span>
        ${isAdmin && hasAnySvc ? `<button class="btn sm primary" id="ud-add-svc-group">${icon('plus',14)} Lisa teenuse gruppi</button>` : ''}
      </div>
      ${svcRows.length === 0
        ? `<div class="muted" style="font-size:13px;padding:12px 0;text-align:center">${icon('briefcase',24)}<div style="margin-top:8px">Kasutajal pole teenuseid</div></div>`
        : svcRows.join('')}

      <!-- Service+group picker tree (hidden) -->
      <div id="ud-svc-picker" style="display:none;margin-top:14px">
        <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden">
          <div style="padding:8px 12px;background:var(--surface-2);border-bottom:1px solid var(--border);font-size:12px;font-weight:500;color:var(--ink-2)">
            Vali teenus ja grupp, kuhu kasutaja lisada
          </div>
          <div style="max-height:300px;overflow-y:auto">
            ${this._renderSvcGroupTree(u)}
          </div>
        </div>
      </div>`;
  },

  _renderSvcGroupTree(u) {
    const sam  = u.sam;
    const svcs = this._services.filter(s => (s.rightsGroups||[]).length > 0);
    if (!svcs.length) return `<div style="padding:14px;font-size:13px;color:var(--ink-3)">Teenustel pole õiguste gruppe.</div>`;

    return svcs.map(svc => {
      // Which groups can the user be added to (not already a member for non-AD services)
      const groups = (svc.rightsGroupDetails || svc.rightsGroups.map(n => ({ name: n })));
      const rows = groups.map(g => {
        const alreadyIn = !svc.adLinked && ((svc.groupMembers||{})[g.name]||[]).includes(sam);
        return `<div class="svc-tree-item" data-svc-id="${esc(svc.id)}" data-gname="${esc(g.name)}"
          data-ad-linked="${svc.adLinked ? '1' : '0'}"
          style="display:flex;align-items:center;gap:10px;padding:7px 16px 7px 32px;border-top:1px solid var(--border);
          ${alreadyIn ? 'opacity:.45;pointer-events:none' : 'cursor:pointer'}">
          <div class="grp-ic" style="flex-shrink:0">${icon('shield',13)}</div>
          <div style="flex:1;min-width:0">
            <span style="font-size:12.5px">${esc(g.name)}</span>
            ${alreadyIn ? `<span style="font-size:11px;color:var(--ink-3);margin-left:6px">juba liige</span>` : ''}
          </div>
          ${icon('plus',13)}
        </div>`;
      }).join('');

      return `
        <div style="background:var(--surface-2);padding:7px 12px;display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:500;border-top:1px solid var(--border)">
          ${icon('briefcase',13)}
          <span style="flex:1">${esc(svc.name)}</span>
          ${svc.code ? `<span style="font-family:monospace;font-size:10.5px;background:var(--border);border-radius:4px;padding:1px 5px">${esc(svc.code)}</span>` : ''}
          ${!svc.adLinked ? `<span style="font-size:10.5px;color:#6a1b9a">kohalik</span>` : ''}
        </div>
        ${rows}`;
    }).join('');
  },

  _bindServicesTabEvents(container, u, isAdmin) {
    const self = this;

    document.getElementById('ud-add-svc-group')?.addEventListener('click', () => {
      const picker = document.getElementById('ud-svc-picker');
      if (picker) picker.style.display = picker.style.display === 'none' ? '' : 'none';
    });

    container.querySelectorAll('.svc-tree-item').forEach(item => {
      item.addEventListener('click', async () => {
        const svcId    = item.dataset.svcId;
        const gname    = item.dataset.gname;
        const adLinked = item.dataset.adLinked === '1';

        try {
          if (adLinked) {
            // Add to AD group via existing users route
            await API.addToGroup(u.sam, gname);
            if (!u.groups.includes(gname)) u.groups.push(gname);
          } else {
            // Add to non-AD service group
            const r = await API.addServiceGroupMember(svcId, gname, u.sam);
            // Refresh user services list
            const refreshed = await API.getUserServices(u.sam);
            self._userSvcs = refreshed.services || [];
            // Update services list too
            const svcIdx = self._services.findIndex(s => s.id === svcId);
            if (svcIdx !== -1) self._services[svcIdx] = r.service;
          }
          App.toast('ok', 'Lisatud teenuse gruppi', gname);
          self._renderDetail(container);
        } catch (err) { App.toast('bad', 'Viga', err.message); }
      });
    });
  },

  // ── HR muutmistaotluse modaal ─────────────────────────────────────────────────

  _openHrModifyForm(u, container) {
    const ovl = document.getElementById('overlay');
    ovl.innerHTML = `
      <div class="scrim" id="hrmod-scrim"></div>
      <div class="modal" role="dialog" aria-modal="true" style="max-width:480px">
        <div class="modal-body">
          <div class="modal-ic" style="background:var(--accent-weak);color:var(--accent)">${icon('edit',24)}</div>
          <h3>Esita muutmistaotlus</h3>
          <p style="font-size:13px;color:var(--ink-2);margin:0 0 12px">Täitke ainult väljad, mida soovite muuta. Tühjad väljad jäetakse muutmata.</p>
          <div class="field"><label class="label">Eesnimi</label>
            <input class="input" id="hrm-givenName" value="${esc(u.givenName||u.displayName?.split(' ')[0]||'')}" /></div>
          <div class="field"><label class="label">Perekonnanimi</label>
            <input class="input" id="hrm-sn" value="${esc(u.sn||u.displayName?.split(' ').slice(1).join(' ')||'')}" /></div>
          <div class="field"><label class="label">E-post</label>
            <input class="input" id="hrm-mail" type="email" value="${esc(u.mail||'')}" /></div>
          <div class="field"><label class="label">Osakond</label>
            <input class="input" id="hrm-department" value="${esc(u.department||'')}" /></div>
          <div class="field"><label class="label">Ametinimetus</label>
            <input class="input" id="hrm-title" value="${esc(u.title||'')}" /></div>
          <div class="field"><label class="label">Põhjus / selgitus (vabatahtlik)</label>
            <input class="input" id="hrm-reason" placeholder="Miks on muutmine vajalik?" /></div>
        </div>
        <div class="modal-foot">
          <button class="btn" id="hrmod-cancel">Loobu</button>
          <button class="btn primary" id="hrmod-submit">Esita taotlus</button>
        </div>
      </div>`;

    const close = () => { ovl.innerHTML = ''; };
    document.getElementById('hrmod-scrim').addEventListener('click', close);
    document.getElementById('hrmod-cancel').addEventListener('click', close);
    document.getElementById('hrmod-submit').addEventListener('click', async () => {
      const orig = {
        givenName:  u.givenName  || u.displayName?.split(' ')[0] || '',
        sn:         u.sn         || u.displayName?.split(' ').slice(1).join(' ') || '',
        mail:       u.mail       || '',
        department: u.department || '',
        title:      u.title      || '',
      };
      const changes = {};
      ['givenName','sn','mail','department','title'].forEach(f => {
        const val = document.getElementById('hrm-' + f)?.value.trim() ?? '';
        if (val !== (orig[f]||'').trim()) changes[f] = val;
      });
      if (!Object.keys(changes).length) {
        App.toast('warn', 'Muutusi pole', 'Ükski väli ei muutunud.'); return;
      }
      const reason = document.getElementById('hrm-reason')?.value.trim();
      const btn = document.getElementById('hrmod-submit');
      btn.disabled = true; btn.textContent = 'Saadan…';
      try {
        await API.submitModifyRequest(u.sam, changes, reason);
        close();
        App.toast('ok', 'Taotlus esitatud', 'Muutmistaotlus saadetud administraatorile.');
      } catch (err) { btn.disabled = false; btn.textContent = 'Esita taotlus'; App.toast('bad','Viga',err.message); }
    });
  },

  // ── Checklist helpers ────────────────────────────────────────────────────────

  _buildLocalEntries() {
    const entries = [];
    for (const svc of this._userSvcs) {
      if (svc.adLinked) continue;
      const roles = [];
      if ((svc.userRoles || []).includes('O')) roles.push('Omanik');
      if ((svc.userRoles || []).includes('T')) roles.push('Tehniline isik');
      for (const gname of (svc.userGroups || [])) roles.push(gname);
      if (!roles.length) continue;
      const full = this._services.find(s => s.id === svc.id) || {};
      const owners = (full.owners || []).join(', ') || '—';
      const tech   = full.technicalPerson || '—';
      entries.push({ svc, roles, owners, tech });
    }
    return entries;
  },

  _renderChecklistRow(e, i, chkAttr) {
    return `
      <label style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;cursor:pointer;background:var(--surface)">
        <input type="checkbox" ${chkAttr}="${i}" style="margin-top:3px;flex-shrink:0" />
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span style="font-weight:600;font-size:13px">${esc(e.svc.name)}</span>
            <span style="font-size:10.5px;color:#6a1b9a;font-weight:500">kohalik</span>
          </div>
          <div style="font-size:11.5px;color:var(--ink-2);margin-top:2px">
            Kasutaja roll: <b>${esc(e.roles.join(', '))}</b>
          </div>
          <div style="font-size:11px;color:var(--ink-3);margin-top:3px;display:flex;gap:12px;flex-wrap:wrap">
            <span>${icon('user',11)} Omanik: <b>${esc(e.owners)}</b></span>
            <span>${icon('tool',11)} Tehniline: <b>${esc(e.tech)}</b></span>
          </div>
        </div>
      </label>`;
  },

  // ── Disable checklist ────────────────────────────────────────────────────────

  _openDisableChecklist(u, onSuccess) {
    const sam = u.sam;
    const localEntries = this._buildLocalEntries();

    // No local services → simple confirm
    if (localEntries.length === 0) {
      App.confirm('Keela konto?', `Keelata kasutaja "${u.displayName}" konto? Sisselogimine blokeeritakse.`, async () => {
        try { await API.disableUser(sam); u.status='disabled'; App.toast('warn','Konto keelatud',u.displayName); onSuccess?.(); }
        catch (err) { App.toast('bad','Viga',err.message); }
      }, { icon:'ban', confirmLabel:'Keela konto' });
      return;
    }

    const ovl = document.getElementById('overlay');
    ovl.innerHTML = `
      <div class="scrim" id="dis-scrim"></div>
      <div class="modal" role="dialog" aria-modal="true" style="max-width:540px">
        <div class="modal-body" style="text-align:left">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
            ${icon('ban',22)}
            <h3 style="margin:0">Kohalike ligipääsude kontroll — ${esc(u.displayName)}</h3>
          </div>
          <p style="font-size:13px;color:var(--ink-2);margin:0 0 14px">
            Kasutajal on ligipääs järgmistesse kohalikesse süsteemidesse. AD-konto keelamine neid automaatselt ei blokeeri. Kinnita, et oled kontakteerunud vastutavate isikutega.
          </p>
          <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:6px">
            ${localEntries.map((e, i) => this._renderChecklistRow(e, i, 'data-dis-chk')).join('')}
          </div>
          <div style="font-size:12px;color:var(--ink-3)" id="dis-chk-hint">
            ${icon('info',13)} Kinnita kõik ${localEntries.length} süsteemi, et keelamine lubada.
          </div>
        </div>
        <div class="modal-foot" style="gap:8px">
          <button class="btn" id="dis-cancel">Loobu</button>
          <button class="btn danger" id="dis-confirm" disabled>${icon('ban',14)} Keela konto</button>
        </div>
      </div>`;

    const checkboxes = ovl.querySelectorAll('[data-dis-chk]');
    const confirmBtn = ovl.querySelector('#dis-confirm');
    const hintEl     = ovl.querySelector('#dis-chk-hint');
    const self       = this;

    function updateState() {
      const checkedCount = [...checkboxes].filter(c => c.checked).length;
      const allDone = checkedCount === localEntries.length;
      confirmBtn.disabled = !allDone;
      if (allDone) {
        hintEl.innerHTML = `${icon('checkCircle',13)} Kõik ${localEntries.length} süsteemi kinnitatud — keelamine lubatud.`;
        hintEl.style.color = 'var(--ok-ink)';
      } else {
        hintEl.innerHTML = `${icon('info',13)} Kinnitatud ${checkedCount} / ${localEntries.length}.`;
        hintEl.style.color = 'var(--ink-3)';
      }
    }

    checkboxes.forEach(cb => cb.addEventListener('change', updateState));
    ovl.querySelector('#dis-cancel').addEventListener('click',  () => { ovl.innerHTML = ''; });
    ovl.querySelector('#dis-scrim').addEventListener('click',   () => { ovl.innerHTML = ''; });
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Keelatakse…';
      try {
        await API.disableUser(sam);
        ovl.innerHTML = '';
        u.status = 'disabled';
        App.toast('warn', 'Konto keelatud', u.displayName);
        onSuccess?.();
      } catch (err) {
        App.toast('bad', 'Viga', err.message);
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `${icon('ban',14)} Keela konto`;
      }
    });
  },

  // ── Delete checklist ─────────────────────────────────────────────────────────

  _openDeleteChecklist(u, onSuccess) {
    const sam = u.sam;
    const localEntries = this._buildLocalEntries();

    // No local services → simple confirm
    if (localEntries.length === 0) {
      App.confirm('Kustuta kasutaja?', `Kasutaja "${u.displayName}" kustutatakse jäädavalt.`, async () => {
        try { await API.deleteUser(sam); App.toast('bad','Kasutaja kustutatud', u.displayName); onSuccess?.(); }
        catch (err) { App.toast('bad','Viga', err.message); }
      }, { icon:'trash', confirmLabel:'Kustuta jäädavalt' });
      return;
    }

    // Show checklist modal
    const ovl = document.getElementById('overlay');
    ovl.innerHTML = `
      <div class="scrim" id="del-scrim"></div>
      <div class="modal" role="dialog" aria-modal="true" style="max-width:540px">
        <div class="modal-body" style="text-align:left">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
            ${icon('alertTriangle',22)}
            <h3 style="margin:0">Ringkäigu kontroll — ${esc(u.displayName)}</h3>
          </div>
          <p style="font-size:13px;color:var(--ink-2);margin:0 0 14px">
            Kasutaja on järgmistes kohalikes süsteemides. Kinnita iga süsteemi juures, et kasutaja on sealt eemaldatud, seejärel saab konto kustutada.
          </p>
          <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:6px">
            ${localEntries.map((e, i) => this._renderChecklistRow(e, i, 'data-chk')).join('')}
          </div>
          <div style="font-size:12px;color:var(--ink-3)" id="del-chk-hint">
            ${icon('info',13)} Kinnita kõik ${localEntries.length} süsteemi, et kustutamine lubada.
          </div>
        </div>
        <div class="modal-foot" style="gap:8px">
          <button class="btn" id="del-cancel">Loobu</button>
          <button class="btn danger" id="del-confirm" disabled>${icon('trash',14)} Kustuta kasutaja</button>
        </div>
      </div>`;

    const checkboxes  = ovl.querySelectorAll('[data-chk]');
    const confirmBtn  = ovl.querySelector('#del-confirm');
    const hintEl      = ovl.querySelector('#del-chk-hint');

    function updateConfirmState() {
      const checkedCount = [...checkboxes].filter(c => c.checked).length;
      const allDone = checkedCount === localEntries.length;
      confirmBtn.disabled = !allDone;
      if (allDone) {
        hintEl.innerHTML = `${icon('checkCircle',13)} Kõik ${localEntries.length} süsteemi kinnitatud — kustutamine lubatud.`;
        hintEl.style.color = 'var(--ok-ink)';
      } else {
        hintEl.innerHTML = `${icon('info',13)} Kinnitatud ${checkedCount} / ${localEntries.length}.`;
        hintEl.style.color = 'var(--ink-3)';
      }
    }

    checkboxes.forEach(cb => cb.addEventListener('change', updateConfirmState));

    ovl.querySelector('#del-cancel').addEventListener('click',  () => { ovl.innerHTML = ''; });
    ovl.querySelector('#del-scrim').addEventListener('click',   () => { ovl.innerHTML = ''; });
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Kustutamine…';
      try {
        await API.deleteUser(sam);
        ovl.innerHTML = '';
        App.toast('bad', 'Kasutaja kustutatud', u.displayName);
        onSuccess?.();
      } catch (err) {
        App.toast('bad', 'Viga', err.message);
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `${icon('trash',14)} Kustuta kasutaja`;
      }
    });
  },
};
