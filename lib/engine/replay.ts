/**
 * Replay harness, streams a past/synthetic World Cup match tick-by-tick "as if
 * live". The hackathon's matches finish after the submission deadline, so a
 * deterministic replay is how judges see the agent working end-to-end, every
 * time, with no live dependency. (In production the very same engine consumes the
 * real TxLINE SSE streams, see lib/txline/.)
 *
 * The script below is a 3-2 thriller: multiple goals, a red card, and a feed
 * drop+recovery so the resilience path is visible on screen.
 */

import { EngineEvent, MarketId } from "./types";
import { calibrate, fairProbs, MatchSnapshot } from "./math/model";
import { mulberry32 } from "./courtsiding";

export interface ScriptedEvent {
  /** real playback offset in ms (accelerated) */
  playAtMs: number;
  event: EngineEvent;
}

const MIN_MS = 850; // 1 match-minute of playback ≈ 0.85s → full match ≈ 77s
const minute = (m: number) => m * MIN_MS;

interface Beat {
  m: number; // match minute
  action: "kickoff" | "goal-home" | "goal-away" | "red-home" | "red-away" | "ht" | "fulltime";
}

// A 2-2 thriller with lead changes: the book's directional exposure flips and
// partially cancels (realistic market-making), so the demo isn't a one-way
// adverse-selection scoreline. Still dramatic: an upset opener, a red card, a
// go-ahead goal, and a late equaliser, five reprices in all.
const SCRIPT: Beat[] = [
  { m: 0, action: "kickoff" },
  { m: 9, action: "goal-away" }, // upset opener 0-1
  { m: 23, action: "goal-home" }, // 1-1
  { m: 45, action: "ht" },
  { m: 51, action: "red-away" }, // red card
  { m: 63, action: "goal-home" }, // 2-1 home leads
  { m: 84, action: "goal-away" }, // 2-2 late equaliser
  { m: 90, action: "fulltime" },
];

const TARGET_CONSENSUS = { home: 0.46, draw: 0.27, away: 0.27 };

export function buildMatch(seed = 0xc47e): {
  events: ScriptedEvent[];
  homeTeam: string;
  awayTeam: string;
  fixtureId: number;
} {
  const rng = mulberry32(seed);
  const params = calibrate(TARGET_CONSENSUS, 2.8);
  const fixtureId = 104007;
  const homeTeam = "Argentina";
  const awayTeam = "France";

  let oddsN = 0;
  let scoreN = 0;
  const out: ScriptedEvent[] = [];

  const state: MatchSnapshot = { homeGoals: 0, awayGoals: 0, clockSeconds: 0, redHome: 0, redAway: 0 };

  const consensusFor = (m: MarketId): number[] => {
    const p = fairProbs(state, params);
    const jitter = () => 1 + (rng() - 0.5) * 0.02;
    let arr: number[];
    if (m === "1X2") arr = [p.oneXtwo.home * jitter(), p.oneXtwo.draw * jitter(), p.oneXtwo.away * jitter()];
    else if (m === "OU25") arr = [p.overUnder25.over * jitter(), p.overUnder25.under * jitter()];
    else arr = [p.btts.yes * jitter(), p.btts.no * jitter()];
    const s = arr.reduce((a, b) => a + b, 0);
    return arr.map((v) => v / s);
  };

  const emitOdds = (playAtMs: number, gameState: number) => {
    for (const m of ["1X2", "OU25", "BTTS"] as MarketId[]) {
      out.push({
        playAtMs,
        event: {
          kind: "odds",
          fixtureId,
          messageId: `odds-${oddsN++}`,
          ts: playAtMs,
          market: m,
          inRunning: gameState >= 2 && gameState <= 4,
          gameState,
          consensus: consensusFor(m),
        },
      });
    }
  };

  // pre-match consensus (calibrates the model)
  emitOdds(0, 1);

  // per-minute clock + periodic consensus drift
  for (let m = 0; m <= 90; m++) {
    const gs = m === 0 ? 1 : m < 45 ? 2 : m === 45 ? 3 : 5 > m ? 2 : 4;
    state.clockSeconds = m * 60;
    out.push({ playAtMs: minute(m), event: { kind: "clock", ts: minute(m), clockSeconds: m * 60 } });
    if (m > 0 && m % 6 === 0 && m < 90) emitOdds(minute(m) + 30, m < 45 ? 2 : 4);
  }

  // feed drop + recovery (resilience demo) around minute 20
  out.push({ playAtMs: minute(20), event: { kind: "feed", ts: minute(20), status: "suspended", detail: "SSE disconnect" } });
  out.push({ playAtMs: minute(20) + 350, event: { kind: "feed", ts: minute(20) + 350, status: "backfilling", detail: "sequence gap → replaying /updates" } });
  out.push({ playAtMs: minute(21), event: { kind: "feed", ts: minute(21), status: "resumed", detail: "gap backfilled, caught up" } });

  // scripted score events + a consensus "catch-up" tick shortly after each goal
  for (const beat of SCRIPT) {
    const gs = beat.action === "ht" ? 3 : beat.action === "fulltime" ? 5 : beat.m < 45 ? 2 : 4;
    if (beat.action === "goal-home") state.homeGoals++;
    if (beat.action === "goal-away") state.awayGoals++;
    if (beat.action === "red-home") state.redHome++;
    if (beat.action === "red-away") state.redAway++;
    state.clockSeconds = beat.m * 60;

    out.push({
      playAtMs: minute(beat.m),
      event: {
        kind: "score",
        fixtureId,
        messageId: `score-${scoreN++}`,
        ts: minute(beat.m),
        seq: scoreN,
        statKey: beat.action.startsWith("goal") ? (beat.action.endsWith("home") ? 1 : 2) : 5,
        confirmed: true,
        action: beat.action,
        gameState: gs,
        clockSeconds: beat.m * 60,
      },
    });

    // consensus catches up ~1.2s of playback after the event, this is the
    // window Catenaccio is already repriced and a slow book is still stale.
    if (beat.action.startsWith("goal") || beat.action.startsWith("red")) {
      emitOdds(minute(beat.m) + 1200, gs);
    }
  }

  out.sort((a, b) => a.playAtMs - b.playAtMs);
  return { events: out, homeTeam, awayTeam, fixtureId };
}
