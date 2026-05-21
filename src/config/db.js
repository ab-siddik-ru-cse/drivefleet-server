import { MongoClient } from "mongodb";

let client = null;
let connectPromise = null;
let connected = false;

export async function connect() {
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
    console.log("✅ MongoDB connected");
    return client;
  })();

  try {
    return await connectPromise;
  } catch (err) {
    connectPromise = null;
    throw err;
  }
}

export function getDb() {
  if (!connected || !client) {
    throw new Error("Database not connected yet. Call connect() first.");
  }
  return client.db("drivefleet");
}
