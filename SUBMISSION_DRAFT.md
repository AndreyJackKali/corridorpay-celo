# CorridorPay — Loops House Submission Draft (`Celo: Agents Open for Business`)

## Project Name
**CorridorPay** — Autonomous Non-Custodial Stablecoin Payroll & Supplier Settlement Agent on Celo Mainnet

## Target Tracks (2 Tracks, up to $1,750 CELO)
1. **Track 1: Stablecoin Corridors (Textile FX)** — `$1,000 / $600 / $400`
2. **Track 4: Altana Agent Wallets** — `$750 / $250 + 25k XP`

## One-Line Tagline
Non-custodial Celo Mainnet payroll & supplier settlement agent that converts a single USD₮ treasury into local stablecoins (`wBRL`, `wARS`, `cNGN`, `wCOP`, `IDRX`) via Textile FX RFQ v2 inside an on-chain Altana session key with ERC-8004 identity and ERC-8021 attribution.

## Named User & Real Job Done
- **Named User:** Andrey — Operations Lead at Veridian Distributed Studio, coordinating remote engineering, QA, security, and documentation contractors across Brazil, Argentina, Nigeria, Colombia, and Indonesia.
- **Problem Solved:** Paying 5 international contractors via traditional wires costs ~$160 in SWIFT fees + FX spreads and takes 3–5 business days, while handing a raw treasury private key to an autonomous AI agent creates catastrophic custody risk.
- **How CorridorPay Solves It:**
  1. Ingests a structured payroll manifest (`examples/payroll.json`) and enforces hard pre-flight policy checks (rejects self-transfers, unlisted corridors, and daily spend cap breaches).
  2. Fetches live Celo Mainnet quotes from **Textile FX RFQ v2** (`USDT -> wBRL, wARS, cNGN, wCOP, IDRX`) at ~2 bps (~$0.0086 total fee on a $43 batch — **$159.99 savings** vs. SWIFT, ~5s settlement).
  3. Executes through a counterfactual **Altana Smart Wallet (`@altananetwork/sdk@1.2.0`)** using an on-chain **Keystore session key** scoped strictly to a daily USD₮ cap, 7-day expiry, and contract allowlist (`LimitOrderReactor`, `Permit2`, approved local stablecoins) with 1-tx owner revoke (`client.revokeSession()`).
  4. Automatically registers agent identity via **ERC-8004** (`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`) and appends the official Loops House **ERC-8021** attribution tag `celo_76dc8c3315b1` (`altana,corridorpay,celo_76dc8c3315b1`), byte-for-byte verified with `@celo/attribution-tags@0.5.0`.

## Public Links & Artifacts
- **GitHub Repository:** https://github.com/AndreyJackKali/corridorpay-celo
- **Live Interactive Dashboard:** https://andreyjackkali.github.io/corridorpay-celo/
- **1-Page Printable Judge Brief:** https://andreyjackkali.github.io/corridorpay-celo/judge-brief.html
- **8-Slide Pitch Deck:** https://andreyjackkali.github.io/corridorpay-celo/deck.html
- **Narrated HD Demo Video:** https://andreyjackkali.github.io/corridorpay-celo/demo.mp4
- **Logo SVG:** https://andreyjackkali.github.io/corridorpay-celo/logo.svg
- **Loops House Artifact ID:** `b09ee5ef-282d-4547-ba9a-bc486634353c`

## Verified Technical Details (Celo Mainnet — Chain ID `42220`)
- **ERC-8021 Attribution Tag:** `celo_76dc8c3315b1`
- **ERC-8021 Encoded Suffix:** `0x63656c6f5f373664633863333331356231110080218021802180218021802180218021`
- **Deterministic Altana Wallet / Treasury Address:** `0x5C7852265dAC8d322d761ca5308D18986CCAb32C`
- **ERC-8004 Registry:** `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- **Textile `LimitOrderReactor`:** `0xa9AA0a64769cBed4d3B1Ceb4Df01CdE915C235b3`
- **Automated Verification:** `9/9` Node tests PASS against live Celo Mainnet RPC (`https://forno.celo.org`), live Textile FX RFQ v2 quotes, `@altananetwork/sdk@1.2.0`, and `@celo/attribution-tags@0.5.0` (verified in GitHub Actions CI).

## Mainnet TX Checklist (Execute as soon as Celo Hackathon Faucets `PM2M4C` / `QXO4ND` land)
- [ ] Run `ADMIN_PRIVATE_KEY=... RECIPIENT_ADDRESS=0xF3c1a43c79Ba76193Ab73cc4e9C22B6ff08e078e CORRIDOR=wBRL AMOUNT_USDT=1 DRY_RUN=false node scripts/execute_mainnet.mjs`
- [ ] Paste ERC-8004 registration tx, Altana Keystore session grant tx, and Textile FX settlement tx (`celo_76dc8c3315b1` verified via `verifyTx`) below before final submission on Loops House (deadline: Dec 7, 2026 09:00 GMT).
