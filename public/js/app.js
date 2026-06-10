/* AD Kasutajahaldus — main SPA controller */
'use strict';

// ─── Escape HTML (prevent XSS) ───────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ─── SVG icon library ─────────────────────────────────────────────────────────
const ICONS = {
  shield:    '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  users:     '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  group:     '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  settings:  '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  audit:     '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>',
  search:    '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  plus:      '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  edit:      '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  trash:     '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  key:       '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
  lock:      '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  unlock:    '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  ban:       '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>',
  check:     '<polyline points="20 6 9 17 4 12"/>',
  checkCircle:'<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  x:         '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  alert:     '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  info:      '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  bell:      '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  chevron:   '<polyline points="9 18 15 12 9 6"/>',
  chevronL:  '<polyline points="15 18 9 12 15 6"/>',
  mail:      '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/>',
  phone:     '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  refresh:   '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  logout:    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  userPlus:  '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>',
  sun:       '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
  moon:      '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  id:        '<rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="8" cy="10" r="2"/><path d="M12 16a4 4 0 0 0-8 0"/><line x1="14" y1="9" x2="18" y2="9"/><line x1="14" y1="13" x2="18" y2="13"/>',
  clock:     '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  copy:      '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  upload:    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  download:  '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  building:  '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  clipboard: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>',
  sliders:   '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
};

