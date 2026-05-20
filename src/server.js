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

app.set("trust proxy", true);

app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);

app.use(cookieParser());

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
    return res.status(500).json({ error: "Auth service unavailable." });
  }
});

// Now safe to enable JSON parsing for our own routes
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

// Health check
app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "drivefleet-server",
    time: new Date().toISOString(),
    env: process.env.NODE_ENV,
    clientUrl: CLIENT_URL,
  });
});

// 404
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found." });
});

// Error handler
app.use((err, _req, res, _next) => {
  console.error("[unhandled]", err);
  res.status(500).json({ error: "Internal server error." });
});

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`DriveFleet server listening on http://localhost:${PORT}`);
    console.log(`CORS origin: ${CLIENT_URL}`);
    console.log(`Better Auth base: ${process.env.BETTER_AUTH_URL || "http://localhost:" + PORT}`);
  });
}

module.exports = app;