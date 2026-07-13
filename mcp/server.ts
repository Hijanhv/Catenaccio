#!/usr/bin/env npx tsx
/**
 * Catenaccio MCP server. Exposes the agent's in-play signals as tools another
 * agent can call over stdio: a fair value that is repriced on confirmed events
 * and anchored to TxLINE data on Solana.
 *
 *   npm run mcp     # then connect an MCP client over stdio
 *
 * Tools: get_fair_value, get_quote, get_signals, get_arb_report, verify_decision,
 *        run_backtest, get_settlement
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { CatenaccioEngine } from "../lib/engine/engine";
import { buildMatch } from "../lib/engine/replay";
import { generateRandomMatch } from "../lib/engine/simulate";
import { verifyMerkleProof } from "../lib/engine/merkle";
import { MARKET_LABEL, MarketId } from "../lib/engine/types";

/** Play the demo match to a LIVE in-play moment (~70') so signals are meaningful. */
function liveEngine() {
  const { events, homeTeam, awayTeam, fixtureId } = buildMatch();
  const engine = new CatenaccioEngine({ fixtureId, homeTeam, awayTeam, seed: 7 });
  for (const { event } of events) {
    engine.apply(event);
    if (engine.snapshot().clockSeconds >= 70 * 60) break;
  }
  return engine;
}

/** Play the demo match to full time so settlement receipts exist. */
function settledEngine() {
  const { events, homeTeam, awayTeam, fixtureId } = buildMatch();
  const engine = new CatenaccioEngine({ fixtureId, homeTeam, awayTeam, seed: 7 });
  for (const { event } of events) engine.apply(event);
  return engine;
}

const text = (o: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(o, null, 2) }] });