function icon(name, size) {
  const p = ICONS[name] || '';
  return `<svg width="${size||18}" height="${size||18}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
}

function initials(name) {
  const parts = String(name||'').trim().split(/\s+/);
  return ((parts[0]?.[0]||'') + (parts[1]?.[0]||'')).toUpperCase() || '?';
}

function avatar(user, size) {
  const sz = size || 36;
  const fs = Math.round(sz * 0.38);
  return `<div class="avatar" style="width:${sz}px;height:${sz}px;background:${esc(user.avatarColor||'#5e1d27')};font-size:${fs}px">${esc(initials(user.displayName))}</div>`;
}

function statusBadge(status) {
  const map = { active:'ok', disabled:'bad', locked:'warn' };
  const lbl = { active:'Aktiivne', disabled:'Keelatud', locked:'Lukustatud' };
  const cls = map[status] || 'neutral';
  return `<span class="badge ${cls}"><span class="dot"></span>${lbl[status]||esc(status)}</span>`;
}

function checkbox(on) {
  return `<button class="checkbox${on?' on':''}" role="checkbox" aria-checked="${on}">${icon('check',12)}</button>`;
}

// ─── Accent ink (white vs dark text on accent bg) ─────────────────────────────
function _accentInk(hex) {
  try {
    const r = parseInt(hex.slice(1,3),16)/255;
    const g = parseInt(hex.slice(3,5),16)/255;
    const b = parseInt(hex.slice(5,7),16)/255;
    return (0.299*r + 0.587*g + 0.114*b) > 0.5 ? '#1a0a0a' : '#ffffff';
  } catch { return '#ffffff'; }
}

// ─── App state ────────────────────────────────────────────────────────────────
const App = {
  state: {
    user: null,
    view: 'dashboard',
    params: {},
    collapsed: localStorage.getItem('sb-collapsed') === '1',
    theme: localStorage.getItem('theme') || 'light',
    appearance: {},
    pendingRequests: 0,
  },

  applyAppearance(a) {
    if (!a) return;
    const r = document.documentElement;
    if (a.accentColor) {
      r.style.setProperty('--accent',     a.accentColor);
      r.style.setProperty('--accent-ink', _accentInk(a.accentColor));
    }
    if (a.navyColor)  r.style.setProperty('--navy',   a.navyColor);
    if (a.navyColor2) r.style.setProperty('--navy-2', a.navyColor2);
    if (a.navyColor3) r.style.setProperty('--navy-3', a.navyColor3);
    if (a.systemName) document.title = a.systemName;
  },

  async init() {
    document.documentElement.setAttribute('data-theme', this.state.theme);
    if (this.state.collapsed) document.getElementById('app').classList.add('collapsed');

    // Apply cached branding immediately (login page shows correct colors even before auth)
    try {
      const cached = JSON.parse(localStorage.getItem('appearance') || '{}');
      this.state.appearance = cached;
      this.applyAppearance(cached);
    } catch { /* ignore bad cache */ }

    try {
      const { user, csrfToken } = await API.me();
      API.setToken(csrfToken);
      this.state.user = user;
      // Refresh appearance from server after auth (same session, no CSRF complications)
      try {
        const { settings } = await API.getSettings();
        const a = settings.appearance || {};
        this.state.appearance = a;
        this.applyAppearance(a);
        localStorage.setItem('appearance', JSON.stringify(a));
      } catch { /* use cached */ }
      this.showApp();
    } catch {
      this.showLogin();
    }
  },

  showLogin() {
    document.getElementById('login-page').style.display = '';
    document.getElementById('app').style.display = 'none';
    this.renderLogin();
  },

  showApp() {
    document.getElementById('login-page').style.display = 'none';
    const appEl = document.getElementById('app');
    appEl.style.display = '';
    if (this.state.collapsed) appEl.classList.add('collapsed');
    this.renderSidebar();
    this.renderTopbar();
    this.navigate(this.state.view, this.state.params);
    // Load pending request count for admin badge (best-effort, non-blocking)
    if (this.state.user?.isAdmin) {
      API.getRequestsCount().then(({ pending }) => {
        this.state.pendingRequests = pending || 0;
        this.renderSidebar();
      }).catch(() => {});
    }
  },

  async navigate(view, params) {
    this.state.view = view;
    this.state.params = params || {};
    this.updateNav();
    this.renderTopbar();
    const content = document.getElementById('content');
    content.scrollTop = 0;

    const dispatch = {
      dashboard: () => Views.Dashboard.render(content),
      users:     () => Views.Users.render(content, this.state.params),
      userDetail:() => Views.UserDetail.render(content, this.state.params.sam),
      groups:    () => Views.Groups.render(content),
      audit:     () => Views.AuditLog.render(content),
      settings:  () => Views.Settings.render(content),
      requests:  () => Views.Requests.render(content),
    };
    const fn = dispatch[view] || dispatch.dashboard;
    try { await fn(); } catch (err) {
      content.innerHTML = `<div class="content-inner"><div class="empty">${icon('alert')}<div>${esc(err.message)}</div></div></div>`;
    }
  },

  updateNav() {
    document.querySelectorAll('.sb-item').forEach(el => {
      const v = el.dataset.view;
      const active = v === this.state.view || (v === 'users' && this.state.view === 'userDetail');
      el.classList.toggle('active', active);
    });
  },

  // ─── Login ─────────────────────────────────────────────────────
  renderLogin() {
    const a       = this.state.appearance || {};
    const sysName = a.systemName || 'AD Kasutajahaldus';
    const orgName = a.orgName    || 'Viljandi Haigla';
    const logoHtml = a.logoEnabled
      ? `<img src="/api/settings/logo?v=${a.logoVersion||0}" alt="${esc(sysName)}" class="login-logo-img" />`
      : `<div class="login-logo">${icon('shield',22)}</div>`;
    const pg = document.getElementById('login-page');
    pg.className = 'login-page';
    pg.innerHTML = `
      <div class="login-card">
        ${logoHtml}
        <div class="login-title">
          <h1>${esc(sysName)}</h1>
          <p>${esc(orgName)} · Active Directory</p>
        </div>
        <div id="login-error" style="display:none" class="login-error">
          ${icon('alert',16)}<span id="login-error-text"></span>
        </div>
        <form id="login-form" autocomplete="on">
          <div class="field" style="margin-bottom:12px">
            <label for="login-user">Kasutajanimi</label>
            <input id="login-user" class="input" type="text" name="username" autocomplete="username" placeholder="k.kasutaja" required />
          </div>
          <div class="field" style="margin-bottom:20px">
            <label for="login-pass">Parool</label>
            <input id="login-pass" class="input" type="password" name="password" autocomplete="current-password" placeholder="••••••••" required />
          </div>
          <button class="btn primary block" type="submit" id="login-btn">
            ${icon('shield',16)} Logi sisse
          </button>
        </form>
        <div class="login-footer">Turvaline ühendus · Session aegub 8 tunniga</div>
      </div>`;

    const form = document.getElementById('login-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn  = document.getElementById('login-btn');
      const errEl = document.getElementById('login-error');
      const errTx = document.getElementById('login-error-text');
      btn.disabled = true;
      btn.textContent = 'Sisselogimine…';
      errEl.style.display = 'none';
      try {
        const u = document.getElementById('login-user').value.trim();
        const p = document.getElementById('login-pass').value;
        const { user, csrfToken } = await API.login(u, p);
        API.setToken(csrfToken);
        App.state.user = user;
        App.showApp();
      } catch (err) {
        errEl.style.display = 'flex';
        errTx.textContent = err.message;
        btn.disabled = false;
        btn.innerHTML = `${icon('shield',16)} Logi sisse`;
        document.getElementById('login-pass').value = '';
        document.getElementById('login-pass').focus();
      }
    });
  },

  // ─── Sidebar ───────────────────────────────────────────────────
  renderSidebar() {
    const a       = this.state.appearance || {};
    const sysName = a.systemName || 'AD Kasutajahaldus';
    const orgName = a.orgName    || 'Viljandi Haigla';
    const isAdmin = !!(this.state.user?.isAdmin);
    const isHR    = !!(this.state.user?.isHR);
    const pending = this.state.pendingRequests || 0;
    const logoHtml = a.logoEnabled
      ? `<img src="/api/settings/logo?v=${a.logoVersion||0}" alt="" class="sb-logo-img" />`
      : `<div class="sb-logo">${icon('shield',19)}</div>`;

    const pendingBadge = pending > 0
      ? `<span style="background:var(--bad);color:#fff;border-radius:99px;padding:1px 6px;font-size:10px;font-weight:700;line-height:1.4;margin-left:auto">${pending}</span>`
      : '';

    const roleLabel = isHR ? '<span style="font-size:10px;color:#8595b3;text-transform:uppercase;letter-spacing:.5px">HR</span>' : '';

    // Build nav based on role
    const NAV_ADMIN = [
      { sec: 'Üldine' },
      { id:'dashboard', label:'Töölaud',    ic:'dashboard' },
      { id:'users',     label:'Kasutajad',  ic:'users'     },
      { id:'requests',  label:'Taotlused',  ic:'clipboard', badge: pendingBadge },
      { sec: 'Haldus' },
      { id:'groups',    label:'Grupid',     ic:'group'     },
      { sec: 'Süsteem' },
      { id:'settings',  label:'Seaded',     ic:'settings'  },
      { id:'audit',     label:'Auditilogi', ic:'audit'     },
    ];
    const NAV_HR = [
      { sec: 'Üldine' },
      { id:'dashboard', label:'Töölaud',    ic:'dashboard' },
      { id:'users',     label:'Kasutajad',  ic:'users'     },
      { id:'requests',  label:'Minu taotlused', ic:'clipboard' },
    ];
    const NAV = isHR ? NAV_HR : NAV_ADMIN;

    const sb = document.getElementById('sidebar');
    sb.innerHTML = `
      <div class="sb-brand">
        ${logoHtml}
        <div class="sb-brand-text"><b>${esc(sysName)}</b><span>${esc(orgName)}</span></div>
      </div>
      <nav class="sb-nav">
        ${NAV.map(n => n.sec
          ? `<div class="sb-section">${esc(n.sec)}</div>`
          : `<button class="sb-item${this.state.view===n.id||(n.id==='users'&&this.state.view==='userDetail')?' active':''}" data-view="${n.id}" title="${esc(n.label)}" style="display:flex;align-items:center;gap:8px;width:100%">
               ${icon(n.ic,18)}<span class="sb-label" style="flex:1">${esc(n.label)}</span>${n.badge||''}
             </button>`
        ).join('')}
      </nav>
      <div class="sb-foot">
        <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;margin-bottom:4px">
          <div class="avatar" style="width:30px;height:30px;background:var(--navy-3);font-size:11px;flex-shrink:0">
            ${esc(initials(this.state.user?.displayName || 'KA'))}
          </div>
          <div class="sb-label" style="min-width:0;overflow:hidden">
            <div style="color:#fff;font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(this.state.user?.displayName||'')} ${roleLabel}</div>
            <div style="font-size:11px;color:#8595b3;white-space:nowrap">${esc(this.state.user?.sam||'')}</div>
          </div>
        </div>
        <button class="sb-item" id="logout-btn" title="Logi välja" style="color:#8595b3">
          ${icon('logout',18)}<span class="sb-label">Logi välja</span>
        </button>
        <button class="sb-collapse" id="sb-toggle">
          ${icon('chevronL',18)}<span>Ahenda</span>
        </button>
      </div>`;

    sb.querySelectorAll('.sb-item[data-view]').forEach(btn => {
      btn.addEventListener('click', () => App.navigate(btn.dataset.view));
    });
    document.getElementById('logout-btn').addEventListener('click', () => App.doLogout());
    document.getElementById('sb-toggle').addEventListener('click', () => {
      const appEl = document.getElementById('app');
      App.state.collapsed = !App.state.collapsed;
      appEl.classList.toggle('collapsed', App.state.collapsed);
      localStorage.setItem('sb-collapsed', App.state.collapsed ? '1' : '0');
    });
  },

  // ─── Topbar ────────────────────────────────────────────────────
  renderTopbar() {
    const TITLES = {
      dashboard:  { t:'Töölaud',       c:'Ülevaade ja kiirtoimingud' },
      users:      { t:'Kasutajad',     c:'Active Directory kontode haldus' },
      userDetail: { t:'Kasutaja profiil', c:'Kasutajad › Profiil' },
      groups:     { t:'Grupid',        c:'Turbe- ja jaotusrühmad' },
      audit:      { t:'Auditilogi',    c:'Süsteemi sündmused' },
      settings:   { t:'Seaded',        c:'Süsteemi konfiguratsioon' },
      requests:   { t:'Taotlused',     c:'Konto loomise taotlused' },
    };
    const meta = TITLES[this.state.view] || TITLES.dashboard;
    const tb = document.getElementById('topbar');
    tb.innerHTML = `
      <div class="tb-title">
        <h1>${esc(meta.t)}</h1>
        <span class="crumb">${esc(meta.c)}</span>
      </div>
      <div class="tb-spacer"></div>
      <div class="tb-search">
        ${icon('search',16)}
        <input id="topbar-search" placeholder="Otsi kasutajaid…" autocomplete="off" />
      </div>
      <button class="tb-icon-btn" id="theme-toggle" title="${this.state.theme==='dark'?'Hele teema':'Tume teema'}">
        ${icon(this.state.theme==='dark'?'sun':'moon',18)}
      </button>
      <div class="tb-me">
        <div class="avatar" style="width:36px;height:36px;background:var(--navy);font-size:13px">
          ${esc(initials(this.state.user?.displayName||'KA'))}
        </div>
        <span class="tb-user-name">${esc(this.state.user?.displayName||'')}</span>
      </div>`;

    document.getElementById('theme-toggle').addEventListener('click', () => {
      App.state.theme = App.state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', App.state.theme);
      const el = document.documentElement;
      el.classList.add('theming');
      el.setAttribute('data-theme', App.state.theme);
      setTimeout(() => el.classList.remove('theming'), 80);
      App.renderTopbar();
    });

    const ts = document.getElementById('topbar-search');
    ts.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && ts.value.trim()) {
        App.navigate('users', { q: ts.value.trim() });
      }
    });
  },

  // ─── Logout ────────────────────────────────────────────────────
  async doLogout() {
    try { await API.logout(); } catch { /* best-effort */ }
    this.state.user = null;
    API.setToken('');
    this.showLogin();
  },

  // ─── Toast system ──────────────────────────────────────────────
  toast(kind, title, msg) {
    const wrap = document.getElementById('toasts');
    const ic   = { ok:'checkCircle', bad:'ban', warn:'alert' }[kind] || 'info';
    const bg   = { ok:'var(--ok-bg)', bad:'var(--bad-bg)', warn:'var(--warn-bg)' }[kind] || 'var(--accent-weak)';
    const fg   = { ok:'var(--ok-ink)', bad:'var(--bad-ink)', warn:'var(--warn-ink)' }[kind] || 'var(--accent)';
    const id   = 't' + Date.now();
    const el   = document.createElement('div');
    el.className = `toast ${kind}`;
    el.id = id;
    el.innerHTML = `
      <div class="toast-ic" style="background:${bg};color:${fg}">${icon(ic,16)}</div>
      <div style="min-width:0">
        <div class="tt">${esc(title)}</div>
        ${msg ? `<div class="tm">${esc(msg)}</div>` : ''}
      </div>
      <button class="x-btn x" aria-label="Sulge">${icon('x',16)}</button>`;
    el.querySelector('.x-btn').addEventListener('click', () => el.remove());
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  },

  // ─── Confirmation modal ────────────────────────────────────────
  confirm(title, message, onConfirm, opts) {
    const o    = opts || {};
    const danger = o.danger !== false;
    const iconName = o.icon || 'alert';
    const ovl  = document.getElementById('overlay');
    const bg   = danger ? 'var(--bad-bg)'     : 'var(--accent-weak)';
    const fg   = danger ? 'var(--bad-ink)'    : 'var(--accent)';
    const confirmCls = danger ? 'danger' : 'primary';

    ovl.innerHTML = `
      <div class="scrim" id="confirm-scrim"></div>
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-body">
          <div class="modal-ic" style="background:${bg};color:${fg}">${icon(iconName,24)}</div>
          <h3>${esc(title)}</h3>
          <p>${esc(message)}</p>
          ${o.inputLabel ? `<div class="modal-input">
            <div class="field">
              <label>${esc(o.inputLabel)}</label>
              <div class="input-group">
                <input class="input mono" id="modal-input" type="${o.inputType||'text'}" placeholder="${esc(o.inputPlaceholder||'')}" />
                ${o.inputBtn ? `<button class="btn" id="modal-input-btn" type="button">${icon('refresh',15)} ${esc(o.inputBtn)}</button>` : ''}
              </div>
              ${o.inputHint ? `<div id="modal-input-bar"></div><span class="hint" id="modal-input-hint">${esc(o.inputHint)}</span>` : ''}
            </div>
          </div>` : ''}
        </div>
        <div class="modal-foot">
          <button class="btn" id="confirm-cancel">${esc(o.cancelLabel||'Loobu')}</button>
          <button class="btn ${confirmCls}" id="confirm-ok">${esc(o.confirmLabel||'Kinnita')}</button>
        </div>
      </div>`;

    const close = () => { ovl.innerHTML = ''; };
    document.getElementById('confirm-scrim').addEventListener('click', close);
    document.getElementById('confirm-cancel').addEventListener('click', close);
    document.getElementById('confirm-ok').addEventListener('click', () => {
      const inp = document.getElementById('modal-input');
      close();
      onConfirm(inp ? inp.value : null);
    });

    if (o.inputBtn) {
      document.getElementById('modal-input-btn').addEventListener('click', () => {
        const inp = document.getElementById('modal-input');
        if (inp) { inp.value = genPassword(); updatePwBar(inp.value); }
      });
    }
    if (o.inputType === 'password' || o.inputLabel) {
      const inp = document.getElementById('modal-input');
      if (inp && o.inputLabel?.toLowerCase().includes('parool')) {
        inp.addEventListener('input', () => updatePwBar(inp.value));
      }
    }
  },
};

function updatePwBar(pw) {
  const bar = document.getElementById('modal-input-bar');
  const hint = document.getElementById('modal-input-hint');
  if (!bar) return;
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const cols = ['','var(--bad)','var(--warn)','var(--warn)','var(--accent)','var(--ok)'];
  const lbls = ['','Nõrk','Nõrk','Keskmine','Tugev','Väga tugev'];
  bar.className = 'pwbar';
  bar.innerHTML = `<i style="width:${Math.min(s,5)*20}%;background:${cols[s]}"></i>`;
  if (hint) hint.textContent = pw ? 'Tugevus: ' + lbls[s] : '';
}

function genPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let p = '';
  const arr = new Uint32Array(14);
  crypto.getRandomValues(arr);
  arr.forEach(v => { p += chars[v % chars.length]; });
  return p;
}

// Start the app
document.addEventListener('DOMContentLoaded', () => App.init());

// Expose helpers globally for views
window.App       = App;
window.icon      = icon;
window.esc       = esc;
window.avatar    = avatar;
window.initials  = initials;
window.statusBadge = statusBadge;
window.checkbox  = checkbox;
window.genPassword = genPassword;
// Views registry is initialised in api.js (first script to load)
