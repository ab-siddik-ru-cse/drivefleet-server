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

        app.get('/cars', async (req, res) => {
            const cursor = await carsCollection.find().toArray();
            res.json(cursor);
        });

        app.post('/admin', async (req, res) => {
            const carsData = req.body;

            console.log(carsData);

            const result = await carsCollection.insertOne(carsData);

            res.status(200).json({
                success: true,
                message: 'Car added successfully',
                result,
            });
        });

        await client.db("admin").command({ ping: 1 });

        console.log("Connected to MongoDB!");
    } finally {
        // await client.close();
    }
}

run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hello World!');
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});