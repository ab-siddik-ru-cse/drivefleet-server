import { COOKIE_NAME, verifyToken } from "../lib/jwt.js";

function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader && typeof authHeader === "string") {
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    if (m) return m[1].trim();
  }
  return req.cookies?.[COOKIE_NAME] || null;
}

export function requireAuth(req, res, next) {
  const token = getTokenFromRequest(req);
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

export function attachUser(req, _res, next) {
  const token = getTokenFromRequest(req);
  if (!token) return next();
  const decoded = verifyToken(token);
  if (decoded) {
    req.user = { uid: decoded.uid, email: decoded.email, name: decoded.name };
  }
  next();
}