#!/usr/bin/env node
// CorridorPay CLI — Live Celo Mainnet Textile FX + Altana Session Wallet Agent
import fs from "node:fs";
import { scanCorridors } from "./textile.mjs";
import { buildPayrollPlan } from "./payroll.mjs";
import {
  buildSessionPolicy,
  deriveAltanaWallet,
  getAttributionMetadata,
  verifyMainnetAttribution,
} from "./altana.mjs";
import { CONTRACTS, LOOPS_ATTRIBUTION_TAG } from "./config.mjs";

const [cmd, arg1, arg2] = process.argv.slice(2);

async function main() {
  if (cmd === "rates") {
    const amount = arg1 || "10";
    const result = await scanCorridors(amount);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === "plan") {
    const file = arg1 || "examples/payroll.json";
    const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
    const policy = buildSessionPolicy({ dailyUsdtCapHuman: arg2 || "100" });
    const plan = await buildPayrollPlan(manifest, {
      treasuryAddress: process.env.ALTANA_WALLET_ADDRESS || null,
      dailyUsdtCapHuman: arg2 || "100",
      allowedTargets: policy.summary.allowedTargets,
    });
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  if (cmd === "wallet") {
    const pk = process.env.ADMIN_PRIVATE_KEY;
    const attr = getAttributionMetadata(LOOPS_ATTRIBUTION_TAG);
    const policy = buildSessionPolicy({ dailyUsdtCapHuman: "100", expiryDays: 7 });
    if (!pk) {
      console.log(
        JSON.stringify(
          {
            mode: "config_preview",
            note: "Set ADMIN_PRIVATE_KEY to derive counterfactual Altana smart-account wallet address",
            attribution: attr,
            contracts: CONTRACTS,
            defaultSessionPolicy: policy.summary,
          },
          null,
          2
        )
      );
      return;
    }
    const derived = await deriveAltanaWallet(pk);
    console.log(
      JSON.stringify(
        {
          smartAccountAddress: derived.smartAccountAddress,
          attributionTag: derived.attributionTag,
          appCodes: derived.appCodes,
          erc8021DataSuffix: attr.suffix,
          contracts: CONTRACTS,
          defaultSessionPolicy: policy.summary,
        },
        null,
        2
      )
    );
    return;
  }

  if (cmd === "verify" && arg1) {
    const res = await verifyMainnetAttribution(arg1);
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  console.log(`CorridorPay Celo CLI
Usage:
  node src/cli.mjs rates [usdtAmount]          Fetch live Textile FX Celo mainnet quotes across all corridors
  node src/cli.mjs plan <manifest.json> [cap]  Validate Altana session policy & generate live payroll plan
  node src/cli.mjs wallet                      Derive Altana Celo smart wallet & inspect ERC-8021 tag
  node src/cli.mjs verify <txHash>             Verify ERC-8021 attribution tag on a Celo Mainnet tx`);
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
