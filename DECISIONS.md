---
document_type: project-decision-log
project: "OpenCrabs Reef"
status: active
created: "2026-10-03"
---

# OpenCrabs Reef Decision Log

Source of truth for approved and proposed product, architecture, implementation,
security and operational decisions for this target. PRD Toolkit policy is not
recorded here.

## Entry Format

```markdown
- [YYYY-MM-DD HH:mm] Decision: short title
  Status: Proposed | Accepted | Reopened | Superseded
  Approval: owner evidence, or N/A with the reason it is not yet accepted
  Requirement IDs: FR-###, NFR-###, or N/A with the reason it is governance only
  Context: why the decision was needed
  Rationale: why this option is preferred
  Impact: what changes because of this decision
```

## Decisions

- [2026-10-03 08:45] Decision: Fork hermes-town rather than build the town from scratch
  Status: Accepted
  Approval: Owner asked for the fork and approved publishing the repository on 2026-10-03.
  Requirement IDs: FR-005, NFR-002
  Context: A pixel-art agent visualisation was wanted for OpenCrabs. Writing a renderer, an art pipeline and a choreography system from nothing would dominate the cost of the project.
  Rationale: Upstream is MIT-licensed for code and artwork, has one runtime dependency, a zero-dependency server, and a working art pipeline. Verified through the GitHub API and a real clone on 2026-10-03.
  Impact: The product inherits a land town theme and a Hermes plugin event source that must be replaced, and must carry the upstream copyright notice and fork credit permanently.

- [2026-10-03 08:50] Decision: Name the repository opencrabs-reef
  Status: Accepted
  Approval: Owner agreed to the proposed defaults on 2026-10-03.
  Requirement IDs: N/A - naming, not a requirement.
  Context: The fork needed a published repository name that says both the runtime and the theme.
  Rationale: Alternatives considered were `crabs-town` and `crabtown`. `opencrabs-reef` ties the name to the runtime and states the underwater setting, and does not collide with the upstream name.
  Impact: Public URL, README and every future reference use `opencrabs-reef`.

- [2026-10-03 08:55] Decision: Source town events from a read-only poll of opencrabs.db instead of an agent plugin
  Status: Accepted
  Approval: Owner approved the proposal that included this change on 2026-10-03.
  Requirement IDs: FR-001, FR-003, NFR-002, NFR-004
  Context: Upstream receives events by an authenticated ingress POST from a Hermes plugin. OpenCrabs already records sessions, tool calls, turn outcomes and cron runs in its own SQLite database.
  Rationale: Polling removes the plugin, the token ingress, the Python runtime and the duplicated bundled app. The tables needed were confirmed against the live schema on 2026-10-03, and built-in `node:sqlite` was confirmed usable on the host the same day, so the reader costs no dependency.
  Impact: The town is a view over existing state rather than a consumer of new instrumentation. It inherits SQLite locking behaviour, so NFR-004 and the lock failure mode become mandatory rather than theoretical.

- [2026-10-03 09:05] Decision: Strip heavy upstream paths from the whole history with filter-branch, keeping the 13 upstream commits
  Status: Accepted
  Approval: Owner's standing requirement that the product be as light as possible, 2026-10-03.
  Requirement IDs: NFR-001, NFR-002
  Context: Deleting `artifacts/` and `integrations/` only at the head would still make every clone download about 15 MB, because the objects stay reachable from history.
  Rationale: Rewriting the paths out of all commits keeps upstream authorship and messages while removing dead weight. Squashing to a single commit would have been lighter still but would have thrown away the original author's development history, which is the part of provenance that a fork should not quietly discard.
  Impact: `.git` measured 4.3 MB from a fresh clone instead of about 15 MB. Commit hashes differ from upstream, so upstream changes arrive by cherry-pick rather than by merge.

- [2026-10-03 09:10] Decision: Recompress sprite atlases to 256-color indexed PNG at unchanged dimensions
  Status: Accepted
  Approval: Owner's weight requirement of 2026-10-03; no visual regression observed.
  Requirement IDs: FR-005, NFR-001
  Context: Five PNG atlases were 9.98 MB, most of the remaining repository weight.
  Rationale: Dimensions must not change because `src/art/reference.ts` reads each frame from hand-written source pixel rectangles, so a resize would silently move every sprite. Quantization to 256 colors keeps geometry and cut the payload to 3.85 MB. The chroma key in these sheets is approximately 246,2,250 rather than pure magenta, and the despill in the same file is a continuous function with a 0.55 threshold, so a small key shift does not break transparency.
  Impact: Measured and visually compared crops show no banding. The 2 MB target is still not met, so the next reduction must come from baking the despill and downsample, not from a harsher palette.

