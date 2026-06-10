/* Requests view — HR submits, admin approves/rejects */
'use strict';

Views.Requests = {
  _requests: [],
  _tab: 'pending',

  async render(container) {
    container.innerHTML = `<div class="content-inner"><div style="text-align:center;padding:60px"><div class="spinner" style="margin:auto"></div></div></div>`;
    try {
      const { requests } = await API.getRequests();
      this._requests = requests || [];
    } catch (err) {
      container.innerHTML = `<div class="content-inner"><div class="empty">${icon('alert',40)}<div>${esc(err.message)}</div></div></div>`;
      return;
    }
    this._renderList(container);
  },

  _renderList(container) {
    const isAdmin = !!(App.state.user?.isAdmin);
    const tab     = this._tab;
    const all     = this._requests;

    const filtered = all.filter(r => r.status === tab);

    const counts = {
      pending:  all.filter(r => r.status === 'pending').length,
      approved: all.filter(r => r.status === 'approved').length,
      rejected: all.filter(r => r.status === 'rejected').length,
    };

    const TABS = [
      { id:'pending',  label:'Ootel',        ic:'clock'       },
      { id:'approved', label:'Kinnitatud',   ic:'checkCircle' },
      { id:'rejected', label:'Tagasi lükatud',ic:'ban'        },
    ];

    const statusBadgeReq = (s) => {
      if (s === 'pending')  return `<span class="badge warn"><span class="dot"></span>Ootel</span>`;
      if (s === 'approved') return `<span class="badge ok"><span class="dot"></span>Kinnitatud</span>`;
      return `<span class="badge bad"><span class="dot"></span>Tagasi lükatud</span>`;
    };

    const fmtDT = (iso) => {
      if (!iso) return '—';
      const d = new Date(iso);
      if (isNaN(d)) return '—';
      return d.toLocaleDateString('et-EE') + ' ' +
        d.toLocaleTimeString('et-EE', { hour:'2-digit', minute:'2-digit' });
    };

    const rowsHtml = filtered.length === 0
      ? `<tr><td colspan="7"><div class="empty" style="padding:36px">
          ${icon('briefcase',40)}<div>Taotlusi ei ole.</div>
         </div></td></tr>`
      : filtered.map(r => {
          const d = r.data || {};
          return `<tr data-id="${esc(r.id)}">
            <td>
              <div style="font-weight:600;font-size:13.5px">${esc(d.givenName||'')} ${esc(d.sn||'')}</div>
              <div style="font-size:12px;color:var(--ink-3)">${esc(d.department||'')}</div>
            </td>
            <td><span class="mono">${esc(d.username||'')}</span></td>
            <td class="muted">${esc(d.mail||'')}</td>
            ${isAdmin ? `<td>${esc(r.submittedByName||r.submittedBy)}</td>` : ''}
            <td class="muted" style="font-size:12px;white-space:nowrap">${esc(fmtDT(r.submittedAt))}</td>
            <td>${statusBadgeReq(r.status)}
              ${r.rejectionReason ? `<div style="font-size:11px;color:var(--bad-ink);margin-top:3px" title="${esc(r.rejectionReason)}">${esc(r.rejectionReason.slice(0,60))}${r.rejectionReason.length>60?'…':''}</div>` : ''}
            </td>
            <td>
              <div class="row-actions">
                ${r.status === 'pending' && isAdmin ? `
                  <button class="btn sm primary" data-action="approve" data-id="${esc(r.id)}">${icon('check',14)} Kinnita</button>
                  <button class="btn sm danger"  data-action="reject"  data-id="${esc(r.id)}">${icon('x',14)} Lükka tagasi</button>
                ` : ''}
                ${r.status === 'pending' && !isAdmin ? `
                  <button class="icon-act danger" title="Tühista" data-action="delete" data-id="${esc(r.id)}">${icon('trash',16)}</button>
                ` : ''}
                <button class="icon-act" title="Vaata" data-action="view" data-id="${esc(r.id)}">${icon('edit',16)}</button>
              </div>
            </td>
          </tr>`;
        }).join('');

    container.innerHTML = `<div class="content-inner">
      <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap;align-items:center">
        ${TABS.map(t => `
          <button class="btn${t.id===tab?' primary':''}" data-rtab="${t.id}">
            ${icon(t.ic,15)} ${esc(t.label)}
            ${counts[t.id] > 0 ? `<span style="background:${t.id==='pending'?'var(--warn-ink)':'currentColor'};color:${t.id==='pending'?'#fff':'var(--surface)'};border-radius:99px;padding:1px 7px;font-size:11px;margin-left:4px;font-weight:700">${counts[t.id]}</span>` : ''}
          </button>`).join('')}
        <span style="flex:1"></span>
        ${!isAdmin ? `<button class="btn primary" id="req-new">${icon('plus',16)} Esita uus taotlus</button>` : ''}
      </div>

      <div class="card">
        <div class="tbl-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>Kasutaja</th>
                <th>Kasutajanimi</th>
                <th>E-post</th>
                ${isAdmin ? '<th>Esitaja</th>' : ''}
                <th>Esitatud</th>
                <th>Olek</th>
                <th style="width:160px;text-align:right">Toimingud</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>
    </div>`;

    const self = this;

    // Tab switch
    container.querySelectorAll('[data-rtab]').forEach(btn => {
      btn.addEventListener('click', () => { self._tab = btn.dataset.rtab; self._renderList(container); });
    });

    // HR: new request button opens the users form in request mode
    document.getElementById('req-new')?.addEventListener('click', () => {
      Views.Users._requestMode = true;
      App.navigate('users', { new: true });
    });

    // Row actions
    container.querySelectorAll('[data-action]').forEach(btn => {
      const { action, id } = btn.dataset;
      if (action === 'approve') btn.addEventListener('click', () => self._doApprove(id, container));
      if (action === 'reject')  btn.addEventListener('click', () => self._doReject(id, container));
      if (action === 'delete')  btn.addEventListener('click', () => self._doDelete(id, container));
      if (action === 'view')    btn.addEventListener('click', () => self._showDetail(id));
    });
  },

  _doApprove(id, container) {
    const item = this._requests.find(r => r.id === id);
    if (!item) return;
    const d = item.data || {};
    App.confirm(
      'Kinnita konto loomine',
      `Luuakse konto kasutajale ${d.givenName || ''} ${d.sn || ''} (${d.username || ''}).`,
      async (password) => {
        if (!password || password.length < 8) {
          App.toast('warn', 'Parool liiga lühike', 'Vähemalt 8 tähemärki.');
          return;
        }
        try {
          await API.approveRequest(id, { password });
          App.toast('ok', 'Konto loodud', `${d.givenName || ''} ${d.sn || ''} · ${d.username || ''}`);
          await this.render(container);
          App.renderSidebar();
        } catch (err) {
          App.toast('bad', 'Kinnitamine ebaõnnestus', err.message);
        }
      },
      {
        icon:             'checkCircle',
        danger:           false,
        confirmLabel:     'Loo konto',
        cancelLabel:      'Loobu',
        inputLabel:       `Parool kasutajale ${d.username || ''}`,
        inputType:        'text',
        inputPlaceholder: d.password || '••••••••',
        inputBtn:         'Genereeri',
        inputHint:        'Parool saadetakse kasutajale',
      }
    );
    // Pre-fill with submitted password after modal renders
    requestAnimationFrame(() => {
      const inp = document.getElementById('modal-input');
      if (inp && d.password) inp.value = d.password;
    });
  },

  _doReject(id, container) {
    const item = this._requests.find(r => r.id === id);
    if (!item) return;
    const d = item.data || {};
    App.confirm(
      'Lükka taotlus tagasi',
      `Taotlus ${d.username || ''} lükatakse tagasi.`,
      async (reason) => {
        try {
          await API.rejectRequest(id, reason || '');
          App.toast('warn', 'Taotlus tagasi lükatud', d.username || '');
          await this.render(container);
          App.renderSidebar();
        } catch (err) {
          App.toast('bad', 'Viga', err.message);
        }
      },
      {
        icon:             'ban',
        danger:           true,
        confirmLabel:     'Lükka tagasi',
        cancelLabel:      'Loobu',
        inputLabel:       'Põhjus (valikuline)',
        inputType:        'text',
        inputPlaceholder: 'Tagasilükkamise põhjus…',
      }
    );
  },

  async _doDelete(id, container) {
    App.confirm('Tühista taotlus?', 'Taotlus kustutatakse jäädavalt.',
      async () => {
        try {
          await API.deleteRequest(id);
          this._requests = this._requests.filter(r => r.id !== id);
          App.toast('ok', 'Taotlus tühistatud');
          this._renderList(container);
        } catch (err) {
          App.toast('bad', 'Viga', err.message);
        }
      },
      { icon: 'trash', confirmLabel: 'Tühista taotlus' }
    );
  },

  _showDetail(id) {
    const item = this._requests.find(r => r.id === id);
    if (!item) return;
    const d = item.data || {};
    const rows = [
      ['Eesnimi', d.givenName],
      ['Perekonnanimi', d.sn],
      ['Kasutajanimi', d.username],
      ['E-post', d.mail],
      ['Osakond', d.department],
      ['Ametinimetus', d.title],
      ['Telefon', d.telephoneNumber],
      ['Juht', d.manager],
      ['AD asukoht', d.ou],
    ].filter(r => r[1]);

    const ovl = document.getElementById('overlay');
    ovl.innerHTML = `
      <div class="scrim" id="detail-scrim"></div>
      <div class="modal" role="dialog" aria-modal="true" style="max-width:520px">
        <div class="modal-body" style="text-align:left">
          <h3 style="margin-bottom:16px">${icon('briefcase',20)} Taotluse andmed</h3>
          <table style="width:100%;font-size:13px;border-collapse:collapse">
            ${rows.map(r=>`<tr>
              <td style="color:var(--ink-3);padding:5px 0;width:140px">${esc(r[0])}</td>
              <td style="font-weight:500">${esc(r[1]||'')}</td>
            </tr>`).join('')}
          </table>
        </div>
        <div class="modal-foot">
          <button class="btn" id="detail-close">Sulge</button>
        </div>
      </div>`;
    document.getElementById('detail-scrim').addEventListener('click', () => { ovl.innerHTML = ''; });
    document.getElementById('detail-close').addEventListener('click', () => { ovl.innerHTML = ''; });
  },
};
