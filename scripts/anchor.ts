#!/usr/bin/env npx tsx
/**
 * Anchor a real decision-log Merkle root on Solana devnet via the SPL Memo program.
 * Uses the devnet wallet provisioned by scripts/subscribe.ts (./agent-key.json), so
 * the "anchored on Solana" claim is a real, clickable transaction, not a simulation.
 *
 *   npm run anchor
 */

import { existsSync } from "node:fs";
import { CatenaccioEngine } from "../lib/engine/engine";
import { buildMatch } from "../lib/engine/replay";
import { anchorRoot } from "../lib/onchain/solana";

if (!process.env.WALLET_KEYPAIR_PATH && existsSync("./agent-key.json")) {
  process.env.WALLET_KEYPAIR_PATH = "./agent-key.json";
}

async function main() {
  const { events, homeTeam, awayTeam, fixtureId } = buildMatch();
  const engine = new CatenaccioEngine({ fixtureId, homeTeam, awayTeam, seed: 7 });
  for (const { event } of events) engine.apply(event);
  const snap = engine.snapshot();

  console.log(`decision-log root : ${snap.merkleRoot}`);
  console.log(`decisions anchored: ${snap.decisionCount}`);
  console.log("writing Memo transaction to devnet ...");

  const res = await anchorRoot(snap.merkleRoot);
  if (res.simulated) {
    console.log("SIMULATED (no funded wallet found at ./agent-key.json, run `npm run subscribe` first)");
    console.log("signature:", res.signature);
  } else {
    console.log("ANCHORED ON DEVNET");
    console.log("signature:", res.signature);
    console.log("explorer :", `https://explorer.solana.com/tx/${res.signature}?cluster=devnet`);
  }
}

main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
