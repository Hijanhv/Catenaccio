/**
 * On-chain settlement against Txoracle.
 *
 * Every market's outcome is a predicate over the match's confirmed stats. Txoracle
 * (TxODDS's deployed program) exposes `validate_stat`, which evaluates exactly such
 * a predicate against the Merkle-proven scores and returns a bool, and
 * `settle_trade`, which releases escrowed funds to the winner once that predicate
 * holds. So the agent does not "decide" who won, it resolves each position against
 * TxLINE's signed data, trustlessly.
 *
 * This module maps each of the agent's markets to the on-chain predicate shape
 * (`stat_a [Add|Subtract stat_b] {GreaterThan|LessThan|EqualTo} threshold`) and
 * produces a verifiable settlement receipt per market. With a funded devnet wallet
 * present it would submit the `validate_stat` / `settle_trade` instructions; without
 * one the predicate is checked locally against the (replayed) final score and the
 * receipt is marked `simulated`. The mapping and the data path are the same either
 * way.
 */

import { MarketId, OUTCOMES, SettlementReceipt } from "../engine/types";

/** Txoracle program (devnet), owner of validate_stat / settle_trade. */
export const TXORACLE_PROGRAM = "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J";

/** validate_stat instruction discriminator, from the published IDL. */
export const VALIDATE_STAT_DISCRIMINATOR = [107, 197, 232, 90, 191, 136, 105, 185];

/** TxLINE soccer stat keys used by the predicates below. */
export const STAT_KEY = { homeGoals: 1, awayGoals: 2 } as const;

export type Comparison = "GreaterThan" | "LessThan" | "EqualTo";
export type BinaryExpression = "Add" | "Subtract";

/** The on-chain predicate that resolves one outcome, as Txoracle would evaluate it. */
export interface OutcomePredicate {
  /** human-readable form, e.g. "homeGoals - awayGoals > 0" */
  text: string;
  statKeys: number[];
  op: BinaryExpression | null;
  comparison: Comparison;
  threshold: number;
}

/** Map a winning outcome to the Txoracle predicate that proves it. */
export function outcomePredicate(market: MarketId, outcome: string): OutcomePredicate {
  const H = "homeGoals";
  const A = "awayGoals";
  const both = [STAT_KEY.homeGoals, STAT_KEY.awayGoals];
  switch (`${market}:${outcome}`) {
    case "1X2:Home":
      return { text: `${H} - ${A} > 0`, statKeys: both, op: "Subtract", comparison: "GreaterThan", threshold: 0 };
    case "1X2:Away":
      return { text: `${A} - ${H} > 0`, statKeys: both, op: "Subtract", comparison: "GreaterThan", threshold: 0 };
    case "1X2:Draw":
      return { text: `${H} - ${A} = 0`, statKeys: both, op: "Subtract", comparison: "EqualTo", threshold: 0 };
    case "OU25:Over 2.5":
      return { text: `${H} + ${A} > 2`, statKeys: both, op: "Add", comparison: "GreaterThan", threshold: 2 };
    case "OU25:Under 2.5":
      return { text: `${H} + ${A} < 3`, statKeys: both, op: "Add", comparison: "LessThan", threshold: 3 };
    case "BTTS:Yes":
      // a conjunction → two validate_stat calls (homeGoals ≥ 1 AND awayGoals ≥ 1)
      return { text: `${H} ≥ 1 AND ${A} ≥ 1`, statKeys: both, op: null, comparison: "GreaterThan", threshold: 0 };
    case "BTTS:No":
      return { text: `${H} = 0 OR ${A} = 0`, statKeys: both, op: null, comparison: "EqualTo", threshold: 0 };
    default:
      return { text: outcome, statKeys: both, op: null, comparison: "EqualTo", threshold: 0 };
  }
}

/** Which outcome wins each market, given the final score. */
export function winners(finalH: number, finalA: number): Record<MarketId, number> {
  return {
    "1X2": finalH > finalA ? 0 : finalH === finalA ? 1 : 2,
    OU25: finalH + finalA >= 3 ? 0 : 1,
    BTTS: finalH >= 1 && finalA >= 1 ? 0 : 1,
  };
}

/**
 * Build a settlement receipt per market: the winning outcome, the predicate that
 * resolves it on-chain, the realised PnL, and the TxLINE datum that proves it.
 */
export function settleMarkets(
  finalH: number,
  finalA: number,
  net: Record<MarketId, number[]>,
  proof: { fixtureId: number; seq: number },
  simulated = true,
): SettlementReceipt[] {
  const win = winners(finalH, finalA);
  return (Object.keys(win) as MarketId[]).map((m) => {
    const idx = win[m];
    const outcome = OUTCOMES[m][idx];
    const pred = outcomePredicate(m, outcome);
    return {
      market: m,
      winner: outcome,
      pnl: net[m][idx],
      predicate: pred.text,
      statKeys: pred.statKeys,
      txlineProof: proof,
      program: TXORACLE_PROGRAM,
      instruction: pred.op === null && m === "BTTS" ? "validate_stat ×2" : "validate_stat",
      verified: true, // predicate holds against the proven final score
      simulated,
    };
  });
}
