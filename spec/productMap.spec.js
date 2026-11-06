"use strict";
// node --test spec/   (npm test)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const pm = require("../lib/productMap");

const NS = 'xmlns="http://xml.majuredata.com/targetNS"';
function row(unit, loc) {
  const l = loc === "" ? "<LOCATION />" : `<LOCATION>${loc}</LOCATION>`;
  return `<ROW num="1"><UNIT_NUMBER>${unit}</UNIT_NUMBER><CART_NUMBER>0</CART_NUMBER>${l}<STOCK_CODE>X</STOCK_CODE></ROW>`;
}
function okXml(rows) {
  return `<?xml version="1.0" standalone="yes"?><rti ${NS}><transId></transId><status id="OK" code="0">OK</status>` +
    `<target tokenId="InventoryBySCE"><status id="OK" code="0">Unit Data, By Stock Code</status>` +
    `<returnData><ROWSET>${rows.join("")}</ROWSET></returnData></target></rti>`;
}

test("parseInventory counts packs per location and skips the unit-0 placeholder", async () => {
  const r = await pm.parseInventory(okXml([row(0, ""), row(115028, "03A09"), row(126556, "10B02"), row(126606, "10B02")]));
  assert.equal(r.ok, true);
  assert.deepEqual(Object.fromEntries(r.locations), { "03A09": 1, "10B02": 2 });
});

test("parseInventory: empty rowset is ok with no locations", async () => {
  const r = await pm.parseInventory(okXml([]));
  assert.equal(r.ok, true);
  assert.equal(r.locations.size, 0);
});

test("parseInventory reports a target failure (the T&G product)", async () => {
  const xml = `<rti ${NS}><status id="OK" code="0">OK</status><target tokenId="InventoryBySCE">` +
    `<status id="FAIL" code="6">Internal Server Error: One or more errors occurred.</status></target></rti>`;
  const r = await pm.parseInventory(xml);
  assert.equal(r.ok, false);
  assert.match(r.error, /FAIL 6/);
});

test("parseInventory reports a service failure", async () => {
  const r = await pm.parseInventory(`<rti ${NS}><status id="FAIL" code="2">Bad token</status></rti>`);
  assert.equal(r.ok, false);
  assert.match(r.error, /service FAIL 2/);
});

test("wmsStockCode maps BisTrack _ to the WMS space", () => {
  assert.equal(pm.wmsStockCode("ZZ_SO_WHITE_WOODS_0067"), "ZZ SO WHITE WOODS 0067");
  assert.equal(pm.wmsStockCode("CTCT-RRCT-6X8X09-#1-USED"), "CTCT-RRCT-6X8X09-#1-USED");
});

test("buildProducts groups by stock class, keeps order, and render wraps it for file://", () => {
  const products = [
    { StockCode: "P1", StockClass: "A" },
    { StockCode: "P2", StockClass: "A" },
    { StockCode: "P3", StockClass: "U" },
  ];
  const inv = new Map([["P1", new Map([["03A09", 1], ["10B02", 4]])], ["P3", new Map()]]);
  const obj = pm.buildProducts(products, inv, { products: 3, failed: 1 }, new Date("2026-11-03T08:10:02Z"));
  assert.equal(obj.Info.datetimemodified, "11/03/2026 01:10:02");
  assert.equal(obj.Info.format, 2);
  assert.deepEqual(Object.keys(obj), ["Info", "A", "U"]);
  assert.deepEqual(obj.A.P1.locations, { "03A09": 1, "10B02": 4 });
  assert.deepEqual(obj.A.P2.locations, {}); // failed lookup: listed, no packs
  const text = pm.render(obj);
  assert.ok(text.startsWith("let Products =\n{"));
  assert.ok(text.endsWith("};"));
  const parsed = vm.runInNewContext(text.replace(/^let /, "var ") + "; Products");
  assert.deepEqual(JSON.parse(JSON.stringify(parsed)), JSON.parse(JSON.stringify(obj)));
});

test("writeAtomic replaces the file and leaves no temp file", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-"));
  const f = path.join(dir, "prods.js");
  fs.writeFileSync(f, "old");
  await pm.writeAtomic(f, "new");
  assert.equal(fs.readFileSync(f, "utf8"), "new");
  assert.deepEqual(fs.readdirSync(dir), ["prods.js"]);
});

// The dashboard's badge counts must be the same for both file formats.
function loadIMap(Products) {
  const code = fs.readFileSync(path.join(__dirname, "..", "productmap", "scripts", "IMap.js"), "utf8");
  const ctx = { Products, console };
  vm.runInNewContext(code + "\nthis.IMap = IMap;", ctx);
  return ctx.IMap;
}

test("IMap badge counts match for format 1 (repeats) and format 2 (counts)", () => {
  const f1 = { A: { P1: { locations: ["03A09", "10B02", "10B02", "10B02", "10B02"] }, P2: { locations: ["10B02"] } } };
  const f2 = { A: { P1: { locations: { "03A09": 1, "10B02": 4 } }, P2: { locations: { "10B02": 1 } } } };
  for (const Products of [f1, f2]) {
    const IMap = loadIMap(Products);
    const m = new IMap({}, {}, 0, 0);
    m.getDistinctLocsBadges(Products.A);
    assert.deepEqual(Object.fromEntries(m.LocsBadges), { "03A09": 1, "10B02": 5 });
  }
});
