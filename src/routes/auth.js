import express from "express";
import { signToken, setAuthCookie, clearAuthCookie, verifyToken } from "../lib/jwt.js";

export default function authRoutes(auth) {
  const router = express.Router();

  /**
   * POST /api/session/issue-jwt
   *
   * After Better Auth sign-in, client calls this to get our JWT.
   * Returns token in response body (client stores in localStorage AND
   * sends as Bearer header on subsequent requests). Also sets cookie
   * for same-origin clients / formal "JWT in HttpOnly cookie" compliance.
   */
  router.post("/issue-jwt", async (req, res) => {
    try {
      const session = await auth.api.getSession({ headers: req.headers });
      if (!session?.user) {
        return res.status(401).json({ error: "No active session. Sign in first." });
      }

      const token = signToken({
        uid: session.user.id,
        email: session.user.email,
        name: session.user.name || session.user.email,
      });
      setAuthCookie(res, token);

      return res.json({
        ok: true,
        token,
        user: {
          uid: session.user.id,
          email: session.user.email,
          name: session.user.name || session.user.email,
          image: session.user.image || null,
        },
      });
    } catch (err) {
      console.error("[POST /api/session/issue-jwt] error:", err);
      return res.status(500).json({ error: "Could not issue token." });
    }
  });

  /**
   * GET /api/session/me
   *
   * Returns current user. Tries Bearer JWT first, then Better Auth session.
   */
  router.get("/me", async (req, res) => {
    try {
      // 1. Try Bearer JWT (primary in cross-origin deployments)
      const authHeader = req.headers.authorization;
      if (authHeader) {
        const m = authHeader.match(/^Bearer\s+(.+)$/i);
        if (m) {
          const decoded = verifyToken(m[1].trim());
          if (decoded) {
            return res.json({
              user: {
                uid: decoded.uid,
                email: decoded.email,
                name: decoded.name,
                image: null,
              },
            });
          }
        }
      }

      // 2. Fallback: Better Auth session (works same-origin or local dev)
      const session = await auth.api.getSession({ headers: req.headers });
      if (session?.user) {
        return res.json({
          user: {
            uid: session.user.id,
            email: session.user.email,
            name: session.user.name || session.user.email,
            image: session.user.image || null,
          },
        });
      }

      return res.json({ user: null });
    } catch (err) {
      console.error("[GET /api/session/me] error:", err);
      return res.json({ user: null });
    }
  });

  router.post("/logout", async (req, res) => {
    try {
      await auth.api.signOut({ headers: req.headers });
    } catch (err) {
      console.warn("[logout] Better Auth signOut failed:", err.message);
    }
    clearAuthCookie(res);
    return res.json({ ok: true });
  });

  /**
   * GET /api/session/google-handoff
   *
   * KEY FIX FOR GOOGLE OAUTH IN CROSS-ORIGIN DEPLOYMENT:
   *
   * After Google OAuth completes, Better Auth lands on the SERVER (because
   * the callback URL was server-side). Better Auth's session cookie is now
   * set on the SERVER's domain. From here we:
   *   1. Read the session
   *   2. Issue our JWT
   *   3. Redirect to client with the JWT in the URL hash (#token=...)
   *
   * The client reads the hash on /auth-callback page and stores the token
   * in localStorage. URL hash is preferred over query param because the
   * browser doesn't send hash fragments to the server in subsequent requests.
   */
  router.get("/google-handoff", async (req, res) => {
    try {
      const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
      const session = await auth.api.getSession({ headers: req.headers });

      if (!session?.user) {
        return res.redirect(`${clientUrl}/login?error=no-session`);
      }

      const token = signToken({
        uid: session.user.id,
        email: session.user.email,
        name: session.user.name || session.user.email,
      });

      // Hash fragment so the token never reaches the server logs
      return res.redirect(`${clientUrl}/auth-callback#token=${encodeURIComponent(token)}`);
    } catch (err) {
      console.error("[GET /api/session/google-handoff] error:", err);
      const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
      return res.redirect(`${clientUrl}/login?error=handoff-failed`);
    }
  });

  return router;
}