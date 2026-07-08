import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // bright "stadium daylight" surface ramp
        base: "#F6F8FB",
        panel: "#FFFFFF",
        panel2: "#EEF1F6",
        hair: "rgba(12,18,32,0.08)",
        // signature accents
        shield: "#0AA06E", // protected / our edge / up-candle green
        shield2: "#077E57",
        attack: "#E5484D", // courtsiding / leak / down-candle red
        gold: "#C08A1E",
        ink: "#0B0F16", // near-black text
        mut: "#566173",
        mut2: "#98A1B0",
        // cheerful secondary accents (used sparingly, for gradients + highlights)
        mint: "#22C58C",
        sky: "#4F9CF9",
        grape: "#7C3AED",
        sun: "#F5B301",
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "SF Pro Display", "Inter", "system-ui", "sans-serif"],
        mono: ["SF Mono", "ui-monospace", "JetBrains Mono", "Menlo", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(10,160,110,0.18), 0 16px 50px -18px rgba(10,160,110,0.30)",
        soft: "0 12px 40px -16px rgba(15,23,42,0.16)",
        card: "0 1px 2px rgba(15,23,42,0.04), 0 8px 30px -14px rgba(15,23,42,0.14)",
        lift: "0 1px 2px rgba(15,23,42,0.04), 0 22px 60px -20px rgba(10,160,110,0.28)",
      },
      keyframes: {
        flash: { "0%": { opacity: "0", transform: "scale(0.98)" }, "12%": { opacity: "1" }, "100%": { opacity: "0", transform: "scale(1)" } },
        pulseRing: { "0%": { boxShadow: "0 0 0 0 rgba(10,160,110,0.4)" }, "100%": { boxShadow: "0 0 0 16px rgba(10,160,110,0)" } },
        ticker: { from: { transform: "translateY(6px)", opacity: "0" }, to: { transform: "translateY(0)", opacity: "1" } },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-10px)" } },
        // new: cheerful ambient + micro-interactions
        gradientShift: { "0%,100%": { backgroundPosition: "0% 50%" }, "50%": { backgroundPosition: "100% 50%" } },
        drift: { "0%": { transform: "translate3d(0,0,0)" }, "50%": { transform: "translate3d(3%,-3%,0)" }, "100%": { transform: "translate3d(0,0,0)" } },
        sheen: { "0%": { transform: "translateX(-120%)" }, "100%": { transform: "translateX(220%)" } },
        glowPulse: { "0%,100%": { boxShadow: "0 0 0 0 rgba(10,160,110,0)" }, "50%": { boxShadow: "0 0 22px 2px rgba(10,160,110,0.28)" } },
        popIn: { "0%": { opacity: "0", transform: "translateY(8px) scale(0.98)" }, "100%": { opacity: "1", transform: "translateY(0) scale(1)" } },
        sparkle: { "0%,100%": { opacity: "0.25", transform: "scale(0.85)" }, "50%": { opacity: "1", transform: "scale(1.15)" } },
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        risePop: { "0%": { transform: "scale(1)" }, "40%": { transform: "scale(1.12)" }, "100%": { transform: "scale(1)" } },
      },
      animation: {
        flash: "flash 1.6s ease-out",
        pulseRing: "pulseRing 1.4s ease-out",
        ticker: "ticker 0.35s ease-out",
        float: "float 6s ease-in-out infinite",
        gradient: "gradientShift 14s ease infinite",
        drift: "drift 18s ease-in-out infinite",
        sheen: "sheen 2.6s ease-in-out infinite",
        glowPulse: "glowPulse 2.4s ease-in-out infinite",
        popIn: "popIn 0.5s cubic-bezier(0.22,1,0.36,1) both",
        sparkle: "sparkle 2.2s ease-in-out infinite",
        shimmer: "shimmer 2.4s linear infinite",
        risePop: "risePop 0.5s ease-out",
      },
    },
  },
  plugins: [],
};
export default config;
