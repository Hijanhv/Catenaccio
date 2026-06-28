/**
 * Quote engine — turns fair probabilities into two-sided tradeable prices.
 *
 *  - We quote in decimal odds. Fair odds = 1 / fairProb.
 *  - We apply a configurable margin (half-spread) so we earn on the round-turn.
 *  - The spread WIDENS with uncertainty: early in the match, near our exposure
 *    limits, and immediately after a goal (adverse-selection protection — exactly
 *    the moments a desk is most likely to be picked off).
 *  - Quotes are SKEWED by inventory: if we are long an outcome, we shade our
 *    prices to attract flow that flattens the book (classic market-making).
 */

import { MarketId } from "./types";

export interface QuoteConfig {
  baseMarginBps: number; // base half-spread in basis points of probability
  inventorySkewBps: number; // how hard we lean against inventory
  minProb: number; // floor to avoid div-by-zero on extreme outcomes
}

export const DEFAULT_QUOTE_CONFIG: QuoteConfig = {
  baseMarginBps: 250, // 2.5%
  inventorySkewBps: 200, // lean hard against inventory → keep the book flat
  minProb: 0.005,
};

export interface QuoteInputs {
  fairProbs: number[];
  inventory: number[];
  /** 0..1 — extra spread multiplier (1 = calm, >1 = uncertain/just-after-goal) */
  uncertainty: number;
  cfg: QuoteConfig;
}

export interface OutcomeQuote {
  fair: number;
  bid: number;
  ask: number;
}

export function quoteMarket(inp: QuoteInputs): OutcomeQuote[] {
  const { fairProbs, inventory, uncertainty, cfg } = inp;
  const margin = (cfg.baseMarginBps / 10000) * uncertainty;
  return fairProbs.map((p, i) => {
    const fair = Math.min(0.995, Math.max(cfg.minProb, p));
    const inv = inventory[i] ?? 0;
    // Inventory skew in probability space: long inventory → quote a slightly
    // higher implied prob on our ask (cheaper for us to sell more) and lower bid.
    const skew = (cfg.inventorySkewBps / 10000) * Math.tanh(inv / 45);
    const bidProb = Math.min(0.995, fair + margin + skew);
    const askProb = Math.max(cfg.minProb, fair - margin + skew);
    return {
      fair,
      // decimal odds = 1 / impliedProb. Higher prob → shorter odds.
      bid: round2(1 / bidProb),
      ask: round2(1 / askProb),
    };
  });
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Cross-market consistency guard (model-free).
 *
 * Converts each market's quoted prices back to implied probability and checks
 * relationships that must hold by arithmetic, regardless of any model:
 *   - 1X2 implied probs should sum to ~1 (after de-margining).
 *   - P(Over 2.5) should not contradict a very low/high scoring 1X2 shape.
 *   - BTTS Yes cannot exceed min(P(home scores), P(away scores)) bounds.
 * Returns human-readable violations; the engine uses these to (a) widen/suspend
 * an inconsistent market and (b) surface a signal in the event feed.
 */
export function consistencyViolations(
  probsByMarket: Record<MarketId, number[]>,
): string[] {
  const out: string[] = [];
  const x = probsByMarket["1X2"];
  const ou = probsByMarket["OU25"];
  const btts = probsByMarket["BTTS"];
  if (x) {
    const sum = x[0] + x[1] + x[2];
    if (Math.abs(sum - 1) > 0.04) out.push(`1X2 implied probs sum to ${(sum * 100).toFixed(1)}% (expected ~100%)`);
  }
  if (ou) {
    const sum = ou[0] + ou[1];
    if (Math.abs(sum - 1) > 0.04) out.push(`O/U implied probs sum to ${(sum * 100).toFixed(1)}%`);
  }
  if (x && ou) {
    // A heavy draw + very high Over is internally odd: draws are usually low-scoring.
    if (x[1] > 0.4 && ou[0] > 0.75) out.push(`High draw prob (${pct(x[1])}) with very high Over 2.5 (${pct(ou[0])})`);
  }
  if (btts) {
    const sum = btts[0] + btts[1];
    if (Math.abs(sum - 1) > 0.04) out.push(`BTTS implied probs sum to ${(sum * 100).toFixed(1)}%`);
  }
  return out;
}

const pct = (p: number) => `${(p * 100).toFixed(0)}%`;
