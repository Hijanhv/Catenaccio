import { describe, it, expect } from "vitest";
import { CatenaccioEngine } from "@/lib/engine/engine";
import { buildMatch } from "@/lib/engine/replay";
import { outcomePredicate, winners, settleMarkets } from "@/lib/onchain/settlement";
import { valueSignals, sharpSignals } from "@/lib/engine/signals";

function runMatch(seed: number) {
  const { events, homeTeam, awayTeam, fixtureId } = buildMatch();
  const engine = new CatenaccioEngine({ fixtureId, homeTeam, awayTeam, seed });
  for (const { event } of events) engine.apply(event);
  return engine;
}

describe("settlement predicate mapping", () => {
  it("maps each outcome to the right validate_stat predicate", () => {
    expect(outcomePredicate("1X2", "Home")).toMatchObject({ op: "Subtract", comparison: "GreaterThan", threshold: 0 });
    expect(outcomePredicate("OU25", "Over 2.5")).toMatchObject({ op: "Add", comparison: "GreaterThan", threshold: 2 });
    expect(outcomePredicate("OU25", "Under 2.5")).toMatchObject({ op: "Add", comparison: "LessThan", threshold: 3 });
  });

  it("picks the correct winning outcome for a final score", () => {
    // 2-1 home win, 3 goals, both scored
    const w = winners(2, 1);
    expect(w["1X2"]).toBe(0); // Home
    expect(w.OU25).toBe(0); // Over 2.5
    expect(w.BTTS).toBe(0); // Yes
    // 0-0 draw
    const d = winners(0, 0);
    expect(d["1X2"]).toBe(1); // Draw
    expect(d.OU25).toBe(1); // Under
    expect(d.BTTS).toBe(1); // No
  });

  it("produces a receipt per market that references Txoracle + the proof", () => {
    const net = { "1X2": [100, 0, -50], OU25: [40, -10], BTTS: [25, -5] } as Record<string, number[]>;
    const receipts = settleMarkets(2, 1, net as any, { fixtureId: 99, seq: 7 });
    expect(receipts).toHaveLength(3);
    for (const r of receipts) {
      expect(r.program).toContain("6pW64gN1");
      expect(r.instruction).toContain("validate_stat");
      expect(r.txlineProof).toEqual({ fixtureId: 99, seq: 7 });
    }
  });
});

describe("engine emits settlement + signals", () => {
  it("settles every market at full time", () => {
    const s = runMatch(7).snapshot();
    expect(s.settlements).toHaveLength(3);
    const total = s.settlements.reduce((a, r) => a + r.pnl, 0);
    expect(Number.isFinite(total)).toBe(true);
  });

  it("emits at least one prediction signal over a full match", () => {
    const s = runMatch(7).snapshot();
    expect(Array.isArray(s.recentSignals)).toBe(true);
    expect(s.recentSignals.length).toBeGreaterThan(0);
  });
});

describe("signal detection", () => {
  it("flags an underpriced outcome when the model beats the market", () => {
    const sigs = valueSignals("1X2", [0.55, 0.25, 0.2], [0.45, 0.27, 0.28], 1);
    const home = sigs.find((s) => s.outcome === "Home");
    expect(home).toBeDefined();
    expect(home!.edgePct!).toBeGreaterThan(0);
  });

  it("flags a sharp consensus move tick over tick", () => {
    const sigs = sharpSignals("1X2", [0.4, 0.3, 0.3], [0.5, 0.25, 0.25], 1);
    expect(sigs.length).toBeGreaterThan(0);
    expect(sigs[0].kind).toBe("sharp");
  });

  it("stays quiet when model and market agree", () => {
    expect(valueSignals("1X2", [0.4, 0.3, 0.3], [0.41, 0.3, 0.29], 1)).toHaveLength(0);
  });
});
