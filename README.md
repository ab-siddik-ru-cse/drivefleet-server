# DriveFleet — Server

Express + MongoDB + Better Auth backend for the DriveFleet car rental platform.

**Auth strategy:**
- **Better Auth** handles email/password sign-up/sign-in and Google OAuth (social login). It stores sessions in MongoDB and sets its own HTTP-only signed cookies.
- **Custom JWT cookie (`df_token`)** on top of that — issued after Better Auth confirms a session, verified by our `requireAuth` middleware on every protected route.

This satisfies the "JWT with Cookies" requirement (generate → HTTP-only cookie → middleware verification → protect private APIs) while keeping Better Auth's polished OAuth and account management.

---

## Folder Structure

```
drivefleet-server/
├── src/
│   ├── server.js               
│   ├── config/
│   │   ├── db.js               
│   │   └── auth.js              
│   ├── lib/
│   │   └── jwt.js               
│   ├── middleware/
│   │   └── requireAuth.js       
│   └── routes/
│       ├── auth.js              
│       ├── cars.js              
│       └── bookings.js          
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