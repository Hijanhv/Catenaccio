/**
 * TxLINE authentication (two-token flow).
 *
 * 1. Guest JWT:  POST {AUTH}/auth/guest/start            -> { token }
 * 2. Subscribe on-chain to the free World Cup real-time tier (the `subscribe`
 *    instruction on Txoracle).
 * 3. Activate API token: POST {AUTH}/api/token/activate   -> { apiToken }
 * 4. Every data call sends both headers:
 *      Authorization: Bearer <jwt>
 *      X-Api-Token:   <apiToken>
 *
 * If TXLINE_JWT / TXLINE_API_TOKEN are set in the environment they are used
 * directly. With no credentials the app falls back to the bundled deterministic
 * replay, so it runs without an account.
 */

export interface TxlineCreds {
  authUrl: string;
  apiUrl: string;
  jwt: string;
  apiToken: string;
}

export function credsFromEnv(): TxlineCreds | null {
  const jwt = process.env.TXLINE_JWT?.trim();
  const apiToken = process.env.TXLINE_API_TOKEN?.trim();
  if (!jwt || !apiToken) return null;
  return {
    authUrl: process.env.TXLINE_AUTH_URL || "https://txline.txodds.com",
    apiUrl: process.env.TXLINE_API_URL || "https://txline-dev.txodds.com/api",
    jwt,
    apiToken,
  };
}

/** Step 1: obtain a guest JWT (valid ~30 days). */
export async function startGuest(authUrl: string): Promise<string> {
  const res = await fetch(`${authUrl}/auth/guest/start`, { method: "POST" });
  if (!res.ok) throw new Error(`guest/start failed: ${res.status}`);
  const j = (await res.json()) as { token: string };
  return j.token;
}

/**
 * Step 3: activate the API token after an on-chain subscription.
 * `subscriptionSig` is the Solana tx signature of the `subscribe` instruction.
 */
export async function activateToken(
  authUrl: string,
  jwt: string,
  subscriptionSig: string,
  walletSignature: string,
  leagues: number[] = [],
): Promise<string> {
  const res = await fetch(`${authUrl}/api/token/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ subscriptionSignature: subscriptionSig, walletSignature, leagues }),
  });
  if (!res.ok) throw new Error(`token/activate failed: ${res.status}`);
  const j = (await res.json()) as { apiToken: string };
  return j.apiToken;
}

export const authHeaders = (c: TxlineCreds) => ({
  Authorization: `Bearer ${c.jwt}`,
  "X-Api-Token": c.apiToken,
});
