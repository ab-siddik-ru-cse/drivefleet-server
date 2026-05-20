const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const { betterAuth } = require("better-auth");
const { toNodeHandler } = require("better-auth/node");
const { mongodbAdapter } = require("better-auth/adapters/mongodb");

const app = express();
const port = process.env.PORT || 5000;

// MIDDLEWARE

app.use(
    cors({
        origin: "http://localhost:3000",
        credentials: true,
    })
);

app.use(express.json());
app.use(cookieParser());

// MONGODB CONNECTION

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        deprecationErrors: true,
    },
});

// RUN SERVER

async function run() {
    try {

        await client.connect();

        const database = client.db("drivefleet");

        // Collections
        const carsCollection = database.collection("cars");
        const bookingsCollection = database.collection("bookings");

        console.log("Connected to MongoDB!");

        // BETTER AUTH

        const auth = betterAuth({

            database: mongodbAdapter(db),

            secret: process.env.BETTER_AUTH_SECRET,

            baseURL: "http://localhost:5000",

            trustedOrigins: [
                "http://localhost:3000",
            ],

            emailAndPassword: {
                enabled: true,
            },

            socialProviders: {
                google: {
                    clientId: process.env.GOOGLE_CLIENT_ID,
                    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                },
            },

        });

        // Better Auth handler
        app.all("/api/auth/{*any}", toNodeHandler(auth));

        // AUTH MIDDLEWARE

        async function verifyAuth(req, res, next) {
            try {

                const session = await auth.api.getSession({
                    headers: req.headers,
                });

                if (!session) {
                    return res.status(401).json({
                        success: false,
                        message: "Unauthorized access",
                    });
                }

                req.user = session.user;

                next();

            } catch (error) {

                console.error("AUTH MIDDLEWARE ERROR:", error);

                res.status(401).json({
                    success: false,
                    message: "Unauthorized access",
                });
            }
        }

        // GET ALL CARS

        app.get("/cars", async (req, res) => {
            try {

                const q = req.query.q?.trim();

                const types = req.query.type
                    ? Array.isArray(req.query.type)
                        ? req.query.type
                        : [req.query.type]
                    : [];

                const limitParam = parseInt(req.query.limit || "0");

                const ownerId = req.query.ownerId;

                const sort = req.query.sort || "newest";

                const filter = {};

                // Search by name
                if (q) {
                    filter.name = {
                        $regex: q,
                        $options: "i",
                    };
                }

                // Filter by type
                if (types.length > 0) {
                    filter.type = {
                        $in: types,
                    };
                }

                // Filter by owner
                if (ownerId) {
                    filter.ownerId = ownerId;
                }

                // Sorting
                const sortMap = {
                    newest: { createdAt: -1 },
                    "price-asc": { dailyPrice: 1 },
                    "price-desc": { dailyPrice: -1 },
                    popular: { bookingCount: -1 },
                };

                const sortStage = sortMap[sort] || sortMap.newest;

                let cursor = carsCollection.find(filter).sort(sortStage);

                if (limitParam > 0) {
                    cursor = cursor.limit(limitParam);
                }

                const cars = await cursor.toArray();

                res.status(200).json({
                    success: true,
                    count: cars.length,
                    cars,
                });

            } catch (error) {

                console.error("GET /cars error:", error);

                res.status(500).json({
                    success: false,
                    message: "Could not load cars",
                });
            }
        });

        // GET SINGLE CAR

        app.get("/cars/:id", async (req, res) => {
            try {

                const id = req.params.id;

                const car = await carsCollection.findOne({
                    _id: new ObjectId(id),
                });

                if (!car) {
                    return res.status(404).json({
                        success: false,
                        message: "Car not found",
                    });
                }

                res.status(200).json({
                    success: true,
                    car,
                });

            } catch (error) {

                console.error("GET SINGLE CAR error:", error);

                res.status(500).json({
                    success: false,
                    message: "Failed to fetch car",
                });
            }
        });

        // ADD NEW CAR

        app.post("/add-car", verifyAuth, async (req, res) => {
            try {

                const body = req.body;

                const {
                    name,
                    dailyPrice,
                    type,
                    imageURL,
                    seatCapacity,
                    pickupLocation,
                    description,
                    available,
                } = body;

                const missing = [];

                if (!name?.trim()) missing.push("name");

                if (dailyPrice === undefined || dailyPrice === "")
                    missing.push("dailyPrice");

                if (!type?.trim()) missing.push("type");

                if (!imageURL?.trim()) missing.push("imageURL");

                if (seatCapacity === undefined || seatCapacity === "")
                    missing.push("seatCapacity");

                if (!pickupLocation?.trim())
                    missing.push("pickupLocation");

                if (!description?.trim())
                    missing.push("description");

                if (missing.length > 0) {
                    return res.status(400).json({
                        success: false,
                        message: `Missing required fields: ${missing.join(", ")}`,
                    });
                }

                const priceNum = Number(dailyPrice);

                const seatsNum = Number(seatCapacity);

                if (!Number.isFinite(priceNum) || priceNum <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Daily price must be positive number",
                    });
                }

                if (
                    !Number.isFinite(seatsNum) ||
                    seatsNum < 1 ||
                    seatsNum > 50
                ) {
                    return res.status(400).json({
                        success: false,
                        message: "Seat capacity must be between 1 and 50",
                    });
                }

                // Final document
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

                    // Owner from session
                    ownerId: req.user.id,
                    ownerEmail: req.user.email,
                    ownerName: req.user.name || "",

                    createdAt: new Date(),
                };

                const result = await carsCollection.insertOne(doc);

                res.status(201).json({
                    success: true,
                    message: "Car added successfully",

                    insertedId: result.insertedId,

                    car: {
                        ...doc,
                        _id: result.insertedId,
                    },
                });

            } catch (error) {

                console.error("POST /add-car error:", error);

                res.status(500).json({
                    success: false,
                    message: "Could not create car",
                });
            }
        });

        // GET BOOKINGS

        app.get("/bookings", verifyAuth, async (req, res) => {
            try {

                const bookings = await bookingsCollection
                    .find({
                        userId: req.user.id,
                    })
                    .sort({
                        bookingDate: -1,
                    })
                    .toArray();

                res.status(200).json({
                    success: true,
                    count: bookings.length,
                    bookings,
                });

            } catch (error) {

                console.error("GET /bookings error:", error);

                res.status(500).json({
                    success: false,
                    message: "Could not load bookings",
                });
            }
        });

        // CREATE BOOKING

        app.post("/bookings", verifyAuth, async (req, res) => {
            try {

                const body = req.body;

                const {
                    carId,
                    startDate,
                    endDate,
                    driverNeeded,
                    specialNote,
                } = body;

                if (!carId) {
                    return res.status(400).json({
                        success: false,
                        message: "Car ID is required",
                    });
                }

                let _carId;

                try {
                    _carId = new ObjectId(carId);
                } catch {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid car ID",
                    });
                }

                const start = new Date(startDate);
                const end = new Date(endDate);

                const days = Math.max(
                    1,
                    Math.round(
                        (end - start) / (1000 * 60 * 60 * 24)
                    ) + 1
                );

                const car = await carsCollection.findOne({
                    _id: _carId,
                });

                if (!car) {
                    return res.status(404).json({
                        success: false,
                        message: "Car not found",
                    });
                }

                const DRIVER_DAILY_FEE = 50;

                const dailyPrice = Number(car.dailyPrice);

                const driverTotal = driverNeeded
                    ? DRIVER_DAILY_FEE * days
                    : 0;

                const totalPrice =
                    dailyPrice * days + driverTotal;

                const bookingDoc = {
                    carId: _carId,

                    carName: car.name,
                    carImage: car.imageURL,

                    ownerId: car.ownerId,

                    userId: req.user.id,
                    userEmail: req.user.email,
                    userName: req.user.name || "",

                    startDate: start,
                    endDate: end,

                    bookingDate: new Date(),

                    days,

                    driverNeeded: Boolean(driverNeeded),

                    specialNote: (specialNote || "")
                        .toString()
                        .trim()
                        .slice(0, 500),

                    dailyPrice,
                    totalPrice,

                    status: "confirmed",
                };

                const result = await bookingsCollection.insertOne(
                    bookingDoc
                );

                // Increment booking count
                await carsCollection.updateOne(
                    {
                        _id: _carId,
                    },
                    {
                        $inc: {
                            bookingCount: 1,
                        },
                    }
                );

                res.status(201).json({
                    success: true,
                    message: "Booking created successfully",

                    booking: {
                        ...bookingDoc,
                        _id: result.insertedId,
                    },
                });

            } catch (error) {

                console.error("POST /bookings error:", error);

                res.status(500).json({
                    success: false,
                    message: "Could not create booking",
                });
            }
        });

        // CANCEL BOOKING

        app.delete("/bookings/:id", verifyAuth, async (req, res) => {
            try {

                const id = req.params.id;

                const booking = await bookingsCollection.findOne({
                    _id: new ObjectId(id),
                });

                if (!booking) {
                    return res.status(404).json({
                        success: false,
                        message: "Booking not found",
                    });
                }

                if (booking.userId !== req.user.id) {
                    return res.status(403).json({
                        success: false,
                        message: "Unauthorized booking cancel",
                    });
                }

                await bookingsCollection.updateOne(
                    {
                        _id: booking._id,
                    },
                    {
                        $set: {
                            status: "cancelled",
                            cancelledAt: new Date(),
                        },
                    }
                );

                // Decrement booking count
                await carsCollection.updateOne(
                    {
                        _id: booking.carId,
                    },
                    {
                        $inc: {
                            bookingCount: -1,
                        },
                    }
                );

                res.status(200).json({
                    success: true,
                    message: "Booking cancelled successfully",
                });

            } catch (error) {

                console.error("DELETE /bookings/:id error:", error);

                res.status(500).json({
                    success: false,
                    message: "Could not cancel booking",
                });
            }
        });

        // TEST DATABASE CONNECTION

        await client.db("admin").command({
            ping: 1,
        });

    } finally {

        // await client.close();

    }
}

run().catch(console.dir);

// ROOT ROUTE

app.get("/", (req, res) => {
    res.send("DriveFleet Server Running...");
});

// START SERVER

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});