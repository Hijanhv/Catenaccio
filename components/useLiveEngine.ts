"use client";

import { useEffect, useRef, useState } from "react";
import { CatenaccioEngine } from "@/lib/engine/engine";
import { EngineSnapshot, EngineEvent } from "@/lib/engine/types";

export type LiveStatus = "idle" | "connecting" | "live" | "no-creds" | "error";

/**
 * Feeds the real TxLINE feed (proxied by /api/stream) into the same engine the
 * replay uses. EventSource reconnects on its own; the route runs in bounded windows.
 * Pinned to the first fixture seen so concurrent matches don't interleave.
 */
export function useLiveEngine(enabled: boolean) {
  const [snap, setSnap] = useState<EngineSnapshot | null>(null);
  const [status, setStatus] = useState<LiveStatus>("idle");
  const engineRef = useRef<CatenaccioEngine | null>(null);
  const fixtureRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      return;
    }
    setStatus("connecting");
    engineRef.current = new CatenaccioEngine({ fixtureId: 0, homeTeam: "Home", awayTeam: "Away", seed: 1 });
    fixtureRef.current = null;
    setSnap(engineRef.current.snapshot());

    const es = new EventSource("/api/stream");
    es.onmessage = (e) => {
      let msg: any;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.kind === "status") {
        if (msg.status === "no-creds") setStatus("no-creds");
        else if (msg.status === "auth-failed") setStatus("error");
        else if (msg.status === "connected") setStatus("live");
        return;
      }
      const ev = msg as EngineEvent;
      if (ev.kind !== "odds" && ev.kind !== "score") return;
      const fid = (ev as any).fixtureId as number;
      if (fixtureRef.current === null && fid) fixtureRef.current = fid;
      if (fid && fid !== fixtureRef.current) return;
      engineRef.current!.apply(ev);
      setSnap(engineRef.current!.snapshot());
      setStatus("live");
    };
    es.onerror = () => setStatus((s) => (s === "live" ? "connecting" : s));

    return () => es.close();
  }, [enabled]);

  return { snap, status, engineRef };
}
