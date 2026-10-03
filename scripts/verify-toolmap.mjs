// Proves the town recognises the tools this runtime actually calls.
//
// The check imports the real module, compiled, rather than a copy of its rules:
// a duplicated table would drift and then certify the wrong thing.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { transformSync } from 'esbuild';

const repo = path.resolve(import.meta.dirname, '..');
const js = transformSync(readFileSync(path.join(repo, 'src/sim/toolMap.ts'), 'utf8'), { loader: 'ts', format: 'esm' }).code;
const dir = mkdtempSync(path.join(tmpdir(), 'toolmap-'));
const mod = path.join(dir, 'toolMap.mjs');
writeFileSync(mod, js);
const { targetForTool } = await import(mod);

// Names come from the checked-in sample by default, so CI needs no database.
// Point --db at an opencrabs.db to audit a live host instead.
const flag = process.argv.indexOf('--db');
let names, origin;
if (flag >= 0 && process.argv[flag + 1]) {
  const { DatabaseSync } = await import('node:sqlite');
  const db = path.resolve(process.argv[flag + 1]);
  const handle = new DatabaseSync(db, { readOnly: true });
  handle.exec('PRAGMA query_only = ON');
  names = handle.prepare(
    "SELECT DISTINCT tool_name AS n FROM tool_executions WHERE created_at > strftime('%s','now')-2592000 ORDER BY n",
  ).all().map((row) => row.n);
  handle.close();
  origin = `live database ${db}`;
} else {
  names = readFileSync(path.join(repo, 'tests/fixtures/openclabs-tool-names.txt'), 'utf8')
    .split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  origin = 'fixture tests/fixtures/openclabs-tool-names.txt';
}

// The market is where an unrecognised tool goes, by design. That makes it the
// one place a tool this runtime actually ships must not appear: if it does, the
// name was never added to the table and the resident just wanders off to browse.
const unmapped = [];
const byPlace = new Map();
for (const name of names) {
  const target = targetForTool(name);
  byPlace.set(target.place, (byPlace.get(target.place) ?? 0) + 1);
  if (target.place === 'market') unmapped.push(name);
}

// A tool nobody has heard of must still produce a destination, and must not
// throw: the town keeps rendering even when a runtime renames something.
for (const probe of ['zeta_unknown_tool', 'brand_new_tool_2027', 'mcp__srv__do_thing', 'functions__core__whatever']) {
  const target = targetForTool(probe);
  if (!target || !target.place || !target.verb) throw new Error(`unrecognised tool did not resolve: ${probe}`);
}

console.log(`source: ${origin}`);
console.log(`tool names checked: ${names.length}`);
for (const [place, count] of [...byPlace].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
  console.log(`  ${place.padEnd(12)} ${count}`);
}
console.log('unrecognised-tool probes resolved without throwing: 4');

if (unmapped.length) {
  console.error(`\nUNMAPPED to a real workplace (${unmapped.length}): ${unmapped.join(', ')}`);
  console.error('Add them to src/sim/toolMap.ts, or record why the market is correct.');
  process.exit(1);
}
console.log('\nevery observed tool has an explicit home');
