import express from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../config/db.js";
import { requireAuth, attachUser } from "../middleware/requireAuth.js";

const router = express.Router();

function toObjectId(id) {
  try { return new ObjectId(id); } catch { return null; }
}

router.get("/", attachUser, async (req, res) => {
  try {
    const { q, sort = "newest", limit, owner } = req.query;
    const typesRaw = req.query.type;
    const types = Array.isArray(typesRaw) ? typesRaw : typesRaw ? [typesRaw] : [];

    const filter = {};
    if (typeof q === "string" && q.trim()) {
      filter.name = { $regex: q.trim(), $options: "i" };
    }
    if (types.length > 0) {
      filter.type = { $in: types };
    }
    if (owner === "me") {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      filter.ownerId = req.user.uid;
    }

    const sortMap = {
      newest: { createdAt: -1 },
      "price-asc": { dailyPrice: 1 },
      "price-desc": { dailyPrice: -1 },
      popular: { bookingCount: -1 },
    };
    const sortStage = sortMap[sort] || sortMap.newest;

    let cursor = getDb().collection("cars").find(filter).sort(sortStage);
    const lim = parseInt(limit, 10);
    if (Number.isFinite(lim) && lim > 0) cursor = cursor.limit(lim);

    const docs = await cursor.toArray();
    const cars = docs.map((c) => ({ ...c, _id: c._id.toString() }));

    return res.json({ ok: true, count: cars.length, cars });
  } catch (err) {
    console.error("[GET /api/cars] error:", err);
    return res.status(500).json({ error: "Could not load cars." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ error: "Invalid car ID." });

    const car = await getDb().collection("cars").findOne({ _id });
    if (!car) return res.status(404).json({ error: "Car not found." });

    return res.json({ ok: true, car: { ...car, _id: car._id.toString() } });
  } catch (err) {
    console.error("[GET /api/cars/:id] error:", err);
    return res.status(500).json({ error: "Could not load car details." });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const {
      name, dailyPrice, type, imageURL, seatCapacity,
      pickupLocation, description, available,
    } = req.body || {};

    const missing = [];
    if (!name?.trim()) missing.push("name");
    if (dailyPrice === undefined || dailyPrice === "") missing.push("dailyPrice");
    if (!type?.trim()) missing.push("type");
    if (!imageURL?.trim()) missing.push("imageURL");
    if (seatCapacity === undefined || seatCapacity === "") missing.push("seatCapacity");
    if (!pickupLocation?.trim()) missing.push("pickupLocation");
    if (!description?.trim()) missing.push("description");
    if (missing.length) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
    }

    const priceNum = Number(dailyPrice);
    const seatsNum = Number(seatCapacity);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      return res.status(400).json({ error: "Daily price must be a positive number." });
    }
    if (!Number.isFinite(seatsNum) || seatsNum < 1 || seatsNum > 50) {
      return res.status(400).json({ error: "Seat capacity must be between 1 and 50." });
    }

    const doc = {
      name: name.trim(),
      dailyPrice: priceNum,
      type: type.trim(),
      imageURL: imageURL.trim(),
      seatCapacity: seatsNum,
      pickupLocation: pickupLocation.trim(),
      description: description.trim(),
      available: available !== false,
      bookingCount: 0,
      ownerId: req.user.uid,
      ownerEmail: req.user.email,
      ownerName: req.user.name || "",
      createdAt: new Date(),
    };

    const result = await getDb().collection("cars").insertOne(doc);
    return res.json({
      ok: true,
      id: result.insertedId.toString(),
      car: { ...doc, _id: result.insertedId.toString() },
    });
  } catch (err) {
    console.error("[POST /api/cars] error:", err);
    return res.status(500).json({ error: "Could not create car." });
  }
});

router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ error: "Invalid car ID." });

    const car = await getDb().collection("cars").findOne({ _id });
    if (!car) return res.status(404).json({ error: "Car not found." });
    if (car.ownerId !== req.user.uid) {
      return res.status(403).json({ error: "You can only update cars you own." });
    }

    const updates = req.body || {};
    const allowed = [
      "name", "dailyPrice", "type", "imageURL",
      "seatCapacity", "pickupLocation", "description", "available",
    ];

    const $set = {};
    for (const key of allowed) {
      if (key in updates) {
        const value = updates[key];
        if (key === "dailyPrice") {
          const n = Number(value);
          if (!Number.isFinite(n) || n <= 0) {
            return res.status(400).json({ error: "Daily price must be a positive number." });
          }
          $set[key] = n;
        } else if (key === "seatCapacity") {
          const n = Number(value);
          if (!Number.isFinite(n) || n < 1 || n > 50) {
            return res.status(400).json({ error: "Seat capacity must be between 1 and 50." });
          }
          $set[key] = n;
        } else if (key === "available") {
          $set[key] = Boolean(value);
        } else if (typeof value === "string") {
          if (!value.trim()) {
            return res.status(400).json({ error: `${key} cannot be empty.` });
          }
          $set[key] = value.trim();
        }
      }
    }

    if (Object.keys($set).length === 0) {
      return res.status(400).json({ error: "No valid fields to update." });
    }

    $set.updatedAt = new Date();
    await getDb().collection("cars").updateOne({ _id }, { $set });

    const updated = await getDb().collection("cars").findOne({ _id });
    return res.json({
      ok: true,
      car: updated ? { ...updated, _id: updated._id.toString() } : null,
    });
  } catch (err) {
    console.error("[PATCH /api/cars/:id] error:", err);
    return res.status(500).json({ error: "Could not update car." });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ error: "Invalid car ID." });

    const car = await getDb().collection("cars").findOne({ _id });
    if (!car) return res.status(404).json({ error: "Car not found." });
    if (car.ownerId !== req.user.uid) {
      return res.status(403).json({ error: "You can only delete cars you own." });
    }

    await getDb().collection("cars").deleteOne({ _id });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/cars/:id] error:", err);
    return res.status(500).json({ error: "Could not delete car." });
  }
});

export default router;
