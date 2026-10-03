import type { BuildingKind } from '../art/buildings';
import type { WorkStyle } from '../art/characters';

/**
 * The town's whole vocabulary: a tool name becomes a place and a way of
 * working there. The table covers the Hermes tool registry (89 names as of
 * September 2026) plus the common Claude Code names, so the same town reads
 * either runtime. Anything unrecognised goes to the market, so an unknown tool
 * is still visible work rather than a resident standing still.
 */
export type Place = Exclude<BuildingKind, 'house'>;

export type { WorkStyle };

export interface ToolTarget {
  place: Place;
  style: WorkStyle;
  /** Short verb shown in the bubble beside the tool name. */
  verb: string;
}

const LIBRARY: ToolTarget = { place: 'library', style: 'read', verb: 'reading' };
const WORKSHOP: ToolTarget = { place: 'workshop', style: 'hammer', verb: 'making' };
const FORGE: ToolTarget = { place: 'forge', style: 'bellows', verb: 'running' };
const POST: ToolTarget = { place: 'post', style: 'parcel', verb: 'sending' };
const OBSERVATORY: ToolTarget = { place: 'observatory', style: 'gaze', verb: 'looking' };
const HALL: ToolTarget = { place: 'hall', style: 'desk', verb: 'planning' };
const MARKET: ToolTarget = { place: 'market', style: 'haggle', verb: 'using' };
/** Skills are the market: every skill is a stall, a skill call is a visit to it. */
const SKILLS: ToolTarget = { place: 'market', style: 'haggle', verb: 'consulting' };

/** Exact Hermes tool names, grouped by where the work happens. */
const EXACT: Record<string, ToolTarget> = Object.fromEntries<ToolTarget>([
  // reading and looking things up: the library
  ...['skill_view', 'skills_list', 'skill_manage'].map((t): [string, ToolTarget] => [t, SKILLS]),
  ...['read_file', 'search_files', 'session_search', 'memory', 'read_terminal', 'read_window_below',
    'feishu_doc_read', 'feishu_drive_list_comments', 'feishu_drive_list_comment_replies',
    'kanban_list', 'kanban_show', 'kanban_attachments', 'ha_get_state', 'ha_list_entities', 'ha_list_services',
    'yb_query_group_info', 'yb_query_group_members', 'yb_search_sticker'].map((t): [string, ToolTarget] => [t, LIBRARY]),
  // making and changing things: the workshop
  ...['write_file', 'patch', 'apply_layout', 'image_generate', 'video_generate', 'xai_video_edit', 'xai_video_extend', 'text_to_speech',
    'setup_mcp', 'kanban_create', 'kanban_attach', 'kanban_attach_url', 'kanban_link', 'kanban_comment'].map((t): [string, ToolTarget] => [t, WORKSHOP]),
  // executing: the forge
  ...['terminal', 'execute_code', 'process_manage', 'close_terminal', 'computer_use', 'ha_call_service'].map((t): [string, ToolTarget] => [t, FORGE]),
  // sending and shipping: the post office
  ...['discord', 'discord_admin', 'yb_send_dm', 'yb_send_sticker', 'feishu_drive_add_comment', 'feishu_drive_reply_comment', 'react_to_message',
    'kanban_complete', 'kanban_request_review', 'kanban_request_changes', 'kanban_block', 'kanban_unblock', 'kanban_heartbeat', 'manage_connections'].map((t): [string, ToolTarget] => [t, POST]),
  // browsing, watching, seeing: the observatory
  ...['web_search', 'web_extract', 'x_search', 'vision_analyze', 'video_analyze', 'desktop_preview', 'drive_preview', 'annotate_preview',
    'gui_tour', 'show_tip', 'focus_pane', 'desktop_project'].map((t): [string, ToolTarget] => [t, OBSERVATORY]),
  // planning, delegating, asking: the hall
  ...['delegate_task', 'todo_list', 'clarify'].map((t): [string, ToolTarget] => [t, HALL]),
  // OpenCrabs' own registry. These names are read out of `tool_executions` rather
  // than guessed, and the generic rules below would have parked most of them in
  // the market: `load_brain_file`, `config_manager`, `cron_manage` and friends
  // match none of the read/write/send verbs the fallbacks test for.
  ...['read_file', 'grep', 'glob', 'ls', 'memory_search', 'session_search', 'channel_search',
    'load_brain_file', 'tasks_list', 'parse_document', 'pdf_to_images', 'context7_docs', 'context7_search',
    'cloudflare_docs', 'cloudflare_api_search', 'feedback_analyze', 'profile_list', 'whatsapp_history'].map((t): [string, ToolTarget] => [t, LIBRARY]),
  ...['write_file', 'edit_file', 'hashline_edit', 'write_opencrabs_file', 'write_opcrabs_file',
    'generate_document', 'generate_image', 'stitch_list_projects', 'config_manager', 'tool_manage',
    'self_improve', 'rsi_propose', 'feedback_record', 'rename_session'].map((t): [string, ToolTarget] => [t, WORKSHOP]),
  ...['bash', 'execute_code', 'slash_command', 'cloudflare_api_execute', 'command_code', 'evolve', 'rebuild'].map((t): [string, ToolTarget] => [t, FORGE]),
  ...['telegram_send', 'whatsapp_send', 'slack_send', 'trello_send', 'a2a_send', 'session_notify'].map((t): [string, ToolTarget] => [t, POST]),
  ...['web_search', 'exa_search', 'brave_search', 'analyze_image', 'analyze_video', 'vision_read',
    'browser_navigate', 'browser_find', 'camofox_navigate', 'camofox_health', 'mission_control_report'].map((t): [string, ToolTarget] => [t, OBSERVATORY]),
  ...['plan', 'cron_manage', 'goal_manage', 'suggest_options', 'suggest_followups', 'session_context', 'decide_cached'].map((t): [string, ToolTarget] => [t, HALL]),
]);

