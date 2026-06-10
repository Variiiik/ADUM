/* User detail view */
'use strict';

Views.UserDetail = {
  _tab: 'general',
  _user: null,
  _groups: [],

  async render(container, sam) {
    if (!sam) { App.navigate('users'); return; }
    container.innerHTML = `<div class="content-inner"><div style="text-align:center;padding:60px"><div class="spinner" style="margin:auto"></div></div></div>`;

    try {
      const [userRes, groupsRes] = await Promise.all([API.getUser(sam), API.getGroups()]);
      this._user   = userRes.user;
      this._groups = groupsRes.groups || [];
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
    const auditEntries = window._auditCache || [];

    function fmtDT(iso) {
      if (!iso) return '—';
      const d = new Date(iso);
      if (isNaN(d)) return '—';
      return d.toLocaleDateString('et-EE') + ' ' + d.toLocaleTimeString('et-EE',{hour:'2-digit',minute:'2-digit'});
    }

    const tabDefs = [
      { id:'general',  label:'Üldinfo',       cnt:null },
      { id:'groups',   label:'Grupikuuluvused',cnt:u.groups.length },
      { id:'account',  label:'Konto seaded',  cnt:null },
      { id:'activity', label:'Tegevuslogi',   cnt:null },
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
      tabContent = `<div class="muted" style="font-size:13px;padding:8px 0">Näidatakse globaalse auditilogi kandeid selle kasutajaga seotult.</div>
        <div style="text-align:center;padding:20px;color:var(--ink-3)">${icon('info',20)}<div style="margin-top:8px;font-size:13px">Reaalajas tegevuslogi saadaval auditilogi vaates.</div></div>`;
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

          <div class="card card-pad">
            <h3 class="sec-title">Kokkuvõte</h3>
            <div style="display:flex;flex-direction:column;gap:12px">
              <div style="display:flex;justify-content:space-between"><span class="muted" style="font-size:13px">Grupikuuluvusi</span><b>${u.groups.length}</b></div>
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

    // Edit (admin only)
    if (isAdmin) {
      document.getElementById('ud-edit')?.addEventListener('click', () => Views.Users.openForm(u, null));
    }

    // Reset password
    document.getElementById('ud-reset')?.addEventListener('click', () => {
      App.confirm('Lähtesta parool', `Sisestage uus parool kasutajale "${u.displayName}".`,
        async (pw) => {
          if (!pw || pw.length < 8) { App.toast('warn','Parool liiga lühike'); return; }
          try { await API.resetPassword(u.sam, pw); App.toast('ok','Parool lähtestatud', u.displayName); }
          catch (err) { App.toast('bad','Viga', err.message); }
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
        App.confirm('Keela konto?', `Keelata kasutaja "${u.displayName}" konto? Sisselogimine blokeeritakse.`, async () => {
          try { await API.disableUser(u.sam); u.status='disabled'; App.toast('warn','Konto keelatud',u.displayName); self._renderDetail(container); }
          catch (err) { App.toast('bad','Viga',err.message); }
        }, { icon:'ban', confirmLabel:'Keela konto' });
      }
    });

    // Delete
    document.getElementById('ud-delete')?.addEventListener('click', () => {
      App.confirm('Kustuta kasutaja?', `Kasutaja "${u.displayName}" kustutatakse jäädavalt.`, async () => {
        try { await API.deleteUser(u.sam); App.toast('bad','Kasutaja kustutatud',u.displayName); App.navigate('users'); }
        catch (err) { App.toast('bad','Viga',err.message); }
      }, { icon:'trash', confirmLabel:'Kustuta jäädavalt' });
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
  },
};
