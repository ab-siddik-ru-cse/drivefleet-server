const express = require('express');
const cors = require('cors');
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require('dotenv').config();

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        await client.connect();
        const database = client.db('drivefleet');
        const carsCollection = database.collection('cars');

        console.log("Connected to MongoDB!");

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

                // ISSUE FIX:
                // cars variable cursor create howar pore call korte hobe
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

        //Get a single car
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

        //Add a new car
        app.post("/add-car", async (req, res) => {
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
                    ownerId,
                    ownerEmail,
                    ownerName,
                } = body;

                // Validation
                const missing = [];

                if (!name?.trim()) missing.push("name");

                if (dailyPrice === undefined || dailyPrice === "")
                    missing.push("dailyPrice");

                if (!type?.trim()) missing.push("type");

                if (!imageURL?.trim()) missing.push("imageURL");

                if (seatCapacity === undefined || seatCapacity === "")
                    missing.push("seatCapacity");

                if (!pickupLocation?.trim()) missing.push("pickupLocation");

                if (!description?.trim()) missing.push("description");

                if (missing.length > 0) {
                    return res.status(400).json({
                        success: false,
                        message: `Missing required fields: ${missing.join(", ")}`,
                    });
                }

                // Number validation
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

                    // owner info
                    ownerId: ownerId || "",
                    ownerEmail: ownerEmail || "",
                    ownerName: ownerName || "",

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

        // Update a car
        app.put("/cars/:id", async (req, res) => {
            try {
                const id = req.params.id;
                const updatedData = req.body;

                const result = await carsCollection.updateOne(
                    {
                        _id: new ObjectId(id),
                    },
                    {
                        $set: updatedData,
                    }
                );

                res.status(200).json({
                    success: true,
                    message: "Car updated successfully",
                    result,
                });

            } catch (error) {
                console.error("UPDATE CAR error:", error);

                res.status(500).json({
                    success: false,
                    message: "Failed to update car",
                });
            }
        });

        // Delete a car
        app.delete("/cars/:id", async (req, res) => {
            try {
                const id = req.params.id;

                const result = await carsCollection.deleteOne({
                    _id: new ObjectId(id),
                });

                res.status(200).json({
                    success: true,
                    message: "Car deleted successfully",
                    result,
                });

            } catch (error) {
                console.error("DELETE CAR error:", error);

                res.status(500).json({
                    success: false,
                    message: "Failed to delete car",
                });
            }
        });

        // Bookings collection
        const bookingsCollection = database.collection("bookings");

        // Get bookings for a user
        app.get("/bookings", async (req, res) => {
            try {

                // userId query diye user er bookings fetch
                const userId = req.query.userId;

                if (!userId) {
                    return res.status(400).json({
                        success: false,
                        message: "User ID is required",
                    });
                }

                const bookings = await bookingsCollection
                    .find({ userId })
                    .sort({ bookingDate: -1 })
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

        // Create a new booking
        app.post("/bookings", async (req, res) => {
            try {

                const body = req.body;

                const {
                    carId,
                    startDate,
                    endDate,
                    driverNeeded,
                    specialNote,
                    userId,
                    userEmail,
                    userName,
                } = body;

                // Validation
                if (!carId) {
                    return res.status(400).json({
                        success: false,
                        message: "Car ID is required",
                    });
                }

                if (!startDate || !endDate) {
                    return res.status(400).json({
                        success: false,
                        message: "Both start and end dates are required",
                    });
                }

                // Convert ObjectId
                let _carId;

                try {
                    _carId = new ObjectId(carId);
                } catch {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid car ID",
                    });
                }

                // Date validation
                const start = new Date(startDate);
                const end = new Date(endDate);

                const today = new Date();
                today.setHours(0, 0, 0, 0);

                if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid dates",
                    });
                }

                if (start < today) {
                    return res.status(400).json({
                        success: false,
                        message: "Start date cannot be in the past",
                    });
                }

                if (end < start) {
                    return res.status(400).json({
                        success: false,
                        message: "End date must be after start date",
                    });
                }

                // Days calculation
                const days = Math.max(
                    1,
                    Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1
                );

                // Find car
                const car = await carsCollection.findOne({
                    _id: _carId,
                });

                if (!car) {
                    return res.status(404).json({
                        success: false,
                        message: "Car not found",
                    });
                }

                // Availability check
                if (!car.available) {
                    return res.status(400).json({
                        success: false,
                        message: "This car is currently unavailable",
                    });
                }

                // Own car booking check
                if (car.ownerId === userId) {
                    return res.status(400).json({
                        success: false,
                        message: "You cannot book your own car",
                    });
                }

                // Price calculation
                const DRIVER_DAILY_FEE = 50;

                const dailyPrice = Number(car.dailyPrice);

                const driverTotal = driverNeeded
                    ? DRIVER_DAILY_FEE * days
                    : 0;

                const totalPrice = dailyPrice * days + driverTotal;

                // Final booking document
                const bookingDoc = {
                    carId: _carId,
                    carName: car.name,
                    carImage: car.imageURL,
                    carType: car.type,
                    pickupLocation: car.pickupLocation,

                    ownerId: car.ownerId,
                    ownerEmail: car.ownerEmail,

                    userId,
                    userEmail,
                    userName: userName || "",

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

                // Insert booking
                const result = await bookingsCollection.insertOne(bookingDoc);

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

                    insertedId: result.insertedId,

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

        //cancel a booking
        app.delete("/bookings/:id", async (req, res) => {
            try {

                const id = req.params.id;
                const userId = req.query.userId;

                let _id;

                try {
                    _id = new ObjectId(id);
                } catch {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid booking ID",
                    });
                }

                // Find booking
                const booking = await bookingsCollection.findOne({
                    _id,
                });

                if (!booking) {
                    return res.status(404).json({
                        success: false,
                        message: "Booking not found",
                    });
                }

                // User validation
                if (booking.userId !== userId) {
                    return res.status(403).json({
                        success: false,
                        message: "You can only cancel your own booking",
                    });
                }

                // Already cancelled
                if (booking.status === "cancelled") {
                    return res.status(400).json({
                        success: false,
                        message: "Booking already cancelled",
                    });
                }

                // Update booking status
                await bookingsCollection.updateOne(
                    {
                        _id,
                    },
                    {
                        $set: {
                            status: "cancelled",
                            cancelledAt: new Date(),
                        },
                    }
                );

                // Decrement booking count
                if (booking.carId) {
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
                }

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

        //login a user
        app.post("/login", async (req, res) => {
            try {

                const { email, password } = req.body;

                // Validation
                if (!email || !password) {
                    return res.status(400).json({
                        success: false,
                        message: "Email and password are required",
                    });
                }

                // Find user
                const user = await usersCollection.findOne({
                    email: email.toLowerCase(),
                });

                // User check
                if (!user || !user.passwordHash) {
                    return res.status(401).json({
                        success: false,
                        message: "Invalid email or password",
                    });
                }

                // Password compare
                const isPasswordValid = await bcrypt.compare(
                    password,
                    user.passwordHash
                );

                if (!isPasswordValid) {
                    return res.status(401).json({
                        success: false,
                        message: "Invalid email or password",
                    });
                }

                // JWT token create
                const token = jwt.sign(
                    {
                        uid: user._id.toString(),
                        email: user.email,
                        name: user.name,
                    },
                    process.env.JWT_SECRET,
                    {
                        expiresIn: "7d",
                    }
                );

                // Cookie set
                res.cookie("token", token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === "production",
                    sameSite: "strict",
                    maxAge: 7 * 24 * 60 * 60 * 1000,
                });

                // Response
                res.status(200).json({
                    success: true,
                    message: "Login successful",

                    token,

                    user: {
                        uid: user._id.toString(),
                        email: user.email,
                        name: user.name,
                    },
                });

            } catch (error) {
                console.error("POST /auth/login error:", error);

                res.status(500).json({
                    success: false,
                    message: "Could not log in",
                });
            }
        });


        // Test the connection
        await client.db("admin").command({ ping: 1 });

    } finally {
        // await client.close();
    }
}

run().catch(console.dir);

// Root route
app.get("/", (req, res) => {
    res.send("DriveFleet Server Running...");
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});