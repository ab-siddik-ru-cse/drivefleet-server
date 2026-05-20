const { MongoClient } = require("mongodb");

if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI is not set. Add it to your .env file.");
}

const client = new MongoClient(process.env.MONGODB_URI);
let connected = false;

async function connect() {
  if (!connected) {
    await client.connect();
    connected = true;
    console.log("MongoDB connected");
  }
  return client;
}

function getDb() {
  if (!connected) {
    throw new Error("Database not connected yet. Call connect() first.");
  }
  return client.db("drivefleet");
}
module.exports = { client, connect, getDb };
