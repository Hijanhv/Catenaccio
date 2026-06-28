"use client";

import { mulberry32, triangular } from "@/lib/engine/courtsiding";

/**
 * "$ leaked vs. how fast you reprice" — the MEASURED defence, not a staged number.
 * y = avgLeakPerGoal × (fraction of courtsiders whose reaction beats your latency).
 */

const W = 340;
const H = 150;
const PAD = { l: 38, r: 12, t: 14, b: 26 };
const MAX_MS = 8000;

const ATTACKERS = (() => {
  const rng = mulberry32(0x5eed);
  return Array.from({ length: 600 }, () => triangular(rng, 900, 1500, 2600)).sort((a, b) => a - b);
})();

const fractionBeaten = (latencyMs: number) => {
  let lo = 0,
    hi = ATTACKERS.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ATTACKERS[mid] < latencyMs) lo = mid + 1;
    else hi = mid;
  }
  return lo / ATTACKERS.length;
};

export function SensitivityChart({ avgLeakPerGoal, repriceMs }: { avgLeakPerGoal: number; repriceMs: number }) {
  const leak = Math.max(20, avgLeakPerGoal);
  const x = (ms: number) => PAD.l + (ms / MAX_MS) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - (v / leak) * (H - PAD.t - PAD.b);

  const pts: string[] = [];
  for (let ms = 0; ms <= MAX_MS; ms += 160) pts.push(`${x(ms).toFixed(1)},${y(leak * fractionBeaten(ms)).toFixed(1)}`);
  const area = `M${x(0)},${y(0)} L${pts.join(" L")} L${x(MAX_MS)},${y(0)} Z`;

  const cat = { ms: repriceMs, leak: leak * fractionBeaten(repriceMs) };
  const book = { ms: 6000, leak: leak * fractionBeaten(6000) };

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <defs>
        <linearGradient id="leakFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E5484D" stopOpacity="0.28" />
          <stop offset="1" stopColor="#E5484D" stopOpacity="0.03" />
        </linearGradient>
      </defs>
      <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke="rgba(12,18,32,0.14)" />
      <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} stroke="rgba(12,18,32,0.14)" />
      <path d={area} fill="url(#leakFill)" stroke="#E5484D" strokeWidth="1.5" />

      <line x1={x(cat.ms)} y1={PAD.t} x2={x(cat.ms)} y2={H - PAD.b} stroke="#0AA06E" strokeDasharray="3 3" strokeWidth="1" />
      <circle cx={x(cat.ms)} cy={y(cat.leak)} r="4" fill="#0AA06E" />
      <text x={x(cat.ms) + 6} y={PAD.t + 10} fill="#0AA06E" fontSize="9" className="font-mono">
        Catenaccio {Math.round(cat.ms)}ms
      </text>

      <circle cx={x(book.ms)} cy={y(book.leak)} r="4" fill="#E5484D" />
      <text x={x(book.ms) - 4} y={y(book.leak) - 8} fill="#E5484D" fontSize="9" textAnchor="end" className="font-mono">
        broadcast book ~6s
      </text>

      <text x={PAD.l} y={H - 6} fill="#98A1B0" fontSize="8" className="font-mono">0</text>
      <text x={W - PAD.r} y={H - 6} fill="#98A1B0" fontSize="8" textAnchor="end" className="font-mono">8s reprice</text>
      <text x={6} y={PAD.t + 4} fill="#98A1B0" fontSize="8" className="font-mono">${Math.round(leak)}</text>
    </svg>
  );
}
