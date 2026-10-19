/**
 * Admin UI routes: config/queries CRUD, reload, restart.
 */

const express = require("express");
const path = require("path");
const {
  readConfigFile,
  readQueriesFile,
  writeConfigFile,
  writeQueriesFile,
  mergeConfigAllowList,
  mergeQueriesAllowList,
} = require("../lib/configFiles");

/**
 * @param {object} deps
 * @param {object} deps.adminAuth - from createAdminAuth
 * @param {function} deps.applyConfigFromDisk - () => { applied, requiresRestart }
 * @param {function} deps.applyQueriesFromDisk - () => void
 * @param {object} deps.logger
 */
function createAdminRouter(deps) {
  const {
    adminAuth,
    applyConfigFromDisk,
    applyQueriesFromDisk,
    logger,
  } = deps;

  function actor(req) {
    return adminAuth.requestUser(req) || "unknown";
  }

  function configForClient(data) {
    const copy = JSON.parse(JSON.stringify(data));
    if (copy && copy.admin && typeof copy.admin === "object") {
      delete copy.admin.user;
      delete copy.admin.password;
    }
    return copy;
  }

  const router = express.Router();
  router.use(adminAuth.middleware);

  router.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "views", "admin.html"));
  });

  router.get("/api/config", (req, res) => {
    try {
      const data = configForClient(readConfigFile());
      res.json(data);
    } catch (err) {
      logger.error(`admin GET config: ${err.message}`);
      res.status(500).json({ error: "Failed to read config.json" });
    }
  });

  router.put("/api/config", (req, res) => {
    try {
      const disk = readConfigFile();
      const merged = mergeConfigAllowList(disk, req.body);
      writeConfigFile(merged);

      const applyResult = applyConfigFromDisk();
      logger.info(`Admin saved config.json (${actor(req)})`);

      res.json({
        ok: true,
        applied: applyResult.applied || [],
        requiresRestart: Boolean(applyResult.requiresRestart),
      });
    } catch (err) {
      logger.error(`admin PUT config: ${err.message}`);
      res.status(400).json({ error: err.message || "Failed to save config" });
    }
  });

  router.get("/api/queries", (req, res) => {
    try {
      const data = readQueriesFile();
      res.json(data);
    } catch (err) {
      logger.error(`admin GET queries: ${err.message}`);
      res.status(500).json({ error: "Failed to read queries.json" });
    }
  });

  router.put("/api/queries", (req, res) => {
    try {
      const disk = readQueriesFile();
      const merged = mergeQueriesAllowList(disk, req.body);
      writeQueriesFile(merged);
      applyQueriesFromDisk();
      logger.info(`Admin saved queries.json (${actor(req)})`);
      res.json({
        ok: true,
        applied: ["queries"],
        requiresRestart: false,
      });
    } catch (err) {
      logger.error(`admin PUT queries: ${err.message}`);
      res.status(400).json({ error: err.message || "Failed to save queries" });
    }
  });

  router.post("/api/reload", (req, res) => {
    try {
      const cfgResult = applyConfigFromDisk();
      applyQueriesFromDisk();
      logger.info("Admin reloaded config and queries from disk");
      res.json({
        ok: true,
        applied: [...(cfgResult.applied || []), "queries"],
        requiresRestart: Boolean(cfgResult.requiresRestart),
      });
    } catch (err) {
      logger.error(`admin reload: ${err.message}`);
      res.status(500).json({ error: err.message || "Reload failed" });
    }
  });

  router.post("/api/restart", (req, res) => {
    logger.warn(`Admin requested process restart (${actor(req)})`);
    res.status(202).json({
      ok: true,
      message:
        "Server exiting. A process supervisor (Docker, systemd, pm2) must restart it.",
    });
    setTimeout(() => {
      process.exit(0);
    }, 250);
  });

  return router;
}

module.exports = { createAdminRouter };
