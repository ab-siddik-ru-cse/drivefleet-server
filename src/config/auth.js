const { betterAuth } = require("better-auth");
const { mongodbAdapter } = require("better-auth/adapters/mongodb");
const { getDb } = require("./db");

function buildAuth() {
  const db = getDb();

  const isProd = process.env.NODE_ENV === "production";
  const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
  const baseURL = process.env.BETTER_AUTH_URL || "http://localhost:5000";

  // Trusted origins for client/server requests
  const trustedOrigins = [clientUrl, baseURL].filter(Boolean);

  return betterAuth({
    database: mongodbAdapter(db),

    baseURL,
    basePath: "/api/auth",
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins,

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 6,

      // Password validation rules
      password: {
        validate: async (password) => {
          if (password.length < 6) {
            throw new Error("Password must be at least 6 characters long.");
          }

          if (!/[A-Z]/.test(password)) {
            throw new Error(
              "Password must contain at least one uppercase letter."
            );
          }

          if (!/[a-z]/.test(password)) {
            throw new Error(
              "Password must contain at least one lowercase letter."
            );
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

    // Cross-origin cookie configuration
    advanced: {
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: isProd ? "none" : "lax",
        secure: isProd,
      },
    },
  });
}

module.exports = { buildAuth };