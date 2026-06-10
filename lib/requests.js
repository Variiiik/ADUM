'use strict';

const crypto = require('crypto');
const db     = require('./db');

function _row(row) {
  if (!row) return null;
  const data = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {});
  return {
    id:              row.id,
    type:            data.type || 'create',
    status:          row.status,
    submittedBy:     row.submitted_by,
    submittedByName: row.submitted_by_name,
    submittedAt:     row.submitted_at instanceof Date ? row.submitted_at.toISOString() : row.submitted_at,
    reviewedBy:      row.reviewed_by   || null,
    reviewedAt:      row.reviewed_at instanceof Date ? row.reviewed_at.toISOString() : (row.reviewed_at || null),
    rejectionReason: row.rejection_reason || '',
    data,
  };
}

async function load() {
  const [rows] = await db.execute('SELECT * FROM requests ORDER BY submitted_at DESC');
  return rows.map(_row);
}

async function add(submitter, data) {
  const id  = 'req-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex');
  const now = new Date();
  await db.execute(
    `INSERT INTO requests (id, status, submitted_by, submitted_by_name, submitted_at, data)
     VALUES (?, 'pending', ?, ?, ?, ?)`,
    [id, submitter.sam, submitter.displayName || submitter.sam, now, JSON.stringify(data)]
  );
  return { id, status: 'pending', submittedBy: submitter.sam, submittedByName: submitter.displayName || submitter.sam,
    submittedAt: now.toISOString(), reviewedBy: null, reviewedAt: null, rejectionReason: '', data };
}

async function get(id) {
  const [rows] = await db.execute('SELECT * FROM requests WHERE id = ?', [id]);
  return _row(rows[0] || null);
}

async function update(id, fields) {
  const sets = [];
  const vals = [];
  if (fields.status !== undefined)          { sets.push('status = ?');           vals.push(fields.status); }
  if (fields.reviewedBy !== undefined)      { sets.push('reviewed_by = ?');      vals.push(fields.reviewedBy); }
  if (fields.reviewedAt !== undefined)      { sets.push('reviewed_at = ?');      vals.push(new Date(fields.reviewedAt)); }
  if (fields.rejectionReason !== undefined) { sets.push('rejection_reason = ?'); vals.push(fields.rejectionReason); }
  if (!sets.length) return get(id);
  vals.push(id);
  await db.execute(`UPDATE requests SET ${sets.join(', ')} WHERE id = ?`, vals);
  return get(id);
}

async function remove(id) {
  await db.execute('DELETE FROM requests WHERE id = ?', [id]);
  return true;
}

module.exports = { load, add, get, update, remove };
