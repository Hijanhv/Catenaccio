# Catenaccio, demo video script (~90s)

The brief weights the demo heavily and says to *show it working*. This script is built to
prove, in order: live TxLINE ingestion → the ~400ms defended reprice → on-chain verification
→ settlement. Keep it under 100 seconds. Record at 1440p, no music, calm voiceover.

## Before you record
- [ ] `npm run subscribe` has been run (so `.env.local` has a live token) and `npm run dev` is up.
- [ ] Two terminals ready: one for `npm run live`, one for `npm run verify` / `npm run anchor`.
- [ ] Browser tabs: the live dashboard at `/app`, and a Solana explorer tab (devnet).
- [ ] Do a dry run once; goals in the dashboard replay fire on a fixed script, so you can time them.

## Shot list

**0:00-0:10, The problem (landing page)**
- On screen: the landing page hero.
- Say: "When a goal is scored, the fair price moves instantly, but a slow book takes seconds
  to update. In that gap it gets picked off. Catenaccio is an autonomous agent that closes it."

**0:10-0:28, Live TxLINE data (terminal)**
- On screen: run `npm run live`. Let the raw packets scroll.
- Say: "This is real World Cup data from TxLINE's API, de-margined consensus odds and scores,
  streaming over SSE into the agent. It's authorized by an on-chain subscription on Solana devnet."
- Point at a `[raw odds]` line and the `win Home 42% | Sharp move …` line: "Real packets in,
  fair value and signals out."

**0:28-0:58, The defended reprice (dashboard /app)**
- On screen: the dashboard. Wait for a goal in the replay.
- Say: "Here's the moment that matters. A goal is confirmed."
- On the goal: point at the reprice badge (~400ms) and the Courtsider Cam.
- Say: "The agent suspends, reprices in about 400 milliseconds, and reopens. A courtsider on a
  broadcast-delayed feed hits the old price and gets rejected. The book to the left leaks real
  dollars; Catenaccio leaks zero." Point at the Signals and Risk panels: "Same engine, live
  signals and hard risk limits."

**0:58-1:18, On-chain, for real (terminal)**
- On screen: run `npm run verify`.
- Say: "Every price is checked against TxLINE's data on Solana. This calls Txoracle's
  validate_stat on a real Merkle proof." (result prints `true`) "It returns true against the
  on-chain root. No trusted oracle."
- Run `npm run anchor`, click the printed explorer link.
- Say: "And the agent's decision log is anchored on devnet, here's the transaction."

**1:18-1:30, Settlement + close (dashboard)**
- On screen: the Settlement panel (after full time in the replay).
- Say: "At full time each market settles against that same on-chain proof. Autonomous agent,
  live TxLINE data, ~400ms defense, verifiable end to end. Repo and live demo are in the
  description." Show the URL: catenaccio-six.vercel.app.

## What each beat proves (map to judging)
- Live terminal → Core Functionality & Data Ingestion (must integrate TxLINE as a live input).
- Dashboard reprice loop → Autonomous Operation + Innovation & Novelty.
- verify / anchor → Production Readiness + the verifiable-data hook.
- Settlement → closes the loop; resolution is trustless, not asserted.
- `npm run replay:real` → the reprice on real captured TxLINE odds with a measured, sub-ms engine hot path; reproducible with no credentials.
