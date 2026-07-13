#!/usr/bin/env npx tsx
/**
 * Real-data proof: run the SAME engine over REAL TxLINE market data.
 *
 * The World Cup dev/free tier streams real de-margined 1X2 and Over/Under consensus
 * (verified live), but a quiet fixture carries no score events, so a genuinely live
 * goal is not always available to record on demand. So this has two modes:
 *
 *   --capture   Connect to the live feed and record real odds ticks for one fixture
 *               into data/real-odds-capture.json. Needs TXLINE_JWT + TXLINE_API_TOKEN.
 *               CAPTURE_SECONDS=70 npm run capture:real
 *
 *   (default)   Replay those captured REAL odds through the engine to calibrate fair
 *               value off the real consensus, then apply confirmed goals to exercise
 *               and MEASURE the defended reprice. The odds, the de-margined consensus,
 *               the messageIds and the measured hot path are all real; the goal trigger
 *               is labelled, because the free tier carries no live score events.
 *               No credentials needed, it reads the bundled capture.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { credsFromEnv } from "../lib/txline/auth";
import { streamSse } from "../lib/txline/sse";
import { normalizeOdds, normalizeScore } from "../lib/txline/normalize";
import { CatenaccioEngine } from "../lib/engine/engine";
import { EngineEvent, OddsTick } from "../lib/engine/types";

const CAPTURE_FILE = "data/real-odds-capture.json";

// Load .env.local (written by scripts/subscribe.ts) without a dependency.
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

interface Capture {
  apiUrl: string;
  fixtureId: number;
  capturedAt: string;
  seconds: number;
  rawSamples: any[];
  odds: OddsTick[];
}

async function capture(): Promise<void> {
  const creds = credsFromEnv();
  if (!creds) {
    console.error("Capture needs TXLINE_JWT + TXLINE_API_TOKEN (run `npm run subscribe` first).");
    process.exit(1);
  }
  const seconds = Number(process.env.CAPTURE_SECONDS ?? 70);
  const ac = new AbortController();
  let fixture: number | null = null;
  const odds: OddsTick[] = [];
  const rawSamples: any[] = [];

  const onOdds = (raw: any) => {
    if (rawSamples.length < 3) rawSamples.push(raw);
    const ev = normalizeOdds(raw);
    if (!ev || ev.kind !== "odds") return;
    if (fixture === null) fixture = ev.fixtureId;
    if (ev.fixtureId !== fixture) return;
    odds.push(ev);
  };

  console.error(`Capturing real TxLINE odds for ${seconds}s...`);
  streamSse(creds, "odds", { onMessage: onOdds, onStatus: (s) => console.error(`[odds] ${s}`) }, ac.signal).catch(
    () => {},
  );

  setTimeout(() => {
    ac.abort();
    if (!fixture || odds.length === 0) {
      console.error("No real odds captured (feed idle or token expired). Try again during a match window.");
      process.exit(1);
    }
    mkdirSync("data", { recursive: true });
    const cap: Capture = {
      apiUrl: creds.apiUrl,
      fixtureId: fixture,
      capturedAt: new Date().toISOString(),
      seconds,
      rawSamples,
      odds,
    };
    writeFileSync(CAPTURE_FILE, JSON.stringify(cap, null, 2));
    console.error(`\nWrote ${CAPTURE_FILE}: ${odds.length} real odds ticks for fixture #${fixture}.`);
    process.exit(0);
  }, seconds * 1000);
}

function replay(): void {
  if (!existsSync(CAPTURE_FILE)) {
    console.error(`No ${CAPTURE_FILE}. Capture one first:  CAPTURE_SECONDS=70 npm run capture:real`);
    process.exit(1);
  }
  const cap = JSON.parse(readFileSync(CAPTURE_FILE, "utf8")) as Capture;
  const engine = new CatenaccioEngine({ fixtureId: cap.fixtureId, homeTeam: "Home", awayTeam: "Away", seed: 7 });

  console.log("Catenaccio, replaying REAL TxLINE data");
  console.log(`  source        ${cap.apiUrl}`);
  console.log(`  fixture       #${cap.fixtureId}  (captured ${cap.capturedAt})`);
  console.log(`  real ticks    ${cap.odds.length} de-margined consensus updates`);
  const first = cap.odds.find((o) => o.market === "1X2") ?? cap.odds[0];
  console.log(
    `  first real 1X2  msg ${first.messageId}  consensus [${first.consensus.map((p) => (p * 100).toFixed(0) + "%").join(", ")}]`,
  );

  // 1) feed the REAL odds, in order, to calibrate fair value off the real consensus
  let ts = cap.odds[0]?.ts ?? Date.now();
  for (const ev of cap.odds) engine.apply(ev);

  // 2) exercise + MEASURE the defended reprice with confirmed goals. The free tier
  //    carries no live score events, so these goal triggers are synthetic (labelled);
  //    the surrounding market data and the measured hot path are real.
  const measured: number[] = [];
  const goals: { clock: number; team: "home" | "away" }[] = [
    { clock: 34 * 60, team: "home" },
    { clock: 61 * 60, team: "away" },
    { clock: 78 * 60, team: "home" },
  ];
  console.log("\n  [synthetic goals on real odds, dev tier carries no live score events]");
  for (const g of goals) {
    ts += 1000;
    const goal: EngineEvent = {
      kind: "score",
      fixtureId: cap.fixtureId,
      messageId: `synthetic-goal-${g.clock}`,
      ts,
      seq: g.clock,
      statKey: g.team === "home" ? 1 : 2,
      confirmed: true,
      action: g.team === "home" ? "goal-home" : "goal-away",
      gameState: 4,
      clockSeconds: g.clock,
    };
    engine.apply(goal);
    const s = engine.snapshot();
    measured.push(s.measuredRepriceMs ?? NaN);
    console.log(
      `   ${String(Math.round(g.clock / 60)).padStart(2)}'  ${g.team.toUpperCase()} goal  ` +
        `score ${s.score.home}-${s.score.away}  ` +
        `engine hot path ${s.measuredRepriceMs?.toFixed(3)} ms measured  ` +
        `(end-to-end ~${s.lastRepriceMs} ms)  arb prevented $${Math.round(s.arbPrevented)}`,
    );
  }

  // 3) settle every market on the real fixture id via the validate_stat predicate
  engine.apply({
    kind: "score",
    fixtureId: cap.fixtureId,
    messageId: `synthetic-ft`,
    ts: ts + 1000,
    seq: 90 * 60,
    statKey: 0,
    confirmed: true,
    action: "fulltime",
    gameState: 5,
    clockSeconds: 90 * 60,
  } as EngineEvent);

  const s = engine.snapshot();
  const avg = measured.filter((x) => !Number.isNaN(x)).reduce((a, b) => a + b, 0) / (measured.length || 1);
  console.log("\n  result");
  console.log(`   engine hot path      ${avg.toFixed(3)} ms mean (measured over ${measured.length} reprices)`);
  console.log(`   end-to-end budget    ~400 ms (confirmation + network + compute)`);
  console.log(`   latency-arb prevented $${Math.round(s.arbPrevented)} vs a broadcast-delayed book`);
  console.log(`   markets settled       ${s.settlements.length} via Txoracle validate_stat`);
  console.log(`   decisions anchored    ${s.decisionCount}  merkle root ${s.merkleRoot.slice(0, 18)}...`);
  console.log("\n  Real odds in, real measured reprice. Reproducible with no credentials.");
}

if (process.argv.includes("--capture") || process.env.CAPTURE === "1") capture();
else replay();
