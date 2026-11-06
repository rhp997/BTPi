/* =====================================================================
  WMS Product Map data job

  Builds the prods.js file that the WMS Product Map dashboard loads
  (dashboard, hand-off and SQL pickup job: the ProductMap repo). Replaces getProducts.py, which ran in
  the old Python container on IronHide.

  1. One SQL query (BisTrack, read-only login): every in-stock product at
     branch 1 with its stock class (A-U turn ranking), except major code HA.
  2. One WMS InventoryBySCE call per product: one row per pack/bundle,
     with the location it is in. Rows with unit number 0 are WMS's
     placeholder and are skipped.
  3. Count packs per location and write
       let Products = { "Info": {...}, "<class>": { "<product>":
         { "locations": { "<location>": <packs>, ... } } } };
     (format 2). Format 1 listed a location once per pack; the dashboard's
     IMap.js reads both. Change the shape only together with ProductMap.

  The file is written to a temporary name and renamed, so a reader never
  sees a partial file, and a failed run leaves the last good file in place.
  Run on a schedule from app.js, or once by hand:
    node lib/productMap.js --out /tmp/prods.js [--pause <ms between WMS calls>]
 ===================================================================== */
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const axios = require("axios");
const xml2js = require("xml2js");
const moment = require("moment-timezone");

const PRODUCT_SQL = `SELECT UPPER(p.ProductCode) [StockCode], pso.StockClass
FROM Product p WITH(NOLOCK)
INNER JOIN ProductStockOption pso WITH(NOLOCK) ON pso.ProductID = p.ProductID
INNER JOIN Stock s WITH(NOLOCK) ON s.ProductID = p.ProductID
WHERE p.Deleted = 0
AND pso.BranchID = 1
AND s.BranchID = 1
AND s.StockActual > 0
AND p.udfMajorCode <> 'HA'
ORDER BY pso.StockClass, UPPER(p.ProductCode)`;

const FORMAT = 2;
// Refuse to replace the last good file when more than this share of WMS calls fail
const MAX_FAILED_SHARE = 0.2;

/* BisTrack product codes use "_" where WMS stock codes have a space
   (getProducts.py sent "_" as %20). */
function wmsStockCode(productCode) {
  return productCode.replace(/_/g, " ");
}

function text(node) {
  if (node === undefined || node === null) return "";
  if (Array.isArray(node)) return text(node[0]);
  if (typeof node === "object") return String(node._ || "").trim();
  return String(node).trim();
}

function statusOf(node) {
  const s = Array.isArray(node) ? node[0] : node;
  return {
    id: (s && s.$ && s.$.id) || "",
    code: (s && s.$ && s.$.code) || "",
    message: text(s),
  };
}

/* Parse one InventoryBySCE response into { ok, locations: Map, error }.
   Shape: <rti><status id=OK/><target><status id=OK/><returnData><ROWSET><ROW>... */
async function parseInventory(xml) {
  const doc = await xml2js.parseStringPromise(xml, {
    tagNameProcessors: [xml2js.processors.stripPrefix],
  });
  const rti = doc && doc.rti;
  if (!rti) return { ok: false, error: "no <rti> element" };
  const outer = statusOf(rti.status);
  if (outer.id !== "OK") {
    return { ok: false, error: `service ${outer.id} ${outer.code}: ${outer.message}` };
  }
  const target = rti.target && rti.target[0];
  const inner = statusOf(target && target.status);
  if (inner.id !== "OK") {
    return { ok: false, error: `target ${inner.id} ${inner.code}: ${inner.message}` };
  }
  const locations = new Map();
  const rowset = target.returnData && target.returnData[0] && target.returnData[0].ROWSET;
  const rows = (rowset && rowset[0] && rowset[0].ROW) || [];
  for (const row of rows) {
    const unit = parseInt(text(row.UNIT_NUMBER), 10);
    const loc = text(row.LOCATION);
    if (!(unit > 0) || !loc) continue;
    locations.set(loc, (locations.get(loc) || 0) + 1);
  }
  return { ok: true, locations };
}

/* Build the Products object. products: [{ StockCode, StockClass }] in
   output order; inventory: Map(code -> Map(location -> packs)). */
function buildProducts(products, inventory, summary, now = new Date()) {
  const out = {
    Info: {
      datetimemodified: moment(now).tz("America/Denver").format("MM/DD/YYYY HH:mm:ss"),
      format: FORMAT,
      products: summary.products,
      failed: summary.failed,
    },
  };
  for (const { StockCode, StockClass } of products) {
    const cls = String(StockClass || "").trim() || "?";
    if (!out[cls]) out[cls] = {};
    const locs = inventory.get(StockCode) || new Map();
    out[cls][StockCode] = { locations: Object.fromEntries(locs) };
  }
  return out;
}

