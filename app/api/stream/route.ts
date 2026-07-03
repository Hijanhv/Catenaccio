/**
 * Server-side live TxLINE proxy (Edge).
 *
 * The browser cannot hold the API token, so this route holds it (from env), mints a
 * fresh guest JWT per connection, opens the real TxLINE odds + scores SSE, normalises
 * each payload into the engine's event type, and forwards it to the browser as SSE.
 * It runs for a bounded window; the client's EventSource reconnects automatically.
 *
 * Set TXLINE_API_TOKEN (and optionally TXLINE_API_URL) in the environment. With no
 * token the route emits a single `no-creds` status and the dashboard stays on replay.
 */

import { normalizeOdds, normalizeScore } from "@/lib/txline/normalize";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const API = process.env.TXLINE_API_URL || "https://txline-dev.txodds.com/api";
const AUTH = API.replace(/\/api\/?$/, "");
const BUDGET_MS = 25_000;

async function guestJwt(): Promise<string> {
  const r = await fetch(`${AUTH}/auth/guest/start`, { method: "POST" });
  const j = (await r.json()) as { token: string };
  return j.token;
}

export async function GET(req: Request): Promise<Response> {
  const apiToken = process.env.TXLINE_API_TOKEN;
  const enc = new TextEncoder();

  const body = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          /* stream closed */
        }
      };

      if (!apiToken) {
        send({ kind: "status", status: "no-creds" });
        controller.close();
        return;
      }

      let jwt: string;
      try {
        jwt = await guestJwt();
      } catch {
        send({ kind: "status", status: "auth-failed" });
        controller.close();
        return;
      }
      send({ kind: "status", status: "connected" });

      const deadline = Date.now() + BUDGET_MS;
      const ac = new AbortController();
      req.signal.addEventListener("abort", () => ac.abort());
      const timer = setTimeout(() => ac.abort(), BUDGET_MS);

      const pump = async (kind: "odds" | "scores", normalize: (raw: any) => unknown) => {
        const res = await fetch(`${API}/${kind}/stream`, {
          headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken!, Accept: "text/event-stream" },
          signal: ac.signal,
        });
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        while (Date.now() < deadline) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const frames = buf.split("\n\n");
          buf = frames.pop() ?? "";
          for (const frame of frames) {
            const line = frame.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            let payload: any;
            try {
              payload = JSON.parse(line.slice(5).trim());
            } catch {
              continue;
            }
            const ev = normalize(payload);
            if (ev) send(ev);
          }
        }
      };

      try {
        await Promise.all([pump("odds", normalizeOdds), pump("scores", normalizeScore)]);
      } catch {
        /* aborted or upstream ended */
      }
      clearTimeout(timer);
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
