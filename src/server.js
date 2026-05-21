require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { toNodeHandler } = require("better-auth/node");

const { connect } = require("./config/db");
const { buildAuth } = require("./config/auth");
const authRoutes = require("./routes/auth");
const carsRoutes = require("./routes/cars");
const bookingsRoutes = require("./routes/bookings");
const usersRoutes = require("./routes/users");

const app = express();
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

// === trust proxy ===
// Vercel and most PaaS platforms route requests through proxies. Without
// this, Express thinks every connection is HTTP (not HTTPS) and cookies
// with `secure: true` get silently dropped — which is exactly the bug
// causing the "401 on issue-jwt" symptom in production.
app.set("trust proxy", true);

// === CORS ===
// credentials:true is essential — without it, the browser strips the cookie
// and the JWT middleware will think you're not logged in.
//
// origin must be the exact client URL, NOT "*". Browsers refuse to send
// cookies to a "*" origin.
app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);

app.use(cookieParser());

// === Diagnostic logging ===
// Logs every incoming request with its origin and which cookies arrived.
// Look in Vercel "Functions" logs to see this output. If the cookie header
// is missing or doesn't contain df_token, the browser isn't sending it.
app.use((req, _res, next) => {
  if (req.path.startsWith("/api/")) {
    console.log(
      "[req] %s %s origin=%s cookies=[%s]",
      req.method,
      req.path,
      req.headers.origin || "-",
      Object.keys(req.cookies || {}).join(",") || "(none)"
    );
  }
  next();
});

// === Database & Auth bootstrap ===
// On Vercel each function invocation may be a cold start, so we lazily
// initialize and memoize the auth instance across invocations.
let authInstance = null;
let initPromise = null;

async function ensureInit() {
  if (authInstance) return authInstance;
  if (!initPromise) {
    initPromise = (async () => {
      await connect();
      authInstance = buildAuth();
      return authInstance;
    })();
  }
  return initPromise;
}

// =================================================================
// === Better Auth catch-all (must come BEFORE express.json!) ======
// =================================================================
// Better Auth needs the raw request body. If express.json() runs first,
// it consumes the stream and Better Auth's calls hang or 422.
app.all("/api/auth/*", async (req, res) => {
  try {
    const auth = await ensureInit();
    return toNodeHandler(auth)(req, res);
  } catch (err) {
    console.error("[better-auth handler] init error:", err);
    return res.status(500).json({ error: "Auth service unavailable." });
  }
});

// Now safe to enable JSON parsing for our own routes
app.use(express.json({ limit: "1mb" }));

// === Our routes ===
// authRoutes(auth) returns a router; we need auth ready first.
// Memoize so we don't rebuild the router on every request.
let sessionRouter = null;
app.use("/api/session", async (req, res, next) => {
  try {
    if (!sessionRouter) {
      const auth = await ensureInit();
      sessionRouter = authRoutes(auth);
    }
    return sessionRouter(req, res, next);
  } catch (err) {
    next(err);
  }
});
app.use("/api/cars", carsRoutes);
app.use("/api/bookings", bookingsRoutes);
app.use("/api/users", usersRoutes);

// Health check + env diagnostic. Visit this URL in a browser to see
// exactly which env vars are configured. SAFE — only reveals presence,
// not values.
app.get("/", (_req, res) => {
  const required = [
    "MONGODB_URI",
    "JWT_SECRET",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "CLIENT_URL",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
  ];
  const envStatus = {};
  const missing = [];
  for (const key of required) {
    const present = !!process.env[key];
    envStatus[key] = present ? "✓ set" : "✗ MISSING";
    if (!present) missing.push(key);
  }

  res.json({
    ok: missing.length === 0,
    service: "drivefleet-server",
    time: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV || "(unset)",
    onVercel: !!process.env.VERCEL,
    clientUrl: process.env.CLIENT_URL || "(unset)",
    envStatus,
    missing: missing.length ? missing : undefined,
    hint: missing.length
      ? "Add the missing env vars on Vercel Dashboard → Project → Settings → Environment Variables. Make sure to check the 'Production' checkbox. Redeploy after adding."
      : "All required env vars are set.",
  });
});

// 404
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found." });
});

// Error handler — return the actual error message so production debugging
// is easier. (You can hide this once everything works.)
app.use((err, _req, res, _next) => {
  console.error("[unhandled]", err);
  res.status(500).json({
    error: "Internal server error.",
    detail: err.message,
    // Help operators find missing env vars when this fires.
    hint: err.message?.includes("is not set")
      ? "Check Vercel Project Settings → Environment Variables. Add the missing variable to Production and redeploy."
      : undefined,
  });
});

// === Local development server ===
// When NOT running on Vercel, start a normal HTTP server.
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚗 DriveFleet server listening on http://localhost:${PORT}`);
    console.log(`   CORS origin: ${CLIENT_URL}`);
    console.log(`   Better Auth base: ${process.env.BETTER_AUTH_URL || "http://localhost:" + PORT}`);
  });
}

// === Vercel serverless export ===
// Vercel detects this default export and routes every request to it.
module.exports = app;