// Altana Non-Custodial Agent Wallet + On-Chain Session Key Policy + ERC-8021 Attribution (Celo Mainnet)
import { createClient, CELO, signerFromPrivateKey } from "@altananetwork/sdk";
import { toDataSuffix, fromDataSuffix, withAttribution, verifyTx } from "@celo/attribution-tags";
import { createPublicClient, createWalletClient, encodeFunctionData, http, parseAbi } from "viem";
import { celo } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { APP_CODES, CELO_RPC_URL, CONTRACTS, LOOPS_ATTRIBUTION_TAG, TOKENS, parseTokenUnits } from "./config.mjs";

export const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
]);

/**
 * Create an Altana SDK client bound to Celo Mainnet with ERC-8021 attribution
 * and automatic ERC-8004 agent identity registration on first admin action.
 */
export function createCorridorAltanaClient({
  appCodes = APP_CODES,
  agentName = "CorridorPay Agent",
  agentDescription = "Non-custodial cross-border stablecoin payroll & supplier settlement agent on Celo Mainnet via Altana session keys and Textile FX.",
  agentEndpoint = "https://github.com/AndreyJackKali/corridorpay-celo",
} = {}) {
  return createClient({
    chains: [CELO],
    appCode: appCodes,
    agentIdentity: {
      name: agentName,
      description: agentDescription,
      endpoint: agentEndpoint,
    },
  });
}

/**
 * Derive counterfactual Altana Smart Account address on Celo Mainnet (zero gas).
 */
export async function deriveAltanaWallet(adminPrivateKey) {
  const client = createCorridorAltanaClient();
  const signer = signerFromPrivateKey(adminPrivateKey);
  const wallet = await client.createWallet({ signer });
  return {
    client,
    signer,
    wallet,
    smartAccountAddress: wallet.address,
    attributionTag: LOOPS_ATTRIBUTION_TAG,
    appCodes: APP_CODES,
  };
}

/**
 * Build a strictly scoped Altana session policy:
 * - Allowlist ONLY Textile FX LimitOrderReactor, Permit2, USDT, and supported local stablecoins
 * - Enforce daily USDT spend cap on-chain in Altana Keystore
 * - Bounded expiry (default 7 days), revocable in 1 transaction by owner
 */
export function buildSessionPolicy({
  dailyUsdtCapHuman = "100",
  expiryDays = 7,
  allowedCorridors = ["cNGN", "IDRX", "wARS", "wBRL", "wCOP"],
} = {}) {
  const dailyLimitRaw = parseTokenUnits(dailyUsdtCapHuman, TOKENS.USDT.decimals);
  const callTargets = [
    { to: CONTRACTS.TEXTILE_LIMIT_ORDER_REACTOR },
    { to: CONTRACTS.PERMIT2 },
    { to: TOKENS.USDT.address },
    ...allowedCorridors
      .filter((c) => TOKENS[c])
      .map((c) => ({ to: TOKENS[c].address })),
  ];
  const expiry = Math.floor(Date.now() / 1000) + expiryDays * 24 * 60 * 60;
  return {
    permissions: {
      calls: callTargets,
      spend: [
        {
          limit: dailyLimitRaw,
          period: "day",
          token: TOKENS.USDT.address,
        },
      ],
    },
    expiry,
    summary: {
      dailyUsdtCapHuman: String(dailyUsdtCapHuman),
      dailyLimitRaw: dailyLimitRaw.toString(),
      expiryIso: new Date(expiry * 1000).toISOString(),
      allowedContractsCount: callTargets.length,
      allowedTargets: callTargets.map((c) => c.to),
    },
  };
}

/**
 * Grant on-chain Altana session key on Celo Mainnet Keystore.
 * First admin call also triggers automatic ERC-8004 agent identity registration.
 */
export async function grantCorridorSession(adminPrivateKey, policyOpts = {}) {
  const { client, signer, wallet } = await deriveAltanaWallet(adminPrivateKey);
  const policy = buildSessionPolicy(policyOpts);
  const session = await client.grantSession({
    wallet,
    signer,
    permissions: policy.permissions,
    expiry: policy.expiry,
  });
  return {
    walletAddress: wallet.address,
    session,
    policy: policy.summary,
  };
}

/**
 * Create a standalone viem wallet client wrapped with @celo/attribution-tags@^0.5.0
 * for direct EOA fallback or verification tooling.
 */
export function createTaggedViemWallet(privateKey) {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain: celo,
    transport: http(CELO_RPC_URL),
  }).extend(withAttribution(LOOPS_ATTRIBUTION_TAG));
}

export function createCeloPublicClient() {
  return createPublicClient({
    chain: celo,
    transport: http(CELO_RPC_URL),
  });
}

/**
 * Encode & verify ERC-8021 data suffix for our Loops House attribution tag.
 */
export function getAttributionMetadata(codes = LOOPS_ATTRIBUTION_TAG) {
  const suffix = toDataSuffix(codes);
  const decoded = fromDataSuffix(suffix);
  return { codes, suffix, decoded };
}

/**
 * Verify that an on-chain Celo Mainnet transaction hash carries our official Loops attribution tag.
 */
export async function verifyMainnetAttribution(txHash) {
  const client = createCeloPublicClient();
  const result = await verifyTx({ client, hash: txHash });
  return {
    txHash,
    decoded: result,
    hasOfficialTag: Boolean(result?.codes?.includes(LOOPS_ATTRIBUTION_TAG)),
  };
}

/**
 * Build atomic batch calls (approve + settle + recipient transfer) for Altana session.execute().
 */
export function buildSettlementBatchCalls({
  usdtAmountRaw,
  reactorCalldata,
  buyTokenAddress,
  recipientAddress,
  payoutAmountRaw,
}) {
  const calls = [
    {
      to: TOKENS.USDT.address,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CONTRACTS.PERMIT2, BigInt(usdtAmountRaw)],
      }),
    },
  ];
  if (reactorCalldata) {
    calls.push({
      to: CONTRACTS.TEXTILE_LIMIT_ORDER_REACTOR,
      data: reactorCalldata,
    });
  }
  calls.push({
    to: buyTokenAddress,
    data: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [recipientAddress, BigInt(payoutAmountRaw)],
    }),
  });
  return calls;
}
