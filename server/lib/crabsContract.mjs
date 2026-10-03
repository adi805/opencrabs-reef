// OpenCrabs Reef contract.
//
// Same rule as the upstream wire contract: nothing raw leaves the source. A row
// from `opencrabs.db` becomes a public event only through the derivation here,
// so a session title, a working directory or a message id can never reach a
// browser by accident.
//
// Roles, outcomes and the tool-name guard are imported from the upstream
// contract rather than re-declared, so there is exactly one list of each.

import { createHash } from 'node:crypto';

import { ROLES, TOOL_NAME, displayNameFor } from './contract.mjs';

export const SNAPSHOT_VERSION = 'crabs-town.snapshot.v1';
export const PUBLIC_VERSION = 'crabs-town.public.v1';

/** Pseudonym shape: `c/<bucket>/<16 hex>`. Buckets: s = session, b = background task. */
export const AGENT_KEY = /^c\/[sb]\/[0-9a-f]{16}$/;

/**
 * SQLite stores no parent/child link for sessions, and the tables that do exist
 * carry operator-authored text. A tool call therefore identifies its actor only
 * by session, and a session is only ever named by its pseudonym.
 */
export function agentKeyFor(sessionId, salt) {
  return `c/s/${digest(`${salt}|s|${sessionId}`).slice(0, 16)}`;
}

export function eventIdFor(rowId, salt) {
  return `e${digest(`${salt}|e|${rowId}`).slice(0, 15)}`;
}

/**
 * Pseudonym salt. Stable across restarts by default, derived from the database
 * path, otherwise every server bounce renames every resident. Override to
 * rotate pseudonyms deliberately.
 */
export function saltFor(dbPath, explicit) {
  if (explicit) return digest(`salt:${explicit}`).slice(0, 16);
  return digest(`reef:${dbPath}`).slice(0, 16);
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Where a tool's work belongs, by role. The building a resident walks to is
 * decided client-side in `src/sim/toolMap.ts`, exactly as upstream does it, so
 * the wire never carries a district.
 *
 * Anything not listed is `general`: an unmapped tool still renders, it just
 * goes to the plaza instead of vanishing.
 */
const TOOL_ROLE = Object.freeze({
  read_file: 'research',
  grep: 'research',
  glob: 'research',
  ls: 'research',
  memory_search: 'research',
  web_search: 'research',
  exa_search: 'research',
  brave_search: 'research',
  session_search: 'research',
  channel_search: 'research',
  load_brain_file: 'research',
  analyze_image: 'research',
  analyze_video: 'research',
  parse_document: 'research',
  pdf_to_images: 'research',
  browser_find: 'research',
  browser_content: 'research',
  http_request: 'research',

  write_file: 'fabrication',
  edit_file: 'fabrication',
  hashline_edit: 'fabrication',
  notebook_edit: 'fabrication',
  generate_document: 'fabrication',
  generate_image: 'fabrication',
  browser_navigate: 'fabrication',
  browser_click: 'fabrication',
  browser_type: 'fabrication',
  browser_eval: 'fabrication',

  bash: 'tooling',
  execute_code: 'tooling',
  tool_search: 'tooling',
  tool_manage: 'tooling',
  config_manager: 'tooling',
  cron_manage: 'tooling',
  slash_command: 'tooling',
  telegram_send: 'tooling',
  discord_send: 'tooling',
  slack_send: 'tooling',
  whatsapp_send: 'tooling',
  trello_send: 'tooling',

  plan: 'coordinator',
  spawn_agent: 'coordinator',
  team_create: 'coordinator',
  resume_agent: 'coordinator',
  wait_agent: 'coordinator',
  tasks_list: 'coordinator',
  session_context: 'coordinator',

  self_improve: 'review',
  feedback_analyze: 'review',
  feedback_record: 'review',
  decide_cached: 'review',
});

export function roleForTool(toolName) {
  return TOOL_ROLE[toolName] ?? 'general';
}

/** `success`/`error` are the only statuses the ledger writes today. */
export function outcomeForStatus(status) {
  if (status === 'success') return 'ok';
  if (status === 'error') return 'error';
  return 'interrupted';
}

export { ROLES, TOOL_NAME, displayNameFor };
