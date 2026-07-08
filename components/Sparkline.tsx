"use client";

import { motion } from "framer-motion";

/** A live equity curve. Feeds smoothly as new P&L points arrive; last point pulses. */
export function Sparkline({ data, height = 44, up = true }: { data: number[]; height?: number; up?: boolean }) {
  const w = 260;
  const h = height;
  if (data.length < 2) {
    return <div className="h-[44px] w-full rounded-lg shimmer opacity-60" style={{ height }} />;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = 4;
  const x = (i: number) => (i / (data.length - 1)) * (w - pad * 2) + pad;
  const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2);
  const pts = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const line = `M ${pts.join(" L ")}`;
  const area = `${line} L ${x(data.length - 1)},${h} L ${x(0)},${h} Z`;
  const stroke = up ? "#0AA06E" : "#E5484D";
  const lastX = x(data.length - 1);
  const lastY = y(data[data.length - 1]);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark-fill)" />
      <motion.path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={false}
        animate={{ d: line }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      />
      <circle cx={lastX} cy={lastY} r="3.4" fill={stroke} />
      <circle cx={lastX} cy={lastY} r="3.4" fill={stroke} className="animate-ping" style={{ transformOrigin: `${lastX}px ${lastY}px` }} />
    </svg>
  );
}
