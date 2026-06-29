"use client";

/**
 * Catenaccio mark — an aesthetic football. Clean geometric soccer ball with an
 * emerald centre panel (our signature pitch-green) and charcoal seams. Reads
 * crisp from 16px to 160px.
 */

export function LogoMark({ size = 36, className = "" }: { size?: number; className?: string }) {
  const id = `ball-${Math.round(size)}`;
  // central pentagon
  const pent = "32,23 40.56,29.22 37.29,39.28 26.71,39.28 23.44,29.22";
  // seams from each pentagon vertex outward
  const seams: [number, number, number, number][] = [
    [32, 23, 32, 8],
    [40.56, 29.22, 54.82, 24.58],
    [37.29, 39.28, 46.11, 51.42],
    [26.71, 39.28, 17.89, 51.42],
    [23.44, 29.22, 9.18, 24.58],
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="14" y1="8" x2="50" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22C58C" />
          <stop offset="1" stopColor="#077E57" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="25" fill="#fff" stroke="#0B0F16" strokeWidth="2.4" />
      {seams.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#0B0F16" strokeWidth="1.8" strokeLinecap="round" />
      ))}
      <polygon points={pent} fill={`url(#${id})`} />
    </svg>
  );
}

export function Wordmark({ size = 34, sub = "In-Play Defense Engine" }: { size?: number; sub?: string }) {
  return (
    <div className="flex items-center gap-3 select-none">
      <LogoMark size={size} />
      <div className="leading-none">
        <div className="font-semibold tracking-[0.12em] text-ink" style={{ fontSize: size * 0.48 }}>
          CATENACCIO
        </div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-mut">{sub}</div>
      </div>
    </div>
  );
}
