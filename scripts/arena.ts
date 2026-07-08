#!/usr/bin/env npx tsx
/**
 * Agent vs Agent Arena — tournament runner.
 *
 * Runs several strategy agents over a tournament of matches on the same TxLINE-shaped
 * feed, prints the leaderboard, and anchors the final standings on Solana devnet so
 * the result is settled on-chain and tamper-evident.
 *
 *   npm run arena
 *   npm run arena -- 500     # number of matches
 */

import { existsSync } from "node:fs";
import { runTournament } from "../lib/arena/arena";
import { anchorRoot } from "../lib/onchain/solana";
import { hashHex } from "../lib/engine/math/sha256";

if (!process.env.WALLET_KEYPAIR_PATH && existsSync("./agent-key.json")) {
  process.env.WALLET_KEYPAIR_PATH = "./agent-key.json";
}

async function main() {
  const matches = Number(process.argv[2] ?? 200);
  const table = runTournament(matches);

  console.log(`\nAgent vs Agent Arena — ${matches} matches\n`);
  console.log("  rank  agent        P&L        ROI      hit-rate   bets");
  console.log("  ----  ---------    -------    ------    --------   ----");
  table.forEach((s, i) => {
    console.log(
      `  ${String(i + 1).padEnd(4)}  ${s.name.padEnd(11)}  ${fmt(s.pnl).padStart(7)}    ${(s.roi * 100).toFixed(1).padStart(5)}%    ${(s.hitRate * 100).toFixed(0).padStart(6)}%   ${String(s.bets).padStart(4)}`,
    );
  });
  console.log(`\n  Winner: ${table[0].name} — the agent that reacts fastest to goals.`);

  // settle the standings on-chain (tamper-evident record of who won)
  const digest = hashHex(table.map((s) => `${s.name}:${s.pnl}`).join("|"));
  console.log("\n  anchoring final standings on devnet …");
  const res = await anchorRoot(digest);
  if (res.simulated) {
    console.log(`  standings digest ${digest.slice(0, 16)}… (simulated — run \`npm run subscribe\` for a real tx)`);
  } else {
    console.log(`  settled on-chain: https://explorer.solana.com/tx/${res.signature}?cluster=devnet`);
  }
}

const fmt = (n: number) => `${n < 0 ? "-" : "+"}$${Math.abs(n)}`;

main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
