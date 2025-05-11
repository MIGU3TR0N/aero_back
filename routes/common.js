const express = require('express')
const{ ObjectId } = require('mongodb')
const app = express()
const db_postgres = require('../db/postgres');
const db_mongo = require('../db/mongo')
app.use(express.json())

const router = express.Router();

router.get('/flights/:origin_country?', async (req, res) => {
    const searchValue = req.params.origin_country || false
    let data = (searchValue) ? await db_mongo.collection('vuelos').find({
        origin: { $regex: `^${searchValue}`, $options: 'i' }
    }).toArray() : await db_mongo.collection('vuelos').find().toArray()

    res.status(200).json({"data":data})
})

