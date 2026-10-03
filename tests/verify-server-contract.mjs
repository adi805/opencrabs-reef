// Contract for the server that actually ships: `server/reefServer.mjs`.
//
// The upstream ingress server is gone with the plugin. These are the promises
// the live bridge still makes, and each one is a property of the real server
// object rather than of a fixture that imitates it:
//
//   1. It refuses any bind that is not loopback. The bridge exposes agent
//      activity, so a public bind is the one failure that must be impossible.
//   2. Responses carry the security headers and no CORS allowance.
//   3. A snapshot never contains operator data: a session title sentinel goes
//      into the fixture database and must not appear in the response.
//   4. A missing database degrades the source state without taking the server
//      down, and the degraded response leaks nothing either.
//
// The fixture lives in a temp directory. The live database holds real session
// titles, and a test must never read them.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { createReefServer, isLoopbackHost } from '../server/reefServer.mjs';

const PRIVATE_TITLE = 'HT_SERVER_TITLE_SENTINEL';
const PRIVATE_CWD = '/home/operator/HT_SERVER_CWD_SENTINEL';
const PRIVATE_UUID = '99999999-8888-7777-6666-555555555555';

const dir = mkdtempSync(path.join(os.tmpdir(), 'reef-server-contract-'));
const dbPath = path.join(dir, 'fixture.db');

function makeFixture(file) {
  const db = new DatabaseSync(file);
  db.exec('CREATE TABLE sessions (id TEXT PRIMARY KEY, title TEXT, working_directory TEXT)');
  db.exec(`CREATE TABLE tool_executions (
    id TEXT, session_id TEXT, tool_name TEXT, status TEXT,
    created_at INTEGER, duration_ms INTEGER
  )`);
  db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(PRIVATE_UUID, PRIVATE_TITLE, PRIVATE_CWD);
  const insert = db.prepare('INSERT INTO tool_executions VALUES (?, ?, ?, ?, ?, ?)');
  for (let i = 0; i < 10; i += 1) {
    insert.run(`x${i}`, PRIVATE_UUID, i % 3 === 0 ? 'grep' : 'read_file', 'success', 1700000000 + i, 9 + i);
  }
  db.close();
}

const options = {
  db: dbPath,
  salt: 'contract-fixture',
  replay: 50,
  staticRoot: null,
  intervalMs: 50,
  ringLength: 200,
  batch: 100,
  heartbeatSeconds: 60,
};

makeFixture(dbPath);

// 1. Loopback is the only bind the server will accept.
assert.equal(isLoopbackHost('127.0.0.1'), true);
assert.equal(isLoopbackHost('localhost'), true);
assert.equal(isLoopbackHost('::1'), true);
assert.equal(isLoopbackHost('0.0.0.0'), false);
assert.equal(isLoopbackHost('example.com'), false);

const refused = createReefServer({ ...options });
try {
  // `listen` validates the host before it returns a promise, so the refusal is
  // synchronous: `assert.rejects` would let the throw escape and read as a crash.
  assert.throws(
    () => refused.listen(0, '0.0.0.0'),
    /loopback/,
    'server accepted a non-loopback bind',
  );
} finally {
  refused.close();
}

const live = createReefServer({ ...options });
try {
  const address = await live.listen(0, '127.0.0.1');
  const origin = `http://127.0.0.1:${address.port}`;
  await new Promise((resolve) => setTimeout(resolve, 300));

  const snapshotResponse = await fetch(`${origin}/api/reef/snapshot`);
  assert.equal(snapshotResponse.status, 200);
  // 2. No CORS allowance, and the security headers are present.
  assert.equal(snapshotResponse.headers.get('access-control-allow-origin'), null);
  assert.equal(snapshotResponse.headers.get('x-content-type-options'), 'nosniff');
  assert.match(snapshotResponse.headers.get('content-security-policy') ?? '', /connect-src 'self'/);

  const snapshotText = await snapshotResponse.text();
  // 3. Nothing operator-authored reaches the wire.
  assert.equal(snapshotText.includes(PRIVATE_TITLE), false, 'session title leaked');
  assert.equal(snapshotText.includes(PRIVATE_CWD), false, 'working directory leaked');
  assert.equal(snapshotText.includes(PRIVATE_UUID), false, 'raw session uuid leaked');

  const snapshot = JSON.parse(snapshotText);
  assert.equal(snapshot.status, 'live');
  assert.ok(Array.isArray(snapshot.residents));
  for (const resident of snapshot.residents) {
    assert.match(resident.key, /^c\/[sb]\/[0-9a-f]{16}$/, `resident key is not a pseudonym: ${resident.key}`);
  }

  const health = await fetch(`${origin}/api/reef/health`);
  assert.equal(health.status, 200);
  const healthText = await health.text();
  assert.equal(healthText.includes(PRIVATE_TITLE), false);
} finally {
  live.close();
}

// 4. A missing database is a state, not a crash: the server still answers.
const degraded = createReefServer({ ...options, db: path.join(dir, 'does-not-exist.db') });
try {
  const address = await degraded.listen(0, '127.0.0.1');
  const origin = `http://127.0.0.1:${address.port}`;
  await new Promise((resolve) => setTimeout(resolve, 300));
  const response = await fetch(`${origin}/api/reef/snapshot`);
  assert.equal(response.status, 200, 'a missing database must not take the server down');
  const body = JSON.parse(await response.text());
  assert.equal(body.status, 'degraded');
  assert.deepEqual(body.residents, []);
  assert.deepEqual(body.events, []);
} finally {
  degraded.close();
  rmSync(dir, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, loopback_only: true, headers: true, degraded_ok: true }));
