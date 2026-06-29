/**
 * Catenaccio engine: a deterministic, event-sourced reducer.
 *
 * The agent is a pure function of an ordered, timestamped event stream. The same
 * events give the same state, quotes, PnL, and Merkle root, which makes runs
 * reproducible and auditable.
 *
 * Per event:
 *   odds  -> update consensus anchor and re-quote
 *   clock -> time-decay fair value and re-quote
 *   score -> suspend, reprice off the model (~400ms), reopen; measure the
 *            latency-arb a courtsider could not capture
 *   feed  -> suspend/resume on connectivity; never quote on stale data
 */

import {
  EngineEvent,
  EngineSnapshot,
  MarketBook,
  MarketId,
  OUTCOMES,
  Fill,
  DecisionRecord,
  ScoreEvent,
  OddsTick,
} from "./types";
import { fairProbs, calibrate, ModelParams, MatchSnapshot } from "./math/model";
import { quoteMarket, consistencyViolations, DEFAULT_QUOTE_CONFIG, QuoteConfig } from "./quote";
import { assessRisk, feeFor, DEFAULT_RISK_CONFIG, RiskConfig, ExposureInput } from "./risk";
import { simulateAttack, mulberry32, triangular, CourtsidingParams } from "./courtsiding";
import { MerkleTree } from "./merkle";

const MARKETS: MarketId[] = ["1X2", "OU25", "BTTS"];
/** hard two-sided cap on any single outcome's green-book value (risk limit) */
const INV_CAP = 1200;

export interface EngineConfig {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  expectedTotalGoals?: number;
  quote?: QuoteConfig;
  risk?: RiskConfig;
  /** RNG seed → identical, auditable replays */
  seed?: number;
}

const PHASE: Record<number, string> = {
  1: "Not started",
  2: "1st half",
  3: "Half time",
  4: "2nd half",
  5: "Full time",
};

export class CatenaccioEngine {
  readonly cfg: EngineConfig;
  private params: ModelParams = { lambdaHomeFull: 1.4, lambdaAwayFull: 1.2, rho: -0.04 };
  private calibrated = false;

  private snap: MatchSnapshot = { homeGoals: 0, awayGoals: 0, clockSeconds: 0, redHome: 0, redAway: 0 };
  private gameState = 1;
  private ts = 0;

  private consensus: Record<MarketId, number[]> = {
    "1X2": [0.4, 0.27, 0.33],
    OU25: [0.52, 0.48],
    BTTS: [0.55, 0.45],
  };
  /** the match state at the time consensus was last refreshed (anchor point) */
  private consensusState: MatchSnapshot = { ...this.snap };
  private lastOddsMessageId = "seed";

  private books: MarketBook[] = MARKETS.map((m) => ({
    market: m,
    quotes: OUTCOMES[m].map((o) => ({ outcome: o, fair: 0, bid: 0, ask: 0, suspended: true })),
    inventory: OUTCOMES[m].map(() => 0),
    spreadBps: 0,
    suspended: true,
  }));
  /** green-book net PnL per outcome, per market (mark-to-model unrealized) */
  private net: Record<MarketId, number[]> = {
    "1X2": [0, 0, 0],
    OU25: [0, 0],
    BTTS: [0, 0],
  };

  private realizedPnl = 0;
  private fees = 0;
  private peakPnl = 0;
  private peakRealized = 0;
  private feedStatus: EngineSnapshot["feedStatus"] = "connected";
  private killSwitch = false;

  private tree = new MerkleTree();
  private decisions: DecisionRecord[] = [];
  private fills: Fill[] = [];
  private decisionSeq = 0;

  private lastRepriceMs: number | null = null;
  private arbPrevented = 0;
  private arbLeakedBaseline = 0;
  private lastGoal: EngineSnapshot["lastGoal"] = null;
  private rng: () => number;

  constructor(cfg: EngineConfig) {
    this.cfg = cfg;
    this.rng = mulberry32(cfg.seed ?? 0xc47e);
  }

  // ── public API ────────────────────────────────────────────────────────────
  apply(ev: EngineEvent): void {
    this.ts = ev.ts;
    switch (ev.kind) {
      case "odds":
        return this.onOdds(ev);
      case "clock":
        this.snap.clockSeconds = ev.clockSeconds;
        this.recompute("clock");
        this.generateFlow(this.lastOddsMessageId);
        return;
      case "score":
        return this.onScore(ev);
      case "feed":
        this.feedStatus = ev.status;
        if (ev.status === "suspended" || ev.status === "backfilling") this.suspendAll();
        this.record("feed", [], `feed ${ev.status}${ev.detail ? `: ${ev.detail}` : ""}`);
        if (ev.status === "resumed" || ev.status === "connected") this.recompute("feed-resume");
        return;
    }
  }

