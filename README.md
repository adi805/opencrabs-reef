# 🦀 OpenCrabs Reef

An underwater pixel-art town that shows an OpenCrabs agent working. Every resident is one
execution context. Every tool call walks a resident to a building: coral library, workshop,
forge, post office, observatory, town hall.

> **Status: early.** Fork of [hermes-town](https://github.com/sxuff/hermes-town), being rebuilt
> as a crab-themed, low-footprint town driven by OpenCrabs' own session database. The product
> spec lives in [`PRD.md`](PRD.md), the build log in [`PROGRESS.md`](PROGRESS.md).

## Fork notice

Forked from **[`sxuff/hermes-town`](https://github.com/sxuff/hermes-town)** under the MIT License.

- Original code and artwork: Copyright (c) 2026 Hermes Town contributors. The original notice is
  kept unchanged in [`LICENSE`](LICENSE).
- Upstream history is preserved in the first 13 commits of this branch. The atlases in
  `src/assets/` are upstream MIT artwork, recompressed for this fork (256-colour indexed PNG,
  dimensions and frame layout unchanged) from 9.98 MB to 3.85 MB.
- Removed from this fork and from its history: `integrations/` (the Hermes plugin and its second
  copy of the built app, 11 MB) and `artifacts/` (upstream QA screenshots, 4.6 MB).

## What changes here

| Area | hermes-town | OpenCrabs Reef |
|---|---|---|
| Setting | land town | submerged coastal town |
| Event source | Hermes plugin → authenticated ingress POST | read-only poller over `~/.opencrabs/opencrabs.db` |
| Runtime deps | `phaser` | `phaser` only, poller uses built-in `node:sqlite` |
| Server | Node, loopback only | unchanged: Node, loopback only |
| Repo weight | ~15 MB | target < 8 MB |
| Public demo | GitHub Pages | Cloudflare Pages, demo mode only |

## Privacy

The live view reads OpenCrabs' session database **read-only** and forwards the same sanitised
allow-list upstream uses: tool names, event types, roles and outcomes. Prompts, tool arguments,
file contents, messages and credentials never leave the database. The live bridge binds to
loopback only. The public demo runs on synthetic data and cannot reach a real agent.

## Build status

Nothing in this fork has been rewritten yet. The fork, the history sanitisation and the atlas
recompression are done; the OpenCrabs event source, the underwater theme, the reduced server and
the CI deploy are the remaining tasks, tracked in [`PROGRESS.md`](PROGRESS.md) and on the
OpenCrabs Trello board (board **Crabs**, card "🌊 OpenCrabs Reef — kota bawah laut buat OpenCrabs").

Upstream's own build and verify scripts are still present and still describe the Hermes plugin
that this fork no longer ships. Treat them as reference until task 5 replaces them.

## License

MIT. See [`LICENSE`](LICENSE).
