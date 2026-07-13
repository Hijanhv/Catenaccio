/**
 * Sensitivity sweep, proves the "$ prevented" number is MEASURED, not staged.
 *
 * For a representative goal mispricing, we sweep the defender's reprice latency
 * and a distribution of courtsider reaction times, and report how much a book
 * leaks at each latency. Catenaccio (~400ms) sits at ~$0; a broadcast-delayed
 * book (~6s) leaks on nearly every goal.
 *
 *   npm run sweep
 */

import { simulateAttack, mulberry32, triangular } from "../lib/engine/courtsiding";

const rng = mulberry32(0x5eed);
const attackers = Array.from({ length: 5000 }, () => Math.round(triangular(rng, 900, 1500, 2600)));

const STALE = 0.42; // P(outcome) before the goal
const TRUE = 0.61; // P(outcome) after the goal
const STAKE = 800;

console.log(`\n  Latency-arb leak vs. reprice latency  (stake $${STAKE}, edge ${(TRUE - STALE) * 100}%)\n`);
console.log(`  reprice(ms)   leaked$/goal   bar`);
for (const repriceMs of [400, 800, 1500, 3000, 5000, 6000, 8000]) {
  let leaked = 0;
  for (const reaction of attackers) {
    const a = simulateAttack(STALE, TRUE, { attackerReactionMs: reaction, bookFeedDelayMs: repriceMs, repriceMs, attackStake: STAKE });
    leaked += a.baselineLeak;
  }
  const avg = leaked / attackers.length;
  const bar = "█".repeat(Math.round(avg / 4));
  const tag = repriceMs === 400 ? "  ← Catenaccio" : repriceMs === 6000 ? "  ← broadcast book" : "";
  console.log(`  ${String(repriceMs).padStart(8)}   ${("$" + avg.toFixed(0)).padStart(10)}   ${bar}${tag}`);
}
console.log("");
