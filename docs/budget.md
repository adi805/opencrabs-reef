# Runtime budget

The product requirement is that the town runs on a low-end VPS, not just that
the repository is small. That claim is only worth anything with measured
numbers, so this document records what was actually observed, on what machine,
against what data. Anything not measured is labelled as such.

## Method

- **Host for the measurements below:** the 4 GB Ubuntu 24.04 box (joyboy). The
  intended second host (tencent, 2 vCPU / 2 GB) was **unreachable at the time of
  measurement**: see *Tencent* below.
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

## Tencent: NOT measured, and why

The task called for running the measurement on tencent (2 vCPU / 2 GB) because
that is the honest low-end target. It could not be reached:

- `ping` gets no reply (ICMP is filtered there, which is expected).
- TCP to port 22 **connects**, so the host and sshd are up.
- Every SSH attempt then fails at `Connection timed out during banner exchange`,
  meaning sshd accepts the socket but never finishes the banner. Three attempts
  were made (40 s and 70 s connect timeouts, `IPQoS=throughput`,
  `ServerAliveInterval=15`), all identical.

That signature is a wedged or heavily loaded sshd, not a network problem on this
side, and it cannot be fixed without access to the host. **No tencent number is
claimed here.** The figures above are from the 4 GB host and should be read as
an upper bound for memory (RSS is dominated by the Node runtime, not the host)
with the CPU figure still unverified on 2 vCPU.

## What this means for the low-VPS claim

- The live bridge holds roughly **70 MB** resident and answers a snapshot in
  under half a second. On a 2 GB VPS that is under 4 % of RAM.
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
