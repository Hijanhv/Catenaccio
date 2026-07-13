"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { LogoMark, Wordmark } from "./Logo";

const Pitch3D = dynamic(() => import("./Pitch3D"), {
  ssr: false,
  loading: () => <div className="h-[420px] w-full rounded-3xl shimmer" />,
});

const easeOut = [0.22, 1, 0.36, 1] as const;
/** fade + rise into view once */
function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, delay, ease: easeOut }}
    >
      {children}
    </motion.div>
  );
}

const STATS = [
  { k: "~400 ms", v: "reprice on a goal" },
  { k: "$0", v: "picked off" },
  { k: "3.16", v: "backtest Sharpe" },
  { k: "99%", v: "profitable matches" },
];

const COMPARE = [
  { label: "Reprice after a goal", book: "5 to 8 seconds", us: "~400 ms", bookBad: true },
  { label: "Latency-arb leaked / match", book: "~$640", us: "~$0", bookBad: true },
  { label: "Every price verifiable on-chain", book: "✕", us: "✓", bookBad: true },
  { label: "Runs autonomously (no desk babysitting)", book: "✕", us: "✓", bookBad: true },
  { label: "Deployable by any operator", book: "tier-1 only", us: "✓", bookBad: true },
];

const STEPS = [
  { n: "01", t: "Ingest", d: "Reads TxLINE’s live odds (the sharp consensus) and scores (confirmed goals) in real time." },
  { n: "02", t: "Reprice", d: "On a confirmed goal, it suspends → recomputes → reopens in ~400 ms. Deterministic, every time." },
  { n: "03", t: "Defend", d: "The courtsider’s stale bet is rejected. The money that would’ve leaked stays in your book." },
  { n: "04", t: "Prove", d: "Every price is anchored to authentic TxLINE data on Solana. Click any fill to verify it yourself." },
];

const FEATURES = [
  { t: "Measured ~400 ms reprice", d: "Suspend, reprice, and reopen the instant a goal is confirmed. The engine hot path is measured (sub-millisecond); ~400 ms is the end-to-end reaction budget. Verification and anchoring run in parallel and never block it." },
  { t: "Courtsider Cam", d: "A side-by-side comparison of a broadcast-delayed book and Catenaccio, with the dollars leaked on each, a measured figure from a calibrated attacker." },
  { t: "Signals from the model", d: "The same fair value that prices the book flags model-vs-market value and sharp consensus moves, live, and over MCP." },
  { t: "Risk and resilience", d: "Exposure caps, a drawdown kill-switch, real fees, and SSE reconnect with sequence-gap backfill." },
  { t: "Verifiable settlement", d: "Verify any fill against its TxLINE Merkle proof, and settle every market against the on-chain score via Txoracle validate_stat." },
  { t: "MCP server", d: "Exposes the agent's signals as tools another agent can call." },
  { t: "Sharp Movement Detector", d: "A standalone Rust binary that streams the odds feed and flags sharp in-play moves every 60 seconds (default 5pp), then tracks a follow-through hit-rate. Autonomous and unit-tested." },
  { t: "Agent vs Agent Arena", d: "Seeded strategies compete over a tournament on the same feed. The fastest-reacting agent wins, and the final standings are anchored on Solana devnet." },
  { t: "Real-data replay", d: "Replays real captured TxLINE odds through the same engine and times the reprice with performance.now, so the number is measured, not asserted. Reproducible with no credentials." },
];

