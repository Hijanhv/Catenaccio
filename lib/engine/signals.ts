/**
 * Prediction signals.
 *
 * The fair-value engine that prices the book also produces signals: where the
 * model and the market disagree (value), and when the consensus itself moves
 * sharply (sharp). These are the agent's signal-detection output — the input a
 * human trader or another bot would act on, and the prediction surface that sits
 * upstream of the quotes and the settlement.
 */

import { MarketId, OUTCOMES, Signal } from "./types";

/** model-vs-market gap (in probability) at which a value signal fires */
const VALUE_THRESHOLD = 0.03;
/** consensus move between ticks (in probability) at which a sharp signal fires */
const SHARP_THRESHOLD = 0.04;
/** above this, a market is resolving (it just settled), not repricing — not a signal */
const SHARP_MAX = 0.8;

/** Outcomes the model rates differently from the de-margined consensus. */
export function valueSignals(market: MarketId, fair: number[], consensus: number[], ts: number): Signal[] {
  const names = OUTCOMES[market];
  const out: Signal[] = [];
  for (let i = 0; i < names.length; i++) {
    const edge = fair[i] - consensus[i];
    if (Math.abs(edge) < VALUE_THRESHOLD) continue;
    const cheap = edge > 0; // model rates it likelier than the market does
    out.push({
      ts,
      kind: "value",
      market,
      outcome: names[i],
      detail: `${names[i]} ${cheap ? "underpriced" : "overpriced"} by ${(Math.abs(edge) * 100).toFixed(1)}pp`,
      edgePct: edge * 100,
      strength: Math.min(1, Math.abs(edge) / 0.12),
    });
  }
  return out;
}

/** Sharp repricing in the consensus itself, tick over tick. */
export function sharpSignals(market: MarketId, prev: number[] | undefined, consensus: number[], ts: number): Signal[] {
  if (!prev || prev.length !== consensus.length) return [];
  const names = OUTCOMES[market];
  const out: Signal[] = [];
  for (let i = 0; i < names.length; i++) {
    const delta = consensus[i] - prev[i];
    if (Math.abs(delta) < SHARP_THRESHOLD || Math.abs(delta) > SHARP_MAX) continue;
    out.push({
      ts,
      kind: "sharp",
      market,
      outcome: names[i],
      detail: `Sharp move: ${names[i]} ${delta > 0 ? "shortening" : "drifting"} ${(Math.abs(delta) * 100).toFixed(1)}pp`,
      edgePct: delta * 100,
      strength: Math.min(1, Math.abs(delta) / 0.15),
    });
  }
  return out;
}
