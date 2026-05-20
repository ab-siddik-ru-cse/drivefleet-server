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

async function main() {
  await connect();

  const auth = buildAuth();

  const app = express();
  const PORT = process.env.PORT || 5000;
  const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

  app.set("trust proxy", 1);

  app.use(
    cors({
      origin: CLIENT_URL,
      credentials: true,
    })
  );

  app.use(cookieParser());

  app.all("/api/auth/*", toNodeHandler(auth));

  app.use(express.json({ limit: "1mb" }));

  app.use("/api/session", authRoutes(auth));
  app.use("/api/cars", carsRoutes);
  app.use("/api/bookings", bookingsRoutes);

  app.get("/", (_req, res) => {
    res.json({ ok: true, service: "drivefleet-server", time: new Date().toISOString() });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: "Route not found." });
  });

  app.use((err, _req, res, _next) => {
    console.error("[unhandled]", err);
    res.status(500).json({ error: "Internal server error." });
  });

  app.listen(PORT, () => {
    console.log(`DriveFleet server listening on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
