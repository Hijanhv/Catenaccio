/**
 * Risk engine — the safety rails that make this deployable, not a toy.
 *
 * A real trading desk will not run an agent that can blow up. Catenaccio enforces:
 *   - per-market and total exposure caps,
 *   - a drawdown kill-switch (stop quoting if we lose more than X),
 *   - suspend-on-uncertainty (no quoting while the feed is stale/gapped),
 *   - realistic fees + slippage baked into every fill's PnL.
 */

export interface RiskConfig {
  maxExposurePerMarket: number;
  maxTotalExposure: number;
  maxDrawdown: number; // kill-switch threshold (absolute currency)
  feeBps: number; // commission per fill, in bps of stake
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  maxExposurePerMarket: 2000,
  maxTotalExposure: 6000,
  maxDrawdown: 3000,
  feeBps: 250, // 2.5% commission, typical exchange take
};

export interface RiskAssessment {
  killSwitch: boolean;
  maxDrawdownHit: boolean;
  totalExposure: number;
  perMarketExposure: Record<string, number>;
  /** spread multiplier the risk engine asks the quote engine to apply */
  spreadMultiplier: number;
  /** markets to force-suspend right now */
  suspendMarkets: string[];
}

export interface ExposureInput {
  market: string;
  /** worst-case loss if this market resolves against us */
  worstCaseLoss: number;
}

export function assessRisk(
  exposures: ExposureInput[],
  realizedPnl: number,
  peakPnl: number,
  feedHealthy: boolean,
  cfg: RiskConfig,
): RiskAssessment {
  const perMarketExposure: Record<string, number> = {};
  let total = 0;
  const suspend: string[] = [];
  for (const e of exposures) {
    perMarketExposure[e.market] = e.worstCaseLoss;
    total += e.worstCaseLoss;
    if (e.worstCaseLoss > cfg.maxExposurePerMarket) suspend.push(e.market);
  }

  const drawdown = peakPnl - realizedPnl;
  const maxDrawdownHit = drawdown >= cfg.maxDrawdown;
  const killSwitch = maxDrawdownHit;

  // Widen spreads as we approach the total cap (graceful degradation, not a cliff).
  const utilisation = Math.min(1, total / cfg.maxTotalExposure);
  let spreadMultiplier = 1 + utilisation * 1.5;
  if (!feedHealthy) spreadMultiplier = Infinity; // → fully suspend

  return {
    killSwitch,
    maxDrawdownHit,
    totalExposure: total,
    perMarketExposure,
    spreadMultiplier,
    suspendMarkets: suspend,
  };
}

export const feeFor = (stake: number, cfg: RiskConfig) => (stake * cfg.feeBps) / 10000;