export default function Landing() {
  return (
    <div className="min-h-screen">
      {/* ── sticky header ── */}
      <header className="sticky top-0 z-40 border-b border-hair bg-base/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Wordmark size={30} />
          <nav className="flex items-center gap-2 sm:gap-3">
            <a href="https://github.com/Hijanhv/Catenaccio" className="hidden text-sm font-medium text-mut hover:text-ink sm:block">GitHub</a>
            <a href="#how" className="hidden text-sm font-medium text-mut hover:text-ink sm:block">How it works</a>
            <Link href="/app" className="btn-primary text-sm">Launch app →</Link>
          </nav>
        </div>
      </header>

      {/* ── hero ── */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-12 md:grid-cols-2 md:py-20">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: easeOut }}>
          <div className="eyebrow"><span className="h-1.5 w-1.5 rounded-full bg-shield animate-pulse" />TxLINE × Solana · Trading Tools &amp; Agents</div>
          <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-5xl md:text-6xl">
            The defense for your <span className="grad-text">in-play</span> prices.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-mut">
            An autonomous football market-making agent that reprices in <strong className="text-ink">~400 ms</strong> the
            instant a goal is confirmed, so your book is never picked off by latency arbitrage. Every price is proven on-chain.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {STATS.map((s, i) => (
              <motion.div
                key={s.k}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.35 + i * 0.09, ease: easeOut }}
              >
                <div className="tnum text-2xl font-semibold grad-text">{s.k}</div>
                <div className="text-xs text-mut">{s.v}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>
        <motion.div
          className="order-first md:order-last"
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.1, ease: easeOut }}
        >
          <div className="mx-auto h-[420px] w-full max-w-[520px]">
            <Pitch3D />
          </div>
        </motion.div>
      </section>

      {/* ── the problem ── */}
      <section className="mx-auto max-w-6xl px-5 py-12">
        <div className="glass p-7 sm:p-10">
          <div className="text-xs uppercase tracking-[0.2em] text-mut">The problem · in plain English</div>
          <p className="mt-3 max-w-3xl text-xl leading-relaxed text-ink sm:text-2xl">
            When a goal is scored, the fair price changes <em>instantly</em>, but slow books take seconds to update.
            In that gap, someone who saw the goal first grabs the old price for <span className="text-shield">free money</span>.
            It’s called <strong>courtsiding</strong>, and it costs books millions. Today only bet365-tier firms react fast enough.
          </p>
        </div>
      </section>

      {/* ── comparison table ── */}
      <section className="mx-auto max-w-6xl px-5 py-8">
        <h2 className="text-center text-2xl font-semibold tracking-tight text-ink sm:text-3xl">The same goal, two books</h2>
        <div className="mt-8 overflow-hidden rounded-2xl border border-hair bg-white shadow-card">
          <div className="grid grid-cols-[1.4fr_1fr_1fr] border-b border-hair bg-panel2/60 text-sm font-medium">
            <div className="px-5 py-4 text-mut">Metric</div>
            <div className="px-5 py-4 text-center text-attack">Book on a broadcast feed</div>
            <div className="flex items-center justify-center gap-2 px-5 py-4 text-center text-shield">
              <LogoMark size={18} /> Catenaccio
            </div>
          </div>
          {COMPARE.map((r, i) => (
            <div key={r.label} className={`grid grid-cols-[1.4fr_1fr_1fr] items-center text-sm ${i % 2 ? "bg-panel2/30" : ""}`}>
              <div className="px-5 py-4 text-ink">{r.label}</div>
              <div className="tnum px-5 py-4 text-center text-attack">{r.book}</div>
              <div className="tnum px-5 py-4 text-center font-semibold text-shield">{r.us}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── how it works ── */}
      <section id="how" className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-center text-2xl font-semibold tracking-tight text-ink sm:text-3xl">How it works</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-mut">Four steps, fully autonomous, running on TxLINE’s verified feed.</p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.n}
              className="glass-hover group p-6"
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: i * 0.08, ease: easeOut }}
            >
              <div className="font-mono text-sm text-shield transition group-hover:animate-risePop">{s.n}</div>
              <div className="mt-2 text-lg font-semibold text-ink">{s.t}</div>
              <div className="mt-2 text-sm leading-relaxed text-mut">{s.d}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── features ── */}
      <section className="mx-auto max-w-6xl px-5 py-8">
        <h2 className="text-center text-2xl font-semibold tracking-tight text-ink sm:text-3xl">What&apos;s inside</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-mut">Every starter idea in the track, on one engine: an in-play market maker, a sharp-move detector, and an agent-vs-agent arena.</p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.t}
              className="glass-hover group p-6"
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: (i % 3) * 0.09, ease: easeOut }}
            >
              <div className="h-1.5 w-6 rounded-full bg-shield transition-all duration-300 group-hover:w-12 group-hover:bg-mint" />
              <div className="mt-4 text-lg font-semibold text-ink">{f.t}</div>
              <div className="mt-2 text-sm leading-relaxed text-mut">{f.d}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── numbers band ── */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <Reveal className="relative overflow-hidden rounded-2xl border border-hair bg-ink p-8 text-white shadow-lift sm:p-12">
          <div className="pointer-events-none absolute inset-0 animate-gradient bg-[radial-gradient(600px_240px_at_10%_-20%,rgba(34,197,140,0.22),transparent_60%),radial-gradient(600px_240px_at_100%_120%,rgba(79,156,249,0.18),transparent_60%)] bg-[length:200%_200%]" />
          <div className="relative">
            <div className="text-xs uppercase tracking-[0.2em] text-white/50">Backtested across 500 simulated matches</div>
            <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
              {[
                { k: "+$2,629", v: "mean P&L / match" },
                { k: "3.16", v: "Sharpe" },
                { k: "99%", v: "profitable" },
                { k: "$639", v: "arb prevented / match" },
              ].map((s, i) => (
                <motion.div
                  key={s.v}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1, ease: easeOut }}
                >
                  <div className="tnum text-3xl font-semibold text-[#3ED9A4]">{s.k}</div>
                  <div className="mt-1 text-sm text-white/60">{s.v}</div>
                </motion.div>
              ))}
            </div>
            <p className="mt-6 max-w-2xl text-sm text-white/50">
              The edge is operational, we earn the spread and never get picked off. We never claim to predict football.
            </p>
          </div>
        </Reveal>
      </section>

      {/* ── CTA ── */}
      <section className="mx-auto max-w-6xl px-5 pb-20">
        <div className="glass flex flex-col items-center gap-5 p-10 text-center sm:p-14">
          <LogoMark size={52} className="animate-float" />
          <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">See it defend a live match</h2>
          <p className="max-w-lg text-mut">Watch the Courtsider Cam, the reprices on each goal, and verify any price on-chain. Runs in the browser, no setup.</p>
          <Link href="/app" className="btn-primary">Launch app →</Link>
        </div>
      </section>

      {/* ── footer ── */}
      <footer className="border-t border-hair bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <Wordmark size={28} />
            <p className="mt-4 max-w-xs text-sm text-mut">Prices in-play markets fast enough to avoid latency arbitrage, and anchors every quote on-chain.</p>
          </div>
          <FooterCol title="Product" links={[["Live demo", "/app"], ["How it works", "#how"], ["GitHub", "https://github.com/Hijanhv/Catenaccio"]]} />
          <FooterCol title="Stack" links={[["Next.js 15", "#"], ["Solana devnet", "#"], ["TxLINE", "#"], ["MCP server", "#"]]} />
          <FooterCol title="On-chain" links={[["Txoracle program", "https://explorer.solana.com/address/6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J?cluster=devnet"], ["SPL Memo", "https://explorer.solana.com/address/MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr?cluster=devnet"]]} />
        </div>
        <div className="border-t border-hair px-5 py-5 text-center text-xs text-mut2">
          Catenaccio · TxODDS × Solana World Cup Hackathon · Trading Tools &amp; Agents
        </div>
      </footer>
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.18em] text-mut2">{title}</div>
      <ul className="mt-3 space-y-2">
        {links.map(([label, href]) => (
          <li key={label}>
            <a href={href} className="text-sm text-mut hover:text-ink">{label}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
