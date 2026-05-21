# DriveFleet — Server 🚗

Express + MongoDB + Better Auth backend for the DriveFleet car rental platform.

**Auth strategy:**
- **Better Auth** handles email/password sign-up/sign-in and Google OAuth (social login). It stores sessions in MongoDB and sets its own HTTP-only signed cookies.
- **Custom JWT cookie (`df_token`)** on top of that — issued after Better Auth confirms a session, verified by our `requireAuth` middleware on every protected route.

This satisfies the "JWT with Cookies" requirement (generate → HTTP-only cookie → middleware verification → protect private APIs) while keeping Better Auth's polished OAuth and account management.

---

## 📁 Folder Structure

```
drivefleet-server/
├── src/
│   ├── server.js                # Express entry
│   ├── config/
│   │   ├── db.js                # MongoDB singleton
│   │   └── auth.js              # Better Auth instance (Google + email/password)
│   ├── lib/
│   │   └── jwt.js               # signToken / verifyToken / cookie helpers
│   ├── middleware/
│   │   └── requireAuth.js       # JWT cookie verification middleware
│   └── routes/
│       ├── auth.js              # /api/session/* — issue-jwt, me, logout
│       ├── cars.js              # /api/cars/* — CRUD + $regex/$in search
│       └── bookings.js          # /api/bookings/* — with $inc on bookingCount
├── .env.example
├── .gitignore
└── package.json
```

---

## 🛠 Setup

### 1. Install
```bash
cd drivefleet-server
npm install
```

### 2. Create Google OAuth credentials

1. Go to https://console.cloud.google.com → APIs & Services → **Credentials**.
2. Create OAuth client ID → **Web application**.
3. **Authorized JavaScript origins:**
   - `http://localhost:3000` (client)
   - `http://localhost:5000` (server)
   - your production client + server URLs
4. **Authorized redirect URIs:**
   - `http://localhost:5000/api/auth/callback/google`
   - `https://<your-server-domain>/api/auth/callback/google` (when deployed)
5. Copy the **Client ID** and **Client Secret** into `.env`.

### 3. Configure `.env`

```env
PORT=5000
NODE_ENV=development

CLIENT_URL=http://localhost:3000

MONGODB_URI=mongodb+srv://USER:PASS@cluster.mongodb.net/drivefleet

BETTER_AUTH_URL=http://localhost:5000
BETTER_AUTH_SECRET=long-random-string-1
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

JWT_SECRET=long-random-string-2-DIFFERENT-from-above
JWT_EXPIRES_IN=7d
JWT_COOKIE_NAME=df_token
```

Generate secrets quickly: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### 4. Run

```bash
npm run dev    # nodemon
# or
npm start
```

Open http://localhost:5000 — you should see `{ ok: true, service: "drivefleet-server", ... }`.

---

## 📡 API Reference

### 🔐 Better Auth (catch-all at `/api/auth/*`)

Mounted by `toNodeHandler(auth)` — these are Better Auth's built-in endpoints. Your **client** should call them directly using `fetch` with `credentials: "include"`, OR using `better-auth/client`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/sign-up/email` | `{ email, password, name }` — email signup |
| `POST` | `/api/auth/sign-in/email` | `{ email, password }` — email login |
| `POST` | `/api/auth/sign-in/social` | `{ provider: "google", callbackURL }` — Google login (returns redirect URL) |
| `GET`  | `/api/auth/callback/google` | OAuth callback (Google redirects here) |
| `POST` | `/api/auth/sign-out` | Invalidate Better Auth session |
| `GET`  | `/api/auth/get-session` | Read current session |

After **any successful sign-in** the client should call `POST /api/session/issue-jwt` to also get the JWT cookie.

### 🪙 Session helpers (our custom layer)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/session/issue-jwt` | Mints `df_token` JWT cookie from current Better Auth session |
| `GET`  | `/api/session/me` | Returns current user (or `{ user: null }`) |
| `POST` | `/api/session/logout` | Clears both Better Auth session AND `df_token` |

### 🚙 Cars

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET`    | `/api/cars` | Optional | List cars. `?q=`, `?type=` (repeatable), `?sort=`, `?limit=`, `?owner=me` |
| `POST`   | `/api/cars` | Required | Create a car |
| `GET`    | `/api/cars/:id` | Public | Single car |
| `PATCH`  | `/api/cars/:id` | Owner | Update fields |
| `DELETE` | `/api/cars/:id` | Owner | Delete |

Search uses **`$regex`** (case-insensitive), filter uses **`$in`**.

### 📅 Bookings

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET`    | `/api/bookings` | Required | Current user's bookings |
| `POST`   | `/api/bookings` | Required | Create booking; **`$inc` increments car.bookingCount** |
| `DELETE` | `/api/bookings/:id` | Required | Cancel booking; **`$inc` decrements car.bookingCount** |

