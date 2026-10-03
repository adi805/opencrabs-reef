// Read-only window onto OpenCrabs' own session database.
//
// Two properties carry the whole "runs on a small VPS" claim, and both are
// testable rather than hoped for:
//
//   1. Never writes. The connection is opened read-only, `query_only` is set as
//      a second lock, and `openSource` then *tries* to write and throws if the
//      attempt succeeds. A guard that silently failed to attach is worse than
//      no guard at all, so this one fails closed at startup.
//
//   2. Never scans history. `tool_executions` has no index on `created_at`
//      (verified against the live schema), so a time cursor is a 200k-row scan
//      plus a temp b-tree on every poll. The rowid cursor is an INTEGER
//      PRIMARY KEY seek instead, which is what `EXPLAIN QUERY PLAN` reports.

import { DatabaseSync } from 'node:sqlite';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_DB_PATH = join(homedir(), '.opencrabs', 'opencrabs.db');

/** Hard ceiling on rows pulled per poll, whatever the caller asks for. */
export const MAX_POLL_LIMIT = 2000;

export function openSource(path = DEFAULT_DB_PATH) {
  const db = new DatabaseSync(path, { readOnly: true });
  db.exec('PRAGMA query_only = ON');
  assertReadOnly(db);
  return db;
}

/**
 * Prove the guard is live by provoking it. If a write is accepted here the
 * connection is not read-only, and we must not stay open on the operator's
 * real database.
 */
function assertReadOnly(db) {
  let accepted = false;
  try {
    db.exec('CREATE TABLE _reef_readonly_probe (x INTEGER)');
    accepted = true;
  } catch {
    /* expected: the write is refused */
  }
  if (accepted) {
    try {
      db.exec('DROP TABLE IF EXISTS _reef_readonly_probe');
    } catch {
      /* nothing further to undo if the drop is also refused */
    }
    db.close();
    throw new Error(`source connection to ${db.path ?? 'database'} accepted a write; refusing to run`);
  }
}

/** Highest inserted row, or 0 when the table is empty. */
export function latestRowId(db) {
  const row = db.prepare('SELECT max(rowid) AS r FROM tool_executions').get();
  return Number(row?.r ?? 0);
}

export function totalRows(db) {
  const row = db.prepare('SELECT count(*) AS n FROM tool_executions').get();
  return Number(row?.n ?? 0);
}

/**
 * Rows inserted after `cursor`. Ordered by rowid, which is insertion order:
 * `created_at` defaults to `strftime('%s','now')` at insert time, so the two
 * agree except after a restore that rewrote older timestamps. Ordering by
 * rowid keeps the seek cheap, and the emitted `at` is whatever the row says.
 */
export function poll(db, cursor, limit = 500) {
  const cap = Math.max(1, Math.min(Number(limit) || 500, MAX_POLL_LIMIT));
  const rows = db
    .prepare(
      `SELECT rowid AS row_id, id, session_id, tool_name, status, created_at, duration_ms
       FROM tool_executions
       WHERE rowid > ?
       ORDER BY rowid ASC
       LIMIT ?`,
    )
    .all(BigInt(cursor), cap);
  return rows.map((row) => normalize(row));
}

function normalize(row) {
  return {
    rowId: Number(row.row_id),
    sessionId: String(row.session_id ?? ''),
    toolName: String(row.tool_name ?? ''),
    status: String(row.status ?? 'pending'),
    createdAt: Number(row.created_at ?? 0),
    durationMs: Number.isFinite(row.duration_ms) ? Number(row.duration_ms) : null,
  };
}

/** Per-tool counts inside one window only, so this stays a bounded range read. */
export function toolTotals(db, cursor, horizon) {
  const rows = db
    .prepare(
      `SELECT tool_name AS tool, count(*) AS n
       FROM tool_executions
       WHERE rowid > ? AND rowid <= ?
       GROUP BY tool_name`,
    )
    .all(BigInt(cursor), BigInt(horizon));
  const totals = new Map();
  for (const row of rows) totals.set(String(row.tool), Number(row.n));
  return totals;
}
