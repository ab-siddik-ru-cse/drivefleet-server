const { COOKIE_NAME, verifyToken } = require("../lib/jwt");

function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: "Not authenticated." });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
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
