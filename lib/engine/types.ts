/** Shared domain types for the Catenaccio agent. */

export type MarketId = "1X2" | "OU25" | "BTTS";

/** Each market's outcomes, in canonical order. */
export const OUTCOMES: Record<MarketId, string[]> = {
  "1X2": ["Home", "Draw", "Away"],
  OU25: ["Over 2.5", "Under 2.5"],
  BTTS: ["Yes", "No"],
};

export const MARKET_LABEL: Record<MarketId, string> = {
  "1X2": "Match Result",
  OU25: "Over / Under 2.5 Goals",
  BTTS: "Both Teams To Score",
};

/** A normalised odds update derived from TxLINE `/api/odds/stream`. */
export interface OddsTick {
  kind: "odds";
  fixtureId: number;
  messageId: string;
  ts: number;
  market: MarketId;
  inRunning: boolean;
  gameState: number;
  /** de-margined consensus implied probs (TxLINE `Pct`), per outcome */
  consensus: number[];
}

/** A normalised scores update derived from TxLINE `/api/scores/stream`. */
export interface ScoreEvent {
  kind: "score";
  fixtureId: number;
  messageId: string;
  ts: number;
  seq: number;
  statKey: number;
  confirmed: boolean;
  /** "goal-home" | "goal-away" | "red-home" | "red-away" | "kickoff" | "ht" | "fulltime" */
  action: string;
  gameState: number;
  clockSeconds: number;
}

/** Feed-health events, emitted by the resilient SSE layer. */
export interface FeedEvent {
  kind: "feed";
  ts: number;
  status: "connected" | "suspended" | "backfilling" | "resumed";
  detail?: string;
}

/** A wall-clock tick that advances the match time between updates. */
export interface ClockTick {
  kind: "clock";
  ts: number;
  clockSeconds: number;
}

export type EngineEvent = OddsTick | ScoreEvent | FeedEvent | ClockTick;

export interface Quote {
  outcome: string;
  fair: number; // fair probability
  bid: number; // price (decimal odds) we buy at
  ask: number; // price we sell at
  suspended: boolean;
}

export interface MarketBook {
  market: MarketId;
  quotes: Quote[];
  /** signed inventory per outcome (positive = we are long that outcome paying out) */
  inventory: number[];
  spreadBps: number;
  suspended: boolean;
}

export interface Fill {
  id: string;
  ts: number;
  market: MarketId;
  outcome: string;
  /** "back" = counterparty backs the outcome (we lay it); "lay" = opposite */
  side: "back" | "lay";
  price: number;
  stake: number;
  fee: number;
  counterparty: "flow" | "courtsider";
  /** messageId of the odds/score datum that priced this fill (for the proof) */
  sourceMessageId: string;
  /** if a courtsider tried to pick us off, did the stale price still exist? */
  pickedOff: boolean;
  /** index of the decision-log leaf this fill produced (for Merkle proof) */
  decisionSeq?: number;
}

export interface DecisionRecord {
  seq: number;
  ts: number;
  type: "quote" | "reprice" | "fill" | "risk" | "feed";
  /** TxLINE messageIds that fed this decision (the verifiable inputs) */
  inputMessageIds: string[];
  summary: string;
  /** canonical serialisation that becomes a Merkle leaf */
  leaf: string;
}

/** A prediction signal derived from the same fair-value engine that prices the book. */
export interface Signal {
  ts: number;
  kind: "value" | "sharp";
  market: MarketId;
  outcome: string;
  detail: string;
  /** model minus market, in percentage points (value signals) */
  edgePct?: number;
  /** 0..1, for ranking/intensity */
  strength: number;
}

/**
 * A settlement receipt: how a market's outcome resolves against Merkle-proven
 * TxLINE scores via Txoracle's `validate_stat` predicate. This is the agent's
 * settlement step, and it is verifiable rather than trusted.
 */
export interface SettlementReceipt {
  market: MarketId;
  winner: string;
  pnl: number;
  /** human-readable predicate, e.g. "homeGoals - awayGoals > 0" */
  predicate: string;
  /** TxLINE soccer stat keys the predicate reads */
  statKeys: number[];
  /** the scores datum that proves it */
  txlineProof: { fixtureId: number; seq: number };
  program: string;
  instruction: string;
  verified: boolean;
  simulated: boolean;
}

export interface RiskState {
  totalExposure: number;
  maxDrawdownHit: boolean;
  killSwitch: boolean;
  perMarketExposure: Record<string, number>;
}

export interface EngineSnapshot {
  ts: number;
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  score: { home: number; away: number };
  redCards: { home: number; away: number };
  clockSeconds: number;
  phaseLabel: string;
  feedStatus: FeedEvent["status"];
  books: MarketBook[];
  consensus: Record<MarketId, number[]>;
  realizedPnl: number;
  unrealizedPnl: number;
  fees: number;
  risk: RiskState;
  lastRepriceMs: number | null;
  arbPrevented: number; // $ of latency-arb denied to courtsiders
  arbLeakedBaseline: number; // $ a naive (broadcast-delayed) book would have leaked
  decisionCount: number;
  merkleRoot: string;
  recentFills: Fill[];
  recentDecisions: DecisionRecord[];
  lastGoal: { team: "home" | "away"; clockSeconds: number; repriceMs: number } | null;
  /** live prediction signals from the fair-value engine */
  recentSignals: Signal[];
  /** settlement receipts, populated at full time */
  settlements: SettlementReceipt[];
}
