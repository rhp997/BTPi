/**
 * Admin UI gate. Traefik's LDAP forwardAuth sets X-Auth-Request-User.
 * A missing header is 401, including on /ADMIN, which Express still routes here.
 */

const LOG_LEVELS = Object.freeze([
  "error",
  "warn",
  "info",
  "http",
  "verbose",
  "debug",
  "silly",
]);

function createAdminAuth(getAdminConfig) {
  function isAdminAvailable() {
    const admin = getAdminConfig() || {};
    if (admin.enabled === false || admin.enabled === "false") return false;
    if (admin.enabled === undefined || admin.enabled === null) return true;
    return Boolean(admin.enabled);
  }

  function requestUser(req) {
    const raw = req && typeof req.get === "function" ? req.get("x-auth-request-user") : "";
    const user = String(raw || "").trim();
    return user;
  }

  /**
   * Express middleware: 404 if admin is off; 401 if the gate header is missing.
   */
  function middleware(req, res, next) {
    if (!isAdminAvailable()) {
      return res.status(404).send("Not found");
    }
    if (!requestUser(req)) {
      return res.status(401).send("Authentication required");
    }
    return next();
  }

  return {
    middleware,
    isAdminAvailable,
    requestUser,
    LOG_LEVELS,
  };
}

module.exports = {
  createAdminAuth,
  LOG_LEVELS,
};
