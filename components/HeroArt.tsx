"use client";

import { motion } from "framer-motion";

/**
 * Hero illustration, a football riding a rising in-play market.
 * Candlesticks build in, the trend line draws itself, a live-price marker sweeps
 * the chart, and the ball floats and slowly rotates. One responsive SVG,
 * animated with Framer Motion.
 */

const BASE = 352;
const CANDLES: { x: number; top: number; bot: number; up: boolean }[] = [
  { x: 46, top: 300, bot: 332, up: true },
  { x: 84, top: 286, bot: 320, up: false },
  { x: 122, top: 262, bot: 300, up: true },
  { x: 160, top: 246, bot: 284, up: true },
  { x: 198, top: 258, bot: 290, up: false },
  { x: 236, top: 222, bot: 262, up: true },
  { x: 274, top: 198, bot: 240, up: true },
  { x: 312, top: 168, bot: 214, up: true },
];

const MIDS = CANDLES.map((c) => [c.x, (c.top + c.bot) / 2] as const);
const TREND = MIDS.map(([x, y]) => `${x},${y}`).join(" ") + " 350,150";

// football geometry in 64-space (matches the logo)
const PENT = "32,23 40.56,29.22 37.29,39.28 26.71,39.28 23.44,29.22";
const SEAMS: [number, number, number, number][] = [
  [32, 23, 32, 8],
  [40.56, 29.22, 54.82, 24.58],
  [37.29, 39.28, 46.11, 51.42],
  [26.71, 39.28, 17.89, 51.42],
  [23.44, 29.22, 9.18, 24.58],
];

export function HeroArt() {
  return (
    <div className="relative w-full" style={{ aspectRatio: "460 / 380" }}>
      <svg viewBox="0 0 460 380" className="absolute inset-0 h-full w-full">
        <defs>
          <radialGradient id="lift" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#12924E" stopOpacity="0.18" />
            <stop offset="1" stopColor="#12924E" stopOpacity="0" />
          </radialGradient>
          <filter id="dotGlow" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* glow under the ball */}
        <circle cx="372" cy="120" r="150" fill="url(#lift)" />

        {/* baseline */}
        <line x1="30" y1={BASE} x2="430" y2={BASE} stroke="rgba(12,18,32,0.10)" />

        {/* self-drawing trend line */}
        <motion.polyline
          points={TREND}
          fill="none"
          stroke="#12924E"
          strokeOpacity="0.5"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.6, ease: "easeInOut", delay: 0.5 }}
        />

        {/* candlesticks, wick fades in, body grows up from its base */}
        {CANDLES.map((c, i) => {
          const color = c.up ? "#12924E" : "#E5342B";
          const delay = 0.1 + i * 0.09;
          return (
            <g key={i}>
              <motion.line
                x1={c.x} y1={c.top - 13} x2={c.x} y2={c.bot + 13}
                stroke={color} strokeWidth="2"
                initial={{ opacity: 0 }} animate={{ opacity: 0.85 }}
                transition={{ delay, duration: 0.4 }}
              />
              <motion.rect
                x={c.x - 8} width="16" rx="3" fill={color}
                initial={{ y: c.bot, height: 0, opacity: 0.4 }}
                animate={{ y: c.top, height: c.bot - c.top, opacity: 0.92 }}
                transition={{ delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              />
            </g>
          );
        })}

        {/* live-price marker sweeping the chart */}
        <motion.circle
          r="5.5" fill="#12924E" filter="url(#dotGlow)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, cx: MIDS.map((m) => m[0]), cy: MIDS.map((m) => m[1]) }}
          transition={{ opacity: { delay: 1.6, duration: 0.4 }, cx: { delay: 1.6, duration: 3.6, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }, cy: { delay: 1.6, duration: 3.6, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" } }}
        />
        <motion.circle
          r="2.4" fill="#fff"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, cx: MIDS.map((m) => m[0]), cy: MIDS.map((m) => m[1]) }}
          transition={{ opacity: { delay: 1.6, duration: 0.4 }, cx: { delay: 1.6, duration: 3.6, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }, cy: { delay: 1.6, duration: 3.6, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" } }}
        />
      </svg>

      {/* football, floats + slowly rotates, in its own layer (no transform clash) */}
      <motion.div
        className="absolute"
        style={{ left: "60%", top: "6%", width: "33%" }}
        initial={{ opacity: 0, scale: 0.6, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: [0, -12, 0] }}
        transition={{ opacity: { duration: 0.5 }, scale: { type: "spring", stiffness: 140, damping: 12 }, y: { duration: 4.5, repeat: Infinity, ease: "easeInOut" } }}
      >
        <motion.svg
          viewBox="0 0 64 64" className="h-full w-full"
          style={{ filter: "drop-shadow(0 14px 18px rgba(11,15,22,0.16))", transformOrigin: "center" }}
          animate={{ rotate: 360 }}
          transition={{ duration: 26, repeat: Infinity, ease: "linear" }}
        >
          <defs>
            <linearGradient id="ballg" x1="14" y1="8" x2="50" y2="56" gradientUnits="userSpaceOnUse">
              <stop stopColor="#35C46B" />
              <stop offset="1" stopColor="#0C7A3E" />
            </linearGradient>
          </defs>
          <circle cx="32" cy="32" r="25" fill="#fff" stroke="#0B0F16" strokeWidth="2.2" />
          {SEAMS.map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#0B0F16" strokeWidth="1.6" strokeLinecap="round" />
          ))}
          <polygon points={PENT} fill="url(#ballg)" />
        </motion.svg>
      </motion.div>

      {/* speed badge, pops in, clear of the ball */}
      <motion.div
        className="absolute left-[3%] top-[5%] inline-flex items-center gap-2 rounded-full border border-hair bg-white px-3 py-1.5 shadow-card"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, type: "spring", stiffness: 200, damping: 16 }}
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-shield opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-shield" />
        </span>
        <span className="font-mono text-xs font-semibold text-ink">~400ms reprice</span>
      </motion.div>
    </div>
  );
}
