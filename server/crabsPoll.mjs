// OpenCrabs Reef source CLI.
//
//   reef snapshot                 last 200 tool calls as one JSON snapshot
//   reef snapshot --tail          start at the head of the ledger, emit nothing old
//   reef snapshot --replay 1000   wider first window
//   reef watch --interval 1000    keep polling and print each batch (for task 5's SSE)
//
// The database is opened read-only and the guard is proven at startup, so
// pointing this at the live `opencrabs.db` is safe by construction.

import { existsSync } from 'node:fs';

import {
  DEFAULT_DB_PATH,
  MAX_POLL_LIMIT,
  latestRowId,
  openSource,
  poll,
  toolTotals,
  totalRows,
} from './lib/crabsSource.mjs';
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

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--tail') args.tail = true;
    else if (token === '--json') args.json = true;
    else if (token.startsWith('--')) args[token.slice(2)] = argv[++i];
    else args._.push(token);
  }
  return args;
}

function buildSnapshot(db, cursor, horizon, salt, limit) {
  const rows = poll(db, cursor, limit).filter((row) => TOOL_NAME.test(row.toolName));
  const totals = toolTotals(db, cursor, horizon);
  const residents = new Map();
  const events = [];

  for (const row of rows) {
    const key = agentKeyFor(row.sessionId, salt);
    const role = roleForTool(row.toolName);
    let resident = residents.get(key);
    if (!resident) {
      resident = { key, role, display_name: displayNameFor(role, key), tool_total: 0, last_tool: null };
      residents.set(key, resident);
    }
    resident.tool_total += 1;
    resident.last_tool = row.toolName;
    events.push({
      id: eventIdFor(row.rowId, salt),
      key,
      seq: row.rowId,
      type: 'agent.tool_finished',
      role,
      tool: row.toolName,
      outcome: outcomeForStatus(row.status),
      duration_ms: row.durationMs,
      at: row.createdAt,
    });
  }

  return {
    contract: SNAPSHOT_VERSION,
    public_contract: PUBLIC_VERSION,
    generated_at: Date.now(),
    status: 'live',
    cursor: { rowid: horizon, replayed_from: cursor },
    totals: { tool_executions: totalRows(db), window: events.length },
    residents: [...residents.values()].sort((a, b) => b.tool_total - a.tool_total),
    tool_totals: [...totals.entries()]
      .map(([tool, n]) => ({ tool, n }))
      .sort((a, b) => b.n - a.n),
    events,
  };
}

function degraded(dbPath, reason) {
  return {
    contract: SNAPSHOT_VERSION,
    public_contract: PUBLIC_VERSION,
    generated_at: Date.now(),
    status: 'degraded',
    reason: String(reason).split('\n')[0].slice(0, 200),
    db_path: dbPath,
    cursor: { rowid: 0, replayed_from: 0 },
    totals: { tool_executions: 0, window: 0 },
    residents: [],
    tool_totals: [],
    events: [],
  };
}

const args = parseArgs(process.argv.slice(2));
const mode = args._[0] ?? 'snapshot';
const dbPath = args.db ?? DEFAULT_DB_PATH;
const limit = Math.min(Number(args.limit ?? 500) || 500, MAX_POLL_LIMIT);

if (!existsSync(dbPath)) {
  console.log(JSON.stringify(degraded(dbPath, `no database at ${dbPath}`), null, args.json ? 2 : 0));
  process.exit(0);
}

let db;
try {
  db = openSource(dbPath);
} catch (error) {
  console.log(JSON.stringify(degraded(dbPath, error.message), null, args.json ? 2 : 0));
  process.exit(0);
}

const latest = latestRowId(db);
const requested = args.from !== undefined ? Number(args.from) : null;
const replay = args.tail ? 0 : Number(args.replay ?? 200);
const cursor = requested !== null ? requested : Math.max(0, latest - replay);
const salt = saltFor(dbPath, args.salt);

let snapshot;
try {
  snapshot = buildSnapshot(db, cursor, latest, salt, limit);
} catch (error) {
  console.log(JSON.stringify(degraded(dbPath, error.message), null, args.json ? 2 : 0));
  process.exit(0);
}

if (mode === 'watch') {
  const interval = Math.max(250, Number(args.interval ?? 1000));
  let seen = latestRowId(db);
  process.stdout.write(`${JSON.stringify({ ...snapshot, events: [] })}\n`);
  const tick = () => {
    const head = latestRowId(db);
    if (head > seen) {
      const batch = buildSnapshot(db, seen, head, salt, limit);
      process.stdout.write(`${JSON.stringify({ ...batch, cursor: { rowid: head, replayed_from: seen } })}\n`);
      seen = head;
    }
  };
  const timer = setInterval(tick, interval);
  process.on('SIGINT', () => {
    clearInterval(timer);
    db.close();
    process.exit(0);
  });
} else {
  process.stdout.write(`${JSON.stringify(snapshot, null, args.pretty ? 2 : 0)}\n`);
  db.close();
}