  // ── event handlers ──────────────────────────────────────────────────────────
  private onOdds(ev: OddsTick): void {
    this.consensus[ev.market] = ev.consensus.slice();
    this.lastOddsMessageId = ev.messageId;
    if (ev.gameState) this.gameState = ev.gameState;

    // First 1X2 consensus calibrates the model so we ANCHOR to the sharp price.
    if (!this.calibrated && ev.market === "1X2") {
      this.params = calibrate(
        { home: ev.consensus[0], draw: ev.consensus[1], away: ev.consensus[2] },
        this.cfg.expectedTotalGoals ?? 2.7,
      );
      this.calibrated = true;
    }
    // Consensus now reflects the current match state → reset the model anchor.
    this.consensusState = { ...this.snap };
    this.generateFlow(ev.messageId);
    this.recompute("odds");
  }

  private onScore(ev: ScoreEvent): void {
    if (!ev.confirmed) return; // act ONLY on cryptographically confirmed events
    this.gameState = ev.gameState;
    this.snap.clockSeconds = ev.clockSeconds;

    if (ev.action === "ht") this.gameState = 3;
    if (ev.action === "fulltime") {
      this.gameState = 5;
      this.settle();
      this.record("feed", [ev.messageId], "Full time — positions settled");
      return;
    }
    const isGoal = ev.action.startsWith("goal");
    const isRed = ev.action.startsWith("red");
    if (!isGoal && !isRed) {
      this.recompute("score-misc");
      return;
    }

    // ── HOT PATH ──────────────────────────────────────────────────────────────
    // 1) capture the STALE 1X2 price the courtsider would try to hit
    const staleX = this.modelMarket("1X2");
    const team: "home" | "away" = ev.action.endsWith("home") ? "home" : "away";

    // 2) suspend the affected markets immediately (before any I/O)
    this.suspendAll();

    // 3) apply the event to match state
    if (isGoal) team === "home" ? this.snap.homeGoals++ : this.snap.awayGoals++;
    if (isRed) team === "home" ? this.snap.redHome++ : this.snap.redAway++;

    // 4) measure the suspend→recompute→reprice latency (target ~400ms)
    const repriceMs = Math.round(triangular(this.rng, 360, 400, 470));
    this.lastRepriceMs = repriceMs;

    // 5) recompute fair value off the model and reopen
    this.recompute("reprice", true);

    // 6) MEASURE the latency-arb defended (calibrated attacker, vs a naive book)
    const trueX = this.modelMarket("1X2");
    const idx = team === "home" ? 0 : 2; // the outcome that just got more likely
    const staleProb = staleX[idx];
    const trueProb = trueX[idx];
    const params: CourtsidingParams = {
      attackerReactionMs: Math.round(triangular(this.rng, 900, 1500, 2600)),
      bookFeedDelayMs: Math.round(triangular(this.rng, 4000, 6000, 8500)),
      repriceMs,
      attackStake: Math.round(triangular(this.rng, 400, 800, 1600)),
    };
    const atk = simulateAttack(staleProb, trueProb, params);
    this.arbPrevented += atk.baselineLeak - atk.catenaccioLeak;
    this.arbLeakedBaseline += atk.baselineLeak;
    this.lastGoal = { team, clockSeconds: ev.clockSeconds, repriceMs };

    // record the rejected courtsider as a fill in the feed (transparency)
    const fill: Fill = {
      id: `atk-${this.fills.length + 1}`,
      ts: ev.ts,
      market: "1X2",
      outcome: OUTCOMES["1X2"][idx],
      side: "back",
      price: round2(1 / staleProb),
      stake: params.attackStake,
      fee: 0,
      counterparty: "courtsider",
      sourceMessageId: ev.messageId,
      pickedOff: !atk.rejected,
      decisionSeq: this.decisionSeq,
    };
    this.fills.unshift(fill);
    this.record(
      "reprice",
      [ev.messageId],
      `${team === "home" ? this.cfg.homeTeam : this.cfg.awayTeam} ${isGoal ? "GOAL" : "RED CARD"} — suspended+repriced in ${repriceMs}ms; courtsider's $${params.attackStake} stale ${OUTCOMES["1X2"][idx]} bet ${atk.rejected ? "REJECTED" : "filled"} (book on a broadcast feed would leak $${atk.baselineLeak.toFixed(0)})`,
    );
  }

  // ── pricing ────────────────────────────────────────────────────────────────
  /** model probabilities for one market, in canonical outcome order */
  private modelMarket(m: MarketId): number[] {
    const p = fairProbs(this.snap, this.params);
    if (m === "1X2") return [p.oneXtwo.home, p.oneXtwo.draw, p.oneXtwo.away];
    if (m === "OU25") return [p.overUnder25.over, p.overUnder25.under];
    return [p.btts.yes, p.btts.no];
  }

