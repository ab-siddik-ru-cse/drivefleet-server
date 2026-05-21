const { COOKIE_NAME, verifyToken } = require("../lib/jwt");

function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];

  if (!token) {
    console.warn(
      "[requireAuth] no token. path=%s cookies=%j cookieHeader=%j origin=%s",
      req.path,
      Object.keys(req.cookies || {}),
      req.headers.cookie ? "(present)" : "(missing)",
      req.headers.origin
    );
    return res.status(401).json({
      error: "Not authenticated.",
      debug: {
        cookiesSeen: Object.keys(req.cookies || {}),
        cookieHeaderPresent: !!req.headers.cookie,
        origin: req.headers.origin || null,
      },
    });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    console.warn("[requireAuth] token verify failed. path=%s", req.path);
    return res.status(401).json({ error: "Session expired or invalid. Please log in again." });
  }

  req.user = {
    uid: decoded.uid,
    email: decoded.email,
    name: decoded.name,
  };
  next();
}

function attachUser(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next();
  const decoded = verifyToken(token);
  if (decoded) {
    req.user = { uid: decoded.uid, email: decoded.email, name: decoded.name };
  }
  next();
}

module.exports = { requireAuth, attachUser };