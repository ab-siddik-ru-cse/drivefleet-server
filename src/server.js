import "dotenv/config";

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { toNodeHandler } from "better-auth/node";

import { connect } from "./config/db.js";
import { buildAuth } from "./config/auth.js";
import authRoutes from "./routes/auth.js";
import carsRoutes from "./routes/cars.js";
import bookingsRoutes from "./routes/bookings.js";
import usersRoutes from "./routes/users.js";

const app = express();
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

app.set("trust proxy", true);

app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);

app.use(cookieParser());

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

app.all("/api/auth/*", async (req, res) => {
  try {
    const auth = await ensureInit();
    return toNodeHandler(auth)(req, res);
  } catch (err) {
    console.error("[better-auth handler] init error:", err);
    return res.status(500).json({ error: "Auth service unavailable.", detail: err.message });
  }
});

app.use(express.json({ limit: "1mb" }));

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
      ? "Add the missing env vars on Vercel Dashboard. Make sure to check the 'Production' checkbox. Redeploy after adding."
      : "All required env vars are set.",
  });
});

app.use((_req, res) => {
  res.status(404).json({ error: "Route not found." });
});

app.use((err, _req, res, _next) => {
  console.error("[unhandled]", err);
  res.status(500).json({
    error: "Internal server error.",
    detail: err.message,
  });
});

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`DriveFleet server listening on http://localhost:${PORT}`);
    console.log(`CORS origin: ${CLIENT_URL}`);
  });
}

export default app;
