/* Dashboard view */
'use strict';

Views.Dashboard = {
  async render(container) {
    container.innerHTML = `<div class="content-inner"><div style="display:flex;align-items:center;justify-content:center;padding:60px"><div class="spinner"></div></div></div>`;

    const [usersRes, auditRes] = await Promise.all([
      API.getUsers(),
      API.getAudit(20),
    ]).catch(() => [{users:[]},{entries:[]}]);

    const users   = usersRes.users || [];
    const entries = auditRes.entries || [];

    const total    = users.length;
    const active   = users.filter(u => u.status === 'active').length;
    const disabled = users.filter(u => u.status === 'disabled').length;
    const locked   = users.filter(u => u.status === 'locked').length;

    // Stat kaardid — filter määrab millist kasutajate filtrit kasutatakse navigeerimisel
    const stats = [
      { val:total,    lbl:'Kasutajaid kokku', ic:'users',       c:'var(--accent)',   bg:'var(--accent-weak)', filter:'' },
      { val:active,   lbl:'Aktiivsed kontod', ic:'checkCircle', c:'var(--ok-ink)',   bg:'var(--ok-bg)',       filter:'active' },
      { val:disabled, lbl:'Keelatud kontod',  ic:'ban',         c:'var(--bad-ink)',  bg:'var(--bad-bg)',      filter:'disabled' },
      { val:locked,   lbl:'Lukustatud kontod',ic:'lock',        c:'var(--warn-ink)', bg:'var(--warn-bg)',     filter:'locked' },
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
      USER_LOCKED:   { ic:'lock',        c:'var(--warn-ink)',bg:'var(--warn-bg)',    lbl:'Konto lukustus' },
      SMS_SENT:      { ic:'phone',       c:'var(--ok-ink)',  bg:'var(--ok-bg)',      lbl:'SMS saadetud' },
    };

    // Genereeri lukustussündmused otse kasutaja lockoutTime põhjal
    const lockEvents = users
      .filter(u => u.status === 'locked' && u.lockoutTime && u.lockoutTime > 0)
      .map(u => ({
        id:          'lock-' + u.sam,
        timestamp:   new Date(u.lockoutTime).toISOString(),
        actor:       u.sam,
        action:      'USER_LOCKED',
        actionLabel: 'Konto lukustus',
        target:      u.sam,
        result:      'warning',
        details:     u.displayName || '',
        _synthetic:  true,
      }));

    // Kombineeri auditilogi + lukustussündmused, sorteeri aja järgi
    const allEntries = [...entries, ...lockEvents]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 10);

    function relTime(iso) {
      if (!iso) return '';
      const diff = Date.now() - new Date(iso).getTime();
      const m = Math.floor(diff / 60000);
      if (m < 1)  return 'Äsja';
      if (m < 60) return m + ' min tagasi';
      const h = Math.floor(m / 60);
      if (h < 24) return h + ' t tagasi';
      return Math.floor(h / 24) + ' p tagasi';
    }

    function fmtTime(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      return isNaN(d) ? '' : d.toLocaleTimeString('et-EE', { hour:'2-digit', minute:'2-digit' });
    }

    const quickActions = [
      { t:'Uus kasutaja',   s:'Loo uus AD konto',        ic:'userPlus', view:'users', p:{ new:true } },
      { t:'Otsi kasutajaid',s:'Leia ja halda kontosid',   ic:'search',   view:'users' },
      { t:'Seaded',         s:'Süsteemi konfiguratsioon', ic:'sliders',  view:'settings' },
    ];

    container.innerHTML = `<div class="content-inner">
      <div class="stat-grid">
        ${stats.map(s => `
          <div class="stat stat-link" data-status="${esc(s.filter)}" title="${s.filter ? 'Vaata ' + s.lbl.toLowerCase() : 'Vaata kõiki kasutajaid'}" style="cursor:pointer">
            <div class="ic" style="background:${s.bg};color:${s.c}">${icon(s.ic,19)}</div>
            <div class="val">${s.val}</div>
            <div class="lbl">${esc(s.lbl)}</div>
            <div class="stat-arrow">${icon('chevron',14)}</div>
          </div>`).join('')}
      </div>

      <div class="grid-2 mt16">
        <div class="card">
          <div class="card-head">
            <h3>Hiljutine tegevus</h3>
            <span class="sub">Auditilogi + konto lukustused</span>
            <button class="btn ghost sm" style="margin-left:auto" id="dash-all-audit">Vaata kõiki</button>
          </div>
          <div class="feed">
            ${allEntries.length === 0
              ? `<div class="empty" style="padding:30px">${icon('clock')}<div>Tegevust ei ole registreeritud</div></div>`
              : allEntries.map(e => {
                  const fs = FEED_STYLES[e.action] || { ic:'info', c:'var(--accent)', bg:'var(--accent-weak)', lbl:e.action };
                  const timeStr = relTime(e.timestamp);
                  const clockStr = fmtTime(e.timestamp);
                  const isLock = e.action === 'USER_LOCKED';
                  return `<div class="feed-item${isLock ? ' feed-item-warn' : ''}">
                    <div class="feed-ic" style="background:${fs.bg};color:${fs.c}">${icon(fs.ic,15)}</div>
                    <div class="feed-main">
                      <div class="t">
                        ${isLock
                          ? `<b>${esc(e.details||e.target)}</b> · <span style="color:var(--warn-ink)">Konto lukustus</span>`
                          : `<b>${esc(e.actor)}</b> · ${esc(e.actionLabel||fs.lbl)} — <b>${esc(e.target)}</b>`}
                      </div>
                      <div class="m">
                        ${isLock
                          ? `Liiga palju ebaõnnestunud sisselogimisi · ${icon('clock',12)} ${clockStr}`
                          : `${esc(e.details||'')} · ${e.result === 'success' ? '✓ Õnnestus' : e.result === 'warning' ? '⚠ Hoiatus' : '✗ Ebaõnnestus'}`}
                      </div>
                    </div>
                    <div class="feed-time" title="${esc(e.timestamp||'')}">${timeStr}</div>
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

    // Stat kaardid → kasutajate vaade filtriga
    container.querySelectorAll('.stat-link').forEach(card => {
      card.addEventListener('click', () => {
        const status = card.dataset.status;
        App.navigate('users', status ? { status } : {});
      });
    });

    document.getElementById('dash-all-audit')?.addEventListener('click', () => App.navigate('audit'));
    container.querySelectorAll('.qa-btn[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = JSON.parse(btn.dataset.params || '{}');
        App.navigate(btn.dataset.view, p);
      });
    });
  },
};
