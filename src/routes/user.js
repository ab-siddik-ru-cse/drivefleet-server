const express = require("express");
const { ObjectId } = require("mongodb");
const { getDb } = require("../config/db");
const { requireAuth } = require("../middleware/requireAuth");
const { signToken, setAuthCookie } = require("../lib/jwt");

const router = express.Router();


router.get("/me", requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const user = await db.collection("user").findOne({ id: req.user.uid });

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    const account = await db.collection("account").findOne({ userId: req.user.uid });
    const provider = account?.providerId || "credential";

    return res.json({
      ok: true,
      user: {
        uid: user.id,
        name: user.name || "",
        email: user.email,
        image: user.image || null,
        provider, // "google" | "credential"
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

    const result = await db.collection("user").updateOne(
      { id: req.user.uid },
      { $set }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    if ($set.name) {
      await db.collection("cars").updateMany(
        { ownerId: req.user.uid },
        { $set: { ownerName: $set.name } }
      );
    }

    const updated = await db.collection("user").findOne({ id: req.user.uid });
    const token = signToken({
      uid: updated.id,
      email: updated.email,
      name: updated.name || updated.email,
    });
    setAuthCookie(res, token);

    return res.json({
      ok: true,
      user: {
        uid: updated.id,
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

module.exports = router;