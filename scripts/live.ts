#!/usr/bin/env npx tsx
/**
 * Live TxLINE run.
 *
 * Connects to the real odds and scores SSE streams, normalises each payload into
 * the engine's event type, feeds the same deterministic engine the demo uses, and
 * prints the agent's live state line by line. Requires TXLINE_JWT and
 * TXLINE_API_TOKEN in the environment (see .env.example). The credential-free demo
 * is `npm run agent`.
 *
 *   TXLINE_JWT=... TXLINE_API_TOKEN=... npm run live
 */

import { credsFromEnv } from "../lib/txline/auth";
import { streamSse, StreamKind } from "../lib/txline/sse";
import { normalizeOdds, normalizeScore } from "../lib/txline/normalize";
import { CatenaccioEngine } from "../lib/engine/engine";

const creds = credsFromEnv();
if (!creds) {
  console.log(
    [
      "No TxLINE credentials found.",
      "",
      "To run against the live feed:",
      "  1. cp .env.example .env",
      "  2. Get a guest JWT:   POST {AUTH}/auth/guest/start",
      "  3. Subscribe to the free World Cup tier on devnet, then activate an API token",
      "  4. Set TXLINE_JWT and TXLINE_API_TOKEN, then re-run `npm run live`",
      "",
      "No account needed to see the agent work — run the deterministic demo: `npm run agent`.",
    ].join("\n"),
  );
  process.exit(0);
}

const engine = new CatenaccioEngine({ fixtureId: 0, homeTeam: "Home", awayTeam: "Away", seed: 1 });
const ac = new AbortController();

// Pin to a single fixture so multiple concurrent matches don't interleave.
let fixture: number | null = process.env.TXLINE_FIXTURE_ID ? Number(process.env.TXLINE_FIXTURE_ID) : null;

function printState(): void {
  const s = engine.snapshot();
  const x = s.books.find((b) => b.market === "1X2")!;
  const top = x.quotes.reduce((p, q) => (q.fair > p.fair ? q : p), x.quotes[0]);
  const sig = s.recentSignals[0];
  console.log(
    `${String(Math.round(s.clockSeconds / 60)).padStart(2)}' ` +
      `${s.score.home}-${s.score.away} | win ${top.outcome} ${(top.fair * 100).toFixed(0)}% ` +
      `| reprice ${s.lastRepriceMs ?? "—"}ms | arb prevented $${Math.round(s.arbPrevented)} ` +
      `| feed ${s.feedStatus}${sig ? ` | ${sig.detail}` : ""}`,
  );
}

function onStatus(stream: StreamKind) {
  return (status: "connected" | "suspended" | "backfilling" | "resumed", detail?: string) => {
    engine.apply({ kind: "feed", ts: Date.now(), status, detail });
    console.error(`[${stream}] ${status}${detail ? `: ${detail}` : ""}`);
  };
}

function feed(kind: StreamKind, normalize: (raw: any) => ReturnType<typeof normalizeOdds>) {
  streamSse(
    creds!,
    kind,
    {
      onMessage: (raw) => {
        const ev = normalize(raw);
        if (!ev || ev.kind === "feed" || ev.kind === "clock") return;
        if (fixture === null) fixture = ev.fixtureId;
        if (ev.fixtureId !== fixture) return;
        engine.apply(ev);
        printState();
      },
      onStatus: onStatus(kind),
    },
    ac.signal,
  ).catch((e) => console.error(`[${kind}] stream ended:`, e));
}

console.error(`Catenaccio live — streaming TxLINE${fixture !== null ? ` fixture #${fixture}` : ""}. Ctrl-C to stop.`);
feed("odds", normalizeOdds);
feed("scores", normalizeScore);

process.on("SIGINT", () => {
  ac.abort();
  console.error("\nstopped.");
  process.exit(0);
});