/** Prefix and pattern rules, for tool families and for other runtimes. */
const RULES: [RegExp, ToolTarget][] = [
  [/^browser_/i, OBSERVATORY],
  [/^kanban_/i, LIBRARY],
  [/^feishu_/i, LIBRARY],
  [/^ha_/i, FORGE],
  [/^yb_/i, POST],
  [/^(read|grep|glob|cat|ls|find|view|list_dir|rg|head|tail|less|tree|notebookread)$/i, LIBRARY],
  [/^(edit|write|multiedit|str_replace|create_file|apply_patch|notebookedit|replace)$/i, WORKSHOP],
  [/^(bash|shell|execute|run|exec|powershell|cmd|python|node|npm|pytest|test|make|cargo|go)$/i, FORGE],
  [/^(git.*|gh|github.*|commit|push|pull|pr|merge|rebase|sendmessage|sendemail|slack.*)$/i, POST],
  [/^(web.*|fetch|http.*|curl|browse.*|search|websearch|webfetch|navigate|url)$/i, OBSERVATORY],
  [/^(agent|task|delegate.*|spawn.*|subagent.*|team.*|todo.*|plan.*|think.*|reflect.*|askuserquestion)$/i, HALL],
];

export function targetForTool(tool: string): ToolTarget {
  // Two namespacing styles reach the town: an MCP server's `mcp__<server>__<tool>`
  // and OpenCrabs' own `functions__<group>__<tool>`. Both wrap a name the table
  // already knows, so the wrapper comes off before lookup.
  const t = tool.replace(/^(?:mcp|functions)__.*?__/, '').replace(/^functions\./, '');
  const exact = EXACT[t] ?? EXACT[t.toLowerCase()];
  if (exact) return exact;
  for (const [re, target] of RULES) if (re.test(t)) return target;
  if (/edit|write|generate/i.test(t)) return WORKSHOP;
  if (/read|list|get|search|find|query/i.test(t)) return LIBRARY;
  if (/run|exec|shell|terminal/i.test(t)) return FORGE;
  if (/send|post|reply|comment|notify/i.test(t)) return POST;
  if (/web|http|fetch|browser|vision|preview/i.test(t)) return OBSERVATORY;
  return MARKET;
}

/** Where a resident goes when it has no tool but is thinking (an LLM turn). */
export const THINK_TARGET: ToolTarget = { place: 'hall', style: 'desk', verb: 'thinking' };
/** Where a resident goes between turns. */
export const IDLE_TARGET: ToolTarget = { place: 'tavern', style: 'sit', verb: 'idle' };

export const PLACE_LABEL: Record<Place, string> = {
  library: 'Coral Archive',
  workshop: 'Shell Workshop',
  forge: 'Vent Forge',
  post: 'Tide Post',
  observatory: 'Lighthouse',
  hall: 'Reef Hall',
  tavern: 'Kelp Bar',
  market: 'Reef Market',
};
