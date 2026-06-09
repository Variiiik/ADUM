/* Audit log view */
'use strict';

Views.AuditLog = {
  _entries: [],

  async render(container) {
    container.innerHTML = `<div class="content-inner"><div style="text-align:center;padding:60px"><div class="spinner" style="margin:auto"></div></div></div>`;
    try {
      const res = await API.getAudit(200);
      this._entries = res.entries || [];
    } catch (err) {
      container.innerHTML = `<div class="content-inner"><div class="empty">${icon('alert',40)}<div>${esc(err.message)}</div></div></div>`;
      return;
    }
    window._auditCache = this._entries;
    this._renderLog(container);
  },

  _renderLog(container) {
    const entries = this._entries;

    const ACTION_STYLE = {
      LOGIN:          { bg:'var(--ok-bg)',      c:'var(--ok-ink)',  ic:'checkCircle' },
      LOGOUT:         { bg:'var(--surface-3)',  c:'var(--ink-3)',   ic:'logout'      },
      CREATE_USER:    { bg:'var(--ok-bg)',      c:'var(--ok-ink)',  ic:'userPlus'    },
      MODIFY_USER:    { bg:'var(--accent-weak)',c:'var(--accent)',  ic:'edit'        },
      DELETE_USER:    { bg:'var(--bad-bg)',     c:'var(--bad-ink)', ic:'trash'       },
      RESET_PASSWORD: { bg:'var(--accent-weak)',c:'var(--accent)',  ic:'key'         },
      ENABLE_USER:    { bg:'var(--ok-bg)',      c:'var(--ok-ink)',  ic:'checkCircle' },
      DISABLE_USER:   { bg:'var(--bad-bg)',     c:'var(--bad-ink)', ic:'ban'         },
      UNLOCK_USER:    { bg:'var(--ok-bg)',      c:'var(--ok-ink)',  ic:'unlock'      },
      GROUP_ADD:      { bg:'var(--accent-weak)',c:'var(--accent)',  ic:'group'       },
      GROUP_REMOVE:   { bg:'var(--warn-bg)',    c:'var(--warn-ink)',ic:'group'       },
      UPDATE_SETTINGS:{ bg:'var(--accent-weak)',c:'var(--accent)',  ic:'settings'    },
      TEST_LDAP:      { bg:'var(--surface-3)',  c:'var(--ink-2)',   ic:'sliders'     },
    };

    function fmtDT(iso) {
      if (!iso) return '—';
      const d = new Date(iso);
      if (isNaN(d)) return '—';
      return d.toLocaleDateString('et-EE') + ' ' + d.toLocaleTimeString('et-EE',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    }

    function exportCSV() {
      const rows = [['Aeg','Toimingut teinud','Toiming','Sihtmärk','Tulemus','Üksikasjad']];
      entries.forEach(e => rows.push([
        fmtDT(e.timestamp), e.actor, e.actionLabel||e.action, e.target, e.result, e.details||''
      ]));
      const csv = rows.map(r => r.map(v => '"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
      const a = document.createElement('a');
      a.href = 'data:text/csv;charset=utf-8,﻿' + encodeURIComponent(csv);
      a.download = 'auditilogi_' + new Date().toISOString().slice(0,10) + '.csv';
      a.click();
    }

    container.innerHTML = `<div class="content-inner">
      <div class="toolbar">
        <div style="flex:1"></div>
        <button class="btn" id="audit-export">${icon('download',16)} Ekspordi CSV</button>
      </div>
      <div class="card">
        <div class="tbl-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>Toiming</th>
                <th>Sihtmärk</th>
                <th>Toimingut teinud</th>
                <th>Tulemus</th>
                <th>Üksikasjad</th>
                <th style="text-align:right">Aeg</th>
              </tr>
            </thead>
            <tbody>
              ${entries.length === 0
                ? `<tr><td colspan="6"><div class="empty" style="padding:40px">${icon('audit',40)}<div>Auditikandeid ei ole.</div></div></td></tr>`
                : entries.map(e => {
                    const st = ACTION_STYLE[e.action] || { bg:'var(--surface-3)', c:'var(--ink-2)', ic:'info' };
                    const resultBadge = e.result === 'success'
                      ? '<span class="badge ok"><span class="dot"></span>Õnnestus</span>'
                      : e.result === 'failure'
                      ? '<span class="badge bad"><span class="dot"></span>Ebaõnnestus</span>'
                      : '<span class="badge warn"><span class="dot"></span>Hoiatus</span>';
                    return `<tr>
                      <td>
                        <div class="cell-user">
                          <div class="feed-ic" style="background:${st.bg};color:${st.c}">${icon(st.ic,15)}</div>
                          <span class="nm">${esc(e.actionLabel||e.action)}</span>
                        </div>
                      </td>
                      <td>${esc(e.target)}</td>
                      <td><span class="mono">${esc(e.actor)}</span></td>
                      <td>${resultBadge}</td>
                      <td class="muted" style="font-size:12.5px">${esc(e.details||'—')}</td>
                      <td style="text-align:right" class="muted">${esc(fmtDT(e.timestamp))}</td>
                    </tr>`;
                  }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;

    document.getElementById('audit-export')?.addEventListener('click', exportCSV);
  },
};
