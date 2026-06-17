/* User detail view */
'use strict';

Views.UserDetail = {
  _tab:          'general',
  _user:         null,
  _groups:       [],
  _services:     [],
  _userSvcs:     [],
  _attrs:        null,
  _mail:         null,
  _outlookGroup: '',

  async render(container, sam) {
    if (!sam) { App.navigate('users'); return; }
    container.innerHTML = `<div class="content-inner"><div style="text-align:center;padding:60px"><div class="spinner" style="margin:auto"></div></div></div>`;

    this._attrs = null;
    this._mail  = null;
    try {
      const [userRes, groupsRes, svcsRes, userSvcsRes, auditRes, settingsRes] = await Promise.all([
        API.getUser(sam),
        API.getGroups(),
        API.getServices(),
        API.getUserServices(sam),
        API.getAuditForUser(sam),
        API.getSettings().catch(() => ({ settings: {} })),
      ]);
      this._user          = userRes.user;
      this._groups        = groupsRes.groups    || [];
      this._services      = svcsRes.services    || [];
      this._userSvcs      = userSvcsRes.services || [];
      this._auditEntries  = auditRes.entries    || [];
      this._outlookGroup  = settingsRes.settings?.mail?.outlookGroup || '';
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
      { id:'general',    label:'Üldinfo',        cnt: null },
      { id:'groups',     label:'Grupikuuluvused', cnt: u.groups.length },
      { id:'services',   label:'Teenused',        cnt: svcCount || null },
      { id:'account',    label:'Konto seaded',    cnt: null },
      { id:'email',      label:'Meilindus',       cnt: null },
      { id:'activity',   label:'Tegevuslogi',     cnt: null },
      ...(isAdmin ? [{ id:'attributes', label:'Atribuudid', cnt: null }] : []),
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

    } else if (tab === 'email') {
      tabContent = self._renderEmailTab(container);

    } else if (tab === 'activity') {
      tabContent = self._renderActivityTab();

    } else if (tab === 'attributes' && isAdmin) {
      tabContent = self._renderAttrsTab();
    }

    container.innerHTML = `<div class="content-inner">
      <div class="card detail-head">
        <div class="avatar-wrap${isAdmin ? ' editable' : ''}" id="ud-avatar-wrap">
          ${avatar(u, 76)}
          ${isAdmin ? `<div class="avatar-overlay">${icon('upload',16)}</div>
          <input type="file" id="ud-photo-input" accept="image/jpeg,image/png,image/webp" style="display:none">` : ''}
        </div>
        <div class="meta">
          <h2>${esc(u.displayName)}</h2>
          <div class="role">${esc(u.title)} · ${esc(u.department)}</div>
          <div class="chips">
            ${statusBadge(u.status)}
            ${u.mail ? `<span class="chip">${icon('mail',14)} ${esc(u.mail)}</span>` : ''}
            ${u.telephoneNumber ? `<span class="chip">${icon('phone',14)} ${esc(u.telephoneNumber)}</span>` : ''}
            ${u.employeeID ? `<span class="chip">${icon('id',14)} ${esc(u.employeeID)}</span>` : ''}
            ${self._outlookGroup
              ? (u.groups && u.groups.includes(self._outlookGroup)
                  ? `<span class="chip" style="background:#e1effe;color:#1a56db;border-color:#bfdbfe">${icon('mail',14)} Microsoft 365</span>`
                  : `<span class="chip" style="background:#dcfce7;color:#16a34a;border-color:#bbf7d0">${icon('mail',14)} Postfix</span>`)
              : ''}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
          ${isAdmin ? `<button class="btn" id="ud-edit">${icon('edit',16)} Muuda</button>` : ''}
          ${isHR && !isAdmin ? `<button class="btn" id="ud-hr-modify">${icon('edit',16)} Esita muutmistaotlus</button>` : ''}
          ${isAdmin && u.photo ? `<button class="btn ghost sm" id="ud-delete-photo" style="color:var(--bad)">${icon('trash',13)} Eemalda foto</button>` : ''}
        </div>
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

    // Photo upload / delete
    if (isAdmin) {
      const photoWrap  = document.getElementById('ud-avatar-wrap');
      const photoInput = document.getElementById('ud-photo-input');
      if (photoWrap && photoInput) {
        photoWrap.addEventListener('click', () => photoInput.click());
        photoInput.addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          if (file.size > 10 * 1024 * 1024) { App.toast('warn', 'Fail liiga suur', 'Maksimaalselt 10 MB'); return; }
          const reader = new FileReader();
          reader.onload = async (ev) => {
            try {
              const dataUrl = await resizePhoto(ev.target.result, 128, 0.90);
              await API.uploadUserPhoto(u.sam, dataUrl);
              self._user.photo = dataUrl;
              App.toast('ok', 'Foto uuendatud', u.displayName);
              self._renderDetail(container);
            } catch (err) { App.toast('bad', 'Foto üleslaadimine ebaõnnestus', err.message); }
          };
          reader.readAsDataURL(file);
        });
      }
      document.getElementById('ud-delete-photo')?.addEventListener('click', () => {
        App.confirm('Eemalda foto', `Eemaldada kasutaja "${u.displayName}" profiilipilt?`, async () => {
          try {
            await API.deleteUserPhoto(u.sam);
            self._user.photo = null;
            App.toast('ok', 'Foto eemaldatud', u.displayName);
            self._renderDetail(container);
          } catch (err) { App.toast('bad', 'Viga', err.message); }
        }, { icon: 'trash', confirmLabel: 'Eemalda' });
      });
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

    // Email tab — lazy load on first open
    if (tab === 'email' && isAdmin) {
      if (self._mail === null) {
        API.getUserMail(u.sam)
          .then(r => { self._mail = r; self._renderDetail(container); })
          .catch(err => App.toast('bad', 'Meilindusteabe laadimine ebaõnnestus', err.message));
      } else {
        self._bindEmailTabEvents(container, u);
      }
    }

    // Attributes tab — lazy load on first open
    if (tab === 'attributes' && isAdmin) {
      if (self._attrs === null) {
        API.getUserAttrs(u.sam)
          .then(r => { self._attrs = r.attrs || {}; self._renderDetail(container); })
          .catch(err => App.toast('bad', 'Atribuutide laadimine ebaõnnestus', err.message));
      } else {
        self._bindAttrsTabEvents(container, u);
      }
    }
  },

  // ── Email tab ────────────────────────────────────────────────────────────────

  _renderEmailTab() {
    if (this._mail === null) {
      return `<div style="text-align:center;padding:40px"><div class="spinner" style="margin:auto"></div></div>`;
    }
    const { mailType, aliases } = this._mail;
    const isOutlook = mailType === 'outlook';
    const typeLabel = isOutlook ? 'Microsoft 365 (Outlook)' : 'Postfix (kohalik meil)';
    const typeBadge = isOutlook
      ? `<span class="badge" style="background:#e1effe;color:#1a56db"><span class="dot" style="background:#1a56db"></span>${typeLabel}</span>`
      : `<span class="badge ok"><span class="dot"></span>${typeLabel}</span>`;

    return `
      <div class="kv" style="margin-bottom:20px">
        <div class="k">Meilisüsteem</div>
        <div class="v">${typeBadge}</div>
      </div>

      <div style="font-weight:600;font-size:13px;margin-bottom:10px">E-posti aliased</div>
      <div id="ud-alias-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px">
        ${aliases.length === 0
          ? `<div class="muted" style="font-size:13px;padding:8px 0">Ühtegi aliast pole lisatud.</div>`
          : aliases.map(a => `
              <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid var(--border);border-radius:7px;background:var(--surface-2)">
                <span class="mono" style="flex:1;font-size:13px">${esc(a)}</span>
                <button class="icon-act danger" data-rm-alias="${esc(a)}" title="Eemalda alias">${icon('x',14)}</button>
              </div>`).join('')}
      </div>

      <div style="display:flex;gap:8px;align-items:flex-end">
        <div class="field" style="flex:1;margin:0">
          <input class="input mono" id="ud-alias-input" placeholder="alias@domeen.ee" style="font-size:13px" />
        </div>
        <button class="btn primary sm" id="ud-alias-add">${icon('plus',14)} Lisa alias</button>
      </div>`;
  },

  _bindEmailTabEvents(container, u) {
    const self = this;

    container.querySelectorAll('[data-rm-alias]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const alias = btn.dataset.rmAlias;
        try {
          const r = await API.removeUserAlias(u.sam, alias);
          self._mail.aliases = r.aliases;
          self._renderDetail(container);
          App.toast('ok', 'Alias eemaldatud', alias);
        } catch (err) { App.toast('bad', 'Viga', err.message); }
      });
    });

    document.getElementById('ud-alias-add')?.addEventListener('click', async () => {
      const inp = document.getElementById('ud-alias-input');
      const alias = inp?.value.trim();
      if (!alias || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alias)) {
        App.toast('warn', 'Vigane alias', 'Sisesta korrektne e-posti aadress (nt alias@domeen.ee).');
        return;
      }
      try {
        const r = await API.addUserAlias(u.sam, alias);
        self._mail.aliases = r.aliases;
        self._renderDetail(container);
        App.toast('ok', 'Alias lisatud', alias);
      } catch (err) { App.toast('bad', 'Viga', err.message); }
    });

    document.getElementById('ud-alias-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('ud-alias-add')?.click();
    });
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
      MODIFY_ATTR:     { bg:'var(--accent-weak)', c:'var(--accent)',  ic:'tool'        },
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
      O: 'background:var(--role-o-bg);color:var(--role-o-ink)',
      T: 'background:var(--role-t-bg);color:var(--role-t-ink)',
      L: 'background:var(--role-l-bg);color:var(--role-l-ink)',
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
            ${svc.adLinked ? '' : `<span style="font-size:10.5px;color:var(--tag-local-ink)">kohalik</span>`}
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
          ${!svc.adLinked ? `<span style="font-size:10.5px;color:var(--tag-local-ink)">kohalik</span>` : ''}
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

  // ── Attribute editor tab ─────────────────────────────────────────────────────

  _renderAttrsTab() {
    if (this._attrs === null) {
      return `<div style="text-align:center;padding:40px"><div class="spinner" style="margin:auto"></div></div>`;
    }

    const editable = [];
    const readonly = [];
    for (const [k, v] of Object.entries(this._attrs).sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))) {
      (v.readonly ? readonly : editable).push([k, v.value]);
    }

    const rowHtml = (k, v, isReadonly) => {
      const valHtml = v
        ? `<span class="attr-val-text">${esc(v)}</span>`
        : `<span class="attr-val-text" style="color:var(--ink-3);font-style:italic">—</span>`;
      return `<div class="attr-row" data-attr="${esc(k)}" style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);min-height:34px">
        <span class="mono" style="flex:0 0 220px;font-size:11.5px;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:6px" title="${esc(k)}">${esc(k)}</span>
        <span class="attr-val" style="flex:1;font-size:12.5px;word-break:break-all;min-width:0">${valHtml}</span>
        <div style="flex-shrink:0;width:30px;display:flex;justify-content:center">
          ${!isReadonly
            ? `<button class="icon-act attr-edit-btn" data-attr="${esc(k)}" title="Muuda atribuut">${icon('edit', 13)}</button>`
            : `<span style="color:var(--ink-3);display:flex;align-items:center">${icon('lock', 12)}</span>`}
        </div>
      </div>`;
    };

    return `
      <div style="display:flex;gap:8px;margin-bottom:14px;align-items:center">
        <input class="input" id="attrs-search" placeholder="Otsi atribuudi nime..." style="flex:1;height:32px;font-size:13px">
        <button class="btn sm" id="attrs-add-btn" style="flex-shrink:0">${icon('plus', 13)} Lisa atribuut</button>
      </div>

      <div id="attrs-add-form" class="card" style="display:none;padding:14px;margin-bottom:14px;background:var(--surface-2)">
        <div style="font-size:12px;font-weight:600;color:var(--ink-2);margin-bottom:10px">Uus atribuut</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
          <div class="field" style="flex:0 0 190px">
            <label>Atribuudi nimi</label>
            <input class="input" id="attrs-new-name" placeholder="extensionAttribute1" style="font-family:monospace;font-size:13px">
          </div>
          <div class="field" style="flex:1;min-width:150px">
            <label>Väärtus</label>
            <input class="input" id="attrs-new-value" placeholder="">
          </div>
          <div style="display:flex;gap:6px;padding-bottom:1px">
            <button class="btn sm primary" id="attrs-new-save">${icon('save', 13)} Lisa</button>
            <button class="btn sm" id="attrs-new-cancel">Tühista</button>
          </div>
        </div>
      </div>

      <div id="attrs-list">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);padding:2px 0 6px;display:flex;align-items:center;gap:6px">
          Muudetavad <span class="badge neutral" style="font-size:10px">${editable.length}</span>
        </div>
        ${editable.length ? editable.map(([k, v]) => rowHtml(k, v, false)).join('') : `<div style="font-size:13px;color:var(--ink-3);padding:10px 0">Muudetavaid atribuute ei leitud.</div>`}

        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);padding:14px 0 6px;margin-top:8px;border-top:1px solid var(--border);display:flex;align-items:center;gap:6px">
          Kirjutuskaitstud <span class="badge neutral" style="font-size:10px">${readonly.length}</span>
        </div>
        ${readonly.map(([k, v]) => rowHtml(k, v, true)).join('')}
      </div>`;
  },

  _bindAttrsTabEvents(container, u) {
    const self = this;

    document.getElementById('attrs-search')?.addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      container.querySelectorAll('.attr-row').forEach(row => {
        row.style.display = (row.dataset.attr || '').toLowerCase().includes(q) ? '' : 'none';
      });
    });

    document.getElementById('attrs-add-btn')?.addEventListener('click', () => {
      const form = document.getElementById('attrs-add-form');
      if (!form) return;
      const show = form.style.display === 'none';
      form.style.display = show ? '' : 'none';
      if (show) document.getElementById('attrs-new-name')?.focus();
    });

    document.getElementById('attrs-new-cancel')?.addEventListener('click', () => {
      const form = document.getElementById('attrs-add-form');
      if (form) form.style.display = 'none';
    });

    document.getElementById('attrs-new-save')?.addEventListener('click', async () => {
      const nameEl  = document.getElementById('attrs-new-name');
      const valueEl = document.getElementById('attrs-new-value');
      const name    = nameEl?.value.trim();
      const value   = valueEl?.value ?? '';
      if (!name) { App.toast('warn', 'Atribuudi nimi puudub'); nameEl?.focus(); return; }
      const btn = document.getElementById('attrs-new-save');
      if (btn) { btn.disabled = true; btn.innerHTML = `<div class="spinner" style="width:12px;height:12px;display:inline-block"></div>`; }
      try {
        await API.setUserAttr(u.sam, name, value);
        self._attrs[name] = { value, readonly: false };
        App.toast('ok', 'Atribuut lisatud', name);
        self._renderDetail(container);
      } catch (err) {
        App.toast('bad', 'Viga', err.message);
        if (btn) { btn.disabled = false; btn.innerHTML = `${icon('save', 13)} Lisa`; }
      }
    });

    container.querySelectorAll('.attr-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const row      = btn.closest('.attr-row');
        if (!row) return;
        const attrName = row.dataset.attr;
        const valCell  = row.querySelector('.attr-val');
        if (!valCell || row.querySelector('.attr-inline-input')) return; // already editing

        const currentVal = self._attrs[attrName]?.value ?? '';

        valCell.innerHTML = `<input class="input attr-inline-input" value="${esc(currentVal)}" style="height:28px;font-size:12.5px;padding:3px 8px;width:100%">`;
        btn.style.display = 'none';

        const actionsDiv = document.createElement('div');
        actionsDiv.style.cssText = 'display:flex;gap:4px;flex-shrink:0';
        actionsDiv.innerHTML = `
          <button class="btn sm primary attr-save-btn" style="height:26px;font-size:11px;padding:0 8px">Salvesta</button>
          <button class="btn sm attr-cancel-btn" style="height:26px;font-size:11px;padding:0 8px">✕</button>`;
        row.appendChild(actionsDiv);

        const input = valCell.querySelector('.attr-inline-input');
        input?.focus();

        const revertRow = () => {
          const orig = self._attrs[attrName]?.value ?? '';
          valCell.innerHTML = orig
            ? `<span class="attr-val-text">${esc(orig)}</span>`
            : `<span class="attr-val-text" style="color:var(--ink-3);font-style:italic">—</span>`;
          btn.style.display = '';
          actionsDiv.remove();
        };

        const saveAttr = async () => {
          const newVal = input?.value ?? '';
          const saveBtn = actionsDiv.querySelector('.attr-save-btn');
          if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '…'; }
          try {
            await API.setUserAttr(u.sam, attrName, newVal);
            self._attrs[attrName].value = newVal;
            App.toast('ok', 'Salvestatud', attrName);
            revertRow(); // reads updated _attrs value, so shows newVal
          } catch (err) {
            App.toast('bad', 'Viga', err.message);
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Salvesta'; }
          }
        };

        input?.addEventListener('keydown', e => {
          if (e.key === 'Enter')  saveAttr();
          if (e.key === 'Escape') revertRow();
        });

        actionsDiv.querySelector('.attr-save-btn')?.addEventListener('click', saveAttr);
        actionsDiv.querySelector('.attr-cancel-btn')?.addEventListener('click', revertRow);
      });
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
            <span style="font-size:10.5px;color:var(--tag-local-ink);font-weight:500">kohalik</span>
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
