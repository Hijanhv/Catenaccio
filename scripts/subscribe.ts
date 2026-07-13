#!/usr/bin/env npx tsx
/**
 * Subscribe to TxLINE's free World Cup tier on Solana devnet and activate an API
 * token, the real auth flow from the TxLINE quickstart, end to end:
 *
 *   1. wallet , load ./agent-key.json (or generate one), airdrop devnet SOL for gas
 *   2. subscribe on-chain, Txoracle `subscribe(serviceLevelId, weeks)`; the free
 *      tier moves no TxL, it just registers the subscription
 *   3. guest JWT, POST /auth/guest/start
 *   4. activate , sign `${txSig}:${leagues}:${jwt}`, POST /api/token/activate
 *   5. write TXLINE_JWT + TXLINE_API_TOKEN to .env.local so `npm run live` can stream
 *
 *   npx tsx scripts/subscribe.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotent,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import nacl from "tweetnacl";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const RPC = process.env.SOLANA_RPC || "https://api.devnet.solana.com";
const API = process.env.TXLINE_API_URL?.replace(/\/api\/?$/, "") || "https://txline-dev.txodds.com";
const PROGRAM = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
const TXL_MINT = new PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG");
// Free World Cup tiers: 1 = 60-second delay, 12 = real-time. Devnet currently
// enables tier 1. Both require no TxL.
const SERVICE_LEVEL_ID = Number(process.env.TXLINE_SERVICE_LEVEL ?? 1);
const DURATION_WEEKS = 4;
const LEAGUES: number[] = [];
const KEY_PATH = "./agent-key.json";

/** Some TxLINE auth endpoints return the token as a JSON object, others as plain text. */
async function readToken(res: Response): Promise<string> {
  const txt = await res.text();
  try {
    const j = JSON.parse(txt);
    return j.token || j.apiToken || txt;
  } catch {
    return txt.trim();
  }
}

function loadOrCreateWallet(): Keypair {
  if (existsSync(KEY_PATH)) {
    const secret = Uint8Array.from(JSON.parse(readFileSync(KEY_PATH, "utf8")));
    return Keypair.fromSecretKey(secret);
  }
  const kp = Keypair.generate();
  writeFileSync(KEY_PATH, JSON.stringify(Array.from(kp.secretKey)));
  console.log(`generated new wallet -> ${KEY_PATH}`);
  return kp;
}

async function ensureFunds(connection: Connection, kp: Keypair): Promise<void> {
  let bal = await connection.getBalance(kp.publicKey);
  if (bal >= 0.05 * LAMPORTS_PER_SOL) return;
  console.log(`airdropping 1 SOL to ${kp.publicKey.toBase58()} ...`);
  for (let i = 0; i < 3 && bal < 0.05 * LAMPORTS_PER_SOL; i++) {
    try {
      const sig = await connection.requestAirdrop(kp.publicKey, 1 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, "confirmed");
    } catch (e) {
      console.log(`  airdrop attempt ${i + 1} failed: ${(e as Error).message}`);
    }
    bal = await connection.getBalance(kp.publicKey);
  }
  if (bal < 0.05 * LAMPORTS_PER_SOL) throw new Error("could not fund wallet (devnet faucet rate-limited), fund it manually and re-run");
  console.log(`balance: ${(bal / LAMPORTS_PER_SOL).toFixed(3)} SOL`);
}

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const kp = loadOrCreateWallet();
  console.log("wallet:", kp.publicKey.toBase58());
  await ensureFunds(connection, kp);

  // Reuse an existing subscription if SUBSCRIBE_TX is provided, else subscribe.
  let txSig = process.env.SUBSCRIBE_TX;
  if (!txSig) {
    const wallet = new anchor.Wallet(kp);
    const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
    const idl = await anchor.Program.fetchIdl(PROGRAM, provider);
    if (!idl) throw new Error("could not fetch on-chain IDL");
    const program = new anchor.Program(idl as anchor.Idl, provider);

    const [tokenTreasuryPda] = PublicKey.findProgramAddressSync([Buffer.from("token_treasury_v2")], PROGRAM);
    const tokenTreasuryVault = getAssociatedTokenAddressSync(TXL_MINT, tokenTreasuryPda, true, TOKEN_2022_PROGRAM_ID);
    const [pricingMatrixPda] = PublicKey.findProgramAddressSync([Buffer.from("pricing_matrix")], PROGRAM);
    const userTokenAccount = getAssociatedTokenAddressSync(TXL_MINT, kp.publicKey, false, TOKEN_2022_PROGRAM_ID);

    // The subscribe instruction requires the user's TxL token account to exist (the
    // free tier leaves it at zero balance). Create it idempotently first.
    console.log("ensuring user TxL token account exists ...");
    await createAssociatedTokenAccountIdempotent(connection, kp, TXL_MINT, kp.publicKey, {}, TOKEN_2022_PROGRAM_ID);

    console.log(`subscribing: serviceLevel=${SERVICE_LEVEL_ID} weeks=${DURATION_WEEKS} ...`);
    txSig = await (program.methods as any)
      .subscribe(SERVICE_LEVEL_ID, DURATION_WEEKS)
      .accounts({
        user: kp.publicKey,
        pricingMatrix: pricingMatrixPda,
        tokenMint: TXL_MINT,
        userTokenAccount,
        tokenTreasuryVault,
        tokenTreasuryPda,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("subscribe tx:", txSig);
    console.log("explorer:", `https://explorer.solana.com/tx/${txSig}?cluster=devnet`);
  } else {
    console.log("reusing existing subscribe tx:", txSig);
  }

  // guest JWT
  const jwt = await readToken(await fetch(`${API}/auth/guest/start`, { method: "POST" }));

  // sign the activation message and activate
  const message = new TextEncoder().encode(`${txSig}:${LEAGUES.join(",")}:${jwt}`);
  const walletSignature = Buffer.from(nacl.sign.detached(message, kp.secretKey)).toString("base64");
  const actRes = await fetch(`${API}/api/token/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ txSig, walletSignature, leagues: LEAGUES }),
  });
  if (!actRes.ok) throw new Error(`activate failed ${actRes.status}: ${await actRes.text()}`);
  const apiToken = await readToken(actRes);
  console.log("API token activated:", apiToken.slice(0, 28) + "…");

  const env = [
    `# Generated by scripts/subscribe.ts, devnet World Cup free tier (do not commit)`,
    `TXLINE_AUTH_URL=${API}`,
    `TXLINE_API_URL=${API}/api`,
    `TXLINE_JWT=${jwt}`,
    `TXLINE_API_TOKEN=${apiToken}`,
    `SUBSCRIBE_TX=${txSig}`,
    `WALLET=${kp.publicKey.toBase58()}`,
    ``,
  ].join("\n");
  writeFileSync(".env.local", env);
  console.log("wrote .env.local, now run:  npm run live");
}

main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  if (e?.logs) console.error(e.logs.join("\n"));
  process.exit(1);
});
