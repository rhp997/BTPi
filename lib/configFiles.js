/**
 * Atomic read/write helpers for BTPi config.json and queries.json.
 * Server-side allow-lists prevent freeform key injection from the admin UI.
 */

const fs = require("fs");
const path = require("path");
const { LOG_LEVELS } = require("./adminAuth");

const CONFIG_DIR = path.join(__dirname, "..", "config");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const QUERIES_FILE = path.join(CONFIG_DIR, "queries.json");

const QUERY_FIELDS = Object.freeze(["Name", "Title", "SQL", "File", "Enabled"]);

const LOG_LEVEL_SET = new Set(LOG_LEVELS);

/**
 * Fixed schema paths the admin UI may write (relative to config root).
 * Nested with simple keys; options.encrypt is special-cased.
 */
const CONFIG_ALLOW = Object.freeze({
  database: [
    "user",
    "password",
    "server",
    "database",
    "connectionTimeout",
    "requestTimeout",
  ],
  "database.options": ["encrypt"],
  btpi: [
    "port",
    "interval",
    "connectionTimeout",
    "JSONSpaces",
    "logLevel",
  ],
  wms_proxy: ["host_pulse", "host_xmlep"],
  admin: ["enabled", "user", "password"],
});

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function backupFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const bak = `${filePath}.bak-${stamp}`;
  fs.copyFileSync(filePath, bak);
  // Keep last 5 backups for this basename
  pruneBackups(filePath, 5);
  return bak;
}

function pruneBackups(filePath, keep) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const prefix = `${base}.bak-`;
  let entries;
  try {
    entries = fs.readdirSync(dir).filter((f) => f.startsWith(prefix));
  } catch {
    return;
  }
  entries.sort();
  while (entries.length > keep) {
    const oldest = entries.shift();
    try {
      fs.unlinkSync(path.join(dir, oldest));
    } catch {
      /* ignore */
    }
  }
}

function writeJsonAtomic(filePath, data, spaces = 4) {
  backupFile(filePath);
  const dir = path.dirname(filePath);
  const tmp = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );
  const json = JSON.stringify(data, null, spaces) + "\n";
  fs.writeFileSync(tmp, json, "utf8");
  fs.renameSync(tmp, filePath);
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Merge allow-listed fields from `incoming` into a clone of `diskDoc`.
 * Preserves _comment_* and any unknown keys already on disk.
 */
function mergeConfigAllowList(diskDoc, incoming) {
  const out = deepClone(diskDoc || {});
  if (!incoming || typeof incoming !== "object") {
    throw new Error("Config body must be an object");
  }

  // database scalar fields
  if (incoming.database && typeof incoming.database === "object") {
    if (!out.database || typeof out.database !== "object") out.database = {};
    for (const key of CONFIG_ALLOW.database) {
      if (Object.prototype.hasOwnProperty.call(incoming.database, key)) {
        out.database[key] = coerceConfigValue("database", key, incoming.database[key]);
      }
    }
    if (
      incoming.database.options &&
      typeof incoming.database.options === "object"
    ) {
      if (!out.database.options || typeof out.database.options !== "object") {
        out.database.options = {};
      }
      if (
        Object.prototype.hasOwnProperty.call(incoming.database.options, "encrypt")
      ) {
        out.database.options.encrypt = Boolean(
          incoming.database.options.encrypt
        );
      }
    }
  }

  if (incoming.btpi && typeof incoming.btpi === "object") {
    if (!out.btpi || typeof out.btpi !== "object") out.btpi = {};
    for (const key of CONFIG_ALLOW.btpi) {
      if (Object.prototype.hasOwnProperty.call(incoming.btpi, key)) {
        out.btpi[key] = coerceConfigValue("btpi", key, incoming.btpi[key]);
      }
    }
  }

  if (incoming.wms_proxy && typeof incoming.wms_proxy === "object") {
    if (!out.wms_proxy || typeof out.wms_proxy !== "object") out.wms_proxy = {};
    for (const key of CONFIG_ALLOW.wms_proxy) {
      if (Object.prototype.hasOwnProperty.call(incoming.wms_proxy, key)) {
        out.wms_proxy[key] = String(incoming.wms_proxy[key] ?? "");
      }
    }
  }

  if (incoming.admin && typeof incoming.admin === "object") {
    if (!out.admin || typeof out.admin !== "object") out.admin = {};
    for (const key of CONFIG_ALLOW.admin) {
      if (Object.prototype.hasOwnProperty.call(incoming.admin, key)) {
        out.admin[key] = coerceConfigValue("admin", key, incoming.admin[key]);
      }
    }
  }

  return out;
}

