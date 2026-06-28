/**
 * Merkle tree + inclusion proofs — the data structure behind every
 * "verify this fill on-chain" receipt.
 *
 * Catenaccio commits the Merkle ROOT of its append-only decision log to Solana
 * (via the SPL Memo program — no custom smart contract required). Anyone can
 * later take a single decision (a leaf), walk the proof path, recompute the
 * root, and confirm it matches the on-chain root. That proves the decision
 * existed at commit time and was not edited afterwards — tamper-evidence and
 * non-repudiation, exactly what an auditor or counterparty needs.
 *
 * NOTE on framing (important for the interview): a Merkle proof proves the DATA
 * is authentic and unchanged. It does NOT prove a decision was "optimal" or
 * "correct". We never claim "trustless"; we claim "tamper-evident & independently
 * verifiable".
 */

import { sha256, toHex, fromHex, utf8 } from "./math/sha256";

const concat = (a: Uint8Array, b: Uint8Array) => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
};

/** Domain-separated hashing (RFC-6962 style) to prevent second-preimage attacks. */
const hashLeaf = (data: Uint8Array) => sha256(concat(Uint8Array.of(0x00), data));
const hashNode = (l: Uint8Array, r: Uint8Array) => sha256(concat(Uint8Array.of(0x01), concat(l, r)));

export interface MerkleProofStep {
  /** sibling hash (hex) */
  sibling: string;
  /** is the sibling on the right of the current node? */
  right: boolean;
}

export interface MerkleProof {
  leafIndex: number;
  leafHash: string;
  root: string;
  path: MerkleProofStep[];
}

export class MerkleTree {
  private leaves: Uint8Array[] = [];
  private levels: Uint8Array[][] = [];

  /** Add a leaf (raw string, e.g. a canonicalised decision record). */
  addLeaf(data: string): number {
    this.leaves.push(hashLeaf(utf8(data)));
    this.dirty = true;
    return this.leaves.length - 1;
  }

  private dirty = true;

  private rebuild() {
    if (this.leaves.length === 0) {
      this.levels = [[]];
      this.dirty = false;
      return;
    }
    const levels: Uint8Array[][] = [this.leaves.slice()];
    while (levels[levels.length - 1].length > 1) {
      const prev = levels[levels.length - 1];
      const next: Uint8Array[] = [];
      for (let i = 0; i < prev.length; i += 2) {
        const l = prev[i];
        const r = i + 1 < prev.length ? prev[i + 1] : prev[i]; // duplicate last if odd
        next.push(hashNode(l, r));
      }
      levels.push(next);
    }
    this.levels = levels;
    this.dirty = false;
  }

  get size() {
    return this.leaves.length;
  }

  root(): string {
    if (this.dirty) this.rebuild();
    if (this.leaves.length === 0) return toHex(sha256(utf8("")));
    return toHex(this.levels[this.levels.length - 1][0]);
  }

  proof(leafIndex: number): MerkleProof {
    if (this.dirty) this.rebuild();
    const path: MerkleProofStep[] = [];
    let idx = leafIndex;
    for (let lvl = 0; lvl < this.levels.length - 1; lvl++) {
      const level = this.levels[lvl];
      const isRight = idx % 2 === 1;
      const siblingIdx = isRight ? idx - 1 : Math.min(idx + 1, level.length - 1);
      path.push({ sibling: toHex(level[siblingIdx]), right: !isRight });
      idx = Math.floor(idx / 2);
    }
    return {
      leafIndex,
      leafHash: toHex(this.levels[0][leafIndex]),
      root: this.root(),
      path,
    };
  }
}

/** Verify a proof independently (this is what a judge/auditor runs). */
export function verifyMerkleProof(proof: MerkleProof): boolean {
  let acc = fromHex(proof.leafHash);
  for (const step of proof.path) {
    const sib = fromHex(step.sibling);
    acc = step.right ? hashNode(acc, sib) : hashNode(sib, acc);
  }
  return toHex(acc) === proof.root;
}
