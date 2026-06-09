/* Dashboard view */
'use strict';

Views.Dashboard = {
  async render(container) {
    container.innerHTML = `<div class="content-inner"><div style="display:flex;align-items:center;justify-content:center;padding:60px"><div class="spinner"></div></div></div>`;

    const [usersRes, auditRes] = await Promise.all([
      API.getUsers(),
      API.getAudit(8),
    ]).catch(() => [{users:[]},{entries:[]}]);

    const users   = usersRes.users || [];
    const entries = auditRes.entries || [];

    const total    = users.length;
    const active   = users.filter(u => u.status === 'active').length;
    const disabled = users.filter(u => u.status === 'disabled').length;
    const locked   = users.filter(u => u.status === 'locked').length;

    const stats = [
      { val:total,    lbl:'Kasutajaid kokku', ic:'users',       c:'var(--accent)',   bg:'var(--accent-weak)' },
      { val:active,   lbl:'Aktiivsed kontod', ic:'checkCircle', c:'var(--ok-ink)',   bg:'var(--ok-bg)' },
      { val:disabled, lbl:'Keelatud kontod',  ic:'ban',         c:'var(--bad-ink)',  bg:'var(--bad-bg)' },
      { val:locked,   lbl:'Lukustatud kontod',ic:'lock',        c:'var(--warn-ink)', bg:'var(--warn-bg)' },
    ];

    const byDept = {};
    users.forEach(u => { byDept[u.department] = (byDept[u.department]||0) + 1; });
    const deptList = Object.entries(byDept).sort((a,b)=>b[1]-a[1]).slice(0,6);
    const maxDept  = Math.max(1, ...deptList.map(d=>d[1]));

    const FEED_STYLES = {
      LOGIN:         { ic:'checkCircle', c:'var(--ok-ink)',  bg:'var(--ok-bg)',      lbl:'Sisselogimine' },
      LOGOUT:        { ic:'logout',      c:'var(--ink-2)',   bg:'var(--surface-3)',  lbl:'Väljalogimine' },
      CREATE_USER:   { ic:'userPlus',    c:'var(--ok-ink)',  bg:'var(--ok-bg)',      lbl:'Kasutaja loodud' },
      MODIFY_USER:   { ic:'edit',        c:'var(--accent)',  bg:'var(--accent-weak)',lbl:'Muudetud' },
      DELETE_USER:   { ic:'trash',       c:'var(--bad-ink)', bg:'var(--bad-bg)',     lbl:'Kustutatud' },
      RESET_PASSWORD:{ ic:'key',         c:'var(--accent)',  bg:'var(--accent-weak)',lbl:'Parool lähtestatud' },
      ENABLE_USER:   { ic:'checkCircle', c:'var(--ok-ink)',  bg:'var(--ok-bg)',      lbl:'Konto lubatud' },
      DISABLE_USER:  { ic:'ban',         c:'var(--bad-ink)', bg:'var(--bad-bg)',     lbl:'Konto keelatud' },
      UNLOCK_USER:   { ic:'unlock',      c:'var(--ok-ink)',  bg:'var(--ok-bg)',      lbl:'Konto avatud' },
      GROUP_ADD:     { ic:'group',       c:'var(--accent)',  bg:'var(--accent-weak)',lbl:'Gruppi lisatud' },
      GROUP_REMOVE:  { ic:'group',       c:'var(--warn-ink)',bg:'var(--warn-bg)',    lbl:'Grupist eemaldatud' },
    };

    function relTime(iso) {
      if (!iso) return '';
      const diff = Date.now() - new Date(iso).getTime();
      const m = Math.floor(diff/60000);
      if (m < 1)  return 'Äsja';
      if (m < 60) return m + ' min tagasi';
      const h = Math.floor(m/60);
      if (h < 24) return h + ' t tagasi';
      return Math.floor(h/24) + ' p tagasi';
    }

    const quickActions = [
      { t:'Uus kasutaja',   s:'Loo uus AD konto',       ic:'userPlus', view:'users', p:{ new:true } },
      { t:'Otsi kasutajaid',s:'Leia ja halda kontosid',  ic:'search',   view:'users' },
      { t:'Seaded',         s:'Süsteemi konfiguratsioon',ic:'sliders',  view:'settings' },
    ];

    container.innerHTML = `<div class="content-inner">
      <div class="stat-grid">
        ${stats.map(s => `
          <div class="stat">
            <div class="ic" style="background:${s.bg};color:${s.c}">${icon(s.ic,19)}</div>
            <div class="val">${s.val}</div>
            <div class="lbl">${esc(s.lbl)}</div>
          </div>`).join('')}
      </div>

      <div class="grid-2 mt16">
        <div class="card">
          <div class="card-head">
            <h3>Hiljutine tegevus</h3>
            <span class="sub">Viimased auditisündmused</span>
            <button class="btn ghost sm" style="margin-left:auto" id="dash-all-audit">Vaata kõiki</button>
          </div>
          <div class="feed">
            ${entries.length === 0 ? `<div class="empty" style="padding:30px">${icon('clock')}<div>Tegevust ei ole registreeritud</div></div>` :
              entries.map(e => {
                const fs = FEED_STYLES[e.action] || { ic:'info', c:'var(--accent)', bg:'var(--accent-weak)', lbl:e.action };
                return `<div class="feed-item">
                  <div class="feed-ic" style="background:${fs.bg};color:${fs.c}">${icon(fs.ic,15)}</div>
                  <div class="feed-main">
                    <div class="t"><b>${esc(e.actor)}</b> · ${esc(e.actionLabel||fs.lbl)} — <b>${esc(e.target)}</b></div>
                    <div class="m">${esc(e.details||'')} · ${e.result === 'success' ? '✓ Õnnestus' : '✗ Ebaõnnestus'}</div>
                  </div>
                  <div class="feed-time">${relTime(e.timestamp)}</div>
                </div>`;
              }).join('')}
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="card card-pad">
            <h3 class="sec-title">Kiirtoimingud</h3>
            <div class="qa">
              ${quickActions.map(q => `
                <button class="qa-btn" data-view="${esc(q.view)}" data-params='${JSON.stringify(q.p||{})}'>
                  <div class="qa-ic">${icon(q.ic,18)}</div>
                  <div><div class="qt">${esc(q.t)}</div><div class="qs">${esc(q.s)}</div></div>
                  <span class="chev">${icon('chevron',16)}</span>
                </button>`).join('')}
            </div>
          </div>

          <div class="card">
            <div class="card-head"><h3>Osakonniti</h3></div>
            ${deptList.map(([nm, ct]) => `
              <div class="dept-row">
                <span class="nm">${esc(nm)}</span>
                <span class="dept-bar"><i style="width:${(ct/maxDept*100).toFixed(1)}%"></i></span>
                <span class="ct">${ct}</span>
              </div>`).join('')}
          </div>
        </div>
      </div>
    </div>`;

    document.getElementById('dash-all-audit')?.addEventListener('click', () => App.navigate('audit'));
    container.querySelectorAll('.qa-btn[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = JSON.parse(btn.dataset.params || '{}');
        App.navigate(btn.dataset.view, p);
      });
    });
  },
};
