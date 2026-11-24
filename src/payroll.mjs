// Autonomous Cross-Border Stablecoin Payroll Planner & Policy Enforcer
import { getAddress, isAddress } from "viem";
import { CONTRACTS, LOOPS_ATTRIBUTION_TAG, TOKENS, parseTokenUnits } from "./config.mjs";
import { previewQuote } from "./textile.mjs";

const TRADITIONAL_WIRE_FEE_USD = 32; // Conservative international SWIFT wire + FX spread baseline

/**
 * Validate a payroll manifest against Altana session policy & independent-recipient rules.
 * Rejects: invalid addresses, self-payouts to treasury, unsupported corridors, cap breaches.
 */
export function validatePayrollPolicy(manifest, { treasuryAddress, dailyUsdtCapHuman = "100", allowedTargets = null }) {
  const errors = [];
  if (!manifest || !Array.isArray(manifest.payouts) || manifest.payouts.length === 0) {
    return { ok: false, errors: ["Manifest must include a non-empty payouts array"], totalUsdtRaw: 0n };
  }

  const normalizedTreasury = treasuryAddress ? getAddress(treasuryAddress).toLowerCase() : null;
  const capRaw = parseTokenUnits(dailyUsdtCapHuman, TOKENS.USDT.decimals);
  let totalUsdtRaw = 0n;

  for (const [idx, item] of manifest.payouts.entries()) {
    const label = item.contractor || `payout[${idx}]`;
    if (!item.recipient || !isAddress(item.recipient)) {
      errors.push(`${label}: invalid EVM address (${item.recipient})`);
      continue;
    }
    if (normalizedTreasury && getAddress(item.recipient).toLowerCase() === normalizedTreasury) {
      errors.push(`${label}: self-transfer rejected — recipient must be an independent wallet outside treasury`);
    }
    const token = TOKENS[item.currency];
    if (!token || item.currency === "USDT") {
      errors.push(`${label}: unsupported local corridor currency (${item.currency})`);
    } else if (allowedTargets && !allowedTargets.map((a) => a.toLowerCase()).includes(token.address.toLowerCase())) {
      errors.push(`${label}: token ${item.currency} (${token.address}) not in Altana session contract allowlist`);
    }
    try {
      const amtRaw = parseTokenUnits(item.amountUsdt, TOKENS.USDT.decimals);
      if (amtRaw <= 0n) errors.push(`${label}: amountUsdt must be positive`);
      totalUsdtRaw += amtRaw;
    } catch (e) {
      errors.push(`${label}: ${e.message}`);
    }
  }

  if (totalUsdtRaw > capRaw) {
    errors.push(
      `Batch total (${Number(totalUsdtRaw) / 1e6} USDT) exceeds Altana on-chain daily session spend cap (${dailyUsdtCapHuman} USDT)`
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    totalUsdtRaw,
    totalUsdtHuman: (Number(totalUsdtRaw) / 1e6).toFixed(6),
    capUsdtHuman: String(dailyUsdtCapHuman),
  };
}

/**
 * Generate a complete multi-corridor payroll execution plan using live Textile FX RFQ v2 quotes.
 */
export async function buildPayrollPlan(manifest, { treasuryAddress, dailyUsdtCapHuman = "100", allowedTargets = null } = {}) {
  const policyCheck = validatePayrollPolicy(manifest, { treasuryAddress, dailyUsdtCapHuman, allowedTargets });
  if (!policyCheck.ok) {
    return {
      status: "rejected_by_policy",
      policyCheck,
      items: [],
    };
  }

  const items = await Promise.all(
    manifest.payouts.map(async (p) => {
      const quote = await previewQuote({
        sellSymbol: "USDT",
        buySymbol: p.currency,
        sellAmountHuman: p.amountUsdt,
      });
      const token = TOKENS[p.currency];
      const rampLink =
        typeof token.rampUrl === "function" && quote.buyAmountFormatted
          ? token.rampUrl(Math.floor(Number(quote.buyAmountFormatted)), p.recipient)
          : null;
      return {
        contractor: p.contractor,
        role: p.role || "Contractor",
        recipient: getAddress(p.recipient),
        currency: p.currency,
        region: token.region,
        amountUsdt: String(p.amountUsdt),
        quoteStatus: quote.status,
        estimatedLocalAmount: quote.buyAmountFormatted || null,
        effectiveRate: quote.effectiveRate || null,
        textileFeeUsdt: quote.feeFormatted || null,
        feeBps: quote.feeBps ?? null,
        ripioRampLink: rampLink,
        reason: quote.reason || null,
      };
    })
  );

  const totalTextileFeesUsdt = items.reduce((acc, it) => acc + Number(it.textileFeeUsdt || 0), 0);
  const tradWireCostUsd = items.length * TRADITIONAL_WIRE_FEE_USD;
  const estimatedSavingsUsd = Math.max(0, tradWireCostUsd - totalTextileFeesUsdt);

  return {
    status: items.every((i) => i.quoteStatus === "preview") ? "ready_to_settle" : "partial_liquidity",
    organization: manifest.organization || "Veridian Ops Distributed Studio",
    namedUser: manifest.namedUser || "Andrey — Veridian Engineering & Research Ops",
    chainId: 42220,
    attributionTag: LOOPS_ATTRIBUTION_TAG,
    settlementContract: CONTRACTS.TEXTILE_LIMIT_ORDER_REACTOR,
    erc8004Registry: CONTRACTS.ERC8004_REGISTRY,
    generatedAt: new Date().toISOString(),
    policyCheck: {
      ok: true,
      totalUsdtHuman: policyCheck.totalUsdtHuman,
      capUsdtHuman: policyCheck.capUsdtHuman,
      utilizationPct: +((Number(policyCheck.totalUsdtHuman) / Number(policyCheck.capUsdtHuman)) * 100).toFixed(2),
    },
    economics: {
      totalPayouts: items.length,
      totalTextileFeesUsdt: +totalTextileFeesUsdt.toFixed(6),
      traditionalSwiftBaselineUsd: tradWireCostUsd,
      estimatedSavingsUsd: +estimatedSavingsUsd.toFixed(2),
      settlementTimeSeconds: 5,
    },
    items,
  };
}
