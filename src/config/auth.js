const { betterAuth } = require("better-auth");
const { mongodbAdapter } = require("better-auth/adapters/mongodb");
const { getDb } = require("./db");

function buildAuth() {
  const db = getDb();

  return betterAuth({
    database: mongodbAdapter(db),
    baseURL: process.env.BETTER_AUTH_URL || "http://localhost:5000",
    basePath: "/api/auth",

    secret: process.env.BETTER_AUTH_SECRET,


    trustedOrigins: [process.env.CLIENT_URL || "http://localhost:3000"],

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 6,
      password: {
        validate: async (password) => {
          if (password.length < 6) {
            throw new Error("Password must be at least 6 characters long.");
          }
          if (!/[A-Z]/.test(password)) {
            throw new Error("Password must contain at least one uppercase letter.");
          }
          if (!/[a-z]/.test(password)) {
            throw new Error("Password must contain at least one lowercase letter.");
          }
        },
      },
    },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        prompt: "select_account",
      },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 7,   
      updateAge: 60 * 60 * 24,
    },

    advanced: {
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        secure: process.env.NODE_ENV === "production",
      },
    },
  });
}

module.exports = { buildAuth };
