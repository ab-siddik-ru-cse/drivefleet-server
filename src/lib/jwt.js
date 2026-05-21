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

export function setAuthCookie(res, token) {
  const isProd = process.env.NODE_ENV === "production" || !!process.env.VERCEL;
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookie(res) {
  const isProd = process.env.NODE_ENV === "production" || !!process.env.VERCEL;
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
    path: "/",
  });
}