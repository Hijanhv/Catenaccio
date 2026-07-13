import { describe, it, expect } from "vitest";
import { CatenaccioEngine } from "@/lib/engine/engine";
import { buildMatch } from "@/lib/engine/replay";
import { quoteMarket, consistencyViolations, DEFAULT_QUOTE_CONFIG } from "@/lib/engine/quote";

function runMatch(seed: number) {
  const { events, homeTeam, awayTeam, fixtureId } = buildMatch();
  const engine = new CatenaccioEngine({ fixtureId, homeTeam, awayTeam, seed });
  for (const { event } of events) engine.apply(event);
  return engine;
}

describe("event-sourced engine", () => {
  it("is deterministic, same seed gives the same Merkle root and P&L", () => {
    const a = runMatch(42).snapshot();
    const b = runMatch(42).snapshot();
    expect(a.merkleRoot).toBe(b.merkleRoot);
    expect(a.realizedPnl).toBe(b.realizedPnl);
    expect(a.arbPrevented).toBe(b.arbPrevented);
  });

  it("reprices on a confirmed goal in ~400ms and prevents latency-arb", () => {
    const s = runMatch(1).snapshot();
    expect(s.lastRepriceMs).not.toBeNull();
    expect(s.lastRepriceMs!).toBeGreaterThan(300);
    expect(s.lastRepriceMs!).toBeLessThan(600);
    expect(s.arbPrevented).toBeGreaterThan(0);
  });

  it("measures the reprice hot path without leaking it into the hashed log", () => {
    const s = runMatch(1).snapshot();
    // real wall-clock compute for the hot path is recorded and sane
    expect(s.measuredRepriceMs).not.toBeNull();
    expect(s.measuredRepriceMs!).toBeGreaterThanOrEqual(0);
    // it is non-deterministic, so it must stay out of the Merkle leaves: same seed,
    // same root, regardless of the timing measured on this run
    expect(runMatch(1).snapshot().merkleRoot).toBe(s.merkleRoot);
  });

  it("settles to a flat book at full time (no double-counted P&L)", () => {
    const s = runMatch(3).snapshot();
    expect(s.phaseLabel).toBe("Full time");
    expect(Math.abs(s.unrealizedPnl)).toBeLessThan(1e-6);
  });

  it("anchors a decision for every event it acts on", () => {
    const s = runMatch(5).snapshot();
    expect(s.decisionCount).toBeGreaterThan(20);
    expect(s.merkleRoot).toHaveLength(64);
  });

  it("respects the inventory cap (exposure stays bounded)", () => {
    const engine = runMatch(9);
    // peak exposure during the match never explodes past the configured caps
    expect(engine.snapshot().risk.totalExposure).toBeLessThan(7000);
  });
});

describe("quote engine", () => {
  it("bid is shorter (smaller decimal odds) than ask, we earn the spread", () => {
    const q = quoteMarket({ fairProbs: [0.5, 0.3, 0.2], inventory: [0, 0, 0], uncertainty: 1, cfg: DEFAULT_QUOTE_CONFIG });
    for (const o of q) expect(o.bid).toBeLessThan(o.ask);
  });

  it("cross-market consistency guard flags an impossible book", () => {
    const v = consistencyViolations({ "1X2": [0.6, 0.6, 0.6], OU25: [0.5, 0.5], BTTS: [0.5, 0.5] });
    expect(v.length).toBeGreaterThan(0);
  });

  it("a coherent book passes the consistency guard", () => {
    const v = consistencyViolations({ "1X2": [0.45, 0.27, 0.28], OU25: [0.52, 0.48], BTTS: [0.55, 0.45] });
    expect(v).toHaveLength(0);
  });
});
