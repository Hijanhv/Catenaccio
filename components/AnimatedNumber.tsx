"use client";

import { useEffect } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";

/**
 * Smoothly counts from its previous value to the new one. Renders straight from a
 * motion value (no React re-render per frame), so it stays cheap even when it ticks.
 */
export function AnimatedNumber({
  value,
  format = (n: number) => Math.round(n).toLocaleString("en-US"),
  duration = 0.9,
  className = "",
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => {
    const controls = animate(mv, value, { duration, ease: [0.22, 1, 0.36, 1] });
    return controls.stop;
  }, [value, duration, mv]);
  return <motion.span className={className}>{text}</motion.span>;
}