const server = new Server(
  { name: "catenaccio", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "get_fair_value", description: "Catenaccio's current in-play fair probabilities for a market, anchored to TxLINE consensus and repriced on the latest confirmed event.", inputSchema: { type: "object" as const, properties: { market: { type: "string", enum: ["1X2", "OU25", "BTTS"] } }, required: ["market"] } },
    { name: "get_quote", description: "Two-sided bid/ask (decimal odds) Catenaccio is currently quoting for a market.", inputSchema: { type: "object" as const, properties: { market: { type: "string", enum: ["1X2", "OU25", "BTTS"] } }, required: ["market"] } },
    { name: "get_signals", description: "Current prediction signals from the fair-value engine: live win probability, plus model-vs-market value signals and sharp consensus moves.", inputSchema: { type: "object" as const, properties: {} } },
    { name: "get_arb_report", description: "How much latency-arbitrage Catenaccio has prevented, the last reprice latency, and the committed decision-log Merkle root.", inputSchema: { type: "object" as const, properties: {} } },
    { name: "verify_decision", description: "Return the Merkle inclusion proof for a decision (by seq) and whether it verifies against the committed root, tamper-evidence anyone can check.", inputSchema: { type: "object" as const, properties: { seq: { type: "number" } }, required: ["seq"] } },
    { name: "run_backtest", description: "Run the agent across N simulated matches and return the P&L distribution + arb-prevented stats.", inputSchema: { type: "object" as const, properties: { matches: { type: "number", description: "default 200" } } } },
    { name: "get_settlement", description: "Play the demo match to full time and return how each market resolves trustlessly: the winning outcome, the Txoracle validate_stat predicate over Merkle-proven scores, and the settled P&L.", inputSchema: { type: "object" as const, properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  const a = (args ?? {}) as Record<string, unknown>;

  if (name === "get_fair_value") {
    const m = a.market as MarketId;
    const s = liveEngine().snapshot();
    const book = s.books.find((b) => b.market === m)!;
    return text({
      market: MARKET_LABEL[m],
      score: `${s.homeTeam} ${s.score.home}-${s.score.away} ${s.awayTeam}`,
      minute: Math.round(s.clockSeconds / 60),
      fairProbabilities: book.quotes.map((q) => ({ outcome: q.outcome, fair: +(q.fair * 100).toFixed(1) + "%" })),
      consensus: s.consensus[m].map((c) => +(c * 100).toFixed(1) + "%"),
      note: "Edge is operational (speed of repricing), not predictive, fair value is anchored to the sharp consensus.",
    });
  }

  if (name === "get_quote") {
    const m = a.market as MarketId;
    const s = liveEngine().snapshot();
    const book = s.books.find((b) => b.market === m)!;
    return text({ market: MARKET_LABEL[m], suspended: book.suspended, quotes: book.quotes.map((q) => ({ outcome: q.outcome, bid: q.bid, ask: q.ask })) });
  }

  if (name === "get_signals") {
    const s = liveEngine().snapshot();
    const x = s.books.find((b) => b.market === "1X2")!;
    const top = x.quotes.reduce((p, q) => (q.fair > p.fair ? q : p), x.quotes[0]);
    return text({
      minute: Math.round(s.clockSeconds / 60),
      liveWinProbability: { outcome: top.outcome, prob: +(top.fair * 100).toFixed(1) + "%" },
      signals: s.recentSignals.map((sig) => ({ kind: sig.kind, market: MARKET_LABEL[sig.market], detail: sig.detail, edgePct: sig.edgePct != null ? +sig.edgePct.toFixed(1) : undefined })),
      note: "Value signals flag where the model and the de-margined consensus disagree; sharp signals flag fast consensus moves.",
    });
  }

  if (name === "get_settlement") {
    const s = settledEngine().snapshot();
    return text({
      finalScore: `${s.homeTeam} ${s.score.home}-${s.score.away} ${s.awayTeam}`,
      settlements: s.settlements.map((r) => ({ market: MARKET_LABEL[r.market], winner: r.winner, predicate: r.predicate, statKeys: r.statKeys, settledPnl: `$${r.pnl.toFixed(0)}`, instruction: r.instruction, program: r.program })),
      note: "Each outcome is resolved by Txoracle.validate_stat against the Merkle-proven final score, then settled via settle_trade, no trusted oracle.",
    });
  }

  if (name === "get_arb_report") {
    const s = liveEngine().snapshot();
    return text({
      latencyArbPrevented: `$${Math.round(s.arbPrevented)}`,
      broadcastBookWouldLeak: `$${Math.round(s.arbLeakedBaseline)}`,
      lastRepriceMs: s.lastRepriceMs,
      decisionsAnchored: s.decisionCount,
      merkleRoot: s.merkleRoot,
    });
  }

  if (name === "verify_decision") {
    const engine = liveEngine();
    const seq = Number(a.seq ?? 0);
    try {
      const proof = engine.proofFor(seq);
      return text({ seq, verified: verifyMerkleProof(proof), leafHash: proof.leafHash, root: proof.root, proofLength: proof.path.length, guarantee: "tamper-evident & independently verifiable (not a claim of optimality)" });
    } catch {
      return text({ seq, error: "no such decision" });
    }
  }

  if (name === "run_backtest") {
    const N = Math.max(10, Math.min(500, Number(a.matches ?? 200)));
    const pnls: number[] = [];
    let arb = 0;
    for (let i = 0; i < N; i++) {
      const { events } = generateRandomMatch(2000 + i);
      const e = new CatenaccioEngine({ fixtureId: i, homeTeam: "H", awayTeam: "A", seed: i * 3 + 1 });
      for (const ev of events) e.apply(ev);
      const s = e.snapshot();
      pnls.push(s.realizedPnl + s.unrealizedPnl);
      arb += s.arbPrevented;
    }
    const mean = pnls.reduce((x, y) => x + y, 0) / N;
    const std = Math.sqrt(pnls.reduce((x, y) => x + (y - mean) ** 2, 0) / N);
    return text({ matches: N, meanPnlPerMatch: `$${mean.toFixed(0)}`, sharpe: +(mean / std).toFixed(2), profitablePct: `${((pnls.filter((p) => p > 0).length / N) * 100).toFixed(0)}%`, meanArbPreventedPerMatch: `$${(arb / N).toFixed(0)}` });
  }

  return text({ error: `unknown tool ${name}` });
});

const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  console.error("Catenaccio MCP server running on stdio");
});
