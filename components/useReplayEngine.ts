"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildMatch, ScriptedEvent } from "@/lib/engine/replay";
import { CatenaccioEngine } from "@/lib/engine/engine";
import { EngineSnapshot } from "@/lib/engine/types";

/**
 * Drives the deterministic replay in the browser: the SAME engine that would run
 * server-side against live TxLINE SSE, folding a scripted match tick-by-tick.
 * A single requestAnimationFrame loop advances a virtual clock; control state
 * lives in refs so the loop is established once and never tears down mid-match.
 */
export function useReplayEngine() {
  const engineRef = useRef<CatenaccioEngine | null>(null);
  const eventsRef = useRef<ScriptedEvent[]>([]);
  const idxRef = useRef(0);
  const virtualRef = useRef(0);
  const playingRef = useRef(true);
  const speedRef = useRef(1);
  const doneRef = useRef(false);
  const lastSnapRef = useRef(0);

  const [snap, setSnap] = useState<EngineSnapshot | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeedState] = useState(1);
  const [done, setDone] = useState(false);

  const init = useCallback(() => {
    const { events, homeTeam, awayTeam, fixtureId } = buildMatch();
    const engine = new CatenaccioEngine({ fixtureId, homeTeam, awayTeam });
    engineRef.current = engine;
    eventsRef.current = events;
    idxRef.current = 0;
    virtualRef.current = 0;
    doneRef.current = false;
    setDone(false);
    setSnap(engine.snapshot());
  }, []);

  const restart = useCallback(() => {
    init();
    playingRef.current = true;
    setPlaying(true);
  }, [init]);

  const toggle = useCallback(() => {
    playingRef.current = !playingRef.current;
    setPlaying(playingRef.current);
  }, []);

  const setSpeed = useCallback((s: number) => {
    speedRef.current = s;
    setSpeedState(s);
  }, []);

  useEffect(() => {
    init();
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      const engine = engineRef.current;
      if (engine && playingRef.current && !doneRef.current) {
        virtualRef.current += dt * speedRef.current;
        const events = eventsRef.current;
        while (idxRef.current < events.length && events[idxRef.current].playAtMs <= virtualRef.current) {
          engine.apply(events[idxRef.current].event);
          idxRef.current++;
        }
        if (now - lastSnapRef.current > 90) {
          lastSnapRef.current = now;
          setSnap(engine.snapshot());
        }
        if (idxRef.current >= events.length) {
          doneRef.current = true;
          setDone(true);
          setSnap(engine.snapshot());
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { snap, playing, speed, done, toggle, restart, setSpeed, engineRef };
}
