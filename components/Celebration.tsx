"use client";

import { AnimatePresence, motion } from "framer-motion";

const COLORS = ["#0AA06E", "#22C58C", "#4F9CF9", "#F5B301", "#7C3AED"];
// deterministic burst directions so it renders identically each time
const PARTICLES = Array.from({ length: 22 }, (_, i) => {
  const a = (i / 22) * Math.PI * 2;
  const r = 60 + (i % 5) * 16;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r, c: COLORS[i % COLORS.length], s: 5 + (i % 3) * 2 };
});

/** A quick cheerful confetti burst. Mount it with a changing `keyId` to re-fire. */
export function Celebration({ keyId }: { keyId: string | number | null }) {
  return (
    <AnimatePresence>
      {keyId != null && (
        <motion.div
          key={keyId}
          className="pointer-events-none absolute inset-0 z-20 grid place-items-center"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {PARTICLES.map((p, i) => (
            <motion.span
              key={i}
              className="absolute rounded-[2px]"
              style={{ width: p.s, height: p.s, background: p.c }}
              initial={{ x: 0, y: 0, scale: 0, opacity: 1, rotate: 0 }}
              animate={{ x: p.x, y: p.y, scale: [0, 1, 0.8], opacity: [1, 1, 0], rotate: 180 }}
              transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
