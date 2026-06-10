/* API client — wraps fetch(), handles CSRF tokens and error parsing */
'use strict';

// Views registry — must exist before view scripts run
window.Views = {};

const API = (() => {
  let csrfToken = '';

  function setToken(t) { csrfToken = t || ''; }

  async function request(url, opts = {}) {
    const method  = (opts.method || 'GET').toUpperCase();
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (!['GET','HEAD','OPTIONS'].includes(method)) {
      headers['X-CSRF-Token'] = csrfToken;
    }
    let resp;
    try {
      resp = await fetch(url, { ...opts, method, headers, credentials: 'same-origin' });
    } catch (e) {
      throw new Error('Võrguühendus ebaõnnestus. Kontrollige internetiühendust.');
    }
    // Keep CSRF token in sync with whatever the server's session currently holds
    const freshToken = resp.headers.get('X-CSRF-Token');
    if (freshToken) csrfToken = freshToken;
    if (resp.status === 401) {
      // If already logged in, session expired — go back to login without reload loop
      if (window.App && window.App.state && window.App.state.user) {
        window.App.state.user = null;
        window.App.showLogin();
      }
      throw new Error('Sessioon aegunud. Logige uuesti sisse.');
    }
    let body;
    try { body = await resp.json(); } catch { body = {}; }
    if (!resp.ok) throw new Error(body.error || `HTTP ${resp.status}`);
    return body;
  }

  const get    = (url)        => request(url);
  const post   = (url, data)  => request(url, { method:'POST',   body: JSON.stringify(data) });
  const put    = (url, data)  => request(url, { method:'PUT',    body: JSON.stringify(data) });
  const del    = (url)        => request(url, { method:'DELETE' });

  return {
    setToken,

    // Auth
    login:   (u, p)    => post('/api/auth/login', { username:u, password:p }),
    logout:  ()        => post('/api/auth/logout', {}),
    me:      ()        => get('/api/auth/me'),

    // Users
    getUsers:      (params = {}) => get('/api/users?' + new URLSearchParams(params).toString()),
    getUser:       (sam)         => get('/api/users/' + encodeURIComponent(sam)),
    createUser:    (data)        => post('/api/users', data),
    updateUser:    (sam, data)   => put('/api/users/' + encodeURIComponent(sam), data),
    deleteUser:    (sam)         => del('/api/users/' + encodeURIComponent(sam)),
    resetPassword: (sam, pwd)    => post('/api/users/' + encodeURIComponent(sam) + '/reset-password', { password: pwd }),
    enableUser:    (sam)         => post('/api/users/' + encodeURIComponent(sam) + '/enable', {}),
    disableUser:   (sam)         => post('/api/users/' + encodeURIComponent(sam) + '/disable', {}),
    unlockUser:    (sam)         => post('/api/users/' + encodeURIComponent(sam) + '/unlock', {}),
    addToGroup:    (sam, g)      => post('/api/users/' + encodeURIComponent(sam) + '/groups/add',    { groupName: g }),
    removeFromGroup:(sam, g)     => post('/api/users/' + encodeURIComponent(sam) + '/groups/remove', { groupName: g }),

    // Groups
    getGroups: () => get('/api/groups'),

    // Audit
    getAudit: (limit = 200) => get('/api/audit?limit=' + limit),

    // Public config (no auth needed)
    getConfig: () => get('/api/config'),

    // OU struktuur
    getOus: () => get('/api/ous'),

    // Settings
    getSettings:    ()           => get('/api/settings'),
    updateSettings: (sec, data)  => put('/api/settings', { section: sec, data }),
    testLdap:       (data)       => post('/api/settings/test-ldap', data),
    testEmail:      ()           => post('/api/settings/test-email', {}),

    // Logo upload — sends dataURL as JSON so standard CSRF + body-parser path is used
    uploadLogo: (dataUrl) => post('/api/settings/logo', { dataUrl }),
    deleteLogo: () => del('/api/settings/logo'),

    // Requests (HR approval workflow)
    getRequests:      ()           => get('/api/requests'),
    getRequestsCount: ()           => get('/api/requests/count'),
    submitRequest:    (data)       => post('/api/requests', data),
    approveRequest:   (id, data)   => post('/api/requests/' + id + '/approve', data),
    rejectRequest:    (id, reason) => post('/api/requests/' + id + '/reject', { reason }),
    deleteRequest:    (id)         => del('/api/requests/' + id),
  };
})();
