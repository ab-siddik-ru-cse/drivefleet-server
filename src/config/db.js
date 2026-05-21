const { MongoClient } = require("mongodb");

let client = null;
let connectPromise = null;
let connected = false;

/**
 * Lazy: don't read MONGODB_URI until someone actually tries to connect.
 * This way the server can boot and serve a /health endpoint that tells
 * us what env vars are missing, instead of crashing immediately on import.
 */
async function connect() {
  if (connected && client) return client;
  if (connectPromise) return connectPromise;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. On Vercel: Project Settings → Environment Variables → add MONGODB_URI to Production."
    );
  }

  connectPromise = (async () => {
    client = new MongoClient(uri);
    await client.connect();
    connected = true;
    console.log("MongoDB connected");
    return client;
  })();

  try {
    return await connectPromise;
  } catch (err) {
    // Reset so next call retries (helpful for transient errors on cold start).
    connectPromise = null;
    throw err;
  }
}

function getDb() {
  if (!connected || !client) {
    throw new Error("Database not connected yet. Call connect() first.");
  }
  return client.db("drivefleet");
}

module.exports = { connect, getDb };