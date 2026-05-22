import { MongoClient } from "mongodb";

const g = globalThis;

export async function connect() {
  if (g._mongoClient && g._mongoConnected) {
    try {
      await g._mongoClient.db("admin").command({ ping: 1 });
      return g._mongoClient;
    } catch {
      g._mongoClient = null;
      g._mongoConnected = false;
      g._mongoConnectPromise = null;
    }
  }

  if (g._mongoConnectPromise) return g._mongoConnectPromise;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set.");
  }

  g._mongoConnectPromise = (async () => {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 8000,   
      connectTimeoutMS: 8000,
      socketTimeoutMS: 30000,
      maxPoolSize: 5,                  
      minPoolSize: 1,
    });
    await client.connect();
    g._mongoClient = client;
    g._mongoConnected = true;
    console.log("MongoDB connected");
    return client;
  })().catch((err) => {
    g._mongoConnectPromise = null;
    g._mongoConnected = false;
    throw err;
  });

  return g._mongoConnectPromise;
}

export function getDb() {
  if (!g._mongoConnected || !g._mongoClient) {
    throw new Error("Database not connected yet. Call connect() first.");
  }
  return g._mongoClient.db("drivefleet");
}