---

## 🔌 Client Integration Guide

Your `drivefleet-client` (Next.js) needs three changes:

### A) Set the API base URL

In the client `.env`:
```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

### B) Always send credentials

Every fetch to the server **must** include `credentials: "include"` — otherwise the browser won't send/accept cookies cross-origin.

```js
const API = process.env.NEXT_PUBLIC_API_URL;

await fetch(`${API}/api/cars`, {
  method: "GET",
  credentials: "include",   // ← required
});
```

### C) Auth flow — replace the existing handlers

**Email + password sign-up:**
```js
// 1. Sign up via Better Auth
const r1 = await fetch(`${API}/api/auth/sign-up/email`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name, email, password }),
});
if (!r1.ok) { /* show error */ }

// 2. Issue our JWT cookie
const r2 = await fetch(`${API}/api/session/issue-jwt`, {
  method: "POST",
  credentials: "include",
});
const { user } = await r2.json();
```

**Email + password sign-in:**
```js
await fetch(`${API}/api/auth/sign-in/email`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});

await fetch(`${API}/api/session/issue-jwt`, {
  method: "POST",
  credentials: "include",
});
```

**Google sign-in:**
```js
// Better Auth returns a URL to redirect the user to Google
const r = await fetch(`${API}/api/auth/sign-in/social`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    provider: "google",
    callbackURL: `${window.location.origin}/auth/callback`,
  }),
});
const { url } = await r.json();
window.location.href = url;  // redirect to Google
```

Then create a page at `/auth/callback` in the client that calls `issue-jwt` on mount:

```jsx
// app/auth/callback/page.jsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AuthCallback() {
  const router = useRouter();
  useEffect(() => {
    (async () => {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/session/issue-jwt`, {
        method: "POST",
        credentials: "include",
      });
      router.push("/");
    })();
  }, [router]);
  return <p>Signing you in…</p>;
}
```

**Logout:**
```js
await fetch(`${API}/api/session/logout`, {
  method: "POST",
  credentials: "include",
});
```

**Read current user on app load:**
```js
const res = await fetch(`${API}/api/session/me`, { credentials: "include" });
const { user } = await res.json();
```

### D) Tiny helper to keep this clean

Put this in `lib/api.js` on the client:

```js
const API = process.env.NEXT_PUBLIC_API_URL;

export async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}
```

Then everywhere: `await api("/api/cars")` etc.

---

## ☁️ Deployment

Recommended split:
- **Server** → Render, Railway, Fly.io, or any Node host (Vercel works for the Next.js client, less ideal for long-running Express).
- **Client** → Vercel.

For production:
1. Set `NODE_ENV=production` on the server.
2. Set `CLIENT_URL=https://<your-client-domain>` and `BETTER_AUTH_URL=https://<your-server-domain>`.
3. Add the production server domain to **Google OAuth's Authorized redirect URIs** as `https://<server>/api/auth/callback/google`.
4. MongoDB Atlas → Network Access → whitelist `0.0.0.0/0` (or the platform's outbound IPs).
5. Because client and server are on different domains, cookies need `sameSite=none` + `secure=true` (this code already does that automatically when `NODE_ENV=production`).
6. The server's host must serve HTTPS for `secure` cookies to be accepted.

---

## 🧪 Quick cURL smoke test

```bash
# 1. Sign up
curl -i -c cookies.txt -X POST http://localhost:5000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test1234","name":"Test User"}'

# 2. Issue JWT
curl -i -b cookies.txt -c cookies.txt -X POST http://localhost:5000/api/session/issue-jwt

# 3. Use it
curl -b cookies.txt http://localhost:5000/api/session/me

# 4. Create a car
curl -b cookies.txt -X POST http://localhost:5000/api/cars \
  -H "Content-Type: application/json" \
  -d '{"name":"Toyota Corolla","dailyPrice":45,"type":"Sedan","imageURL":"https://i.ibb.co/abc.jpg","seatCapacity":5,"pickupLocation":"Dhaka","description":"Nice car","available":true}'

# 5. Search with $regex
curl "http://localhost:5000/api/cars?q=toyota"

# 6. Filter with $in
curl "http://localhost:5000/api/cars?type=Sedan&type=SUV"
```

---

## 📜 License

MIT
