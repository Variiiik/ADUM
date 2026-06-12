'use strict';

const fs   = require('fs');
const path = require('path');
const db   = require('./db');

async function migrate() {
  const conn = await db.getConnection();
  try {
    // ── Create tables ────────────────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS services (
        id               CHAR(36)     NOT NULL,
        name             VARCHAR(255) NOT NULL,
        description      TEXT,
        owners           JSON         NOT NULL,
        technical_person VARCHAR(255) DEFAULT NULL,
        rights_groups    JSON         NOT NULL,
        created_at       DATETIME(3)  NOT NULL,
        updated_at       DATETIME(3)  DEFAULT NULL,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS requests (
        id                VARCHAR(64)  NOT NULL,
        status            VARCHAR(32)  NOT NULL DEFAULT 'pending',
        submitted_by      VARCHAR(255) NOT NULL,
        submitted_by_name VARCHAR(255) NOT NULL,
        submitted_at      DATETIME(3)  NOT NULL,
        reviewed_by       VARCHAR(255) DEFAULT NULL,
        reviewed_at       DATETIME(3)  DEFAULT NULL,
        rejection_reason  TEXT,
        data              JSON         NOT NULL,
        PRIMARY KEY (id),
        INDEX idx_status       (status),
        INDEX idx_submitted_by (submitted_by)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id           BIGINT       NOT NULL AUTO_INCREMENT,
        ts           DATETIME(3)  NOT NULL,
        actor        VARCHAR(255) NOT NULL,
        action       VARCHAR(64)  NOT NULL,
        action_label VARCHAR(255),
        target       VARCHAR(255),
        result       VARCHAR(32),
        details      TEXT,
        PRIMARY KEY (id),
        INDEX idx_ts     (ts),
        INDEX idx_actor  (actor),
        INDEX idx_target (target)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS user_mail (
        sam     VARCHAR(255) NOT NULL,
        aliases JSON         NOT NULL,
        PRIMARY KEY (sam)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('[DB] Tabelid olemas / loodud.');

    // ── Add columns introduced after initial schema ───────────────────────────
    await _addColumnIfMissing(conn, 'services', 'code',          'VARCHAR(20) NULL');
    await _addColumnIfMissing(conn, 'services', 'members',       "JSON NOT NULL DEFAULT ('[]')");
    await _addColumnIfMissing(conn, 'services', 'ad_linked',     'TINYINT(1) NOT NULL DEFAULT 1');
    await _addColumnIfMissing(conn, 'services', 'group_members', "JSON NOT NULL DEFAULT ('{}')");
    await _addColumnIfMissing(conn, 'services', 'group_indices', "JSON NOT NULL DEFAULT ('{}')");

    // Ensure code uniqueness index (ignore if already exists)
    try {
      await conn.execute('ALTER TABLE services ADD UNIQUE INDEX idx_service_code (code)');
    } catch (e) { if (e.errno !== 1061 && e.errno !== 1062) throw e; }

    // ── Seed from JSON files (runs only when table is empty) ─────────────────
    await _seedServices(conn);
    await _seedRequests(conn);

  } catch (err) {
    console.error('[DB] Migratsioon ebaõnnestus:', err.message);
    throw err;
  } finally {
    conn.release();
  }
}

function _autoCode(name) {
  const base = (name || 'SVC')
    .replace(/[^A-Za-z0-9\s]/g, '')
    .toUpperCase()
    .trim()
    .split(/\s+/)
    .map(w => w.slice(0, 3))
    .join('')
    .slice(0, 10);
  return base || 'SVC';
}

async function _addColumnIfMissing(conn, table, column, definition) {
  try {
    await conn.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[DB] Lisati veerg ${table}.${column}`);
  } catch (e) {
    if (e.errno !== 1060) throw e; // 1060 = Duplicate column name → already exists
  }
}

async function _seedServices(conn) {
  const [[{ cnt }]] = await conn.execute('SELECT COUNT(*) AS cnt FROM services');
  if (cnt > 0) return;

  const file = path.join(__dirname, '..', 'config', 'services.json');
  if (!fs.existsSync(file)) return;
  try {
    const { services = [] } = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const s of services) {
      await conn.execute(
        `INSERT IGNORE INTO services (id, name, description, owners, technical_person, rights_groups, members, code, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          s.id,
          s.name,
          s.description || '',
          JSON.stringify(s.owners || []),
          s.technicalPerson || null,
          JSON.stringify(s.rightsGroups || []),
          JSON.stringify(s.members || []),
          s.code || _autoCode(s.name),
          new Date(s.createdAt || Date.now()),
          s.updatedAt ? new Date(s.updatedAt) : null,
        ]
      );
    }
    if (services.length) console.log(`[DB] ${services.length} teenust migreeritud services.json-ist.`);
  } catch (e) {
    console.warn('[DB] services.json seedimine ebaõnnestus:', e.message);
  }
}

async function _seedRequests(conn) {
  const [[{ cnt }]] = await conn.execute('SELECT COUNT(*) AS cnt FROM requests');
  if (cnt > 0) return;

  const file = path.join(__dirname, '..', 'config', 'requests.json');
  if (!fs.existsSync(file)) return;
  try {
    const list = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(list) || !list.length) return;
    for (const r of list) {
      await conn.execute(
        `INSERT IGNORE INTO requests (id, status, submitted_by, submitted_by_name, submitted_at, reviewed_by, reviewed_at, rejection_reason, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          r.id,
          r.status || 'pending',
          r.submittedBy,
          r.submittedByName || r.submittedBy,
          new Date(r.submittedAt || Date.now()),
          r.reviewedBy || null,
          r.reviewedAt ? new Date(r.reviewedAt) : null,
          r.rejectionReason || '',
          JSON.stringify(r.data || {}),
        ]
      );
    }
    console.log(`[DB] ${list.length} taotlust migreeritud requests.json-ist.`);
  } catch (e) {
    console.warn('[DB] requests.json seedimine ebaõnnestus:', e.message);
  }
}

module.exports = { migrate };
