// Verified Celo Mainnet (chainId 42220) protocol & token addresses for CorridorPay

export const CELO_CHAIN_ID = 42220;
export const CELO_RPC_URL = process.env.CELO_RPC_URL || "https://forno.celo.org";
export const TEXTILE_API_BASE = process.env.TEXTILE_API_BASE || "https://api.textilecredit.com";

// Official Loops House Agents Open for Business ERC-8021 attribution tag
export const LOOPS_ATTRIBUTION_TAG = "celo_76dc8c3315b1";
export const APP_CODES = ["corridorpay", LOOPS_ATTRIBUTION_TAG];

// Verified Celo Mainnet contracts
export const CONTRACTS = {
  ERC8004_REGISTRY: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  TEXTILE_LIMIT_ORDER_REACTOR: "0xa9AA0a64769cBed4d3B1Ceb4Df01CdE915C235b3",
  PERMIT2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
};

// Verified Celo Mainnet stablecoins supported by Textile FX corridors
export const TOKENS = {
  USDT: {
    symbol: "USDT",
    name: "Tether USD (Celo)",
    address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
    decimals: 6,
    region: "Global",
  },
  cNGN: {
    symbol: "cNGN",
    name: "Compliant Nigerian Naira",
    address: "0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f",
    decimals: 6,
    region: "Nigeria",
    rampHint: "Local NGN settlement via cNGN rail",
  },
  IDRX: {
    symbol: "IDRX",
    name: "Indonesian Rupiah Stablecoin",
    address: "0x18Bc5bcC660cf2B9cE3cd51a404aFe1a0cBD3C22",
    decimals: 2,
    region: "Indonesia",
    rampHint: "Direct IDR bank settlement via IDRX",
  },
  wARS: {
    symbol: "wARS",
    name: "Ripio Wrapped Argentine Peso",
    address: "0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D",
    decimals: 18,
    region: "Argentina",
    rampUrl: (amount, address) =>
      `https://ramp.ripio.com/?country=AR&chain=42220&token=WARS&amount=${amount}&address=${address}`,
  },
  wBRL: {
    symbol: "wBRL",
    name: "Ripio Wrapped Brazilian Real",
    address: "0xD76f5Faf6888e24D9F04Bf92a0c8B921FE4390e0",
    decimals: 18,
    region: "Brazil",
    rampUrl: (amount, address) =>
      `https://ramp.ripio.com/?country=BR&chain=42220&token=WBRL&amount=${amount}&address=${address}`,
  },
  wMXN: {
    symbol: "wMXN",
    name: "Ripio Wrapped Mexican Peso",
    address: "0x337E7456B420bD3481e7FA61fA9850343d610d34",
    decimals: 18,
    region: "Mexico",
    rampUrl: (amount, address) =>
      `https://ramp.ripio.com/?country=MX&chain=42220&token=WMXN&amount=${amount}&address=${address}`,
  },
  wCOP: {
    symbol: "wCOP",
    name: "Ripio Wrapped Colombian Peso",
    address: "0x8a1D45e102e886510e891d2Ec656a708991e2D76",
    decimals: 18,
    region: "Colombia",
    rampUrl: (amount, address) =>
      `https://ramp.ripio.com/?country=CO&chain=42220&token=WCOP&amount=${amount}&address=${address}`,
  },
};

export const LOCAL_CORRIDORS = ["cNGN", "IDRX", "wARS", "wBRL", "wCOP", "wMXN"];

export function formatTokenUnits(rawAmount, decimals, maxFraction = 4) {
  const val = BigInt(rawAmount);
  const base = 10n ** BigInt(decimals);
  const whole = val / base;
  const rem = val % base;
  if (rem === 0n) return whole.toString();
  const frac = rem.toString().padStart(decimals, "0").slice(0, maxFraction).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

export function parseTokenUnits(amountStr, decimals) {
  const s = String(amountStr).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) {
    throw new Error(`Invalid numeric amount: ${amountStr}`);
  }
  const [whole, frac = ""] = s.split(".");
  if (frac.length > decimals) {
    throw new Error(`Amount ${amountStr} exceeds ${decimals} decimals`);
  }
  const padded = frac.padEnd(decimals, "0");
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0");
}
