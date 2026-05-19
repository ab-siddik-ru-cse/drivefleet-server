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