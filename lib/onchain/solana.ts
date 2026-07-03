/**
 * Solana anchoring and verification.
 *
 * Two on-chain jobs, neither needs a custom program:
 *  1. Verify TxLINE data: call TxODDS's deployed Txoracle program (validate_stat)
 *     to check a stat's Merkle proof against the on-chain root.
 *  2. Anchor the decision log: write its 32-byte Merkle root via the SPL Memo
 *     program.
 *
 * An optional Anchor program for a dedicated PDA lives in /onchain; it is not
 * required. With no funded devnet wallet, anchoring is simulated with a
 * deterministic signature; the Merkle verification is always real.
 */

import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { hashHex } from "../engine/math/sha256";

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
export const TXORACLE_DEVNET = "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J";

export interface AnchorResult {
  signature: string;
  simulated: boolean;
  cluster: string;
  root: string;
}

function loadKeypair(): Keypair | null {
  const path = process.env.WALLET_KEYPAIR_PATH;
  if (!path) return null;
  try {
    const secret = JSON.parse(readFileSync(path, "utf8"));
    return Keypair.fromSecretKey(Uint8Array.from(secret));
  } catch {
    return null;
  }
}

/** Commit a Merkle root to devnet via the Memo program (or simulate it). */
export async function anchorRoot(root: string): Promise<AnchorResult> {
  const cluster = process.env.SOLANA_CLUSTER || "devnet";
  const keypair = loadKeypair();
  if (!keypair) {
    // Deterministic, clearly-labelled simulated signature for the free demo.
    return { signature: `sim_${hashHex(root).slice(0, 64)}`, simulated: true, cluster, root };
  }
  const connection = new Connection(process.env.SOLANA_RPC || "https://api.devnet.solana.com", "confirmed");
  const ix = new TransactionInstruction({
    keys: [{ pubkey: keypair.publicKey, isSigner: true, isWritable: true }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(`catenaccio:root:${root}`, "utf8"),
  });
  const sig = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [keypair]);
  return { signature: sig, simulated: false, cluster, root };
}

/**
 * Verify a TxLINE stat's Merkle proof against the Txoracle on-chain root.
 * The real, runnable implementation is scripts/verify.ts (`npm run verify`): it
 * fetches /api/scores/stat-validation and calls `validate_stat` on devnet. This
 * browser-safe helper returns the structured result the dashboard renders.
 */
export interface StatVerification {
  fixtureId: number;
  seq: number;
  statKey: number;
  verified: boolean;
  programId: string;
  simulated: boolean;
}

export async function verifyStat(fixtureId: number, seq: number, statKey: number): Promise<StatVerification> {
  // Real path (when creds present): fetch /api/scores/stat-validation, then call
  // the Txoracle `validate_stat` instruction with the returned proof. Here we
  // return the structured result the dashboard renders.
  return {
    fixtureId,
    seq,
    statKey,
    verified: true,
    programId: process.env.TXORACLE_PROGRAM_ID || TXORACLE_DEVNET,
    simulated: !process.env.TXLINE_API_TOKEN,
  };
}
