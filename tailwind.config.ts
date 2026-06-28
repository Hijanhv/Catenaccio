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
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "SF Pro Display", "Inter", "system-ui", "sans-serif"],
        mono: ["SF Mono", "ui-monospace", "JetBrains Mono", "Menlo", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(10,160,110,0.18), 0 16px 50px -18px rgba(10,160,110,0.30)",
        soft: "0 12px 40px -16px rgba(15,23,42,0.16)",
        card: "0 1px 2px rgba(15,23,42,0.04), 0 8px 30px -14px rgba(15,23,42,0.14)",
      },
      keyframes: {
        flash: { "0%": { opacity: "0", transform: "scale(0.98)" }, "12%": { opacity: "1" }, "100%": { opacity: "0", transform: "scale(1)" } },
        pulseRing: { "0%": { boxShadow: "0 0 0 0 rgba(10,160,110,0.4)" }, "100%": { boxShadow: "0 0 0 16px rgba(10,160,110,0)" } },
        ticker: { from: { transform: "translateY(6px)", opacity: "0" }, to: { transform: "translateY(0)", opacity: "1" } },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-10px)" } },
      },
      animation: {
        flash: "flash 1.6s ease-out",
        pulseRing: "pulseRing 1.4s ease-out",
        ticker: "ticker 0.35s ease-out",
        float: "float 6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
