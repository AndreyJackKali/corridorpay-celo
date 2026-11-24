# CorridorPay — Autonomous Non-Custodial Stablecoin Payroll & Supplier Settlement Agent on Celo Mainnet

Built for **Celo: Agents Open for Business** (Loops House) targeting:
- **Track 1: Stablecoin Corridors (Textile FX)** — USD₮ to local Celo stablecoins (`wBRL`, `wARS`, `cNGN`, `wCOP`, `IDRX`)
- **Track 4: Altana Agent Wallets** — Non-custodial Altana Smart Wallet with on-chain Keystore session key (daily USD₮ spend cap, strict contract allowlist, bounded expiry, 1-tx revoke)

## Named User & Real Job Done
- **Named User:** Andrey — Operations Lead at **Veridian Distributed Studio** (managing remote engineering, QA, security, and documentation contractors across Brazil, Argentina, Nigeria, Colombia, and Indonesia).
- **The Job:** Convert a single USD₮ treasury into each contractor's local stablecoin (`wBRL`, `wARS`, `cNGN`, `wCOP`, `IDRX`) and settle payouts directly to their wallets on Celo Mainnet — **without** paying $30–$45 SWIFT wire fees / 3–5 day delays and **without** ever handing treasury private keys to an AI agent.
- **Measured Savings:** On a 5-contractor batch ($50 USD₮ test batch), Textile FX fees total ~$0.01 USD₮ (~2 bps) vs. ~$160 traditional wire + FX spread baseline, settling in ~5 seconds.

## Architecture
```
[Invoice Manifest JSON]
        │
        ▼
[CorridorPay Policy Engine] ── rejects self-transfers, unlisted tokens, & cap breaches
        │
        ▼
[Textile FX RFQ v2 API] ────── live Celo Mainnet quotes (USD₮ -> wBRL/wARS/cNGN/wCOP/IDRX)
        │
        ▼
[Altana SDK v1.2.0 (CELO)] ─── non-custodial smart wallet + on-chain Keystore session key
        │                      • Daily USD₮ spend cap enforced on-chain
        │                      • Contract allowlist: LimitOrderReactor + Permit2 + approved tokens
        │                      • Auto ERC-8004 agent identity registration (0x8004A169...)
        │                      • Auto ERC-8021 attribution tag: altana,corridorpay,celo_76dc8c3315b1
        ▼
[Celo Mainnet (42220)] ─────── atomic approve + Textile FX settle + local stablecoin payout
```

## Verified Celo Mainnet Contracts & Identity
| Component | Address / Value |
|---|---|
| Chain | Celo Mainnet (`chainId: 42220`, RPC `https://forno.celo.org`) |
| ERC-8021 Attribution Tag | `celo_76dc8c3315b1` (`@celo/attribution-tags@0.5.0` & `@altananetwork/sdk@1.2.0`) |
| ERC-8004 Agent Registry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| Textile `LimitOrderReactor` | `0xa9AA0a64769cBed4d3B1Ceb4Df01CdE915C235b3` |
| Permit2 Singleton | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| USD₮ (6 dec) | `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e` |
| cNGN (6 dec) | `0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f` |
| IDRX (2 dec) | `0x18Bc5bcC660cf2B9cE3cd51a404aFe1a0cBD3C22` |
| wARS (18 dec) | `0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D` |
| wBRL (18 dec) | `0xD76f5Faf6888e24D9F04Bf92a0c8B921FE4390e0` |
| wCOP (18 dec) | `0x8a1D45e102e886510e891d2Ec656a708991e2D76` |
| wMXN (18 dec) | `0x337E7456B420bD3481e7FA61fA9850343d610d34` |

## Quickstart & Reproduction
```bash
npm install

# 1. Run full automated test suite (live Textile FX Celo quotes, live Celo RPC bytecode, ERC-8021 tag & Altana SDK)
npm test

# 2. Fetch live Textile FX quotes across all Celo Mainnet corridors
npm run rates

# 3. Validate Altana session policy & generate a live multi-corridor payroll settlement plan
npm run plan

# 4. Derive counterfactual Altana Smart Wallet & inspect ERC-8021 attribution suffix
npm run wallet

# 5. Launch live interactive dashboard (http://localhost:8742)
npm run serve
```

## Mainnet Settlement Execution
```bash
ADMIN_PRIVATE_KEY=0x... \
RECIPIENT_ADDRESS=0x... \
CORRIDOR=wBRL \
AMOUNT_USDT=1 \
DRY_RUN=false \
node scripts/execute_mainnet.mjs
```

## Security Model
- **Zero agent custody:** The agent only receives an Altana session key scoped on-chain in the public Altana Keystore (`dailyUsdtCap`, strict contract allowlist, 7-day expiry).
- **1-tx emergency revoke:** The treasury owner can revoke the session key in a single on-chain transaction via `client.revokeSession()`.
- **Independent recipient enforcement:** The policy engine rejects any payout targeting the treasury wallet itself.
- **Deterministic attribution:** Every transaction sent via `@altananetwork/sdk` carries `altana,corridorpay,celo_76dc8c3315b1` and is independently verified via `@celo/attribution-tags` `verifyTx()`.
