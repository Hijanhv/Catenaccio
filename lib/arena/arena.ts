/**
 * Agent vs Agent Arena.
 *
 * Several agents read the same TxLINE match feed and run different strategies. They
 * take positions at the de-margined consensus price; at full time every position
 * settles against the actual outcome and each agent's P&L is scored. Over a
 * tournament of matches the better strategy pulls ahead.
 *
 * The edge they compete on is the one this whole project is about: reaction speed.
 * When a goal is confirmed the true price has moved, but the market consensus only
 * catches up on the next tick. An agent that acts on the goal itself buys the stale
 * price (positive expected value); one that waits for the consensus gets no edge;
 * one that fades the move loses. So the Arena is a live demonstration that speed —
 * not prediction — is where the money is.
 */

import { EngineEvent, MarketId } from "../engine/types";
import { calibrate, fairProbs, ModelParams, MatchSnapshot } from "../engine/math/model";
import { generateRandomMatch } from "../engine/simulate";

export interface Bet {
  market: MarketId;
  outcome: number;
  stake: number;
  odds: number; // decimal odds locked at bet time
}

export interface AgentResult {
  name: string;
  pnl: number;
  staked: number;
  bets: number;
  wins: number;
}

const STAKE = 100;
const FEE_BPS = 200; // 2% commission on stake, per bet
const SHARP = 0.05; // consensus move that triggers momentum/contrarian
const VALUE_EDGE = 0.04; // model-vs-market gap that triggers value

interface Ctx {
  kind: "odds" | "goal";
  market: MarketId;
  consensus: number[];
  prev: number[] | undefined;
  modelFair: number[];
  goalTeam?: "home" | "away";
}

type React = (c: Ctx) => Bet | null;

/** The five strategies, as pure reaction functions. */
export const STRATEGIES: Record<string, React> = {
  // Reacts to the goal itself, buying the still-stale 1X2 price. This is the
  // latency-arb edge — positive EV, because the true price has already moved.
  Reflex: (c) => {
    if (c.kind !== "goal" || c.market !== "1X2" || !c.goalTeam) return null;
    const idx = c.goalTeam === "home" ? 0 : 2;
    return bet("1X2", idx, c.consensus);
  },
  // Rides the move, but only after the consensus has already repriced → ~zero edge.
  Momentum: (c) => {
    if (c.kind !== "odds" || !c.prev) return null;
    const i = argmax(c.consensus.map((v, k) => v - c.prev![k]));
    return c.consensus[i] - c.prev[i] >= SHARP ? bet(c.market, i, c.consensus) : null;
  },
  // Fades the move → backs an outcome whose true probability just fell → loses.
  Contrarian: (c) => {
    if (c.kind !== "odds" || !c.prev) return null;
    const i = argmin(c.consensus.map((v, k) => v - c.prev![k]));
    return c.prev[i] - c.consensus[i] >= SHARP ? bet(c.market, i, c.consensus) : null;
  },
  // Backs an outcome the model rates above the market by a margin → ~zero edge here.
  Value: (c) => {
    if (c.kind !== "odds") return null;
    const i = argmax(c.modelFair.map((v, k) => v - c.consensus[k]));
    return c.modelFair[i] - c.consensus[i] >= VALUE_EDGE ? bet(c.market, i, c.consensus) : null;
  },
  // Always backs the current favourite → pays the variance, no edge → slight loss.
  Chalk: (c) => {
    if (c.kind !== "odds" || c.market !== "1X2") return null;
    return bet("1X2", argmax(c.consensus), c.consensus);
  },
};

function bet(market: MarketId, outcome: number, consensus: number[]): Bet | null {
  const p = consensus[outcome];
  if (!p || p < 0.02) return null; // skip degenerate prices
  return { market, outcome, stake: STAKE, odds: 1 / p };
}

const argmax = (a: number[]) => a.reduce((best, v, i, arr) => (v > arr[best] ? i : best), 0);
const argmin = (a: number[]) => a.reduce((best, v, i, arr) => (v < arr[best] ? i : best), 0);

const winners = (h: number, a: number): Record<MarketId, number> => ({
  "1X2": h > a ? 0 : h === a ? 1 : 2,
  OU25: h + a >= 3 ? 0 : 1,
  BTTS: h >= 1 && a >= 1 ? 0 : 1,
});

