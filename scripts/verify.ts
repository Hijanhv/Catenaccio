#!/usr/bin/env npx tsx
/**
 * Real on-chain verification of a TxLINE stat via Txoracle.validate_stat (devnet).
 *
 * Fetches a stat and its Merkle proof from /api/scores/stat-validation, then evaluates
 * a predicate against the on-chain daily-scores root with a read-only `.view()` call
 * (no gas, no wallet balance needed). This is the same primitive the agent uses to
 * settle a market — here run for real against live on-chain roots.
 *
 *   npm run verify
 *   VERIFY_FIXTURE=... VERIFY_SEQ=... VERIFY_STATKEY=... npm run verify
 */

import { readFileSync, existsSync } from "node:fs";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, ComputeBudgetProgram, Transaction } from "@solana/web3.js";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const PROGRAM = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
const API = process.env.TXLINE_API_URL || "https://txline-dev.txodds.com/api";
const RPC = process.env.SOLANA_RPC || "https://api.devnet.solana.com";
const fixtureId = Number(process.env.VERIFY_FIXTURE ?? 17952170);
const seq = Number(process.env.VERIFY_SEQ ?? 941);
const statKey = Number(process.env.VERIFY_STATKEY ?? 1002);

const node = (n: any) => ({ hash: n.hash, isRightSibling: n.isRightSibling });

async function main() {
  const jwt = process.env.TXLINE_JWT;
  const tok = process.env.TXLINE_API_TOKEN;
  if (!jwt || !tok) throw new Error("no TxLINE creds — run `npm run subscribe` first");

  const res = await fetch(`${API}/scores/stat-validation?fixtureId=${fixtureId}&seq=${seq}&statKey=${statKey}`, {
    headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": tok },
  });
  if (!res.ok) throw new Error(`stat-validation ${res.status}: ${await res.text()}`);
  const v = await res.json();
  console.log(`fixture ${fixtureId} seq ${seq} statKey ${statKey}: value = ${v.statToProve.value}`);

  const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync("./agent-key.json", "utf8"))));
  const connection = new Connection(RPC, "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(kp), { commitment: "confirmed" });
  const idl = await anchor.Program.fetchIdl(PROGRAM, provider);
  if (!idl) throw new Error("could not fetch on-chain IDL");
  const program = new anchor.Program(idl as anchor.Idl, provider);
  const BN = anchor.BN;

  const fixtureSummary = {
    fixtureId: new BN(v.summary.fixtureId),
    updateStats: {
      updateCount: v.summary.updateStats.updateCount,
      minTimestamp: new BN(v.summary.updateStats.minTimestamp),
      maxTimestamp: new BN(v.summary.updateStats.maxTimestamp),
    },
    eventsSubTreeRoot: v.summary.eventStatsSubTreeRoot,
  };
  const fixtureProof = (v.subTreeProof ?? []).map(node);
  const mainTreeProof = (v.mainTreeProof ?? []).map(node);
  const stat1 = { statToProve: v.statToProve, eventStatRoot: v.eventStatRoot, statProof: (v.statProof ?? []).map(node) };
  const predicate = { threshold: new BN(0), comparison: { greaterThan: {} } };

  const targetTs = v.summary.updateStats.minTimestamp;
  const epochDay = Math.floor(targetTs / (24 * 60 * 60 * 1000));
  const [dailyScoresPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("daily_scores_roots"), new BN(epochDay).toArrayLike(Buffer, "le", 2)],
    PROGRAM,
  );

  // validate_stat returns bool via set_return_data; simulate the tx and read it.
  const cbIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
  const mainIx = await (program.methods as any)
    .validateStat(new BN(targetTs), fixtureSummary, fixtureProof, mainTreeProof, predicate, stat1, null, null)
    .accounts({ dailyScoresMerkleRoots: dailyScoresPda })
    .instruction();

  const tx = new Transaction().add(cbIx).add(mainIx);
  tx.feePayer = kp.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  const sim = await connection.simulateTransaction(tx);

  console.log(`predicate      : statValue(${v.statToProve.value}) > 0`);
  console.log(`daily-roots PDA: ${dailyScoresPda.toBase58()} (epochDay ${epochDay})`);
  if (sim.value.err) {
    console.error("simulation error:", JSON.stringify(sim.value.err));
    console.error((sim.value.logs ?? []).join("\n"));
    process.exit(1);
  }
  const rd = sim.value.returnData;
  const buf = rd?.data?.[0] ? Buffer.from(rd.data[0], "base64") : Buffer.alloc(0);
  const isValid = buf.length > 0 && buf[0] === 1;
  console.log(`Txoracle.validate_stat -> ${isValid}  ${isValid ? "(proof valid against on-chain root)" : "(rejected)"}`);
}

main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  if (e?.logs) console.error(e.logs.join("\n"));
  process.exit(1);
});
