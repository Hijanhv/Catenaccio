/**
 * Headless autonomous agent, the SAME engine the dashboard runs, but driven from
 * the command line with zero human input. This is the "Autonomous Operation"
 * proof: ingest → model → quote → detect event → reprice → manage risk → settle,
 * all on its own. In production this loop consumes the live TxLINE SSE streams
 * (lib/txline/*); here it consumes the deterministic replay so it always runs.
 *
 *   npm run agent     # play the match through, print decisions + final report
 *   npm run demo      # same, used by the demo recording
 */

import { buildMatch } from "../lib/engine/replay";
import { CatenaccioEngine } from "../lib/engine/engine";
import { anchorRoot } from "../lib/onchain/solana";

async function main() {
  const { events, homeTeam, awayTeam, fixtureId } = buildMatch();
  const engine = new CatenaccioEngine({ fixtureId, homeTeam, awayTeam });

  console.log(`\n  CATENACCIO · autonomous in-play market maker`);
  console.log(`  ${homeTeam} vs ${awayTeam}  (fixture #${fixtureId})  ·  ${events.length} events\n`);

  let lastReprice = 0;
  let peakExposure = 0;
  for (const { event } of events) {
    engine.apply(event);
    const s = engine.snapshot();
    peakExposure = Math.max(peakExposure, s.risk.totalExposure);
    if (event.kind === "score" && event.confirmed && s.lastRepriceMs && s.lastRepriceMs !== lastReprice) {
      lastReprice = s.lastRepriceMs;
      console.log(`  ⚡ ${s.clockSeconds / 60}'  ${s.score.home}-${s.score.away}  repriced in ${s.lastRepriceMs}ms  ·  arb prevented so far ${money(s.arbPrevented)}`);
    }
    if (event.kind === "feed" && event.status !== "connected") {
      console.log(`  ⇄  feed ${event.status}${event.detail ? ` (${event.detail})` : ""}`);
    }
  }

  const s = engine.snapshot();
  const root = engine.merkleTree.root();
  const anchor = await anchorRoot(root);

  console.log(`\n  ── final report ─────────────────────────────────────────`);
  console.log(`  full time            ${s.score.home}-${s.score.away}`);
  console.log(`  net P&L (after fees) ${money(s.realizedPnl + s.unrealizedPnl)}`);
  console.log(`  commission earned    ${money(s.fees)}`);
  console.log(`  latency-arb prevented${money(s.arbPrevented)}   (a broadcast book leaks ${money(s.arbLeakedBaseline)})`);
  console.log(`  peak exposure used   ${money(peakExposure)}   kill-switch: ${s.risk.killSwitch ? "TRIPPED" : "armed"}`);
  console.log(`  decisions anchored   ${s.decisionCount}`);
  console.log(`  merkle root          ${root}`);
  console.log(`  on-chain anchor      ${anchor.signature}${anchor.simulated ? "  (simulated, no funded wallet)" : `  (${anchor.cluster})`}`);
  console.log(`  ─────────────────────────────────────────────────────────\n`);
}

const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
