import jwt from "jsonwebtoken";

export const COOKIE_NAME = process.env.JWT_COOKIE_NAME || "df_token";

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) {
    throw new Error(
      "JWT_SECRET is not set. On Vercel: Project Settings → Environment Variables → add JWT_SECRET to Production."
    );
  }
  return s;
}

export function signToken(payload) {
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";
  return jwt.sign(payload, getSecret(), { expiresIn });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, getSecret());
  } catch {
    return null;
  }
}

/**
 * Set the JWT as an HttpOnly cookie. Because of the Next.js proxy, this
 * cookie ends up being stored on the CLIENT'S domain (first-party).
 * That means sameSite=lax + secure is sufficient — no cross-origin headache.
 */
export function setAuthCookie(res, token) {
  const isProd = process.env.NODE_ENV === "production" || !!process.env.VERCEL;
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    // No `domain` — let the browser scope cookie to the requesting host.
  });
}

export function clearAuthCookie(res) {
  const isProd = process.env.NODE_ENV === "production" || !!process.env.VERCEL;
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
  });
}
