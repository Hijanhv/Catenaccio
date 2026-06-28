/**
 * Normalise raw TxLINE payloads into the engine's EngineEvent shape.
 * The engine only ever sees this clean, ordered event type — live or replayed.
 */

import { EngineEvent, MarketId } from "../engine/types";

/** Map a TxLINE odds object's market descriptor to our MarketId (best-effort). */
function mapMarket(superOddsType?: string, marketParameters?: string): MarketId | null {
  const t = `${superOddsType ?? ""} ${marketParameters ?? ""}`.toLowerCase();
  if (t.includes("1x2") || t.includes("match") || t.includes("result")) return "1X2";
  if ((t.includes("over") || t.includes("under") || t.includes("total")) && t.includes("2.5")) return "OU25";
  if (t.includes("btts") || t.includes("both teams")) return "BTTS";
  return null;
}

export function normalizeOdds(raw: any): EngineEvent | null {
  const market = mapMarket(raw.SuperOddsType, raw.MarketParameters);
  if (!market) return null;
  const pct: number[] = (raw.Pct ?? []).map((v: any) => Number(v)).filter((v: number) => !Number.isNaN(v));
  if (pct.length === 0) return null;
  const sum = pct.reduce((a, b) => a + b, 0) || 1;
  return {
    kind: "odds",
    fixtureId: Number(raw.FixtureId),
    messageId: String(raw.MessageId),
    ts: Number(raw.Ts) || Date.now(),
    market,
    inRunning: Boolean(raw.InRunning),
    gameState: Number(raw.GameState) || 0,
    consensus: pct.map((v) => v / sum),
  };
}

/** Soccer stat keys → our action label. (1/2 goals, 5/6 reds; +1000/2000 = halves) */
function actionFromStat(statKey: number): string | null {
  const base = statKey % 1000;
  if (base === 1) return "goal-home";
  if (base === 2) return "goal-away";
  if (base === 5) return "red-home";
  if (base === 6) return "red-away";
  return null;
}

export function normalizeScore(raw: any): EngineEvent | null {
  const d = raw.data ?? raw;
  if (!d.confirmed) return null; // act only on confirmed events
  const statKey = Number(d.statKey ?? d.type);
  const action = actionFromStat(statKey);
  if (!action) {
    // still surface clock/phase changes
    const gs = Number(d.gameState) || 0;
    if (gs === 3) return makeScore(d, "ht");
    if (gs === 5) return makeScore(d, "fulltime");
    return null;
  }
  return makeScore(d, action);
}

function makeScore(d: any, action: string): EngineEvent {
  return {
    kind: "score",
    fixtureId: Number(d.fixtureId),
    messageId: String(d.id ?? d.messageId ?? `${d.fixtureId}-${d.seq}`),
    ts: Number(d.ts) || Date.now(),
    seq: Number(d.seq) || 0,
    statKey: Number(d.statKey ?? d.type) || 0,
    confirmed: true,
    action,
    gameState: Number(d.gameState) || 0,
    clockSeconds: Number(d.clock?.seconds) || 0,
  };
}