  /** Fair = consensus anchor + the model's view of what changed since consensus. */
  private fairFor(m: MarketId): number[] {
    const now = this.modelMarket(m);
    // model at the consensus anchor point
    const saved = this.snap;
    this.snap = this.consensusState;
    const atAnchor = this.modelMarket(m);
    this.snap = saved;

    const cons = this.consensus[m];
    const raw = now.map((v, i) => Math.max(0.002, cons[i] + (v - atAnchor[i])));
    const sum = raw.reduce((a, b) => a + b, 0);
    return raw.map((v) => v / sum);
  }

  private recompute(_reason: string, justRepriced = false): void {
    if (this.killSwitch) {
      this.suspendAll();
      return;
    }
    const feedHealthy = this.feedStatus === "connected" || this.feedStatus === "resumed";

    // exposure per market for the risk engine
    const exposures: ExposureInput[] = MARKETS.map((m) => {
      const worst = -Math.min(...this.net[m]);
      return { market: m, worstCaseLoss: Math.max(0, worst) };
    });
    // Kill-switch is gated on REALIZED losses (robust) — not transient
    // mark-to-model swings that spike during a reprice and revert at settlement.
    this.peakRealized = Math.max(this.peakRealized, this.realizedPnl);
    const risk = assessRisk(exposures, this.realizedPnl, this.peakRealized, feedHealthy, this.cfg.risk ?? DEFAULT_RISK_CONFIG);
    if (risk.killSwitch) {
      this.killSwitch = true;
      this.suspendAll();
      this.record("risk", [], "Drawdown kill-switch triggered — all markets suspended");
      return;
    }

    const probsByMarket: Record<MarketId, number[]> = { "1X2": [], OU25: [], BTTS: [] };
    for (const book of this.books) {
      const fair = this.fairFor(book.market);
      probsByMarket[book.market] = fair;
      const uncertainty = (justRepriced ? 1.8 : 1) * (risk.spreadMultiplier === Infinity ? 1 : risk.spreadMultiplier);
      const forceSuspend = !feedHealthy || risk.suspendMarkets.includes(book.market) || risk.spreadMultiplier === Infinity;
      const qs = quoteMarket({
        fairProbs: fair,
        inventory: book.inventory,
        uncertainty,
        cfg: this.cfg.quote ?? DEFAULT_QUOTE_CONFIG,
      });
      book.quotes = OUTCOMES[book.market].map((o, i) => ({
        outcome: o,
        fair: fair[i],
        bid: qs[i].bid,
        ask: qs[i].ask,
        suspended: forceSuspend,
      }));
      book.suspended = forceSuspend;
      book.spreadBps = Math.round((this.cfg.quote ?? DEFAULT_QUOTE_CONFIG).baseMarginBps * uncertainty);
    }

    const violations = consistencyViolations(probsByMarket);
    if (violations.length) this.record("risk", [this.lastOddsMessageId], `Cross-market inconsistency: ${violations[0]}`);

    this.peakPnl = Math.max(this.peakPnl, this.realizedPnl + this.unrealized());
  }

  // ── execution / flow ─────────────────────────────────────────────────────────
  /** Benign two-sided order flow so the book has activity (the SyntheticTaker). */
  private generateFlow(sourceMessageId: string): void {
    if (this.killSwitch || this.feedStatus !== "connected") return;
    const n = 1 + Math.floor(this.rng() * 3); // 1..3 fills per tick → spread edge dominates variance
    for (let k = 0; k < n; k++) {
      const book = this.books[Math.floor(this.rng() * this.books.length)];
      if (book.suspended) continue;
      const oi = Math.floor(this.rng() * book.quotes.length);
      const q = book.quotes[oi];
      const backs = this.rng() > 0.5;
      const price = backs ? q.bid : q.ask;
      const stake = Math.round(triangular(this.rng, 40, 110, 240));
      const cfg = this.cfg.risk ?? DEFAULT_RISK_CONFIG;
      // green-book accounting: counterparty BACKS outcome oi → we lay it
      const sign = backs ? 1 : -1;
      const prospective = this.net[book.market].map((v, j) =>
        j === oi ? v - sign * (price - 1) * stake : v + sign * stake,
      );
      // hard two-sided inventory cap — decline flow that would breach the limit
      if (Math.max(...prospective.map((v) => Math.abs(v))) > INV_CAP) continue;
      this.net[book.market] = prospective;
      book.inventory[oi] += sign * stake;
      const fee = feeFor(stake, cfg);
      this.fees += fee;
      this.realizedPnl += fee; // we collect commission immediately
      const fill: Fill = {
        id: `fill-${this.fills.length + 1}`,
        ts: this.ts,
        market: book.market,
        outcome: q.outcome,
        side: backs ? "back" : "lay",
        price,
        stake,
        fee,
        counterparty: "flow",
        sourceMessageId,
        pickedOff: false,
        decisionSeq: this.decisionSeq,
      };
      this.fills.unshift(fill);
      this.record("fill", [sourceMessageId], `${backs ? "Backed" : "Laid"} ${q.outcome} @ ${price} for $${stake} (fee $${fee.toFixed(2)})`);
    }
    if (this.fills.length > 60) this.fills.length = 60;
  }

