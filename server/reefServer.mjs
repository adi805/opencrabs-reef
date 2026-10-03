// OpenCrabs Reef live server.
//
//   npm run reef:serve [-- --port 4188 --static dist --interval 1000]
//
// One process, zero dependencies, four routes and no writer:
//
//   GET /api/reef/snapshot   current window as JSON
//   GET /api/reef/events     SSE, replays from ?cursor=<rowid> then follows
//   GET /api/reef/health     liveness and source state
//   GET /*                   the built app, if `dist` exists
//
// Trust model differs from the upstream server on purpose. Upstream authenticates
// an inbound plugin POST, so it needs a bearer token, a journal and a de-dup
// layer. Reef has no inbound write path at all: the source is a read-only local
// database. That removes a whole attack surface, and the loopback bind below is
// what keeps it that way.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import { contentTypeFor, resolveStatic } from './lib/staticFiles.mjs';
import {
  PUBLIC_VERSION,
  SNAPSHOT_VERSION,
  TOOL_NAME,
  agentKeyFor,
  displayNameFor,
  eventIdFor,
  outcomeForStatus,
  roleForTool,
  saltFor,
} from './lib/crabsContract.mjs';
import { DEFAULT_DB_PATH, latestRowId, openSource, poll, totalRows } from './lib/crabsSource.mjs';

/** `0.0.0.0` is deliberately absent: it is not a loopback address. */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

const SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
  ].join('; '),
});

const startedAt = Date.now();

