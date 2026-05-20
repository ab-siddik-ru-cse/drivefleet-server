const express = require("express");
const { signToken, setAuthCookie, clearAuthCookie } = require("../lib/jwt");

function authRoutes(auth) {
  const router = express.Router();

  // POST /api/session/issue-jwt
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

  // GET /api/session/me
  router.get("/me", async (req, res) => {
    try {
      const session = await auth.api.getSession({ headers: req.headers });
      if (!session?.user) return res.json({ user: null });
      return res.json({
        user: {
          uid: session.user.id,
          email: session.user.email,
          name: session.user.name || session.user.email,
          image: session.user.image || null,
        },
      });
    } catch (err) {
      console.error("[GET /api/session/me] error:", err);
      return res.json({ user: null });
    }
  });

  // POST /api/session/logout
  router.post("/logout", async (req, res) => {
    try {
      await auth.api.signOut({ headers: req.headers });
    } catch (err) {
      console.warn("[logout] Better Auth signOut failed:", err.message);
    }
    clearAuthCookie(res);
    return res.json({ ok: true });
  });

  return router;
}

module.exports = authRoutes;
