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
 * @param {function} deps.getRuntimeConfig - () => config snapshot for credentials compare
 * @param {object} deps.logger
 */
function createAdminRouter(deps) {
  const {
    adminAuth,
    applyConfigFromDisk,
    applyQueriesFromDisk,
    getRuntimeConfig,
    logger,
  } = deps;

  const router = express.Router();
  router.use(adminAuth.middleware);

  router.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "views", "admin.html"));
  });

  router.get("/api/config", (req, res) => {
    try {
      const data = readConfigFile();
      res.json(data);
    } catch (err) {
      logger.error(`admin GET config: ${err.message}`);
      res.status(500).json({ error: "Failed to read config.json" });
    }
  });

  router.put("/api/config", (req, res) => {
    try {
      const disk = readConfigFile();
      const prevAdmin = (getRuntimeConfig().admin || disk.admin || {});
      const merged = mergeConfigAllowList(disk, req.body);

      // Detect credential change before write
      const newAdmin = merged.admin || {};
      const userChanged =
        String(prevAdmin.user ?? "") !== String(newAdmin.user ?? "");
      const passChanged =
        String(prevAdmin.password ?? "") !== String(newAdmin.password ?? "");
      const requiresReauth = userChanged || passChanged;

      writeConfigFile(merged);

      if (requiresReauth) {
        adminAuth.bumpAuthGeneration();
      }

      const applyResult = applyConfigFromDisk();
      logger.info("Admin saved config.json");

      res.json({
        ok: true,
        applied: applyResult.applied || [],
        requiresRestart: Boolean(applyResult.requiresRestart),
        requiresReauth,
        message: requiresReauth
          ? "Admin credentials updated. Sign in again with the new username/password."
          : undefined,
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
      logger.info("Admin saved queries.json");
      res.json({
        ok: true,
        applied: ["queries"],
        requiresRestart: false,
        requiresReauth: false,
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
    logger.warn("Admin requested process restart");
    res.status(202).json({
      ok: true,
      message:
        "Server exiting. A process supervisor (Docker, systemd, pm2) must restart it.",
    });
    setTimeout(() => {
      process.exit(0);
    }, 250);
  });

  /** Used after credential change to force browser Basic Auth re-prompt */
  router.get("/api/reauth", (req, res) => {
    return adminAuth.forceReauth(req, res);
  });

  return router;
}

module.exports = { createAdminRouter };
