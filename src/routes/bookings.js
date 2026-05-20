const express = require("express");
const { ObjectId } = require("mongodb");
const { getDb } = require("../config/db");
const { requireAuth } = require("../middleware/requireAuth");

const router = express.Router();

const DRIVER_DAILY_FEE = 10;


 // GET /api/bookings — current user's bookings.
router.get("/", requireAuth, async (req, res) => {
  try {
    const docs = await getDb()
      .collection("bookings")
      .find({ userId: req.user.uid })
      .sort({ bookingDate: -1 })
      .toArray();

    const bookings = docs.map((b) => ({
      ...b,
      _id: b._id.toString(),
      carId: b.carId?.toString?.() ?? b.carId,
    }));
    return res.json({ ok: true, count: bookings.length, bookings });
  } catch (err) {
    console.error("[GET /api/bookings] error:", err);
    return res.status(500).json({ error: "Could not load bookings." });
  }
});


 // POST /api/bookings — create a booking and $inc the car's bookingCount.

router.post("/", requireAuth, async (req, res) => {
  try {
    const { carId, startDate, endDate, driverNeeded, specialNote } = req.body || {};

    if (!carId) return res.status(400).json({ error: "Car ID is required." });
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "Both start and end dates are required." });
    }

    let _carId;
    try {
      _carId = new ObjectId(carId);
    } catch {
      return res.status(400).json({ error: "Invalid car ID." });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ error: "Invalid dates." });
    }
    if (start < today) {
      return res.status(400).json({ error: "Start date cannot be in the past." });
    }
    if (end < start) {
      return res.status(400).json({ error: "End date must be on or after start date." });
    }

    const days = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);

    const db = getDb();
    const car = await db.collection("cars").findOne({ _id: _carId });
    if (!car) return res.status(404).json({ error: "Car not found." });
    if (!car.available) {
      return res.status(400).json({ error: "This car is currently unavailable." });
    }
    if (car.ownerId === req.user.uid) {
      return res.status(400).json({ error: "You cannot book your own car." });
    }

    const dailyPrice = Number(car.dailyPrice);
    const driverTotal = driverNeeded ? DRIVER_DAILY_FEE * days : 0;
    const totalPrice = dailyPrice * days + driverTotal;

    const bookingDoc = {
      carId: _carId,
      carName: car.name,
      carImage: car.imageURL,
      carType: car.type,
      pickupLocation: car.pickupLocation,
      ownerId: car.ownerId,
      ownerEmail: car.ownerEmail,
      userId: req.user.uid,
      userEmail: req.user.email,
      userName: req.user.name || "",
      startDate: start,
      endDate: end,
      bookingDate: new Date(),
      days,
      driverNeeded: Boolean(driverNeeded),
      specialNote: (specialNote ?? "").toString().trim().slice(0, 500),
      dailyPrice,
      totalPrice,
      status: "confirmed",
    };

    const result = await db.collection("bookings").insertOne(bookingDoc);

    await db.collection("cars").updateOne(
      { _id: _carId },
      { $inc: { bookingCount: 1 } }
    );

    return res.json({
      ok: true,
      id: result.insertedId.toString(),
      booking: {
        ...bookingDoc,
        _id: result.insertedId.toString(),
        carId: _carId.toString(),
      },
    });
  } catch (err) {
    console.error("[POST /api/bookings] error:", err);
    return res.status(500).json({ error: "Could not create booking." });
  }
});

 // DELETE /api/bookings/:id — cancel a booking; $inc -1 on the car.

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    let _id;
    try {
      _id = new ObjectId(req.params.id);
    } catch {
      return res.status(400).json({ error: "Invalid booking ID." });
    }

    const db = getDb();
    const booking = await db.collection("bookings").findOne({ _id });
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    if (booking.userId !== req.user.uid) {
      return res.status(403).json({ error: "You can only cancel your own bookings." });
    }
    if (booking.status === "cancelled") {
      return res.status(400).json({ error: "This booking is already cancelled." });
    }

    await db.collection("bookings").updateOne(
      { _id },
      { $set: { status: "cancelled", cancelledAt: new Date() } }
    );

    if (booking.carId) {
      await db.collection("cars").updateOne(
        { _id: booking.carId },
        { $inc: { bookingCount: -1 } }
      );
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/bookings/:id] error:", err);
    return res.status(500).json({ error: "Could not cancel booking." });
  }
});

module.exports = router;
