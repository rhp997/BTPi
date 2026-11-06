"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { mergeConfigAllowList } = require("../lib/configFiles");

const disk = { database: { user: "btpi_app", password: "stored", server: "s", database: "btprod" } };

test("a blank database password from the admin UI keeps the stored one", () => {
  const out = mergeConfigAllowList(disk, { database: { user: "btpi_app", password: "", server: "s2" } });
  assert.equal(out.database.password, "stored");
  assert.equal(out.database.server, "s2");
});

test("a non-blank database password from the admin UI replaces it", () => {
  const out = mergeConfigAllowList(disk, { database: { password: "new" } });
  assert.equal(out.database.password, "new");
});
