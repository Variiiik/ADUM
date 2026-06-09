'use strict';

const MAX_ENTRIES = 500;
const log = [];

const ACTION_LABELS = {
  LOGIN:          'Sisselogimine',
  LOGOUT:         'Väljalogimine',
  CREATE_USER:    'Kasutaja loodud',
  MODIFY_USER:    'Kasutaja muudetud',
  DELETE_USER:    'Kasutaja kustutatud',
  RESET_PASSWORD: 'Parool lähtestatud',
  ENABLE_USER:    'Konto lubatud',
  DISABLE_USER:   'Konto keelatud',
  UNLOCK_USER:    'Konto avatud',
  GROUP_ADD:      'Gruppi lisatud',
  GROUP_REMOVE:   'Grupist eemaldatud',
  UPDATE_SETTINGS:'Seaded uuendatud',
  TEST_LDAP:      'LDAP test',
};

function logEvent(actor, action, target, result, details) {
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    timestamp: new Date().toISOString(),
    actor: String(actor || 'system').slice(0, 64),
    action,
    actionLabel: ACTION_LABELS[action] || action,
    target: String(target || '').slice(0, 128),
    result, // 'success' | 'failure' | 'warning'
    details: details ? String(details).slice(0, 256) : '',
  };
  log.unshift(entry);
  if (log.length > MAX_ENTRIES) log.length = MAX_ENTRIES;
  return entry;
}

function getLog(limit) {
  return log.slice(0, Math.min(limit || 200, MAX_ENTRIES));
}

function getLogForUser(sam) {
  return log.filter(e => e.target === sam || e.actor === sam);
}

module.exports = { logEvent, getLog, getLogForUser, ACTION_LABELS };
