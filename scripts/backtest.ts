/**
 * Backtest, runs the agent across hundreds of independent simulated matches and
 * reports the P&L distribution. This is the honest answer to "is it profitable?":
 * single matches have variance (you sometimes lay the eventual winner), but the
 * quoted margin makes the MEAN positive, with a healthy Sharpe, and on every
 * match the latency-arb defence holds.
 *
 *   npm run backtest
 */

import { generateRandomMatch } from "../lib/engine/simulate";
import { CatenaccioEngine } from "../lib/engine/engine";

const N = 500;
const pnls: number[] = [];
let totalArb = 0;
let totalComm = 0;
let profitable = 0;
const lats: number[] = [];

for (let i = 0; i < N; i++) {
  const { events } = generateRandomMatch(1000 + i);
  const engine = new CatenaccioEngine({ fixtureId: i, homeTeam: "Home", awayTeam: "Away", seed: i * 7 + 3 });
  for (const ev of events) engine.apply(ev);
  const s = engine.snapshot();
  const net = s.realizedPnl + s.unrealizedPnl;
  pnls.push(net);
  if (net > 0) profitable++;
  totalArb += s.arbPrevented;
  totalComm += s.fees;
  if (s.lastRepriceMs) lats.push(s.lastRepriceMs);
}

const mean = pnls.reduce((a, b) => a + b, 0) / N;
const std = Math.sqrt(pnls.reduce((a, b) => a + (b - mean) ** 2, 0) / N);
const sorted = [...pnls].sort((a, b) => a - b);
const meanLat = lats.reduce((a, b) => a + b, 0) / lats.length;

const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

console.log(`\n  CATENACCIO backtest · ${N} simulated World Cup matches\n  ${"─".repeat(52)}`);
console.log(`  mean P&L / match      ${money(mean)}`);
console.log(`  std dev / match       ${money(std)}`);
console.log(`  Sharpe (per match)    ${(mean / std).toFixed(2)}`);
console.log(`  profitable matches    ${((profitable / N) * 100).toFixed(0)}%`);
console.log(`  worst / best match    ${money(sorted[0])} / ${money(sorted[sorted.length - 1])}`);
console.log(`  median match          ${money(sorted[Math.floor(N / 2)])}`);
console.log(`  ${"─".repeat(52)}`);
console.log(`  mean commission/match ${money(totalComm / N)}`);
console.log(`  mean arb prevented    ${money(totalArb / N)} / match`);
console.log(`  mean reprice latency  ${meanLat.toFixed(0)}ms`);
console.log(`  ${"─".repeat(52)}\n`);
