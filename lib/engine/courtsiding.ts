/**
 * Courtsiding / latency-arbitrage simulator — the threat Catenaccio defends.
 *
 * THE ATTACK (real, costly, universal): when a goal is scored, a "courtsider"
 * watching a faster source (in the stadium, a low-latency feed) knows the true
 * price has moved seconds before a book on a broadcast-derived feed updates. In
 * that window they hit the book's STALE price for near-risk-free profit.
 *
 * We model the attack honestly so the "$ prevented" number is a MEASURED result,
 * not a staged one:
 *  - The courtsider reacts `attackerReactionMs` after the goal.
 *  - A naive book updates `bookFeedDelayMs` after the goal (broadcast-derived).
 *  - Catenaccio, on TxLINE's verified feed, suspends+reprices `repriceMs` after.
 *
 * A stale quote is exploitable only while it still exists. So the dollars leaked
 * depend on whether the attacker's reaction lands *before* the defender's update:
 *   leaked(book) = EV_edge * stake   if attackerReactionMs < bookFeedDelayMs
 *   leaked(cat)  = EV_edge * stake   if attackerReactionMs < repriceMs   (≈ never)
 *
 * EV_edge is the probability the attacker gains by trading the stale price vs the
 * post-goal fair price — i.e. exactly the mispricing the goal created.
 */

export interface CourtsidingParams {
  attackerReactionMs: number; // how fast the courtsider acts after the goal
  bookFeedDelayMs: number; // when a naive broadcast-delayed book finally reprices
  repriceMs: number; // Catenaccio's measured suspend→reprice latency
  attackStake: number; // notional the courtsider fires at the stale price
}

export interface AttackOutcome {
  /** EV the stale price handed to the attacker (per unit), 0..1 */
  edge: number;
  /** $ a naive broadcast-delayed book leaks on this goal */
  baselineLeak: number;
  /** $ Catenaccio leaks on this goal (≈0 because we reprice in ~400ms) */
  catenaccioLeak: number;
  /** did the attacker's stale order get rejected by Catenaccio? */
  rejected: boolean;
}

/**
 * @param staleProb   implied prob of the backed outcome BEFORE the goal (stale)
 * @param trueProb    implied prob of that outcome AFTER the goal (true/new fair)
 */
export function simulateAttack(
  staleProb: number,
  trueProb: number,
  p: CourtsidingParams,
): AttackOutcome {
  // The attacker backs the outcome that became more likely, at the stale (longer)
  // price. Their per-unit edge is the probability gap they capture.
  const edge = Math.max(0, trueProb - staleProb);
  const perStakeLeak = edge * p.attackStake;

  const baselineLeak = p.attackerReactionMs < p.bookFeedDelayMs ? perStakeLeak : 0;
  const hitsCatenaccio = p.attackerReactionMs < p.repriceMs;
  const catenaccioLeak = hitsCatenaccio ? perStakeLeak : 0;

  return {
    edge,
    baselineLeak,
    catenaccioLeak,
    rejected: !hitsCatenaccio,
  };
}

/** Deterministic, seedable RNG so every replay is identical (and auditable). */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Triangular sample in [min,max] with mode — a realistic reaction-time shape. */
export function triangular(rng: () => number, min: number, mode: number, max: number): number {
  const u = rng();
  const c = (mode - min) / (max - min);
  if (u < c) return min + Math.sqrt(u * (max - min) * (mode - min));
  return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}
