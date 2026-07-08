import { describe, it, expect } from "vitest";
import { runArenaMatch, runTournament, STRATEGIES } from "@/lib/arena/arena";
import { generateRandomMatch } from "@/lib/engine/simulate";

describe("agent vs agent arena", () => {
  it("is deterministic — same seeds give the same standings", () => {
    const a = runTournament(80, 5000);
    const b = runTournament(80, 5000);
    expect(a).toEqual(b);
  });

  it("scores every strategy and settles a match", () => {
    const { events, finalScore } = generateRandomMatch(1234);
    const res = runArenaMatch(events, finalScore);
    expect(res.map((r) => r.name).sort()).toEqual(Object.keys(STRATEGIES).sort());
    for (const r of res) expect(Number.isFinite(r.pnl)).toBe(true);
  });

  it("the fast (Reflex) agent beats the fader (Contrarian) over a tournament", () => {
    const table = runTournament(300, 9000);
    const reflex = table.find((s) => s.name === "Reflex")!;
    const contra = table.find((s) => s.name === "Contrarian")!;
    // buying the stale price on a goal is +EV; fading a real move is -EV
    expect(reflex.pnl).toBeGreaterThan(contra.pnl);
    expect(reflex.roi).toBeGreaterThan(contra.roi);
  });

  it("produces a sorted leaderboard", () => {
    const table = runTournament(120, 4200);
    for (let i = 1; i < table.length; i++) {
      expect(table[i - 1].pnl).toBeGreaterThanOrEqual(table[i].pnl);
    }
  });
});
