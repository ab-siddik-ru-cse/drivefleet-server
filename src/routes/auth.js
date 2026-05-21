import express from "express";
import { signToken, setAuthCookie, clearAuthCookie, verifyToken } from "../lib/jwt.js";

export default function authRoutes(auth) {
  const router = express.Router();

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

  router.get("/me", async (req, res) => {
    try {
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

      return res.redirect(`${clientUrl}/auth-callback#token=${encodeURIComponent(token)}`);
    } catch (err) {
      console.error("[GET /api/session/google-handoff] error:", err);
      const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
      return res.redirect(`${clientUrl}/login?error=handoff-failed`);
    }
  });

  return router;
}