- [2026-10-03 09:12] Decision: Live view binds loopback only, public sharing happens through a synthetic-data demo build
  Status: Accepted
  Approval: Owner accepted the proposal that included this boundary on 2026-10-03.
  Requirement IDs: FR-006, NFR-003
  Context: A live town exposes real session identifiers and the names of tools the agent is running. The existing rule for this host forbids exposing agent ports publicly without zero-trust authentication.
  Rationale: Keeping the live server on loopback with access by SSH tunnel removes the whole class of public exposure, while the shareable artifact becomes a static build whose data is invented.
  Impact: There is no code path to a wildcard bind, AC-016 is a CI gate, and the demo bundle must contain no real identifier, which is what AC-012 tests.

- [2026-10-03 09:15] Decision: All heavy installs, builds and long resource samples run on the tencent VPS, never on joyboy
  Status: Accepted
  Approval: Standing owner rule recorded 2026-09-13 and restated 2026-09-22.
  Requirement IDs: NFR-001, NFR-002
  Context: `joyboy` has 4 GB of RAM and carries production services. A dependency install or a long benchmark there risks an out-of-memory kill of the agent itself.
  Rationale: `tencent` exists for test builds and is paid for until 2026-12-28, and its limits are known, so measurements taken there are the honest ones for a low-spec target.
  Impact: AC-013 and AC-014 must name the host they were measured on. The subscription expiry is a real deadline: the measurement environment disappears on 2026-12-28, after which the budget must be re-proven elsewhere or the CI runner becomes the measurement host.

- [2026-10-03 09:20] Decision: Meet the 2 MB asset ceiling by baking the despill and downsample offline
  Status: Proposed
  Approval: N/A - not yet accepted, because the size achieved by baking has not been measured.
  Requirement IDs: FR-005, NFR-001
  Context: Recompression alone stopped at 3.85 MB, and a harsher palette bands because the sheets carry roughly 456000 distinct colors.
  Rationale: The client already performs chroma despill, trim and downsampling to runtime pixel density at load time on every start. Doing that once offline turns a high-resolution source sheet into the smaller runtime sheet it was always about to become, which removes both bytes and per-load CPU work.
  Impact: If it lands, `src/art/reference.ts` gains a pre-baked path and the weight constraint is met without lowering it. If it does not, the constraint is renegotiated in the open rather than quietly missed.

- [2026-10-03 09:22] Decision: Track progress in PROGRESS.md while the Trello card is unreachable by the tool
  Status: Proposed
  Approval: N/A - workaround, pending a fix to the card-scoped Trello path.
  Requirement IDs: N/A - operational governance, not a product requirement.
  Context: The owner asked for progress to be linked to Trello. A card was created successfully on board `Crabs`, but every card-scoped action on it returns `400 Bad Request: invalid id`, while card-scoped actions on cards that predate the connection succeed and a board search for the card returns nothing.
  Rationale: The file inside the repository is the durable record and survives any channel outage, so blocking on the tracker would lose both the audit trail and the deadline. Reconnecting the channel would require passing the API token as a tool argument, which the credential rule forbids.
  Impact: The Trello card exists with the full task list and is readable in the board, but is not updated from this session until the write path works; every milestone report is written here first.

## AI Agent Rules

1. Read this file before proposing a target-project architecture or policy change.
2. Append decisions; do not silently rewrite prior entries.
3. Mark a decision `Accepted` only with explicit owner approval evidence.
4. Mark an earlier decision `Superseded` instead of deleting it.
5. Do not mix PRD Toolkit governance with this target project's decisions.

## D-014 Atlas ships at half resolution, palette stays at 256 colours

- Date: 2026-10-03 · Status: Accepted
- Problem: the 2048 KB asset budget has to come from somewhere, and the two levers are colour count and pixel count.
- Measured: cutting colours is the wrong lever. Through the real sprite pipeline (despill → trim → Lanczos downsample → hard alpha snap) 64 colours is the floor before shading ramps break; a critical look at `equipment` at 32 colours shows steel going olive, which is a colour failure, not a softness one. Sixty-four colours across the five sheets totals 2572 KB, which misses the budget anyway.
- Chosen: halve the source resolution and leave the palette at 256 colours. Total 1180 KB. The pipeline downsamples every frame regardless, so the deleted pixels were payload and per-pixel despill work rather than visible detail.
- Cost paid: one sprite, the statue face in `props`, loses eye pixels at close zoom. Silhouettes are unchanged everywhere because the alpha snap is geometry-driven, not palette-driven.
- Consequence: rects in `reference.ts` are authored in original space and scaled by `SHEET_SCALE` on read. `cell()`-derived grids needed no change because they divide the measured image size.

## D-015 Build source maps are off

- Date: 2026-10-03 · Status: Accepted
- Measured: `sourcemap: true` made `dist` 12768 KB, of which 10541 KB is one map file for a 1306 KB bundle. With maps off, `dist` is 2472 KB.
- Reason: the demo is a read-only render; nobody is stepping through a minified Phaser frame on a low-RAM VPS, and the map is the payload that would have to be shipped or stripped anyway.