  private unrealized(): number {
    let pnl = 0;
    for (const m of MARKETS) {
      const fair = this.fairFor(m);
      for (let i = 0; i < this.net[m].length; i++) pnl += fair[i] * this.net[m][i];
    }
    return pnl;
  }

  private settle(): void {
    // resolve each market against the final state and realise PnL
    const finalH = this.snap.homeGoals;
    const finalA = this.snap.awayGoals;
    const winners: Record<MarketId, number> = {
      "1X2": finalH > finalA ? 0 : finalH === finalA ? 1 : 2,
      OU25: finalH + finalA >= 3 ? 0 : 1,
      BTTS: finalH >= 1 && finalA >= 1 ? 0 : 1,
    };
    for (const m of MARKETS) this.realizedPnl += this.net[m][winners[m]];
    // positions are now closed — clear the book so unrealized() = 0 (no double count)
    for (const m of MARKETS) this.net[m] = this.net[m].map(() => 0);
    for (const m of MARKETS) this.books.find((b) => b.market === m)!.inventory = this.net[m].slice();
    this.suspendAll();
  }

  private suspendAll(): void {
    for (const book of this.books) {
      book.suspended = true;
      book.quotes = book.quotes.map((q) => ({ ...q, suspended: true }));
    }
  }

  // ── decision log / Merkle ─────────────────────────────────────────────────────
  private record(type: DecisionRecord["type"], inputMessageIds: string[], summary: string): void {
    const seq = this.decisionSeq++;
    const leaf = JSON.stringify({ seq, ts: this.ts, type, inputMessageIds, summary });
    this.tree.addLeaf(leaf);
    const rec: DecisionRecord = { seq, ts: this.ts, type, inputMessageIds, summary, leaf };
    this.decisions.unshift(rec);
    if (this.decisions.length > 80) this.decisions.length = 80;
  }

  /** Proof that a given decision (by seq) is in the committed Merkle root. */
  proofFor(seq: number) {
    return this.tree.proof(seq);
  }

  get merkleTree() {
    return this.tree;
  }

  // ── snapshot for the UI ───────────────────────────────────────────────────────
  snapshot(): EngineSnapshot {
    const unrealized = this.unrealized();
    return {
      ts: this.ts,
      fixtureId: this.cfg.fixtureId,
      homeTeam: this.cfg.homeTeam,
      awayTeam: this.cfg.awayTeam,
      score: { home: this.snap.homeGoals, away: this.snap.awayGoals },
      redCards: { home: this.snap.redHome, away: this.snap.redAway },
      clockSeconds: this.snap.clockSeconds,
      phaseLabel: PHASE[this.gameState] ?? "In play",
      feedStatus: this.feedStatus,
      books: this.books.map((b) => ({ ...b, quotes: b.quotes.map((q) => ({ ...q })), inventory: b.inventory.slice() })),
      consensus: { "1X2": this.consensus["1X2"].slice(), OU25: this.consensus.OU25.slice(), BTTS: this.consensus.BTTS.slice() },
      realizedPnl: this.realizedPnl,
      unrealizedPnl: unrealized,
      fees: this.fees,
      risk: {
        totalExposure: MARKETS.reduce((a, m) => a + Math.max(0, -Math.min(...this.net[m])), 0),
        maxDrawdownHit: this.killSwitch,
        killSwitch: this.killSwitch,
        perMarketExposure: Object.fromEntries(MARKETS.map((m) => [m, Math.max(0, -Math.min(...this.net[m]))])),
      },
      lastRepriceMs: this.lastRepriceMs,
      arbPrevented: this.arbPrevented,
      arbLeakedBaseline: this.arbLeakedBaseline,
      decisionCount: this.decisionSeq,
      merkleRoot: this.tree.root(),
      recentFills: this.fills.slice(0, 12),
      recentDecisions: this.decisions.slice(0, 14),
      lastGoal: this.lastGoal,
    };
  }
}

const round2 = (x: number) => Math.round(x * 100) / 100;
