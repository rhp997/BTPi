/**
 * Basic Auth middleware for the BTPi admin UI.
 * Realm generation is bumped when admin credentials change so browsers re-prompt.
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
  let authGeneration = 1;

  function getRealm() {
    return `BTPi Admin ${authGeneration}`;
  }

  function bumpAuthGeneration() {
    authGeneration += 1;
    return authGeneration;
  }

  function getAuthGeneration() {
    return authGeneration;
  }

  function isAdminAvailable() {
    const admin = getAdminConfig() || {};
    if (admin.enabled === false || admin.enabled === "false") return false;
    const user = admin.user;
    const password = admin.password;
    if (user === undefined || user === null || String(user).length === 0) {
      return false;
    }
    if (
      password === undefined ||
      password === null ||
      String(password).length === 0
    ) {
      return false;
    }
    // Treat enabled as true when unset but credentials exist
    if (admin.enabled === undefined || admin.enabled === null) return true;
    return Boolean(admin.enabled);
  }

  function parseBasicAuth(header) {
    if (!header || typeof header !== "string") return null;
    const parts = header.split(" ");
    if (parts.length !== 2 || parts[0].toLowerCase() !== "basic") return null;
    try {
      const decoded = Buffer.from(parts[1], "base64").toString("utf8");
      const idx = decoded.indexOf(":");
      if (idx === -1) return null;
      return {
        user: decoded.slice(0, idx),
        password: decoded.slice(idx + 1),
      };
    } catch {
      return null;
    }
  }

  function unauthorized(res) {
    res.setHeader("WWW-Authenticate", `Basic realm="${getRealm()}"`);
    return res.status(401).send("Authentication required");
  }

  /**
   * Express middleware: 404 if admin disabled; 401 if bad/missing credentials.
   */
  function middleware(req, res, next) {
    if (!isAdminAvailable()) {
      return res.status(404).send("Not found");
    }
    const creds = parseBasicAuth(req.headers.authorization);
    const admin = getAdminConfig() || {};
    if (
      !creds ||
      creds.user !== String(admin.user) ||
      creds.password !== String(admin.password)
    ) {
      return unauthorized(res);
    }
    return next();
  }

  /**
   * Force a 401 with the current (possibly bumped) realm so the browser re-prompts.
   */
  function forceReauth(req, res) {
    return unauthorized(res);
  }

  return {
    middleware,
    isAdminAvailable,
    bumpAuthGeneration,
    getAuthGeneration,
    getRealm,
    forceReauth,
    LOG_LEVELS,
  };
}

module.exports = {
  createAdminAuth,
  LOG_LEVELS,
};
