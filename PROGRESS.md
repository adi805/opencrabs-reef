---
document_type: project-progress
project: "OpenCrabs Reef"
prd: "PRD.md"
status: draft
current_milestone: 0
total_milestones: 3
last_updated: "2026-10-03 09:25"
---

# OpenCrabs Reef Progress

Live state for this target only. `PRD.md` owns milestone outcomes, Done When and
FR/NFR/AC coverage; reference them rather than copying the specification.

## Current State

- PRD version: 0.1.0, `status: draft`, structurally validated.
- Execution mode: native. No toolkit runner plan exists for this target, so no
  `TASKS.json` or `.prd/task-state.json` applies.
- Build authority: the owner's explicit build request of 2026-10-03 plus the
  approved nine-task session plan.
- Active milestone / next action: milestone 1 has not started. Next action is the
  read-only poller and cursor described by FR-001.
- Required unresolved input: none. The art-direction question in the PRD Review
  Focus is not blocking milestone 1.

## Milestones And Evidence

| # | PRD milestone reference | Status | Current evidence / remaining gap |
|---|---|---|---|
| 1 | PRD section 4, milestone 1: Reef runs on real OpenCrabs data over loopback | ⬜ Not Started | No code exists. Database schema and `node:sqlite` availability were verified on 2026-10-03, which is a prerequisite, not milestone evidence. |
| 2 | PRD section 4, milestone 2: Submerged town inside the weight budget | ⬜ Not Started | Upstream atlases measured at 9.98 MB, recompressed to 3.85 MB with dimensions preserved. The 2 MB ceiling is not met and no reef palette or tile exists yet. |
| 3 | PRD section 4, milestone 3: Public demo and measured footprint | ⬜ Not Started | No build, no CI, no measurement. The repository exists and is public. |

Statuses used here: ⬜ Not Started, 🔄 In Progress, ✅ Verified, ✅ Approved.
Approved requires an actual owner verdict, and none has been given for any
milestone.

## Resume And Changes

2026-10-03, pre-PRD repository preparation, deliberately not milestone evidence:

- Forked `sxuff/hermes-town` to the public repository
  `https://github.com/adi805/opencrabs-reef`. Confirmed through the GitHub API:
  `fork: true`, parent `sxuff/hermes-town`, licence `MIT`.
- Rewrote history with `git filter-branch` to remove `artifacts/` (4.6 MB of
  upstream QA screenshots) and `integrations/` (11 MB, the Hermes plugin and a
  second copy of the built app) from every commit, not only from the head. The
  13 upstream commits were kept.
- Recompressed the five sprite atlases in `src/assets/` to 256-color indexed PNG
  with `pngquant`: 9.98 MB to 3.85 MB measured with `du -sk`, dimensions and
  frame layout unchanged because `src/art/reference.ts` reads the atlases at
  hand-written pixel rectangles. Two crops were read back by a vision model and
  judged visually equivalent, so no banding was introduced at this step.
- Measured the published weight by cloning the repository fresh: `.git` is
  4.3 MB, `integrations/` and `artifacts/` are absent, 14 commits.
- Wrote `PRD.md`, this file and `DECISIONS.md`.

Known evidence gaps carried forward:

- The GitHub `diskUsage` API field still reports 14924 KB for this repository
  while a fresh clone proves 4.3 MB. Treat the clone measurement as the fact and
  the API counter as stale.
- `src/assets` at 3.85 MB violates the PRD's 2 MB constraint. Aggressive
  quantization was tried and rejected: 64 colors fails to encode, and the atlases
  hold about 456000 distinct colors, so deeper cuts band. The declared route is
  to bake the despill and downsample that the client already performs at load
  time; that decision is milestone 2 work and is recorded as Proposed in
  `DECISIONS.md`.
- External progress tracking: a card for this project exists on the Trello board
  `Crabs`, list `Doing`, id `6ac0c7fcbb26648a21`, created with the goal, the
  constraints and the nine-task list. Every card-scoped action on that new card
  fails with `400 Bad Request: invalid id` while card-scoped actions on cards
  that existed before the Trello connection was established succeed, and a
  `search` for the card returns zero hits. Configuration reload did not change
  it. `trello_send` therefore cannot update this card yet; the route is marked
  UNAVAILABLE for writes and `PROGRESS.md` is the fallback record. Reconnect
  would need the API token as a tool argument, which is refused under the rule
  against putting credentials in arguments.
- No runtime code exists, so every runtime figure in the PRD is a budget, not an
  observation.

Next exact action: implement the read-only poller with the cursor described by
FR-001 and the Data Contracts table, then run the AC-001 and AC-002 evidence
harnesses against a copy of `~/.opencrabs/opencrabs.db`.

## 2026-10-03 - server Reef live (task 5)

- Endpoint: `/api/reef/snapshot`, `/api/reef/events` (SSE), `/api/reef/health`, plus static build.
- `curl -o /dev/null -w %{http_code} http://127.0.0.1:4188/api/reef/snapshot` -> `200`.
- `ss -ltn | grep 4188` -> `LISTEN 0 511 127.0.0.1:4188 0.0.0.0:*`, count of `0.0.0.0:4188` = `0`, count of `[::]:4188` = `0`.
- SSE held open `12.021s` against the live database, `463` `event: tick` frames and one `hello` frame, `108625` bytes, curl exit `0`.
- Snapshot on that run: `status: live`, contract `crabs-town.snapshot.v1`, `452` events in the ring, `8` residents, cursor `205447`, poll interval `1000 ms`.
- Diagram: `docs/diagrams/architecture.png` (750x2110, md5 `4dfe10d300e03a64031177a2ea403fb9`) rendered from `docs/diagrams/architecture.mmd`, inspected with the vision model: no clipped text, no overlapping boxes, arrows present.
