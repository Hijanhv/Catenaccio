import { describe, it, expect } from "vitest";
import { simulateAttack, triangular, mulberry32 } from "@/lib/engine/courtsiding";

describe("latency-arbitrage defence", () => {
  it("Catenaccio leaks $0 when it reprices faster than the courtsider reacts", () => {
    const r = simulateAttack(0.42, 0.61, { attackerReactionMs: 1500, bookFeedDelayMs: 6000, repriceMs: 400, attackStake: 800 });
    expect(r.edge).toBeCloseTo(0.19, 5);
    expect(r.catenaccioLeak).toBe(0);
    expect(r.rejected).toBe(true);
    expect(r.baselineLeak).toBeCloseTo(152, 0); // a broadcast book DOES leak
  });

  it("a slow defender (reprice after the courtsider) does leak", () => {
    const r = simulateAttack(0.42, 0.61, { attackerReactionMs: 1500, bookFeedDelayMs: 6000, repriceMs: 3000, attackStake: 800 });
    expect(r.catenaccioLeak).toBeGreaterThan(0);
    expect(r.rejected).toBe(false);
  });

  it("no edge means no leak", () => {
    const r = simulateAttack(0.5, 0.5, { attackerReactionMs: 1500, bookFeedDelayMs: 6000, repriceMs: 400, attackStake: 800 });
    expect(r.edge).toBe(0);
    expect(r.baselineLeak).toBe(0);
  });
});

describe("deterministic RNG", () => {
  it("same seed → identical sequence (auditable replays)", () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it("triangular samples stay within bounds", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const x = triangular(rng, 900, 1500, 2600);
      expect(x).toBeGreaterThanOrEqual(900);
      expect(x).toBeLessThanOrEqual(2600);
    }
  });
});
