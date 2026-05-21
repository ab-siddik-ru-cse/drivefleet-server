import express from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../config/db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { signToken, setAuthCookie } from "../lib/jwt.js";

const router = express.Router();

async function findBetterAuthUser(db, uid) {
  const collections = ["user", "users"];
  for (const collName of collections) {
    const coll = db.collection(collName);
    let doc = await coll.findOne({ id: uid });
    if (doc) return { doc, coll };
    try {
      const oid = new ObjectId(uid);
      doc = await coll.findOne({ _id: oid });
      if (doc) return { doc, coll };
    } catch {}
    doc = await coll.findOne({ _id: uid });
    if (doc) return { doc, coll };
  }
  return { doc: null, coll: null };
}

async function findAccount(db, uid) {
  const collections = ["account", "accounts"];
  for (const collName of collections) {
    const acc = await db.collection(collName).findOne({ userId: uid });
    if (acc) return acc;
  }
  return null;
}

router.get("/_debug", requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const colls = await db.listCollections().toArray();
    const summary = {};
    for (const c of colls) {
      summary[c.name] = await db.collection(c.name).countDocuments();
    }

    const uid = req.user.uid;
    const attempts = {};
    for (const collName of ["user", "users"]) {
      attempts[`${collName}.id=string`] = !!(await db.collection(collName).findOne({ id: uid }));
      attempts[`${collName}._id=string`] = !!(await db.collection(collName).findOne({ _id: uid }));
      try {
        const oid = new ObjectId(uid);
        attempts[`${collName}._id=ObjectId`] = !!(await db.collection(collName).findOne({ _id: oid }));
      } catch {
        attempts[`${collName}._id=ObjectId`] = "uid not a valid ObjectId";
      }
    }

    return res.json({
      ok: true,
      uid,
      reqUser: req.user,
      collections: summary,
      lookupAttempts: attempts,
    });
  } catch (err) {
    console.error("[GET /api/users/_debug] error:", err);
    return res.status(500).json({ error: err.message });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { doc: user } = await findBetterAuthUser(db, req.user.uid);

    if (!user) {
      const colls = await db.listCollections().toArray();
      console.error(
        "[GET /api/users/me] user not found. uid =",
        req.user.uid,
        "collections:",
        colls.map((c) => c.name)
      );
      return res.status(404).json({ error: "User not found." });
    }

    const account = await findAccount(db, req.user.uid);
    const provider = account?.providerId || "credential";

    return res.json({
      ok: true,
      user: {
        uid: user.id || user._id?.toString?.() || req.user.uid,
        name: user.name || "",
        email: user.email,
        image: user.image || null,
        provider,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (err) {
    console.error("[GET /api/users/me] error:", err);
    return res.status(500).json({ error: "Could not load profile." });
  }
});

router.patch("/me", requireAuth, async (req, res) => {
  try {
    const { name, image } = req.body || {};
    const $set = {};

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "Name cannot be empty." });
      }
      if (name.trim().length > 80) {
        return res.status(400).json({ error: "Name is too long (max 80 characters)." });
      }
      $set.name = name.trim();
    }

    if (image !== undefined) {
      if (image === "" || image === null) {
        $set.image = null;
      } else if (typeof image === "string") {
        const trimmed = image.trim();
        if (!/^https?:\/\//i.test(trimmed)) {
          return res.status(400).json({ error: "Image URL must start with http(s)://" });
        }
        if (trimmed.length > 500) {
          return res.status(400).json({ error: "Image URL is too long." });
        }
        $set.image = trimmed;
      } else {
        return res.status(400).json({ error: "Invalid image value." });
      }
    }

    if (Object.keys($set).length === 0) {
      return res.status(400).json({ error: "Nothing to update." });
    }

    $set.updatedAt = new Date();

    const db = getDb();
    const { doc: existing, coll } = await findBetterAuthUser(db, req.user.uid);
    if (!existing) {
      return res.status(404).json({ error: "User not found." });
    }

    await coll.updateOne({ _id: existing._id }, { $set });

    if ($set.name) {
      await db.collection("cars").updateMany(
        { ownerId: req.user.uid },
        { $set: { ownerName: $set.name } }
      );
    }

    const updated = await coll.findOne({ _id: existing._id });

    const token = signToken({
      uid: updated.id || updated._id?.toString?.() || req.user.uid,
      email: updated.email,
      name: updated.name || updated.email,
    });
    setAuthCookie(res, token);

    return res.json({
      ok: true,
      user: {
        uid: updated.id || updated._id?.toString?.() || req.user.uid,
        name: updated.name || "",
        email: updated.email,
        image: updated.image || null,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (err) {
    console.error("[PATCH /api/users/me] error:", err);
    return res.status(500).json({ error: "Could not update profile." });
  }
});

export default router;
