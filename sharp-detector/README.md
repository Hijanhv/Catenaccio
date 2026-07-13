# Sharp Movement Detector (Rust)

A standalone TxLINE agent, separate from the market maker: it watches the live odds feed
and flags significant in-play odds shifts, then tracks whether each flag predicted continued
direction. Single compiled binary, autonomous once started.

Rust is the right tool here: a lean, always-on monitor with no runtime, deployable as one
binary, the kind of thing a trading desk actually leaves running.

## What it does

- Streams the TxLINE odds SSE and keeps the latest de-margined consensus per (fixture, market).
- Every **60 seconds**, compares each market to the previous window. If an outcome's implied
  probability moved more than the threshold (default **5pp**), it logs a **sharp move** signal
  to stdout and to `signals.jsonl`.
- On the next window it checks whether the flagged move held, and prints a running
  **follow-through hit-rate**, did the signal predict continued direction?

## Run

It reuses the project's devnet credentials. Run `npm run subscribe` in the repo root first
(writes `.env.local`), then:

```bash
cd sharp-detector
cargo run --release          # needs TXLINE_API_TOKEN (auto-loaded from ../.env.local)
```

Knobs (env):

| Var | Default | Meaning |
|---|---|---|
| `THRESHOLD_PCT` | `5` | move size (in percentage points) that counts as sharp |
| `WINDOW_SECONDS` | `60` | detection window |
| `MAX_SECONDS` |, | exit after N seconds (for bounded/demo runs) |

Sharp moves are occasional and happen in-play (a goal repricing the market), so a live "SHARP"
line appears when a match is in running. The detection logic is unit-tested so it is provable
regardless of feed timing:

```bash
cargo test    # 5 tests: detection, thresholding, baseline, percent-string parsing, market mapping
```

## Output

```
15:04:22  SHARP  fixture 18213979  Match Result  Home shortening +7.3pp -> 61%
  [window: tracking 12 markets, follow-through hit-rate 67% (2/3)]
```

Each signal is also appended to `signals.jsonl` for later analysis.

## Design

- `detect_sharp(prev, cur, threshold)` is a pure, deterministic function (sorted output), the
  whole detection rule in one testable place.
- The SSE reader reconnects on drop; the detector loop is independent of it.
- Stack: `tokio`, `reqwest` (rustls), `serde_json`.
