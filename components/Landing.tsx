"use client";

import Link from "next/link";
import { LogoMark, Wordmark } from "./Logo";
import { HeroArt } from "./HeroArt";

const STATS = [
  { k: "~400 ms", v: "reprice on a goal" },
  { k: "$0", v: "picked off" },
  { k: "3.16", v: "backtest Sharpe" },
  { k: "99%", v: "profitable matches" },
];

const COMPARE = [
  { label: "Reprice after a goal", book: "~5–8 seconds", us: "~400 ms", bookBad: true },
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
  { t: "~400 ms reprice", d: "Suspend, reprice, and reopen when a goal is confirmed. Verification and anchoring run in parallel and never block the reprice." },
  { t: "Courtsider Cam", d: "A side-by-side comparison of a broadcast-delayed book and Catenaccio, with the dollars leaked on each — a measured figure from a calibrated attacker." },
  { t: "Deterministic model", d: "Time-decaying Poisson with a Dixon-Coles correction, calibrated to the market consensus and unit-tested." },
  { t: "Risk and resilience", d: "Exposure caps, a drawdown kill-switch, real fees, and SSE reconnect with sequence-gap backfill." },
  { t: "On-chain verification", d: "Resolve any fill to its TxLINE Merkle proof and check it against the on-chain root." },
  { t: "MCP server", d: "Exposes the agent's signals as tools another agent can call." },
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
        <div>
          <div className="eyebrow"><span className="h-1.5 w-1.5 rounded-full bg-shield" />TxLINE × Solana · Trading Tools &amp; Agents</div>
          <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-5xl md:text-6xl">
            The defense for your <span className="text-shield">in-play</span> prices.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-mut">
            An autonomous football market-making agent that reprices in <strong className="text-ink">~400 ms</strong> the
            instant a goal is confirmed — so your book is never picked off by latency arbitrage — and proves every price on-chain.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/app" className="btn-primary">Launch the live demo →</Link>
            <a href="#how" className="btn-ghost">See how it works</a>
          </div>
          <div className="mt-9 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.k}>
                <div className="tnum text-2xl font-semibold text-ink">{s.k}</div>
                <div className="text-xs text-mut">{s.v}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="order-first md:order-last">
          <div className="mx-auto w-full max-w-[460px]">
            <HeroArt />
          </div>
        </div>
      </section>

      {/* ── the problem ── */}
      <section className="mx-auto max-w-6xl px-5 py-12">
        <div className="glass p-7 sm:p-10">
          <div className="text-xs uppercase tracking-[0.2em] text-mut">The problem · in plain English</div>
          <p className="mt-3 max-w-3xl text-xl leading-relaxed text-ink sm:text-2xl">
            When a goal is scored, the fair price changes <em>instantly</em> — but slow books take seconds to update.
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
          {STEPS.map((s) => (
            <div key={s.n} className="glass p-6">
              <div className="font-mono text-sm text-shield">{s.n}</div>
              <div className="mt-2 text-lg font-semibold text-ink">{s.t}</div>
              <div className="mt-2 text-sm leading-relaxed text-mut">{s.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── features ── */}
      <section className="mx-auto max-w-6xl px-5 py-8">
        <h2 className="text-center text-2xl font-semibold tracking-tight text-ink sm:text-3xl">What&apos;s inside</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.t} className="glass p-6 transition hover:shadow-soft">
              <div className="h-1.5 w-6 rounded-full bg-shield" />
              <div className="mt-4 text-lg font-semibold text-ink">{f.t}</div>
              <div className="mt-2 text-sm leading-relaxed text-mut">{f.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── numbers band ── */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="rounded-2xl border border-hair bg-ink p-8 text-white sm:p-12">
          <div className="text-xs uppercase tracking-[0.2em] text-white/50">Backtested across 500 simulated matches</div>
          <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {[
              { k: "+$2,629", v: "mean P&L / match" },
              { k: "3.16", v: "Sharpe" },
              { k: "99%", v: "profitable" },
              { k: "$639", v: "arb prevented / match" },
            ].map((s) => (
              <div key={s.v}>
                <div className="tnum text-3xl font-semibold text-[#3ED9A4]">{s.k}</div>
                <div className="mt-1 text-sm text-white/60">{s.v}</div>
              </div>
            ))}
          </div>
          <p className="mt-6 max-w-2xl text-sm text-white/50">
            The edge is operational — we earn the spread and never get picked off. We never claim to predict football.
          </p>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="mx-auto max-w-6xl px-5 pb-20">
        <div className="glass flex flex-col items-center gap-5 p-10 text-center sm:p-14">
          <LogoMark size={52} className="animate-float" />
          <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">See it defend a live match</h2>
          <p className="max-w-lg text-mut">Watch the Courtsider Cam, the reprices on each goal, and verify any price on-chain. Runs in the browser, no setup.</p>
          <Link href="/app" className="btn-primary">Launch the live demo →</Link>
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
