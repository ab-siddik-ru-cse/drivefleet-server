import { COOKIE_NAME, verifyToken } from "../lib/jwt.js";

/**
 * Token lookup order:
 *   1. Cookie (df_token) — primary, works because Next.js proxy keeps everything same-origin
 *   2. Authorization Bearer header — fallback for API clients / future mobile app
 */
function getTokenFromRequest(req) {
  // Primary: HttpOnly cookie
  if (req.cookies?.[COOKIE_NAME]) return req.cookies[COOKIE_NAME];

  // Fallback: Authorization header (for non-browser clients)
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader && typeof authHeader === "string") {
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    if (m) return m[1].trim();
  }
  return null;
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