/** Run one match; every agent reacts to the same feed and settles at full time. */
export function runArenaMatch(events: EngineEvent[], finalScore: { home: number; away: number }): AgentResult[] {
  const names = Object.keys(STRATEGIES);
  const results: Record<string, AgentResult> = Object.fromEntries(
    names.map((n) => [n, { name: n, pnl: 0, staked: 0, bets: 0, wins: 0 }]),
  );
  const placed: Record<string, Bet[]> = Object.fromEntries(names.map((n) => [n, []]));

  const consensus: Record<MarketId, number[]> = { "1X2": [], OU25: [], BTTS: [] };
  const prev: Partial<Record<MarketId, number[]>> = {};
  const state: MatchSnapshot = { homeGoals: 0, awayGoals: 0, clockSeconds: 0, redHome: 0, redAway: 0 };
  let params: ModelParams | null = null;

  const modelFor = (m: MarketId): number[] => {
    if (!params) return consensus[m] ?? [];
    const p = fairProbs(state, params);
    return m === "1X2" ? [p.oneXtwo.home, p.oneXtwo.draw, p.oneXtwo.away] : m === "OU25" ? [p.overUnder25.over, p.overUnder25.under] : [p.btts.yes, p.btts.no];
  };

  const offer = (ctx: Ctx) => {
    for (const n of names) {
      const b = STRATEGIES[n](ctx);
      if (b) placed[n].push(b);
    }
  };

  for (const ev of events) {
    if (ev.kind === "clock") {
      state.clockSeconds = ev.clockSeconds;
    } else if (ev.kind === "odds") {
      prev[ev.market] = consensus[ev.market].length ? consensus[ev.market].slice() : undefined;
      consensus[ev.market] = ev.consensus.slice();
      if (!params && ev.market === "1X2") {
        params = calibrate({ home: ev.consensus[0], draw: ev.consensus[1], away: ev.consensus[2] });
      }
      offer({ kind: "odds", market: ev.market, consensus: consensus[ev.market], prev: prev[ev.market], modelFair: modelFor(ev.market) });
    } else if (ev.kind === "score") {
      if (ev.action === "goal-home" || ev.action === "goal-away") {
        const team = ev.action === "goal-home" ? "home" : "away";
        // react on the goal BEFORE the consensus tick that follows it (stale price)
        offer({ kind: "goal", market: "1X2", consensus: consensus["1X2"], prev: prev["1X2"], modelFair: modelFor("1X2"), goalTeam: team });
        if (team === "home") state.homeGoals++;
        else state.awayGoals++;
      }
    }
  }

  // settle every position against the final outcome
  const win = winners(finalScore.home, finalScore.away);
  for (const n of names) {
    for (const b of placed[n]) {
      const r = results[n];
      r.bets++;
      r.staked += b.stake;
      const fee = (b.stake * FEE_BPS) / 10_000;
      if (b.outcome === win[b.market]) {
        r.pnl += b.stake * (b.odds - 1) - fee;
        r.wins++;
      } else {
        r.pnl += -b.stake - fee;
      }
    }
  }
  return names.map((n) => results[n]);
}

export interface Standing {
  name: string;
  pnl: number;
  bets: number;
  hitRate: number;
  roi: number;
}

/** Run a tournament of `matches` generated matches; aggregate a leaderboard. */
export function runTournament(matches = 200, startSeed = 5000): Standing[] {
  const agg: Record<string, AgentResult> = {};
  for (let i = 0; i < matches; i++) {
    const { events, finalScore } = generateRandomMatch(startSeed + i);
    for (const r of runArenaMatch(events, finalScore)) {
      const a = (agg[r.name] ??= { name: r.name, pnl: 0, staked: 0, bets: 0, wins: 0 });
      a.pnl += r.pnl;
      a.staked += r.staked;
      a.bets += r.bets;
      a.wins += r.wins;
    }
  }
  return Object.values(agg)
    .map((a) => ({
      name: a.name,
      pnl: Math.round(a.pnl),
      bets: a.bets,
      hitRate: a.bets ? a.wins / a.bets : 0,
      roi: a.staked ? a.pnl / a.staked : 0,
    }))
    .sort((x, y) => y.pnl - x.pnl);
}
