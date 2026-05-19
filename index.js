const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { MongoClient, ServerApiVersion } = require('mongodb');

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
                const cars = await cursor.toArray();

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