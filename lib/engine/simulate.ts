/**
 * Random match generator for backtesting.
 *
 * Goals are drawn from the SAME Poisson process the model prices against, so the
 * test is honest: the agent's fair value is unbiased and its only structural edge
 * is the quoted margin + not getting picked off. Across many matches that yields a
 * positive mean P&L with single-match variance — which is exactly what we claim.
 */

import { EngineEvent, MarketId } from "./types";
import { fairProbs, MatchSnapshot, ModelParams } from "./math/model";
import { mulberry32 } from "./courtsiding";

function poissonSample(lambda: number, rng: () => number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return k - 1;
}

export function generateRandomMatch(seed: number): { events: EngineEvent[]; finalScore: { home: number; away: number } } {
  const rng = mulberry32(seed);
  const totalGoals = 2.2 + rng() * 1.5;
  const sup = (rng() - 0.5) * 2.2;
  const params: ModelParams = {
    lambdaHomeFull: Math.max(0.25, (totalGoals + sup) / 2),
    lambdaAwayFull: Math.max(0.25, (totalGoals - sup) / 2),
    rho: -0.04,
  };

  const hg = poissonSample(params.lambdaHomeFull, rng);
  const ag = poissonSample(params.lambdaAwayFull, rng);
  const goals: { team: "home" | "away"; minute: number }[] = [];
  for (let i = 0; i < hg; i++) goals.push({ team: "home", minute: 1 + Math.floor(rng() * 89) });
  for (let i = 0; i < ag; i++) goals.push({ team: "away", minute: 1 + Math.floor(rng() * 89) });
  goals.sort((a, b) => a.minute - b.minute);

  const state: MatchSnapshot = { homeGoals: 0, awayGoals: 0, clockSeconds: 0, redHome: 0, redAway: 0 };
  const events: EngineEvent[] = [];
  let oddsN = 0;
  let scoreN = 0;
  let ts = 0;

  const consensusFor = (m: MarketId): number[] => {
    const p = fairProbs(state, params);
    let arr = m === "1X2" ? [p.oneXtwo.home, p.oneXtwo.draw, p.oneXtwo.away] : m === "OU25" ? [p.overUnder25.over, p.overUnder25.under] : [p.btts.yes, p.btts.no];
    const s = arr.reduce((a, b) => a + b, 0);
    return arr.map((v) => v / s);
  };
  const emitOdds = (gs: number) => {
    for (const m of ["1X2", "OU25", "BTTS"] as MarketId[]) {
      events.push({ kind: "odds", fixtureId: seed, messageId: `odds-${seed}-${oddsN++}`, ts: ts++, market: m, inRunning: gs >= 2 && gs <= 4, gameState: gs, consensus: consensusFor(m) });
    }
  };

  emitOdds(1);
  events.push({ kind: "score", fixtureId: seed, messageId: `score-${seed}-${scoreN++}`, ts: ts++, seq: scoreN, statKey: 0, confirmed: true, action: "kickoff", gameState: 2, clockSeconds: 0 });

  let gi = 0;
  for (let m = 1; m <= 90; m++) {
    state.clockSeconds = m * 60;
    events.push({ kind: "clock", ts: ts++, clockSeconds: m * 60 });
    while (gi < goals.length && goals[gi].minute === m) {
      const g = goals[gi++];
      if (g.team === "home") state.homeGoals++;
      else state.awayGoals++;
      const gs = m < 45 ? 2 : 4;
      events.push({ kind: "score", fixtureId: seed, messageId: `score-${seed}-${scoreN++}`, ts: ts++, seq: scoreN, statKey: g.team === "home" ? 1 : 2, confirmed: true, action: `goal-${g.team}`, gameState: gs, clockSeconds: m * 60 });
      emitOdds(gs);
    }
    if (m === 45) events.push({ kind: "score", fixtureId: seed, messageId: `score-${seed}-${scoreN++}`, ts: ts++, seq: scoreN, statKey: 0, confirmed: true, action: "ht", gameState: 3, clockSeconds: 2700 });
    if (m % 6 === 0) emitOdds(m < 45 ? 2 : 4);
  }
  events.push({ kind: "score", fixtureId: seed, messageId: `score-${seed}-${scoreN++}`, ts: ts++, seq: scoreN, statKey: 0, confirmed: true, action: "fulltime", gameState: 5, clockSeconds: 5400 });

  return { events, finalScore: { home: state.homeGoals, away: state.awayGoals } };
}