function render(productsObj) {
  return "let Products =\n" + JSON.stringify(productsObj, null, 4) + ";";
}

async function writeAtomic(file, content) {
  const dir = path.dirname(file);
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.tmp`);
  await fs.promises.writeFile(tmp, content, { encoding: "utf8", mode: 0o664 });
  await fs.promises.rename(tmp, file);
}

async function fetchProductList(sql, dbConfig) {
  // Own pool: app.js's scheduled queries use the global mssql connection
  const pool = new sql.ConnectionPool(dbConfig);
  await pool.connect();
  try {
    const rs = await pool.request().query(PRODUCT_SQL);
    return rs.recordset;
  } finally {
    await pool.close();
  }
}

/* One kept-alive connection to WMS for the whole run (getProducts.py opened
   a new one per product: ~700 connections in a burst over the VPN). */
function wmsClient(host, timeoutMs) {
  return axios.create({
    baseURL: host.replace(/\/+$/, ""),
    timeout: timeoutMs,
    httpAgent: new http.Agent({ keepAlive: true, maxSockets: 1 }),
    responseType: "text",
    transformResponse: (d) => d,
  });
}

async function fetchInventory(client, code, retries = 1) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await client.get("/rtiWeb/run", {
        params: { id: "InventoryBySCE", stock_code: wmsStockCode(code) },
      });
      return await parseInventory(res.data);
    } catch (err) {
      if (attempt >= retries) return { ok: false, error: err.code || err.message };
    }
  }
}

/* Run the whole job. opts: { sql, database, wmsHost, output, logger,
   timeoutMs, pauseMs }. Returns a summary; throws only on SQL failure. */
async function run(opts) {
  const log = opts.logger || console;
  const started = Date.now();
  const products = await fetchProductList(opts.sql, opts.database);
  const client = wmsClient(opts.wmsHost, opts.timeoutMs || 20000);
  const inventory = new Map();
  const failures = [];
  let packs = 0;
  for (const { StockCode } of products) {
    const r = await fetchInventory(client, StockCode);
    if (r.ok) {
      inventory.set(StockCode, r.locations);
      for (const n of r.locations.values()) packs += n;
    } else {
      failures.push(StockCode);
      log.warn(`productMap: WMS lookup failed for '${StockCode}': ${r.error}`);
    }
    if (opts.pauseMs) await new Promise((res) => setTimeout(res, opts.pauseMs));
  }
  const summary = {
    products: products.length,
    failed: failures.length,
    packs,
    seconds: Math.round((Date.now() - started) / 1000),
    output: opts.output,
    written: false,
  };
  if (products.length === 0) {
    log.error("productMap: SQL returned no products; keeping the last file");
  } else if (failures.length / products.length > MAX_FAILED_SHARE) {
    log.error(`productMap: ${failures.length}/${products.length} WMS lookups failed; keeping the last file`);
  } else {
    await writeAtomic(opts.output, render(buildProducts(products, inventory, summary)));
    summary.written = true;
  }
  log.info(`productMap: ${JSON.stringify(summary)}`);
  return summary;
}

module.exports = {
  PRODUCT_SQL,
  wmsStockCode,
  parseInventory,
  buildProducts,
  render,
  writeAtomic,
  run,
};

/* Manual run inside the btpi container:
     node lib/productMap.js --out /tmp/prods.js [--pause 100]
   Database settings come from the DATABASE__* environment (btpi.env), the
   WMS host from config.json's wms_proxy.host_xmlep. */
if (require.main === module) {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  if (outIdx < 0 || !args[outIdx + 1]) {
    console.error("usage: node lib/productMap.js --out <file>");
    process.exit(2);
  }
  const nconf = require("nconf");
  nconf
    .env({ separator: "__", lowerCase: true, parseValues: true, match: /^DATABASE|^WMS_PROXY/i })
    .file({ file: path.join(__dirname, "..", "config", "config.json") });
  const database = nconf.get("database");
  const wmsHost = nconf.get("wms_proxy:host_xmlep");
  if (!database || !wmsHost) {
    console.error("productMap: database or wms_proxy.host_xmlep is not configured");
    process.exit(2);
  }
  const pauseIdx = args.indexOf("--pause");
  const pauseMs = pauseIdx >= 0 ? parseInt(args[pauseIdx + 1], 10) || 0 : 0;
  run({ sql: require("mssql"), database, wmsHost, output: path.resolve(args[outIdx + 1]), pauseMs })
    .then((s) => process.exit(s.written ? 0 : 1))
    .catch((err) => {
      console.error("productMap:", err.message);
      process.exit(1);
    });
}