function parseArgs(argv) {
  const options = {
    port: Number(process.env.REEF_PORT ?? 4188),
    host: process.env.REEF_HOST ?? '127.0.0.1',
    db: process.env.REEF_DB ?? DEFAULT_DB_PATH,
    salt: process.env.REEF_SALT ?? null,
    staticRoot: path.resolve(import.meta.dirname, '..', 'dist'),
    intervalMs: Number(process.env.REEF_INTERVAL ?? 1000),
    heartbeatSeconds: 10,
    ringLength: 600,
    batch: 200,
    replay: 200,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      const next = argv[i + 1];
      if (next === undefined) throw new Error(`${arg} needs a value`);
      i += 1;
      return next;
    };
    switch (arg) {
      case '--port': options.port = Number(value()); break;
      case '--host': options.host = value(); break;
      case '--db': options.db = path.resolve(value()); break;
      case '--salt': options.salt = value(); break;
      case '--static': options.staticRoot = path.resolve(value()); break;
      case '--no-static': options.staticRoot = null; break;
      case '--interval': options.intervalMs = Number(value()); break;
      case '--ring': options.ringLength = Number(value()); break;
      case '--batch': options.batch = Number(value()); break;
      case '--replay': options.replay = Number(value()); break;
      case '--help': case '-h': options.help = true; break;
      default: throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

export function isLoopbackHost(host) {
  return typeof host === 'string' && LOOPBACK_HOSTS.has(host.trim().toLowerCase());
}

/**
 * Derive residents from the ring instead of keeping a parallel counter.
 * A window of at most `ringLength` events costs one pass per request, and it
 * cannot drift out of sync with what was actually published.
 */
function residentsFrom(ring) {
  const byKey = new Map();
  for (const event of ring) {
    let resident = byKey.get(event.key);
    if (!resident) {
      resident = { key: event.key, role: event.role, display_name: displayNameFor(event.role, event.key), tool_total: 0, last_tool: null, last_seq: 0 };
      byKey.set(event.key, resident);
    }
    resident.tool_total += 1;
    resident.last_tool = event.tool;
    resident.last_seq = event.seq;
  }
  return [...byKey.values()].sort((a, b) => b.tool_total - a.tool_total || a.key.localeCompare(b.key));
}

function toolTotalsFrom(ring) {
  const counts = new Map();
  for (const event of ring) counts.set(event.tool, (counts.get(event.tool) ?? 0) + 1);
  return [...counts.entries()]
    .map(([tool, n]) => ({ tool, n }))
    .sort((a, b) => b.n - a.n || a.tool.localeCompare(b.tool));
}

function frame(name, payload) {
  return `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function json(res, status, body) {
  const text = `${JSON.stringify(body)}\n`;
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(text);
}

export function createReefServer(options) {
  const salt = saltFor(options.db, options.salt);
  const ring = [];
  const clients = new Set();
  /** `null` means "no usable source right now"; the server keeps answering. */
  let db = null;
  let source = { status: 'starting', reason: null, next_attempt: 0 };
  let seen = 0;
  /** Only the very first open seeds the ring; a re-open must not replay history. */
  let bootstrapped = false;

  function openSourceQuietly() {
    if (db) return true;
    if (Date.now() < source.next_attempt) return false;
    try {
      db = openSource(options.db);
      const head = latestRowId(db);
      seen = bootstrapped ? head : Math.max(0, head - options.replay);
      bootstrapped = true;
      source = { status: 'live', reason: null, next_attempt: 0 };
      return true;
    } catch (error) {
      db = null;
      // A locked or missing database is a state, not a crash: back off and
      // keep serving the last known window.
      source = { status: 'degraded', reason: String(error.message).split('\n')[0].slice(0, 200), next_attempt: Date.now() + 5000 };
      return false;
    }
  }

  function publish(row) {
    if (!TOOL_NAME.test(row.toolName)) return;
    const role = roleForTool(row.toolName);
    const key = agentKeyFor(row.sessionId, salt);
    const event = {
      id: eventIdFor(row.rowId, salt),
      key,
      seq: row.rowId,
      type: 'agent.tool_finished',
      role,
      tool: row.toolName,
      outcome: outcomeForStatus(row.status),
      duration_ms: row.durationMs,
      at: row.createdAt,
      contract: PUBLIC_VERSION,
    };
    ring.push(event);
    while (ring.length > options.ringLength) ring.shift();
    for (const res of clients) {
      try {
        res.write(frame('tick', event));
      } catch {
        clients.delete(res);
      }
    }
  }

  function tick() {
    if (!openSourceQuietly()) return;
    try {
      const head = latestRowId(db);
      if (head <= seen) return;
      for (const row of poll(db, seen, options.batch)) {
        publish(row);
        seen = row.rowId;
      }
    } catch (error) {
      try {
        db.close();
      } catch {
        /* already gone */
      }
      db = null;
      source = { status: 'degraded', reason: String(error.message).split('\n')[0].slice(0, 200), next_attempt: Date.now() + 5000 };
    }
  }

  const timer = setInterval(tick, options.intervalMs);
  const heartbeat = setInterval(() => {
    for (const res of clients) {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clients.delete(res);
      }
    }
  }, options.heartbeatSeconds * 1000);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${options.host}`);
    const route = url.pathname;

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      json(res, 405, { error: 'method_not_allowed' });
      return;
    }

    if (route === '/api/reef/health') {
      json(res, 200, {
        ok: true,
        status: source.status,
        reason: source.reason,
        cursor: seen,
        ring: ring.length,
        residents: residentsFrom(ring).length,
        clients: clients.size,
        uptime_ms: Date.now() - startedAt,
        poll_interval_ms: options.intervalMs,
      });
      return;
    }

    if (route === '/api/reef/snapshot') {
      let ledger = 0;
      if (db) {
        try {
          ledger = totalRows(db);
        } catch {
          ledger = 0;
        }
      }
      json(res, 200, {
        contract: SNAPSHOT_VERSION,
        public_contract: PUBLIC_VERSION,
        generated_at: Date.now(),
        status: source.status,
        reason: source.reason,
        cursor: { rowid: seen },
        totals: { tool_executions: ledger, window: ring.length },
        residents: residentsFrom(ring),
        tool_totals: toolTotalsFrom(ring),
        events: ring,
      });
      return;
    }

    if (route === '/api/reef/events') {
      const cursor = Number(url.searchParams.get('cursor') ?? 0);
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'Content-Type': 'text/event-stream; charset=utf-8',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write('retry: 2000\n\n');
      res.write(frame('hello', {
        contract: SNAPSHOT_VERSION,
        status: source.status,
        cursor: seen,
        replayed_from: Number.isFinite(cursor) ? cursor : 0,
      }));
      let replayed = 0;
      for (const event of ring) {
        if (event.seq > cursor) {
          res.write(frame('tick', event));
          replayed += 1;
        }
      }
      res.write(frame('replay_done', { replayed, cursor: seen }));
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (route.startsWith('/api/')) {
      json(res, 404, { error: 'not_found' });
      return;
    }

    if (options.staticRoot) {
      const found = resolveStatic(options.staticRoot, route);
      if (found.ok) {
        const body = fs.readFileSync(found.file);
        res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': contentTypeFor(found.file) });
        res.end(req.method === 'HEAD' ? undefined : body);
        return;
      }
    }

    json(res, 404, { error: 'not_found', hint: 'no built app; run npm run build' });
  });

  return {
    server,
    listen(port, host) {
      if (!isLoopbackHost(host)) {
        throw new Error(
          `refusing to bind ${host}: the live bridge exposes agent activity and must stay on loopback (127.0.0.1, ::1, localhost)`,
        );
      }
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => resolve(server.address()));
      });
    },
    tick,
    close() {
      clearInterval(timer);
      clearInterval(heartbeat);
      for (const res of clients) res.end();
      clients.clear();
      if (db) {
        try {
          db.close();
        } catch {
          /* already closed */
        }
      }
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);
if (isMain) {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  if (options.help) {
    console.log([
      'Usage: npm run reef:serve -- [options]',
      '',
      '  --port N        Listen port (default 4188)',
      '  --host ADDR     Bind address, loopback only (default 127.0.0.1)',
      '  --db PATH       OpenCrabs database (default ~/.opencrabs/opencrabs.db)',
      '  --static DIR    Built app to serve (default dist)',
      '  --no-static     API only',
      '  --interval N    Poll interval in ms (default 1000)',
      '  --ring N        Events kept for replay (default 600)',
      '  --batch N       Max rows read per poll (default 200)',
      '  --replay N      Events seeded into the ring on first open (default 200)',
      '  --salt S        Pseudonym salt (default derived from the db path)',
    ].join('\n'));
    process.exit(0);
  }
  if (options.staticRoot !== null && !fs.existsSync(options.staticRoot)) {
    console.log(`note: no built app at ${options.staticRoot}; serving API only (run npm run build)`);
    options.staticRoot = null;
  }
  const app = createReefServer(options);
  try {
    await app.listen(options.port, options.host);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  const origin = `http://${options.host}:${options.port}`;
  console.log('OpenCrabs Reef live server');
  console.log(`  listening   ${origin}`);
  console.log(`  town        ${origin}/?source=reef`);
  console.log(`  snapshot    GET ${origin}/api/reef/snapshot`);
  console.log(`  stream      GET ${origin}/api/reef/events`);
  console.log(`  health      GET ${origin}/api/reef/health`);
  console.log(`  source      ${options.db} (read-only)`);
  app.tick();
  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    console.log(`\n${signal}: closing Reef server`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
}
