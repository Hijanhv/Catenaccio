# On-chain layer — how much Rust? (Answer: ~none required)

Catenaccio has two on-chain responsibilities. **Neither requires us to write a Rust
smart contract** for the submission to work:

| Job | How we do it | Rust we write |
|---|---|---|
| **Verify TxLINE data** (the hero) | Call TxODDS's already-deployed **`Txoracle`** Anchor program (`validate_stat`) from a TypeScript client to check a goal/odds Merkle proof against the on-chain root | **0 lines** |
| **Anchor our decision log** | Write the 32-byte Merkle root as a transaction memo via Solana's standard **SPL Memo** program | **0 lines** |

So the live system is **pure TypeScript on the client side** (`lib/onchain/solana.ts`).

## Optional: `programs/catenaccio_log` (~50 lines of Rust)

If you want a *dedicated, queryable* on-chain account for the audit trail (instead of
memos), deploy the tiny Anchor program in `programs/catenaccio_log`. It has **one PDA
and one instruction** (`commit_root`). It is genuinely optional — the dashboard, the
verification, and the demo all run without it.

```bash
# only if you choose to deploy the optional program
anchor build && anchor deploy --provider.cluster devnet
```

**Why this matters for judging:** "Production Readiness" rewards using the right tool,
not the most code. Leaning on TxODDS's own program for verification (and Memo for
anchoring) is the clean, idiomatic Solana approach and keeps the trust surface tiny.
