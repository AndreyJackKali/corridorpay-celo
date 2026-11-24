import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { privateKeyToAccount } from "viem/accounts";

import {
  CELO_CHAIN_ID,
  CONTRACTS,
  LOOPS_ATTRIBUTION_TAG,
  TOKENS,
  formatTokenUnits,
  parseTokenUnits,
} from "../src/config.mjs";
import {
  buildSessionPolicy,
  buildSettlementBatchCalls,
  createCeloPublicClient,
  deriveAltanaWallet,
  getAttributionMetadata,
} from "../src/altana.mjs";
import { previewQuote, scanCorridors, buildTakerProof } from "../src/textile.mjs";
import { validatePayrollPolicy, buildPayrollPlan } from "../src/payroll.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const LOOPS_OFFICIAL_SUFFIX =
  "0x63656c6f5f373664633863333331356231110080218021802180218021802180218021";

test("1. ERC-8021 attribution suffix matches official Loops House celo_76dc8c3315b1 tag byte-for-byte", () => {
  const meta = getAttributionMetadata(LOOPS_ATTRIBUTION_TAG);
  assert.equal(meta.suffix.toLowerCase(), LOOPS_OFFICIAL_SUFFIX.toLowerCase());
  assert.ok(meta.decoded);
  assert.deepEqual(meta.decoded.codes, [LOOPS_ATTRIBUTION_TAG]);
});

test("2. Altana SDK derives deterministic counterfactual smart wallet on Celo Mainnet", async () => {
  const derived = await deriveAltanaWallet(TEST_PK);
  assert.match(derived.smartAccountAddress, /^0x[0-9a-fA-F]{40}$/);
  assert.equal(derived.attributionTag, LOOPS_ATTRIBUTION_TAG);
  assert.deepEqual(derived.appCodes, ["corridorpay", LOOPS_ATTRIBUTION_TAG]);
});

test("3. Altana session policy allowlists only Textile FX Reactor, Permit2, USDT, and approved local stablecoins", () => {
  const policy = buildSessionPolicy({
    dailyUsdtCapHuman: "75",
    expiryDays: 7,
    allowedCorridors: ["wBRL", "wARS", "cNGN", "wCOP", "IDRX"],
  });
  assert.equal(policy.permissions.spend[0].limit, 75_000_000n);
  assert.equal(policy.permissions.spend[0].token, TOKENS.USDT.address);
  assert.equal(policy.permissions.spend[0].period, "day");
  assert.equal(policy.permissions.calls.length, 8);
  const targets = policy.summary.allowedTargets;
  assert.ok(targets.includes(CONTRACTS.TEXTILE_LIMIT_ORDER_REACTOR));
  assert.ok(targets.includes(CONTRACTS.PERMIT2));
  assert.ok(targets.includes(TOKENS.wBRL.address));
});

test("4. Payroll policy rejects self-transfers, cap breaches, and unlisted corridor tokens", () => {
  const treasury = "0x1234567890123456789012345678901234567890";
  const badManifest = {
    payouts: [
      { contractor: "Self", recipient: treasury, currency: "wBRL", amountUsdt: "10" },
      { contractor: "OverCap", recipient: "0xF3c1a43c79Ba76193Ab73cc4e9C22B6ff08e078e", currency: "cNGN", amountUsdt: "95" },
      { contractor: "BadToken", recipient: "0xF3c1a43c79Ba76193Ab73cc4e9C22B6ff08e078e", currency: "USDT", amountUsdt: "5" },
    ],
  };
  const check = validatePayrollPolicy(badManifest, {
    treasuryAddress: treasury,
    dailyUsdtCapHuman: "100",
  });
  assert.equal(check.ok, false);
  assert.equal(check.errors.length, 3);
  assert.match(check.errors[0], /self-transfer rejected/i);
  assert.match(check.errors[1], /unsupported local corridor/i);
  assert.match(check.errors[2], /exceeds Altana on-chain daily session spend cap/i);
});

