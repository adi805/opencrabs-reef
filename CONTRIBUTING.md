# Contributing

OpenCrabs Reef accepts focused bug fixes and improvements that preserve the
privacy and product boundaries in `AGENTS.md`, `PRODUCT.md`, and `LIVE_BRIDGE.md`.

This fork removed the Hermes plugin and its `integrations/` tree: the town reads
`~/.opencrabs/opencrabs.db` directly through a read-only poller. There is no
plugin to package, install, or validate, and nothing here talks to a Hermes
runtime.

## Development

```bash
npm ci
npm run dev
```

Use `http://127.0.0.1:5173/?agents=demo&hour=17` for visual development. Demo
mode must remain visibly distinct from live activity.

To see the live bridge against your own database:

```bash
npm run reef -- --db ~/.opencrabs/opencrabs.db --replay 400   # snapshot as JSON
npm run reef:serve                                           # loopback server on 4188
```

The poller opens the database read-only and proves the guard at startup by
provoking a write, so pointing it at a live database is safe by construction.
It never emits session titles, working directories, or raw session ids.

## Before opening a pull request

```bash
npm run test:contracts   # poller privacy + live-bridge contract
npm run build
npm run verify:map       # the town recognises the tools this runtime calls
```

The browser checks need a Playwright download and a software renderer, so they
are advisory in CI but worth running locally when the art or layout changes:

```bash
npx playwright install chromium
npm run verify:textures  # writes docs/evidence/m2-reef.png
npm run verify:characters
```

Do not commit credentials, raw session identifiers, prompts, arguments,
commands, paths, outputs, responses, goals, summaries, transcripts, session
databases, runtime journals, or screenshots containing private data.

Use small commits with a conventional subject such as `fix:`, `feat:`, `docs:`,
or `test:`.
