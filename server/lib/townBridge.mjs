// Compatibility adapter: serve the upstream town contract from the reef ring.
//
// The shipped client speaks `/api/town/*` and the `hermes-town.public.v1`
// lifecycle (`spawned` -> `assigned` -> `tool_started` -> `waiting`). The reef
// poller derives one public event per *finished* tool call instead, so a client
// that only knows the old contract shows nothing.
//
// This module re-labels reef events into that lifecycle. It adds nothing the
// reef contract did not already carry: the pseudonym stays `c/<bucket>/<hex>`,
// the tool name is the same allowlisted name, and the role is the same role.
// One tool call becomes up to three town events so a resident appears, walks to
// its station and works, then settles at its door again.

import crypto from 'node:crypto';

import { displayNameFor } from './crabsContract.mjs';

/** The role classes the town client accepts. Anything else degrades to `general`. */
const ROLES = new Set(['coordinator', 'research', 'fabrication', 'review', 'tooling', 'general', 'scheduled']);

/** Town events kept for replay. Bounded so a long-lived process cannot grow. */
const RING_MAX = 4000;

export function createTownBridge() {
  const streamId = crypto.randomBytes(8).toString('hex');
  const seen = new Set();
  const ring = [];
  let cursor = 0;
  let received = 0;
  let lastEventAt = null;

  const stamp = (body) => {
    cursor += 1;
    return { ...body, cursor };
  };

  /** One reef event (a finished tool call) -> the town lifecycle beats it implies. */
  function expand(reef) {
    const role = ROLES.has(reef.role) ? reef.role : 'general';
    const agentId = reef.key;
    const at = reef.at;
    const out = [];
    if (!seen.has(agentId)) {
      seen.add(agentId);
      out.push(stamp({
        id: `sp-${agentId}`,
        seq: reef.seq,
        at,
        agentId,
        type: 'agent.spawned',
        role,
        displayName: displayNameFor(role, agentId),
      }));
    }
    out.push(stamp({
      id: reef.id,
      seq: reef.seq,
      at,
      agentId,
      type: 'agent.tool_started',
      tool: reef.tool,
    }));
    out.push(stamp({
      id: `${reef.id}w`,
      seq: reef.seq,
      at,
      agentId,
      type: 'agent.waiting',
      action: reef.outcome === 'ok' ? 'tool completed' : 'waiting',
    }));
    return out;
  }

  return {
    streamId,

    /** Ingest one reef event; returns the town events to broadcast. */
    ingest(reef) {
      const events = expand(reef);
      for (const event of events) ring.push(event);
      if (ring.length > RING_MAX) ring.splice(0, ring.length - RING_MAX);
      received += 1;
      lastEventAt = reef.at;
      return events;
    },

    /** The `hermes-town` snapshot the client boots from. */
    snapshot(residents = []) {
      const recent = residents.slice(0, 8).map((r) => ({
        agentId: r.key,
        displayName: r.display_name,
        role: r.role,
        at: lastEventAt ?? Math.floor(Date.now() / 1000),
      }));
      return {
        streamId,
        at: Math.floor(Date.now() / 1000),
        events: ring.slice(-600),
        cursor,
        omitted: { departed: 0, stale: 0 },
        recent,
        bridge: { receivedEvents: received, lastEventAt },
      };
    },

    /** Town events newer than a client cursor, for SSE replay. */
    replay(since) {
      const from = Number.isFinite(since) ? since : 0;
      return ring.filter((event) => event.cursor > from);
    },

    bridge() {
      return { receivedEvents: received, lastEventAt };
    },
  };
}