test("5. Atomic settlement batch calldata encodes approve + reactor settle + ERC20 transfer", () => {
  const calls = buildSettlementBatchCalls({
    usdtAmountRaw: "10000000",
    reactorCalldata: "0xdeadbeef",
    buyTokenAddress: TOKENS.wBRL.address,
    recipientAddress: "0xF3c1a43c79Ba76193Ab73cc4e9C22B6ff08e078e",
    payoutAmountRaw: "58000000000000000000",
  });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].to, TOKENS.USDT.address);
  assert.equal(calls[1].to, CONTRACTS.TEXTILE_LIMIT_ORDER_REACTOR);
  assert.equal(calls[2].to, TOKENS.wBRL.address);
  assert.ok(calls[0].data.startsWith("0x095ea7b3")); // approve selector
  assert.ok(calls[2].data.startsWith("0xa9059cbb")); // transfer selector
});

test("6. EIP-712 Textile FX takerProof signing produces valid 65-byte signature", async () => {
  const account = privateKeyToAccount(TEST_PK);
  const proof = await buildTakerProof(account, CELO_CHAIN_ID);
  assert.match(proof.nonce, /^0x[0-9a-f]{64}$/);
  assert.match(proof.signature, /^0x[0-9a-f]{130}$/);
  assert.ok(typeof proof.issuedAt === "number" && proof.issuedAt > 1700000000000);
});

test("7. Live Celo Mainnet RPC confirms bytecode on ERC-8004 Registry & Textile LimitOrderReactor", async () => {
  const client = createCeloPublicClient();
  const [regCode, reactorCode, usdtCode] = await Promise.all([
    client.getCode({ address: CONTRACTS.ERC8004_REGISTRY }),
    client.getCode({ address: CONTRACTS.TEXTILE_LIMIT_ORDER_REACTOR }),
    client.getCode({ address: TOKENS.USDT.address }),
  ]);
  assert.ok(regCode && regCode.length > 10, "ERC-8004 Registry must have deployed bytecode on Celo Mainnet");
  assert.ok(reactorCode && reactorCode.length > 10, "Textile LimitOrderReactor must have deployed bytecode");
  assert.ok(usdtCode && usdtCode.length > 10, "USDT must have deployed bytecode on Celo Mainnet");
});

test("8. Live Textile FX RFQ v2 returns real Celo Mainnet quotes & builds full multi-corridor payroll plan", async () => {
  const scan = await scanCorridors("5", ["cNGN", "IDRX", "wARS", "wBRL", "wCOP"]);
  assert.equal(scan.chainId, CELO_CHAIN_ID);
  assert.ok(scan.activeCorridors >= 4, `Expected >=4 live Textile corridors, got ${scan.activeCorridors}`);

  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../examples/payroll.json"), "utf8")
  );
  const policy = buildSessionPolicy({ dailyUsdtCapHuman: "100" });
  const plan = await buildPayrollPlan(manifest, {
    treasuryAddress: "0x5C7852265dAC8d322d761ca5308D18986CCAb32C",
    dailyUsdtCapHuman: "100",
    allowedTargets: policy.summary.allowedTargets,
  });
  assert.ok(
    plan.status === "ready_to_settle" || plan.status === "partial_liquidity",
    `Unexpected plan status: ${plan.status}`
  );
  assert.equal(plan.items.length, 5);
  assert.equal(plan.attributionTag, LOOPS_ATTRIBUTION_TAG);
  assert.ok(plan.economics.estimatedSavingsUsd > 100);
  const quoted = plan.items.filter((i) => i.quoteStatus === "preview");
  assert.ok(quoted.length >= 4, `Expected >=4 quoted payroll corridors, got ${quoted.length}`);
  for (const item of quoted) {
    assert.ok(Number(item.estimatedLocalAmount) > 0);
  }
});

test("9. Token unit formatting and parsing handle 2, 6, and 18 decimals accurately", () => {
  assert.equal(parseTokenUnits("12.5", 6), 12_500_000n);
  assert.equal(formatTokenUnits("1831642", 2), "18316.42");
  assert.equal(formatTokenUnits("5859875329196395213", 18, 4), "5.8598");
});
