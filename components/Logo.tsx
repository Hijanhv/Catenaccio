"use client";

/**
 * Catenaccio mark, a red football ringed by grass green. Classic white panels
 * (centre pentagon + seams) keep it unmistakably a football; the green ring is the
 * pitch. Reads crisp from 16px to 160px. ("Catenaccio" = the defensive bolt.)
 */

export function LogoMark({ size = 36, className = "" }: { size?: number; className?: string }) {
  const id = `ball-${Math.round(size)}`;
  const pent = "32,22 41.03,28.56 37.58,39.18 26.42,39.18 22.97,28.56";
  const seams: [number, number, number, number][] = [
    [32, 22, 32, 8],
    [41.03, 28.56, 55.3, 24.2],
    [37.58, 39.18, 46.9, 51.6],
    [26.42, 39.18, 17.1, 51.6],
    [22.97, 28.56, 8.7, 24.2],
  ];
  // small panels at the outer seam tips, for a real football read
  const tips: [number, number][] = [
    [32, 8],
    [55.3, 24.2],
    [46.9, 51.6],
    [17.1, 51.6],
    [8.7, 24.2],
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="12" y1="8" x2="52" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EF4A3F" />
          <stop offset="1" stopColor="#C21E1C" />
        </linearGradient>
      </defs>
      {/* pitch-green ring */}
      <circle cx="32" cy="32" r="30" fill="none" stroke="#12924E" strokeWidth="3" />
      {/* the red ball */}
      <circle cx="32" cy="32" r="25.5" fill={`url(#${id})`} stroke="#0C1A10" strokeWidth="1.4" />
      {/* white seams */}
      {seams.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" opacity="0.95" />
      ))}
      {/* outer white panels */}
      {tips.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="2.1" fill="#ffffff" opacity="0.9" />
      ))}
      {/* centre white pentagon */}
      <polygon points={pent} fill="#ffffff" />
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
