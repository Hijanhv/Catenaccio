import { describe, it, expect } from "vitest";
import { calibrate, fairProbs, MatchSnapshot } from "@/lib/engine/math/model";

const kickoff: MatchSnapshot = { homeGoals: 0, awayGoals: 0, clockSeconds: 0, redHome: 0, redAway: 0 };

describe("in-play model", () => {
  it("calibrates to the consensus 1X2 at kickoff (anchors to the sharp price)", () => {
    const consensus = { home: 0.46, draw: 0.27, away: 0.27 };
    const p = calibrate(consensus, 2.8);
    const f = fairProbs(kickoff, p).oneXtwo;
    expect(f.home).toBeCloseTo(consensus.home, 1);
    expect(f.away).toBeCloseTo(consensus.away, 1);
  });

  it("probabilities are normalised", () => {
    const p = calibrate({ home: 0.5, draw: 0.25, away: 0.25 }, 2.7);
    const f = fairProbs({ ...kickoff, clockSeconds: 1800 }, p);
    expect(f.oneXtwo.home + f.oneXtwo.draw + f.oneXtwo.away).toBeCloseTo(1, 5);
    expect(f.overUnder25.over + f.overUnder25.under).toBeCloseTo(1, 5);
    expect(f.btts.yes + f.btts.no).toBeCloseTo(1, 5);
  });

  it("a home goal increases P(home win)", () => {
    const p = calibrate({ home: 0.4, draw: 0.3, away: 0.3 }, 2.6);
    const before = fairProbs({ ...kickoff, clockSeconds: 600 }, p).oneXtwo.home;
    const after = fairProbs({ ...kickoff, homeGoals: 1, clockSeconds: 600 }, p).oneXtwo.home;
    expect(after).toBeGreaterThan(before);
  });

  it("draw probability rises as a level game runs out of time", () => {
    const p = calibrate({ home: 0.4, draw: 0.3, away: 0.3 }, 2.6);
    const early = fairProbs({ ...kickoff, clockSeconds: 600 }, p).oneXtwo.draw;
    const late = fairProbs({ ...kickoff, clockSeconds: 5000 }, p).oneXtwo.draw;
    expect(late).toBeGreaterThan(early);
  });

  it("Over 2.5 is certain once 3 goals are in", () => {
    const p = calibrate({ home: 0.4, draw: 0.3, away: 0.3 }, 2.6);
    const f = fairProbs({ ...kickoff, homeGoals: 2, awayGoals: 1, clockSeconds: 3000 }, p);
    expect(f.overUnder25.over).toBeGreaterThan(0.99);
    expect(f.btts.yes).toBeGreaterThan(0.99);
  });

  it("a red card shifts probability toward the team with 11 men", () => {
    const p = calibrate({ home: 0.4, draw: 0.3, away: 0.3 }, 2.6);
    const base = fairProbs({ ...kickoff, clockSeconds: 1800 }, p).oneXtwo.home;
    const awayRed = fairProbs({ ...kickoff, clockSeconds: 1800, redAway: 1 }, p).oneXtwo.home;
    expect(awayRed).toBeGreaterThan(base);
  });
});
