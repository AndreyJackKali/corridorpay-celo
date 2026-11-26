#!/usr/bin/env node
// CorridorPay Live Dashboard & API Server (Celo Mainnet Textile FX + Altana Session Policy)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanCorridors } from "./textile.mjs";
import { buildPayrollPlan } from "./payroll.mjs";
import { buildSessionPolicy, getAttributionMetadata } from "./altana.mjs";
import { CONTRACTS, LOOPS_ATTRIBUTION_TAG, TOKENS } from "./config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8742);
const INDEX_HTML = fs.readFileSync(path.join(__dirname, "../web/index.html"), "utf8");
const SAMPLE_MANIFEST = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../examples/payroll.json"), "utf8")
);

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data, null, 2));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(INDEX_HTML);
      return;
    }
    if (req.method === "GET" && ["/judge-brief.html", "/deck.html", "/logo.svg", "/demo.mp4"].includes(url.pathname)) {
      const filePath = path.join(__dirname, "../docs", url.pathname.slice(1));
      if (fs.existsSync(filePath)) {
        const ct = url.pathname.endsWith(".html")
          ? "text/html; charset=utf-8"
          : url.pathname.endsWith(".svg")
            ? "image/svg+xml"
            : "video/mp4";
        res.writeHead(200, { "Content-Type": ct });
        fs.createReadStream(filePath).pipe(res);
        return;
      }
    }
    if (req.method === "GET" && url.pathname === "/api/config") {
      const policy = buildSessionPolicy({ dailyUsdtCapHuman: "100", expiryDays: 7 });
      return sendJson(res, 200, {
        chainId: 42220,
        network: "Celo Mainnet",
        contracts: CONTRACTS,
        attribution: getAttributionMetadata(LOOPS_ATTRIBUTION_TAG),
        tokens: TOKENS,
        defaultSessionPolicy: policy.summary,
        sampleManifest: SAMPLE_MANIFEST,
      });
    }
    if (req.method === "GET" && url.pathname === "/api/rates") {
      const amt = url.searchParams.get("amount") || "10";
      const data = await scanCorridors(amt);
      return sendJson(res, 200, data);
    }
    if (req.method === "POST" && url.pathname === "/api/plan") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const parsed = body ? JSON.parse(body) : {};
      const manifest = parsed.manifest || SAMPLE_MANIFEST;
      const cap = parsed.dailyUsdtCapHuman || "100";
      const policy = buildSessionPolicy({ dailyUsdtCapHuman: cap });
      const plan = await buildPayrollPlan(manifest, {
        treasuryAddress: parsed.treasuryAddress || process.env.ALTANA_WALLET_ADDRESS || null,
        dailyUsdtCapHuman: cap,
        allowedTargets: policy.summary.allowedTargets,
      });
      return sendJson(res, 200, plan);
    }
    sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`CorridorPay Celo dashboard running on http://localhost:${PORT}`);
});
