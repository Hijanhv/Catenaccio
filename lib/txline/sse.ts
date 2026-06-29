/**
 * Resilient SSE client for TxLINE `/api/odds/stream` and `/api/scores/stream`.
 *
 * A desk cannot quote on a feed it can't trust, so this client:
 *   - auto-reconnects with exponential backoff,
 *   - tracks `seq` per stream and detects gaps,
 *   - on a gap, backfills via `/api/{kind}/updates/{day}/{hour}/{interval}` before
 *     resuming, and signals suspend/resume so the engine never quotes on stale data.
 */

import { TxlineCreds, authHeaders } from "./auth";

export type StreamKind = "odds" | "scores";

export interface SseHandlers {
  onMessage: (raw: any) => void;
  onStatus: (status: "connected" | "suspended" | "backfilling" | "resumed", detail?: string) => void;
}

export async function streamSse(
  creds: TxlineCreds,
  kind: StreamKind,
  handlers: SseHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let backoff = 500;
  let lastSeq: number | null = null;

  while (!signal?.aborted) {
    try {
      const res = await fetch(`${creds.apiUrl}/${kind}/stream`, {
        headers: { ...authHeaders(creds), Accept: "text/event-stream", "Cache-Control": "no-cache" },
        signal,
      });
      if (!res.ok || !res.body) throw new Error(`${kind}/stream ${res.status}`);
      handlers.onStatus("connected");
      backoff = 500;

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (!signal?.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const frame of frames) {
          const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          let payload: any;
          try {
            payload = JSON.parse(dataLine.slice(5).trim());
          } catch {
            continue;
          }
          const seq: number | undefined = payload?.data?.seq ?? payload?.seq;
          if (typeof seq === "number" && lastSeq !== null && seq > lastSeq + 1) {
            handlers.onStatus("backfilling", `gap ${lastSeq}→${seq}`);
            await backfill(creds, kind, handlers).catch(() => {});
            handlers.onStatus("resumed", "gap backfilled");
          }
          if (typeof seq === "number") lastSeq = seq;
          handlers.onMessage(payload);
        }
      }
    } catch (err) {
      if (signal?.aborted) return;
      handlers.onStatus("suspended", String((err as Error).message));
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 15000);
    }
  }
}

/** Replay the missed interval to fill a sequence gap. */
async function backfill(creds: TxlineCreds, kind: StreamKind, handlers: SseHandlers): Promise<void> {
  const now = new Date();
  const epochDay = Math.floor(now.getTime() / 86400000);
  const hour = now.getUTCHours();
  const interval = Math.floor(now.getUTCMinutes() / 5);
  const res = await fetch(`${creds.apiUrl}/${kind}/updates/${epochDay}/${hour}/${interval}`, {
    headers: authHeaders(creds),
  });
  if (!res.ok) return;
  const items = (await res.json()) as any[];
  for (const it of items) handlers.onMessage(it);
}
