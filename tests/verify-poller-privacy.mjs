// Privacy contract for the read-only source poller.
//
// The plugin that used to carry this contract is gone: the town reads
// `opencrabs.db` directly through `server/lib/crabsSource.mjs`. The promise did
// not go away with the plugin, so the test moves to the code that actually
// ships. Two things are asserted, and both are properties of the real CLI:
//
//   1. Nothing raw leaves. A session title, a working directory and a raw
//      session UUID all go into a fixture database, and none of them may appear
//      anywhere in the snapshot the CLI prints. Residents are only ever named
//      by their pseudonym.
//
//   2. The poller never writes. The database is hashed before and after a poll.
//      The read-only guard is proven at open time by provoking a write, so a
//      silent failure to attach it would throw here rather than pass.
//
// The fixture is built in a temp directory, never against a real database: the
// live one holds operator session titles, and a test must not read them.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const PRIVATE_TITLE = 'HT_POLLER_TITLE_SENTINEL';
const PRIVATE_CWD = '/home/operator/HT_POLLER_CWD_SENTINEL';
const PRIVATE_UUID = '11111111-2222-3333-4444-555555555555';

/** Fields that must never appear in a public snapshot, at any depth. */
const FORBIDDEN_FIELDS = [
  'title', 'working_directory', 'workingDirectory', 'message_id',
  'messageId', 'prompt', 'cwd',
];

const dir = mkdtempSync(path.join(os.tmpdir(), 'reef-poller-privacy-'));
const dbPath = path.join(dir, 'fixture.db');

try {
  const db = new DatabaseSync(dbPath);
  db.exec('CREATE TABLE sessions (id TEXT PRIMARY KEY, title TEXT, working_directory TEXT)');
  db.exec(`CREATE TABLE tool_executions (
    id TEXT, session_id TEXT, tool_name TEXT, status TEXT,
    created_at INTEGER, duration_ms INTEGER
  )`);
  db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(PRIVATE_UUID, PRIVATE_TITLE, PRIVATE_CWD);
  const insert = db.prepare('INSERT INTO tool_executions VALUES (?, ?, ?, ?, ?, ?)');
  const tools = ['read_file', 'grep', 'web_search', 'analyze_image', 'reef'];
  for (let i = 0; i < 12; i += 1) {
    insert.run(`x${i}`, PRIVATE_UUID, tools[i % tools.length], i % 5 === 0 ? 'error' : 'success', 1700000000 + i, 12 + i);
  }
  db.close();

  const hashOf = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
  const before = hashOf(dbPath);

  const out = execFileSync(
    process.execPath,
    ['server/crabsPoll.mjs', 'snapshot', '--db', dbPath, '--replay', '50'],
    { encoding: 'utf8', cwd: path.resolve(import.meta.dirname, '..') },
  );

  const after = hashOf(dbPath);

  // 1. The poll must not have touched the file.
  assert.equal(after, before, 'poller modified the database');

  // 2. Nothing raw may appear in the output, at any nesting depth.
  assert.equal(out.includes(PRIVATE_TITLE), false, 'session title leaked into the snapshot');
  assert.equal(out.includes(PRIVATE_CWD), false, 'working directory leaked into the snapshot');
  assert.equal(out.includes(PRIVATE_UUID), false, 'raw session uuid leaked into the snapshot');

  const snapshot = JSON.parse(out);
  assert.equal(snapshot.status, 'live', `expected a live snapshot, got ${snapshot.status}: ${snapshot.reason ?? ''}`);
  assert.equal(snapshot.contract, 'crabs-town.snapshot.v1');
  assert.equal(snapshot.public_contract, 'crabs-town.public.v1');
  assert.ok(snapshot.residents.length > 0, 'fixture produced no residents');
  assert.ok(snapshot.events.length > 0, 'fixture produced no events');

  // 3. Residents are named by pseudonym only, never by session id.
  for (const resident of snapshot.residents) {
    assert.match(resident.key, /^c\/[sb]\/[0-9a-f]{16}$/, `resident key is not a pseudonym: ${resident.key}`);
  }

  // 4. No forbidden field name survives anywhere in the snapshot.
  const names = new Set();
  const walk = (value) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) { names.add(k); walk(v); }
    }
  };
  walk(snapshot);
  for (const field of FORBIDDEN_FIELDS) {
    assert.equal(names.has(field), false, `forbidden field "${field}" present in the snapshot`);
  }

  // 5. An unknown database degrades instead of throwing, and still leaks nothing.
  const missing = execFileSync(
    process.execPath,
    ['server/crabsPoll.mjs', 'snapshot', '--db', path.join(dir, 'nope.db')],
    { encoding: 'utf8', cwd: path.resolve(import.meta.dirname, '..') },
  );
  const degraded = JSON.parse(missing);
  assert.equal(degraded.status, 'degraded');
  assert.deepEqual(degraded.residents, []);
  assert.deepEqual(degraded.events, []);

  console.log(JSON.stringify({
    ok: true,
    residents: snapshot.residents.length,
    events: snapshot.events.length,
    write_refused: after === before,
  }));
} finally {
  rmSync(dir, { recursive: true, force: true });
}
