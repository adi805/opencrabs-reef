# Tool → workplace map

The town only reads if a tool call sends somebody somewhere. `src/sim/toolMap.ts` is
the single table that turns a tool name into a workplace, a working style, and the
verb shown in the resident's speech bubble.

## Workplaces

| Workplace | Building | What happens there |
|---|---|---|
| `library` | Coral Archive | reading and looking things up: files, search, memory, documents, telemetry queries |
| `workshop` | Shell Workshop | making and changing: writing files, editing, generating, configuring the agent |
| `forge` | Vent Forge | executing: shells, code, builds, cloud calls |
| `post` | Tide Post | sending outward: chat and board delivery, agent-to-agent messages |
| `observatory` | Lighthouse | the wider world: web search, HTTP, browsing, image and video analysis |
| `hall` | Reef Hall | deciding: plans, schedules, goals, asking the operator |
| `tavern` | Kelp Bar | nowhere to be: a resident between turns |
| `market` | Reef Market | **the fallback for a tool nobody recognises** |

## Resolution order

1. Strip a namespace wrapper: `mcp__<server>__<tool>` and `functions__<group>__<tool>`
   both unwrap to the inner name, as does a `functions.` prefix.
2. Exact match in the table.
3. Prefix and word rules (`browser_*`, `^read|grep|glob|ls`, `^edit|write`, `^bash|run`, …).
4. Suffix tests for verbs: `*edit|write|generate` → workshop, `*read|list|get|search|find|query`
   → library, `*run|exec|shell|terminal` → forge, `*send|post|reply|comment|notify` → post,
   `*web|http|fetch|browser|vision|preview` → observatory.
5. Nothing matched → `market`.

## The fallback is a signal, not a silence

An unknown tool must never leave a resident standing still: they walk to the market and
keep the visit visible, so an undocumented capability shows up as activity instead of as a
bug that hides itself.

The cost of that design is that the market also collects tools we simply forgot to map.
`npm run verify:map` closes the loop: it resolves every tool name observed in
`tool_executions` and fails if any of them lands in the market.

```
npm run verify:map                      # checks the sampled list in tests/fixtures/
npm run verify:map -- --db ~/.opencrabs/opencrabs.db   # audits a live host, read-only
```

The checked-in sample covers 71 names from a 30-day window on one OpenCrabs host
(`tests/fixtures/openclabs-tool-names.txt`); tool names are host-specific, which is why a
live audit is the stronger check when a database is available.

## When a new tool appears

Add the name to the matching group in the `EXACT` table in `src/sim/toolMap.ts`, then run
`npm run verify:map`. Do not add a rule that sends real work to the market: that defeats the
only signal the fallback produces.
