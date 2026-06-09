/* Groups view */
'use strict';

Views.Groups = {
  _groups: [],

  async render(container) {
    container.innerHTML = `<div class="content-inner"><div style="text-align:center;padding:60px"><div class="spinner" style="margin:auto"></div></div></div>`;
    try {
      const res = await API.getGroups();
      this._groups = res.groups || [];
    } catch (err) {
      container.innerHTML = `<div class="content-inner"><div class="empty">${icon('alert',40)}<div>${esc(err.message)}</div></div></div>`;
      return;
    }
    this._renderList(container);
  },

  _renderList(container) {
    const groups = this._groups;
    container.innerHTML = `<div class="content-inner">
      <div class="toolbar">
        <div style="flex:1"></div>
      </div>
      <div class="card">
        <div class="tbl-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>Grupi nimi</th>
                <th>Kirjeldus</th>
                <th>Tüüp</th>
                <th>Liikmeid</th>
                <th style="text-align:right;width:80px">Toimingud</th>
              </tr>
            </thead>
            <tbody>
              ${groups.length === 0 ? `<tr><td colspan="5"><div class="empty">${icon('group',40)}<div>Gruppe ei leitud.</div></div></td></tr>` :
                groups.map(g => `<tr data-gname="${esc(g.name)}">
                  <td>
                    <div class="cell-user">
                      <div class="grp-ic">${icon('shield',16)}</div>
                      <span class="nm">${esc(g.name)}</span>
                    </div>
                  </td>
                  <td class="muted">${esc(g.desc)}</td>
                  <td><span class="badge neutral">${esc(g.type)}</span></td>
                  <td><b>${g.memberCount||0}</b></td>
                  <td>
                    <div class="row-actions">
                      <button class="icon-act" title="Liikmed" data-action="members">${icon('users',16)}</button>
                    </div>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;

    const self = this;
    container.querySelectorAll('tr[data-gname]').forEach(row => {
      row.querySelector('[data-action="members"]')?.addEventListener('click', () => {
        const g = self._groups.find(x => x.name === row.dataset.gname);
        if (g) self._openMembersPanel(g);
      });
    });
  },

  _openMembersPanel(group) {
    const ovl = document.getElementById('overlay');
    const members = group.members || [];
    ovl.innerHTML = `
      <div class="scrim" id="grp-scrim"></div>
      <div class="drawer" role="dialog" aria-modal="true" style="width:500px">
        <div class="drawer-head">
          <div class="grp-ic">${icon('shield',18)}</div>
          <div style="flex:1">
            <h2>${esc(group.name)}</h2>
            <div class="sub">${esc(group.desc)} · ${esc(group.type)}</div>
          </div>
          <button class="x-btn" id="grp-close">${icon('x',18)}</button>
        </div>
        <div class="drawer-body">
          <div style="margin-bottom:12px;font-size:13px;color:var(--ink-3)">${members.length} liiget</div>
          ${members.length === 0
            ? `<div class="empty" style="padding:30px">${icon('users',40)}<div>Grupis ei ole liikmeid.</div></div>`
            : members.map(m => `
              <div class="grp-item">
                ${avatar(Object.assign({avatarColor:'#5e1d27'}, m), 36)}
                <div style="flex:1;min-width:0">
                  <div class="nm">${esc(m.displayName)}</div>
                  <div class="ds">${esc(m.title||'')} · <span class="mono" style="font-size:11.5px">${esc(m.sam)}</span></div>
                </div>
                <span class="badge neutral">${esc(m.department||'')}</span>
              </div>`).join('')}
        </div>
        <div class="drawer-foot">
          <span class="sp"></span>
          <button class="btn" id="grp-close2">Sulge</button>
        </div>
      </div>`;

    const close = () => { ovl.innerHTML = ''; };
    document.getElementById('grp-scrim').addEventListener('click', close);
    document.getElementById('grp-close').addEventListener('click', close);
    document.getElementById('grp-close2').addEventListener('click', close);
  },
};
