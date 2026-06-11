'use strict';

const db = require('./db');

const ACTION_LABELS = {
  LOGIN:           'Sisselogimine',
  LOGOUT:          'Väljalogimine',
  CREATE_USER:     'Kasutaja loodud',
  MODIFY_USER:     'Kasutaja muudetud',
  DELETE_USER:     'Kasutaja kustutatud',
  RESET_PASSWORD:  'Parool lähtestatud',
  ENABLE_USER:     'Konto lubatud',
  DISABLE_USER:    'Konto keelatud',
  UNLOCK_USER:     'Konto avatud',
  GROUP_ADD:       'Gruppi lisatud',
  GROUP_REMOVE:    'Grupist eemaldatud',
  UPDATE_SETTINGS: 'Seaded uuendatud',
  TEST_LDAP:       'LDAP test',
  CREATE_SERVICE:  'Teenus loodud',
  UPDATE_SERVICE:  'Teenus uuendatud',
  DELETE_SERVICE:  'Teenus kustutatud',
  CREATE_REQUEST:  'Taotlus esitatud',
  APPROVE_REQUEST: 'Taotlus kinnitatud',
  REJECT_REQUEST:  'Taotlus tagasi lükatud',
  DELETE_REQUEST:  'Taotlus kustutatud',
  SMS_SENT:        'SMS saadetud',
};

// Fire-and-forget — callers need not await, errors are logged internally
function logEvent(actor, action, target, result, details) {
  db.execute(
    'INSERT INTO audit_log (ts, actor, action, action_label, target, result, details) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      new Date(),
      String(actor  || 'system').slice(0, 64),
      action,
      ACTION_LABELS[action] || action,
      String(target  || '').slice(0, 128),
      result  || null,
      details ? String(details).slice(0, 256) : null,
    ]
  ).catch(err => console.error('[audit] logEvent error:', err.message));
}

function _mapRow(row) {
  return {
    id:          row.id,
    timestamp:   row.ts instanceof Date ? row.ts.toISOString() : row.ts,
    actor:       row.actor,
    action:      row.action,
    actionLabel: row.action_label || row.action,
    target:      row.target || '',
    result:      row.result || '',
    details:     row.details || '',
  };
}

async function getLog(limit) {
  const n = Math.min(parseInt(limit || 200, 10), 2000) || 200;
  const [rows] = await db.query(
    `SELECT * FROM audit_log ORDER BY ts DESC LIMIT ${n}`
  );
  return rows.map(_mapRow);
}

async function getLogForUser(sam) {
  const [rows] = await db.execute(
    'SELECT * FROM audit_log WHERE actor = ? OR target = ? ORDER BY ts DESC LIMIT 200',
    [sam, sam]
  );
  return rows.map(_mapRow);
}

module.exports = { logEvent, getLog, getLogForUser, ACTION_LABELS };
