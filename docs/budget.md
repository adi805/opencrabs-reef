# Runtime budget

The product requirement is that the town runs on a low-end VPS, not just that
the repository is small. That claim is only worth anything with measured
numbers, so this document records what was actually observed, on what machine,
against what data. Anything not measured is labelled as such.

## Method

- **Host for the measurements below:** joyboy, the production box: 3 vCPU,
  3,915 MB RAM, Ubuntu 24.04.4, Node v24.20.0. This is the **operator-designated
  host** for the measurement: tencent, the 2 vCPU / 2 GB box the task originally
  named, is unreachable and could not run the poller anyway (see *Tencent* below).
- **Database:** a quiescent copy of the real session database,
  `opencrabs.db.bak-sessionpin-20261003T1247`: 554.6 MB on disk, **200,218**
  rows in `tool_executions`, `-wal` 0 B. The poller opens it read-only, and the
  guard is proven at open time by provoking a write.
- **Snapshot shape:** `--replay 400`, which is what the demo and the bridge use
  on open.
- Wall time and peak RSS come from `/usr/bin/time -v`. CPU percentage is the
  same tool's figure (process CPU time over wall time).

## Measured results

### Poller CLI: `npm run reef -- snapshot`

| Metric | Cold (first touch of the file) | Warm |
|---|---|---|
| Peak RSS | 55.3 MB | 55.5 MB |
| Wall clock | 2.71 s | 0.75 s |
| CPU | 9 % | 18 % |
| Output | 73,168 bytes, `status: live`, 7 residents, 400 events | same |

The cold/warm gap is page-cache, not query cost: the WAL is empty, so nothing
is being replayed. A first poll after a fresh boot pays for reading the file
once; every poll after that is sub-second.

### Live bridge: `npm run reef:serve`

| Metric | Value |
|---|---|
| RSS after boot | 62.1 MB |
| RSS after first snapshot | 67.8 MB |
| RSS steady (after 11 snapshots) | 69.6 MB |
| CPU (sampled while idle-serving) | 5.4 % |
| `GET /api/reef/snapshot` | HTTP 200, 0.405 s, 86,885 bytes |
| `GET /api/reef/health` | HTTP 200 |

### Static demo (what the public URL serves)

| Metric | Value |
|---|---|
| `dist/` total | 2.5 MB |
| JS bundle, raw | 1,329,046 bytes |
| JS bundle, gzip | 373,392 bytes (365 KB) |
| Server processes | none: GitHub Pages serves static files |

## Reproduced independently

The figures above were re-measured from scratch on the same host, to check the
document rather than trust it. Same database copy, same flags.

| Metric | Documented | Reproduced |
|---|---|---|
| `tool_executions` rows | 200,218 | 200,218 |
| Bridge RSS after boot | 62.1 MB | 61.2 MB |
| Bridge RSS after first snapshot | 67.8 MB | 67.1 MB |
| Bridge RSS steady | 69.6 MB | 69.0 MB |
| Bridge CPU while serving | 5.4 % | 4.8 % |
| `GET /api/reef/snapshot` | 200, 0.405 s | 200, 0.364 s |
| Poller peak RSS | 55.3 MB | 64.4 MB |
| Poller CPU | 9 % | 14 % |

The bridge reproduces within a megabyte and a tenth of a second. The one
disagreement is the poller's peak RSS: 64.4 MB here against 55.3 MB documented,
and it was stable across three runs (64.1, 64.4, 64.4). The higher figure is the
one to plan against. Both are dominated by the Node runtime, not by the
database, so the conclusion does not change: the server is a ~70 MB process,
which is under 4 % of a 2 GB VPS.

Wall-clock on the poller is not comparable between the two runs: this host was
at load 15 from unrelated work, and the first (cold) run took 6.3 s against
2.6 s warm.

### Re-measured on joyboy, the operator-designated host

A third pass, run explicitly on joyboy as the designated low-end host, against
the same 554.6 MB / 200,218-row copy. Host state during the run: load average
16.2 from unrelated production work, 3 vCPU, 3,915 MB RAM, Node v24.20.0.

| Metric | Poller CLI | Live bridge |
|---|---|---|
| Peak / steady RSS | 56.2 MB, 56.6 MB | 62.6 MB boot, 68.4 MB after first snapshot, 68.5 MB steady |
| Wall clock | 1.03 s, 0.52 s | n/a (long-running) |
| CPU | 18 %, 24 % | 4.6 %, 3.0 % |
| Response | 73,168 bytes JSON, `status: live` | `GET /api/reef/snapshot` HTTP 200, 0.106 s, 44,198 bytes; `/api/reef/health` 200 |
| Loopback only | n/a | `ss -ltn`: 1 listener on `127.0.0.1:4199`, **0** on `0.0.0.0` |

Privacy spot-check on that same snapshot: 7 residents, 400 events, and **zero**
UUID-shaped strings and **no** `opencrabs.db` path anywhere in the serialized
output.

Poller peak RSS across all passes: 55.3, 56.2, 56.6, 64.4 MB. Plan against the
highest: **~65 MB**.

## Tencent: unreachable, so joyboy is the designated host

The task named tencent (2 vCPU / 2 GB) as the honest low-end target. It cannot
be used, for two independent reasons:

1. **It is unreachable.** `ping` gets no reply (ICMP is filtered there, which is
   expected), and TCP to port 22 **connects**, so host and sshd are up. But every
   SSH attempt then fails at `Connection timed out during banner exchange`:
   sshd accepts the socket and never finishes the banner. Four attempts across
   25-70 s connect timeouts, with `IPQoS=throughput` and
   `ServerAliveInterval=15`, all identical. That is a wedged or heavily loaded
   sshd and needs a console reboot, which is not reachable from here.
2. **It could not run the poller even when healthy.** tencent ships Node
   v20.20.2, and `node:sqlite` (the poller's only dependency, and a built-in)
   requires **>= 22.5**. Installing a newer runtime first would mean measuring
   something other than the shipped artifact.

The operator's instruction on 2026-10-03 was to take the measurement on joyboy
instead, and that is what the third pass above does. **No tencent number is
claimed here.** Read the figures with this split:

- **RSS transfers.** Resident memory is dominated by the Node runtime (55-70 MB
  for the poller and the bridge respectively), not by the host's core count.
- **CPU does not transfer.** joyboy has 3 vCPU against tencent's 2, so the 3-5 %
  bridge figure is a lower bound there, not a prediction.

## What this means for the low-VPS claim

- The live bridge holds roughly **70 MB** resident and answers a snapshot in
  well under half a second. On a 2 GB VPS that is under 4 % of RAM, and the
  measurement host is the operator-designated joyboy, not the unreachable
  tencent.
- The public demo needs **no server process at all**: 2.5 MB of static files,
  365 KB of it over the wire gzipped.
- The database is opened read-only, is never written, and is read through a
  rowid cursor rather than a `created_at` scan (there is no index on that
  column), so polling does not grow with history size.

## Reproducing

```bash
# poller, against any copy of the database
/usr/bin/time -v npm run reef -- --db /path/to/opencrabs.db --replay 400

# live bridge, then measure RSS while it serves
npm run reef:serve -- --db /path/to/opencrabs.db --port 4188
ps -o rss=,pcpu= -p "$(pgrep -f '[r]eefServer')"
```

Run the heavy build and browser checks on a dedicated host or in CI, never on a
production box that also serves traffic.
