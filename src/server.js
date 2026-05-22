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
const allowedOrigins = CLIENT_URL.split(",").map((o) => o.trim()).filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS: ${origin} not allowed`));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(cookieParser());

const g = globalThis;

async function ensureInit() {
  if (g._authInstance) return g._authInstance;
  if (g._initPromise) return g._initPromise;

  g._initPromise = (async () => {
    await connect();
    g._authInstance = buildAuth();
    return g._authInstance;
  })().catch((err) => {
    g._initPromise = null;
    throw err;
  });

  return g._initPromise;
}

app.use((req, _res, next) => {
  if (req.path.startsWith("/api/")) {
    console.log(
      "[req] %s %s origin=%s",
      req.method,
      req.path,
      req.headers.origin || "-"
    );
  }
  next();
});

app.use("/api", async (req, res, next) => {
  try {
    await ensureInit();
    next();
  } catch (err) {
    console.error("[init] DB/Auth init failed:", err.message);
    res.status(503).json({
      error: "Service temporarily unavailable. Please retry in a moment.",
      detail: process.env.NODE_ENV !== "production" ? err.message : undefined,
    });
  }
});

app.all("/api/auth/*", async (req, res) => {
  try {
    const auth = await ensureInit();
    return toNodeHandler(auth)(req, res);
  } catch (err) {
    console.error("[better-auth handler] error:", err);
    return res.status(500).json({ error: "Auth service unavailable.", detail: err.message });
  }
});

app.use(express.json({ limit: "1mb" }));

app.use("/api/session", async (req, res, next) => {
  try {
    const auth = await ensureInit();
    if (!g._sessionRouter) g._sessionRouter = authRoutes(auth);
    return g._sessionRouter(req, res, next);
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