// Textile FX RFQ v2 Client for Celo Mainnet Stablecoin Corridors
import crypto from "node:crypto";
import { CELO_CHAIN_ID, TEXTILE_API_BASE, TOKENS, LOCAL_CORRIDORS, formatTokenUnits, parseTokenUnits } from "./config.mjs";

const USER_AGENT = "CorridorPay-Celo/1.0";

function buildHeaders(apiKey = process.env.TEXTILE_API_KEY, claimToken = null) {
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
  };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  if (claimToken) headers["X-Rfq-Claim"] = claimToken;
  return headers;
}

/**
 * Preview an indicative FX rate from Textile makers (free, no taker required).
 */
export async function previewQuote({
  sellSymbol = "USDT",
  buySymbol,
  sellAmountHuman,
  buyAmountHuman,
  chainId = CELO_CHAIN_ID,
  apiKey,
}) {
  const sellToken = TOKENS[sellSymbol];
  const buyToken = TOKENS[buySymbol];
  if (!sellToken || !buyToken) {
    throw new Error(`Unsupported corridor: ${sellSymbol} -> ${buySymbol}`);
  }
  const payload = {
    chainId,
    sellToken: sellToken.address,
    buyToken: buyToken.address,
  };
  if (sellAmountHuman != null) {
    payload.sellAmount = parseTokenUnits(sellAmountHuman, sellToken.decimals).toString();
  } else if (buyAmountHuman != null) {
    payload.buyAmount = parseTokenUnits(buyAmountHuman, buyToken.decimals).toString();
  } else {
    throw new Error("Specify either sellAmountHuman or buyAmountHuman");
  }

  const res = await fetch(`${TEXTILE_API_BASE}/v2/rfq/preview`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Textile preview HTTP ${res.status}: ${JSON.stringify(json)}`);
  }
  const data = json.data || json;
  const result = {
    corridor: `${sellSymbol}->${buySymbol}`,
    region: buyToken.region,
    status: data.status,
    reason: data.reason || null,
    sellSymbol,
    buySymbol,
    sellAmountRaw: data.sellAmount || payload.sellAmount || null,
    buyAmountRaw: data.buyAmount || null,
    feeAmountRaw: data.feeAmount || "0",
    rateRay: data.rateRay || null,
    availableSellAmountRaw: data.availableSellAmount || null,
  };
  if (data.status === "preview" && data.buyAmount && data.sellAmount) {
    result.sellAmountFormatted = formatTokenUnits(data.sellAmount, sellToken.decimals, 6);
    result.buyAmountFormatted = formatTokenUnits(data.buyAmount, buyToken.decimals, 4);
    result.feeFormatted = formatTokenUnits(data.feeAmount || "0", sellToken.decimals, 6);
    const sellNum = Number(data.sellAmount) / 10 ** sellToken.decimals;
    const buyNum = Number(data.buyAmount) / 10 ** buyToken.decimals;
    result.effectiveRate = sellNum > 0 ? +(buyNum / sellNum).toFixed(4) : 0;
    result.feeBps = sellNum > 0 ? +((Number(data.feeAmount || 0) / Number(data.sellAmount)) * 10000).toFixed(2) : 0;
  }
  return result;
}

/**
 * Scan live Textile FX quotes across all configured Celo local stablecoin corridors.
 */
export async function scanCorridors(usdtAmount = "10", corridors = LOCAL_CORRIDORS) {
  const quotes = await Promise.all(
    corridors.map(async (buySymbol) => {
      try {
        return await previewQuote({ sellSymbol: "USDT", buySymbol, sellAmountHuman: usdtAmount });
      } catch (err) {
        return {
          corridor: `USDT->${buySymbol}`,
          region: TOKENS[buySymbol]?.region || "Unknown",
          status: "error",
          reason: err.message,
        };
      }
    })
  );
  return {
    chainId: CELO_CHAIN_ID,
    baseAmountUsdt: String(usdtAmount),
    timestamp: new Date().toISOString(),
    activeCorridors: quotes.filter((q) => q.status === "preview").length,
    totalCorridors: quotes.length,
    quotes,
  };
}

/**
 * Build EIP-712 takerProof for keyless firm RFQ requests on Textile FX v2.
 */
export async function buildTakerProof(viemAccount, chainId = CELO_CHAIN_ID) {
  const nonce = `0x${crypto.randomBytes(32).toString("hex")}`;
  const issuedAt = Date.now();
  const signature = await viemAccount.signTypedData({
    domain: {
      name: "TextileFX",
      version: "2",
      chainId,
    },
    types: {
      TakerControl: [
        { name: "taker", type: "address" },
        { name: "nonce", type: "bytes32" },
        { name: "issuedAt", type: "uint256" },
      ],
    },
    primaryType: "TakerControl",
    message: {
      taker: viemAccount.address,
      nonce,
      issuedAt: BigInt(issuedAt),
    },
  });
  return { nonce, issuedAt, signature };
}

/**
 * Request a firm executable quote (signed by Textile makers for a specific taker).
 * Uses 75s timeout per Textile FX v2 docs for cold-corridor decimals preflight.
 */
export async function requestFirmQuote({
  sellSymbol = "USDT",
  buySymbol,
  sellAmountHuman,
  taker,
  takerProof,
  chainId = CELO_CHAIN_ID,
  apiKey,
}) {
  const sellToken = TOKENS[sellSymbol];
  const buyToken = TOKENS[buySymbol];
  if (!sellToken || !buyToken) {
    throw new Error(`Unsupported corridor: ${sellSymbol} -> ${buySymbol}`);
  }
  const body = {
    chainId,
    sellToken: sellToken.address,
    buyToken: buyToken.address,
    sellAmount: parseTokenUnits(sellAmountHuman, sellToken.decimals).toString(),
    taker,
  };
  if (!apiKey && takerProof) {
    body.takerProof = takerProof;
  }
  const res = await fetch(`${TEXTILE_API_BASE}/v2/rfq/request`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(75000),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Textile firm RFQ HTTP ${res.status}: ${JSON.stringify(json)}`);
  }
  return {
    claimToken: res.headers.get("x-rfq-claim"),
    quote: json.data || json,
  };
}
