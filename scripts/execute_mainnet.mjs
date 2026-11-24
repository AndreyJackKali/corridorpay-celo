#!/usr/bin/env node
/**
 * CorridorPay Live Celo Mainnet Execution Script
 *
 * Preconditions:
 *   - ADMIN_PRIVATE_KEY set in environment (never committed)
 *   - Altana smart wallet funded with CELO (gas/Keystore registration) + USDT on Celo Mainnet (42220)
 *   - RECIPIENT_ADDRESS set to an independent recipient wallet outside the team
 *
 * Flow:
 *   1. Derive Altana Smart Account on Celo Mainnet with ERC-8021 attribution `altana,corridorpay,celo_76dc8c3315b1`
 *   2. Grant scoped on-chain Altana session key (daily USDT cap + Textile LimitOrderReactor & stablecoin allowlist)
 *      -> Automatically registers the agent's ERC-8004 identity on Celo Mainnet (0x8004A169...)
 *   3. Sign Textile FX v2 takerProof & request firm quote (USDT -> wBRL / cNGN / wARS)
 *   4. Execute atomic settlement + local stablecoin transfer under the scoped session key
 *   5. Verify ERC-8021 attribution tag on-chain via `@celo/attribution-tags` `verifyTx`
 */
import { privateKeyToAccount } from "viem/accounts";
import {
  buildSettlementBatchCalls,
  createCeloPublicClient,
  deriveAltanaWallet,
  ERC20_ABI,
  grantCorridorSession,
  verifyMainnetAttribution,
} from "../src/altana.mjs";
import { buildTakerProof, requestFirmQuote } from "../src/textile.mjs";
import { CELO_CHAIN_ID, TOKENS } from "../src/config.mjs";

async function run() {
  const adminPk = process.env.ADMIN_PRIVATE_KEY;
  const recipient = process.env.RECIPIENT_ADDRESS;
  const corridor = process.env.CORRIDOR || "wBRL";
  const amountUsdt = process.env.AMOUNT_USDT || "1";
  const dryRun = process.env.DRY_RUN !== "false";

  if (!adminPk) throw new Error("Set ADMIN_PRIVATE_KEY env var");
  if (!recipient) throw new Error("Set RECIPIENT_ADDRESS env var (independent recipient)");

  const { client, wallet, smartAccountAddress } = await deriveAltanaWallet(adminPk);
  const publicClient = createCeloPublicClient();

  const [celoBal, usdtBal] = await Promise.all([
    publicClient.getBalance({ address: smartAccountAddress }),
    publicClient.readContract({
      address: TOKENS.USDT.address,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [smartAccountAddress],
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        smartAccountAddress,
        celoBalanceWei: celoBal.toString(),
        usdtBalanceRaw: usdtBal.toString(),
        corridor: `USDT->${corridor}`,
        amountUsdt,
        recipient,
        dryRun,
      },
      null,
      2
    )
  );

  if (dryRun) {
    console.log("DRY_RUN=true — skipping on-chain broadcast. Fund wallet and run with DRY_RUN=false.");
    return;
  }
  if (celoBal === 0n) throw new Error("Smart account has 0 CELO for Keystore registration & gas");
  if (usdtBal === 0n) throw new Error("Smart account has 0 USDT on Celo Mainnet");

  // Step 1: Grant scoped Altana session key (auto-registers ERC-8004 on first admin action)
  const granted = await grantCorridorSession(adminPk, {
    dailyUsdtCapHuman: process.env.DAILY_CAP_USDT || "50",
    expiryDays: 7,
    allowedCorridors: [corridor],
  });
  console.log("Session granted:", granted.session.transactionHash);
  console.log("ERC-8004 registration:", granted.session.agentIdentities || "pending/checked");

  // Step 2: Request firm Textile FX quote
  const account = privateKeyToAccount(adminPk);
  const takerProof = await buildTakerProof(account, CELO_CHAIN_ID);
  const { quote } = await requestFirmQuote({
    sellSymbol: "USDT",
    buySymbol: corridor,
    sellAmountHuman: amountUsdt,
    taker: smartAccountAddress,
    takerProof,
  });

  if (!quote || !quote.calldata) {
    throw new Error(`No executable firm quote returned: ${JSON.stringify(quote)}`);
  }

  // Step 3: Execute atomic swap + independent recipient payout under Altana session key
  const calls = buildSettlementBatchCalls({
    usdtAmountRaw: quote.sellAmount,
    reactorCalldata: quote.calldata,
    buyTokenAddress: TOKENS[corridor].address,
    recipientAddress: recipient,
    payoutAmountRaw: quote.buyAmount,
  });
  const execRes = await client.execute({
    session: granted.session,
    calls,
  });
  console.log("Settlement tx:", execRes.transactionHash, execRes.status);

  // Step 4: Verify ERC-8021 attribution tag on-chain
  const verified = await verifyMainnetAttribution(execRes.transactionHash);
  console.log("Attribution verification:", JSON.stringify(verified, null, 2));
}

run().catch((err) => {
  console.error("EXECUTION ERROR:", err.message);
  process.exit(1);
});