function coerceConfigValue(section, key, value) {
  if (section === "database") {
    if (key === "connectionTimeout" || key === "requestTimeout") {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new Error(`database.${key} must be a number`);
      return n;
    }
    return value === null || value === undefined ? "" : String(value);
  }
  if (section === "btpi") {
    if (key === "port" || key === "connectionTimeout" || key === "JSONSpaces") {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new Error(`btpi.${key} must be a number`);
      return n;
    }
    if (key === "logLevel") {
      const lvl = String(value || "info").toLowerCase();
      if (!LOG_LEVEL_SET.has(lvl)) {
        throw new Error(
          `btpi.logLevel must be one of: ${LOG_LEVELS.join(", ")}`
        );
      }
      return lvl;
    }
    if (key === "interval") {
      const s = String(value ?? "").trim();
      if (!s) throw new Error("btpi.interval is required");
      return s;
    }
    return value;
  }
  if (section === "admin") {
    if (key === "enabled") return Boolean(value);
    return value === null || value === undefined ? "" : String(value);
  }
  return value;
}

/**
 * Normalize and validate queries array. Enforces unique Name.
 * Merges known fields into previous objects by index when possible to preserve extra keys.
 */
function mergeQueriesAllowList(diskDoc, incoming) {
  const out = deepClone(diskDoc || {});
  if (!incoming || typeof incoming !== "object") {
    throw new Error("Queries body must be an object");
  }
  if (!Array.isArray(incoming.queries)) {
    throw new Error('Body must include a "queries" array');
  }

  const prevByName = new Map();
  const prevList = Array.isArray(out.queries) ? out.queries : [];
  for (const q of prevList) {
    if (q && q.Name) prevByName.set(q.Name, q);
  }

  const seen = new Set();
  const merged = [];

  for (let i = 0; i < incoming.queries.length; i++) {
    const item = incoming.queries[i];
    if (!item || typeof item !== "object") {
      throw new Error(`Query at index ${i} must be an object`);
    }
    const name = item.Name !== undefined ? String(item.Name).trim() : "";
    if (!name) {
      throw new Error(`Query at index ${i} requires a non-empty Name`);
    }
    if (seen.has(name)) {
      throw new Error(`Duplicate query Name: "${name}"`);
    }
    seen.add(name);

    // Prefer previous object with same Name for extra-key preservation
    const base = prevByName.has(name)
      ? deepClone(prevByName.get(name))
      : {};
    base.Name = name;
    base.Title =
      item.Title !== undefined && item.Title !== null
        ? String(item.Title)
        : base.Title !== undefined
          ? base.Title
          : "";
    base.SQL =
      item.SQL !== undefined && item.SQL !== null
        ? String(item.SQL)
        : base.SQL !== undefined
          ? base.SQL
          : "";
    base.File =
      item.File !== undefined && item.File !== null
        ? String(item.File)
        : base.File !== undefined
          ? base.File
          : "";
    if (item.Enabled !== undefined) {
      base.Enabled = Boolean(item.Enabled);
    } else if (base.Enabled === undefined) {
      base.Enabled = false;
    } else {
      base.Enabled = Boolean(base.Enabled);
    }
    merged.push(base);
  }

  // Preserve top-level _comment and other non-queries keys
  out.queries = merged;
  return out;
}

function readConfigFile() {
  return readJsonFile(CONFIG_FILE);
}

function readQueriesFile() {
  return readJsonFile(QUERIES_FILE);
}

function writeConfigFile(data) {
  writeJsonAtomic(CONFIG_FILE, data, 4);
}

function writeQueriesFile(data) {
  writeJsonAtomic(QUERIES_FILE, data, 2);
}

module.exports = {
  CONFIG_FILE,
  QUERIES_FILE,
  QUERY_FIELDS,
  CONFIG_ALLOW,
  LOG_LEVELS,
  readConfigFile,
  readQueriesFile,
  writeConfigFile,
  writeQueriesFile,
  mergeConfigAllowList,
  mergeQueriesAllowList,
  readJsonFile,
  writeJsonAtomic,
};
