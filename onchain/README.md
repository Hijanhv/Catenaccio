# On-chain layer: how much Rust?

Catenaccio has two on-chain responsibilities. Neither requires a custom Rust program:

| Job | How | Rust we write |
|---|---|---|
| Verify TxLINE data | Call TxODDS's deployed `Txoracle` program (`validate_stat`) from a TypeScript client to check a stat's Merkle proof against the on-chain root | 0 lines |
| Anchor the decision log | Write the 32-byte Merkle root as a transaction memo via the SPL Memo program | 0 lines |

So the live system is TypeScript (`lib/onchain/solana.ts`).

## Optional: `programs/catenaccio_log` (~50 lines of Rust)

If you want a dedicated, queryable on-chain account for the audit trail instead of memos,
deploy the Anchor program in `programs/catenaccio_log`. It has one PDA and one instruction
(`commit_root`). It is optional; the dashboard, the verification, and the demo all run
without it.

```bash
anchor build && anchor deploy --provider.cluster devnet
```

Using TxODDS's own program for verification and Memo for anchoring keeps the on-chain
surface small and avoids writing a program that already exists.
