"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useReplayEngine } from "./useReplayEngine";
import { useLiveEngine } from "./useLiveEngine";
import { LogoMark, Wordmark } from "./Logo";
import { SensitivityChart } from "./SensitivityChart";
import { AnimatedNumber } from "./AnimatedNumber";
import { Celebration } from "./Celebration";
import { Sparkline } from "./Sparkline";
import { MARKET_LABEL, MarketBook, Fill, EngineSnapshot, Signal, SettlementReceipt } from "@/lib/engine/types";
import { verifyMerkleProof } from "@/lib/engine/merkle";
import { hashHex } from "@/lib/engine/math/sha256";

const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
const clock = (s: number) => `${Math.floor(s / 60)}'`;

export default function Dashboard() {
  const [mode, setMode] = useState<"replay" | "live">("replay");
  const replay = useReplayEngine(mode === "replay");
  const live = useLiveEngine(mode === "live");
  const [verifyFill, setVerifyFill] = useState<Fill | null>(null);
  const [pnlHistory, setPnlHistory] = useState<number[]>([]);

  const snap = mode === "live" ? live.snap : replay.snap;
  const engineRef = mode === "live" ? live.engineRef : replay.engineRef;

  useEffect(() => setPnlHistory([]), [mode]);
  useEffect(() => {
    if (!snap) return;
    setPnlHistory((h) => {
      const next = [...h, snap.realizedPnl + snap.unrealizedPnl];
      return next.length > 90 ? next.slice(-90) : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap?.ts]);

  if (!snap) {
    return (
      <div className="mx-auto max-w-[1280px] px-5 py-6">
        <Header
          snap={null}
          playing={replay.playing}
          speed={replay.speed}
          toggle={replay.toggle}
          restart={replay.restart}
          setSpeed={replay.setSpeed}
          mode={mode}
          setMode={setMode}
          liveStatus={live.status}
        />
        <div className="glass mt-24 grid place-items-center gap-3 py-20 text-center">
          <LogoMark size={56} className="animate-pulse" />
          <div className="text-sm text-mut">
            {mode === "live" ? "Connecting to the live TxLINE feed…" : "Loading…"}
          </div>
        </div>
      </div>
    );
  }

  const net = snap.realizedPnl + snap.unrealizedPnl;
  const goals = snap.score.home + snap.score.away;
  const avgLeakPerGoal = goals > 0 ? snap.arbLeakedBaseline / goals : 72;

  return (
    <div className="mx-auto max-w-[1280px] px-5 py-6">
      <Header
        snap={snap}
        playing={replay.playing}
        speed={replay.speed}
        toggle={replay.toggle}
        restart={replay.restart}
        setSpeed={replay.setSpeed}
        mode={mode}
        setMode={setMode}
        liveStatus={live.status}
      />

      <Hero snap={snap} />

      <CourtsiderCam snap={snap} />

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
        {/* left: markets + feed */}
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {snap.books.map((b, i) => (
              <MarketCard key={b.market} book={b} consensus={snap.consensus[b.market]} index={i} />
            ))}
          </div>
          <Feed snap={snap} onVerify={setVerifyFill} />
        </div>

        {/* right: signals → pnl → risk → settlement → sensitivity (the agent's lifecycle) */}
        <div className="flex flex-col gap-5">
          <SignalsPanel snap={snap} />
          <PnlPanel snap={snap} net={net} history={pnlHistory} />
          <RiskPanel snap={snap} />
          <SettlementPanel snap={snap} />
          <Panel title="Latency-arb defended" hint="measured, not staged">
            <SensitivityChart avgLeakPerGoal={avgLeakPerGoal} repriceMs={snap.lastRepriceMs ?? 400} />
            <p className="mt-2 text-[11px] leading-relaxed text-mut">
              A courtsider profits only while a stale price still exists. We remove that window, the area is
              what a broadcast-delayed book leaks; the green line is us.
            </p>
          </Panel>
        </div>
      </div>

      <Footer snap={snap} />

      <AnimatePresence>
        {verifyFill && <VerifyModal fill={verifyFill} snap={snap} engineRef={engineRef} onClose={() => setVerifyFill(null)} />}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────────────────────── Header ─────────────────────────────── */
function Header({ snap, playing, speed, toggle, restart, setSpeed, mode, setMode, liveStatus }: any) {
  const s: EngineSnapshot | null = snap;
  const status = s?.feedStatus ?? "connected";
  const color = status === "suspended" || status === "backfilling" ? "text-attack" : "text-shield";
  const dot = status === "suspended" || status === "backfilling" ? "bg-attack" : "bg-shield";
  const liveLabel =
    liveStatus === "live" ? "LIVE · TxLINE devnet" :
    liveStatus === "connecting" ? "connecting…" :
    liveStatus === "no-creds" ? "live token not set" :
    liveStatus === "error" ? "live unavailable" : "idle";
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <Link href="/" className="transition hover:opacity-80"><Wordmark size={32} /></Link>
      <div className="flex flex-wrap items-center gap-3">
        {s && (
          <div className="glass flex items-center gap-3 px-4 py-2">
            <span className="text-sm font-medium text-mut">{s.homeTeam}</span>
            <span className="tnum rounded-md bg-panel2 px-2.5 py-1 text-lg font-semibold">
              {s.score.home}<span className="px-1 text-mut2">:</span>{s.score.away}
            </span>
            <span className="text-sm font-medium text-mut">{s.awayTeam}</span>
            <span className="tnum ml-1 text-sm text-mut2">{clock(s.clockSeconds)} · {s.phaseLabel}</span>
          </div>
        )}
        <div className="flex items-center rounded-lg border border-hair bg-panel2/50 p-0.5 text-xs">
          {(["replay", "live"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-2.5 py-1 capitalize transition ${mode === m ? "bg-panel text-ink shadow-soft" : "text-mut hover:text-ink"}`}
            >
              {m}
            </button>
          ))}
        </div>
        {mode === "live" ? (
          <div className={`chip ${liveStatus === "live" ? "text-shield" : liveStatus === "no-creds" || liveStatus === "error" ? "text-attack" : "text-mut"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${liveStatus === "live" ? "bg-shield animate-pulse" : "bg-mut2"}`} />
            {liveLabel}
          </div>
        ) : (
          <>
            <div className={`chip ${color}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${dot} ${status === "connected" ? "animate-pulse" : ""}`} />
              {status}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={toggle} className="chip hover:bg-panel2" title="play/pause">{playing ? "❚❚" : "►"}</button>
              <button onClick={restart} className="chip hover:bg-panel2" title="restart">⟳</button>
              {[1, 2, 4].map((x) => (
                <button key={x} onClick={() => setSpeed(x)} className={`chip ${speed === x ? "text-shield border-shield/40" : "text-mut hover:bg-panel2"}`}>
                  {x}×
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </header>
  );
}

/* ─────────────────────────────── Hero ─────────────────────────────── */
function Hero({ snap }: { snap: EngineSnapshot }) {
  const justGoal = snap.lastGoal && snap.feedStatus !== "suspended";
  return (
    <motion.div
      className="glass animate-glowPulse relative mt-5 overflow-hidden p-6"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* animated gradient top edge */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px] animate-gradient bg-[linear-gradient(100deg,#0C7A3E,#12924E,#35C46B,#4F9CF9,#12924E)] bg-[length:220%_auto]" />
      {/* goal confetti */}
      <Celebration keyId={justGoal ? `${snap.lastGoal!.team}-${snap.lastGoal!.clockSeconds}` : null} />

      <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[1.3fr_1fr_1fr]">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-mut">Latency-arbitrage prevented</div>
          <AnimatedNumber
            value={snap.arbPrevented}
            format={usd}
            className="tnum mt-1 block text-5xl font-semibold grad-text"
          />
          <div className="mt-1 text-sm text-mut">
            a broadcast-delayed book would have leaked <span className="tnum text-attack line-through">{usd(snap.arbLeakedBaseline)}</span>
          </div>
        </div>

        <div className="border-l border-hair pl-6">
          <div className="text-[11px] uppercase tracking-[0.2em] text-mut">Last reprice latency</div>
          <div className="tnum mt-1 text-4xl font-semibold text-ink">
            {snap.lastRepriceMs != null ? <AnimatedNumber value={snap.lastRepriceMs} format={(n) => Math.round(n).toString()} duration={0.6} /> : "n/a"}
            <span className="ml-1 text-lg text-mut">ms</span>
          </div>
          <div className="mt-1 text-sm text-mut">suspend → recompute → reopen</div>
          <div className="mt-0.5 text-xs text-mut2">
            engine hot path {snap.measuredRepriceMs != null ? snap.measuredRepriceMs.toFixed(2) : "n/a"} ms measured
          </div>
        </div>

        <div className="border-l border-hair pl-6">
          <div className="text-[11px] uppercase tracking-[0.2em] text-mut">Decisions anchored</div>
          <AnimatedNumber value={snap.decisionCount} className="tnum mt-1 block text-4xl font-semibold text-ink" />
          <div className="mt-1 truncate font-mono text-xs text-mut">root {snap.merkleRoot.slice(0, 18)}…</div>
        </div>
      </div>

      <AnimatePresence>
        {justGoal && (
          <motion.div
            key={`${snap.lastGoal!.team}-${snap.lastGoal!.clockSeconds}`}
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="pointer-events-none absolute right-5 top-5 chip border-shield/40 text-shield shadow-glow"
          >
            ⚡ {snap.lastGoal!.team === "home" ? snap.homeTeam : snap.awayTeam} scored · repriced {snap.lastGoal!.repriceMs}ms · courtsider rejected
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─────────────────────────────── Courtsider Cam ─────────────────────────────── */
function CourtsiderCam({ snap }: { snap: EngineSnapshot }) {
  return (
    <motion.div
      className="glass mt-5 p-5"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium">
          Courtsider Cam <span className="text-mut2">· the same goal, two books</span>
        </div>
        <span className="chip text-mut">{snap.lastGoal ? `last goal ${Math.floor(snap.lastGoal.clockSeconds / 60)}'` : "awaiting first goal"}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-4">
        <div className="rounded-xl border border-attack/30 bg-attack/5 p-4 transition hover:-translate-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-attack">Book on a broadcast feed</span>
            <span className="chip border-attack/40 text-attack">~6 s reprice</span>
          </div>
          <div className="mt-3 text-[11px] uppercase tracking-wider text-mut2">picked off, total leaked</div>
          <AnimatedNumber value={snap.arbLeakedBaseline} format={usd} className="tnum block text-3xl font-semibold text-attack" />
          <div className="mt-2 text-xs text-mut">stale price stays live for seconds → the courtsider profits</div>
        </div>

        <div className="flex flex-col items-center justify-center px-1">
          <motion.div
            key={snap.lastGoal?.clockSeconds ?? 0}
            initial={{ scale: 0.5, rotate: -20, opacity: 0.4 }}
            animate={{ scale: [0.5, 1.25, 1], rotate: [-20, 8, 0], opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="text-2xl"
          >
            ⚡
          </motion.div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-mut2">vs</div>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-shield/30 bg-shield/5 p-4 transition hover:-translate-y-0.5">
          <div className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-20deg] bg-white/40 animate-sheen" />
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-shield">Catenaccio</span>
            <span className="chip border-shield/40 text-shield">{snap.lastRepriceMs ?? 400} ms reprice</span>
          </div>
          <div className="mt-3 text-[11px] uppercase tracking-wider text-mut2">defended, total leaked</div>
          <div className="tnum text-3xl font-semibold text-shield">$0</div>
          <div className="mt-2 text-xs text-mut">suspended + repriced before any courtsider can act</div>
        </div>
      </div>
    </motion.div>
  );
}

/* a number that flashes green when it changes (remounts on value change) */
function FlashNum({ v, className = "" }: { v: string; className?: string }) {
  return (
    <motion.span
      key={v}
      initial={{ backgroundColor: "rgba(18,146,78,0.20)" }}
      animate={{ backgroundColor: "rgba(18,146,78,0)" }}
      transition={{ duration: 0.7 }}
      className={`tnum inline-block rounded px-1 ${className}`}
    >
      {v}
    </motion.span>
  );
}

/* ─────────────────────────────── Market card ─────────────────────────────── */
function MarketCard({ book, consensus, index = 0 }: { book: MarketBook; consensus: number[]; index?: number }) {
  return (
    <motion.div
      className={`glass-hover relative p-4 ${book.suspended ? "opacity-60" : ""}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.05 + index * 0.08, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{MARKET_LABEL[book.market]}</div>
        {book.suspended ? (
          <span className="chip border-attack/40 text-attack animate-pulse">suspended</span>
        ) : (
          <span className="chip text-mut">{(book.spreadBps / 100).toFixed(1)}% spread</span>
        )}
      </div>
      <div className="mt-3 space-y-2">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 text-[10px] uppercase tracking-wider text-mut2">
          <span>Outcome</span><span className="text-right">Bid</span><span className="text-right">Ask</span><span className="text-right">Fair</span>
        </div>
        {book.quotes.map((q, i) => (
          <div key={q.outcome} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2">
            <span className="truncate text-sm">{q.outcome}</span>
            <span className="text-right text-sm text-shield">{book.suspended ? "·" : <FlashNum v={q.bid.toFixed(2)} />}</span>
            <span className="text-right text-sm text-attack/90">{book.suspended ? "·" : <FlashNum v={q.ask.toFixed(2)} />}</span>
            <span className="tnum text-right text-xs text-mut" title={`consensus ${pct(consensus[i] ?? 0)}`}>{pct(q.fair)}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

/* ─────────────────────────────── PnL & Risk ─────────────────────────────── */
function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <motion.div
      className="glass-hover p-4"
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium">{title}</div>
        {hint && <span className="text-[10px] uppercase tracking-wider text-mut2">{hint}</span>}
      </div>
      {children}
    </motion.div>
  );
}

function PnlPanel({ snap, net, history }: { snap: EngineSnapshot; net: number; history: number[] }) {
  const up = history.length < 2 || net >= history[0];
  return (
    <Panel title="P&L" hint="fees included">
      <div className="text-3xl font-semibold" style={{ color: net >= 0 ? "#12924E" : "#E5342B" }}>
        <AnimatedNumber value={net} format={usd} className="tnum" />
      </div>
      <div className="mt-2">
        <Sparkline data={history} up={up} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Mini label="Realized" value={usd(snap.realizedPnl)} />
        <Mini label="Unrealized" value={usd(snap.unrealizedPnl)} />
        <Mini label="Fees earned" value={usd(snap.fees)} />
      </div>
    </Panel>
  );
}

function RiskPanel({ snap }: { snap: EngineSnapshot }) {
  const cap = 6000;
  const util = Math.min(1, snap.risk.totalExposure / cap);
  return (
    <Panel title="Risk rails" hint={snap.risk.killSwitch ? "KILL-SWITCH" : "live"}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-mut">Total exposure</span>
        <span className="tnum">{usd(snap.risk.totalExposure)} <span className="text-mut2">/ {usd(cap)}</span></span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-panel2">
        <motion.div
          className="h-full rounded-full"
          initial={false}
          animate={{ width: `${util * 100}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{ background: snap.risk.killSwitch ? "#E5342B" : util > 0.75 ? "#C08A1E" : "#12924E" }}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className={`chip ${snap.risk.killSwitch ? "border-attack/40 text-attack" : "text-shield"}`}>kill-switch {snap.risk.killSwitch ? "tripped" : "armed"}</span>
        <span className="chip text-mut">exposure caps</span>
        <span className="chip text-mut">data-gap suspend</span>
      </div>
    </Panel>
  );
}

/* ─────────────────────────────── Signals (prediction) ─────────────────────────────── */
function SignalsPanel({ snap }: { snap: EngineSnapshot }) {
  const x = snap.books.find((b) => b.market === "1X2");
  const top = x ? x.quotes.reduce((a, b) => (b.fair > a.fair ? b : a), x.quotes[0]) : null;
  return (
    <Panel title="Signals" hint="model vs market">
      {top && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-mut">Live win probability</span>
            <span className="tnum text-ink">{top.outcome} {pct(top.fair)}</span>
          </div>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-panel2">
            {x!.quotes.map((q) => (
              <div
                key={q.outcome}
                title={`${q.outcome} ${pct(q.fair)}`}
                style={{ width: `${q.fair * 100}%`, background: q.outcome === "Home" ? "#12924E" : q.outcome === "Draw" ? "#98A1B0" : "#7C3AED" }}
              />
            ))}
          </div>
        </div>
      )}
      <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto pr-1">
        {snap.recentSignals.length === 0 && <div className="text-xs text-mut">Watching for model-vs-market divergence…</div>}
        {snap.recentSignals.map((s, i) => (
          <SignalRow key={`${s.ts}-${i}`} s={s} />
        ))}
      </div>
    </Panel>
  );
}

function SignalRow({ s }: { s: Signal }) {
  const color = s.kind === "sharp" ? "text-ink" : (s.edgePct ?? 0) > 0 ? "text-shield" : "text-gold";
  const tag = s.kind === "sharp" ? "sharp" : "value";
  return (
    <div className="flex items-center gap-2 text-xs leading-snug">
      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${s.kind === "sharp" ? "bg-panel2 text-mut" : "bg-shield/10 text-shield"}`}>{tag}</span>
      <span className={color}>{s.detail}</span>
      <span className="ml-auto text-[10px] text-mut2">{MARKET_LABEL[s.market].split(" ")[0]}</span>
    </div>
  );
}

/* ─────────────────────────────── Settlement ─────────────────────────────── */
function SettlementPanel({ snap }: { snap: EngineSnapshot }) {
  const settled = snap.settlements.length > 0;
  return (
    <Panel title="Settlement" hint="trustless · validate_stat">
      {!settled ? (
        <div className="text-xs leading-relaxed text-mut">
          At full time each market resolves against TxLINE&apos;s Merkle-proven final score through Txoracle&apos;s{" "}
          <span className="font-mono text-ink">validate_stat</span>, no trusted oracle, no manual grading. Positions
          then settle on-chain via <span className="font-mono text-ink">settle_trade</span>.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {snap.settlements.map((r) => (
            <SettlementRow key={r.market} r={r} />
          ))}
          <div className="mt-1 text-[10px] text-mut2">
            resolved by Txoracle <span className="font-mono">{snap.settlements[0].program.slice(0, 10)}…</span> against fixture #{snap.settlements[0].txlineProof.fixtureId}
          </div>
        </div>
      )}
    </Panel>
  );
}

function SettlementRow({ r }: { r: SettlementReceipt }) {
  return (
    <div className="rounded-lg border border-hair bg-panel2/40 px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink">{MARKET_LABEL[r.market]}</span>
        <span className="chip border-shield/40 text-shield">✓ {r.winner}</span>
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="font-mono text-[10px] text-mut">{r.predicate}</span>
        <span className="tnum text-xs" style={{ color: r.pnl >= 0 ? "#12924E" : "#E5342B" }}>{usd(r.pnl)}</span>
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-panel2/60 px-2 py-2">
      <div className="text-[10px] uppercase tracking-wider text-mut2">{label}</div>
      <div className="tnum mt-0.5 text-sm">{value}</div>
    </div>
  );
}

/* ─────────────────────────────── Feed ─────────────────────────────── */
function Feed({ snap, onVerify }: { snap: EngineSnapshot; onVerify: (f: Fill) => void }) {
  return (
    <Panel title="Decision & fill log" hint="every line is Merkle-anchored">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-wider text-mut2">Decisions</div>
          <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto pr-1">
            {snap.recentDecisions.map((d) => (
              <div key={d.seq} className="animate-ticker text-xs leading-snug">
                <span className={`mr-1.5 font-mono ${d.type === "reprice" ? "text-shield" : d.type === "risk" ? "text-gold" : "text-mut2"}`}>
                  {d.type === "reprice" ? "⚡" : d.type === "risk" ? "▲" : d.type === "feed" ? "⇄" : "•"}
                </span>
                <span className={d.type === "reprice" ? "text-ink" : "text-mut"}>{d.summary}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-wider text-mut2">Recent fills</div>
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto pr-1">
            {snap.recentFills.map((f) => (
              <button
                key={f.id}
                onClick={() => onVerify(f)}
                className="group flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs hover:bg-panel2"
              >
                <span className="flex items-center gap-1.5">
                  {f.counterparty === "courtsider" ? (
                    <span className="text-attack">✕ courtsider</span>
                  ) : (
                    <span className="text-mut">{f.side === "back" ? "▼" : "▲"}</span>
                  )}
                  <span className="text-ink">{f.outcome}</span>
                  <span className="tnum text-mut2">@{f.price.toFixed(2)}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="tnum text-mut">{usd(f.stake)}</span>
                  <span className="text-shield opacity-0 transition group-hover:opacity-100">verify ✓</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

/* ─────────────────────────────── Footer ─────────────────────────────── */
function Footer({ snap }: { snap: EngineSnapshot }) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-mut2">
      <div className="flex items-center gap-2">
        <LogoMark size={16} />
        <span>Catenaccio · autonomous in-play market maker · powered by TxLINE on Solana devnet</span>
      </div>
      <div className="font-mono">fixture #{snap.fixtureId} · deterministic replay · {snap.decisionCount} decisions</div>
    </div>
  );
}

/* ─────────────────────────────── Verify modal ─────────────────────────────── */
function VerifyModal({ fill, snap, engineRef, onClose }: { fill: Fill; snap: EngineSnapshot; engineRef: any; onClose: () => void }) {
  const proof = useMemo(() => {
    const engine = engineRef.current;
    if (engine && typeof fill.decisionSeq === "number") {
      try {
        return engine.proofFor(fill.decisionSeq);
      } catch {
        return null;
      }
    }
    return null;
  }, [fill, engineRef]);

  const verified = proof ? verifyMerkleProof(proof) : false;
  const simSig = `sim_${hashHex(snap.merkleRoot).slice(0, 64)}`;

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="glass w-full max-w-lg p-6"
        initial={{ scale: 0.96, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.97, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm font-medium">Verify this {fill.counterparty === "courtsider" ? "rejected courtsider order" : "fill"} on-chain</div>
            <div className="mt-0.5 text-xs text-mut">{fill.outcome} @ {fill.price.toFixed(2)} · {usd(fill.stake)}</div>
          </div>
          <button onClick={onClose} className="chip text-mut hover:bg-panel2">esc</button>
        </div>

        {/* TxLINE data authenticity */}
        <div className="mt-4 rounded-xl border border-hair bg-panel2/50 p-3">
          <div className="text-[10px] uppercase tracking-wider text-mut2">1 · TxLINE data authenticity</div>
          <div className="mt-1 text-sm">
            This price was anchored to TxLINE datum{" "}
            <span className="font-mono text-shield">{fill.sourceMessageId}</span>, validated against the on-chain
            <span className="text-ink"> Txoracle</span> program.
          </div>
          <div className="mt-1 truncate font-mono text-[10px] text-mut">program 6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J</div>
        </div>

        {/* secondary: our decision log tamper-evidence */}
        <div className="mt-3 rounded-xl border border-hair bg-panel2/50 p-3">
          <div className="text-[10px] uppercase tracking-wider text-mut2">2 · Decision-log inclusion (Merkle proof)</div>
          {proof ? (
            <>
              <Row k="leaf" v={proof.leafHash} />
              {proof.path.slice(0, 4).map((s: any, i: number) => (
                <Row key={i} k={`+ sibling ${i}`} v={s.sibling} />
              ))}
              <Row k="root" v={proof.root} accent />
              <div className="mt-2 text-[10px] text-mut">recomputed {proof.path.length} hashes → root committed on devnet via Memo · <span className="font-mono">{simSig.slice(0, 22)}…</span></div>
            </>
          ) : (
            <div className="text-xs text-mut">proof unavailable for this entry</div>
          )}
        </div>

        <div className={`mt-4 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium ${verified ? "bg-shield/10 text-shield" : "bg-attack/10 text-attack"}`}>
          {verified ? "✓ VERIFIED, tamper-evident & independently checkable" : "could not verify"}
        </div>
        <p className="mt-2 text-center text-[10px] text-mut2">
          A proof confirms the data is authentic and unaltered, not that a decision was “optimal”. Tamper-evident, not “trustless”.
        </p>
      </motion.div>
    </motion.div>
  );
}

function Row({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="mt-1 flex items-center justify-between gap-3 font-mono text-[10px]">
      <span className="text-mut2">{k}</span>
      <span className={`truncate ${accent ? "text-shield" : "text-mut"}`}>{v.slice(0, 32)}…</span>
    </div>
  );
}
