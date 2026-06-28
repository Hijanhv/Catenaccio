import { describe, it, expect } from "vitest";
import { hashHex, sha256, utf8, toHex } from "@/lib/engine/math/sha256";
import { MerkleTree, verifyMerkleProof } from "@/lib/engine/merkle";

describe("sha256", () => {
  it("matches canonical NIST vectors", () => {
    expect(toHex(sha256(utf8("")))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(hashHex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hashHex("hello")).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });
});

describe("Merkle tree", () => {
  it("produces a verifiable inclusion proof for every leaf", () => {
    const tree = new MerkleTree();
    for (let i = 0; i < 17; i++) tree.addLeaf(`decision-${i}-${i * 7}`);
    for (let i = 0; i < 17; i++) {
      const proof = tree.proof(i);
      expect(proof.root).toBe(tree.root());
      expect(verifyMerkleProof(proof)).toBe(true);
    }
  });

  it("rejects a tampered proof (tamper-evidence)", () => {
    const tree = new MerkleTree();
    for (let i = 0; i < 8; i++) tree.addLeaf(`d-${i}`);
    const proof = tree.proof(3);
    // flip the leaf → proof must fail
    const tampered = { ...proof, leafHash: hashHex("forged") };
    expect(verifyMerkleProof(tampered)).toBe(false);
  });

  it("changes the root when any leaf changes", () => {
    const a = new MerkleTree();
    const b = new MerkleTree();
    ["x", "y", "z"].forEach((s) => a.addLeaf(s));
    ["x", "y", "Z"].forEach((s) => b.addLeaf(s));
    expect(a.root()).not.toBe(b.root());
  });
});
