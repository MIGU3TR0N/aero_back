const express = require('express')
const{ ObjectId } = require('mongodb')
const app = express()
const db_postgres = require('../db/postgres');
const db_mongo = require('../db/mongo')
app.use(express.json())
const urlFlag='https://restcountries.com/v3.1/alpha/'

const router = express.Router();

router.post('/flights/filter', async (req, res) => {
  const { origin, destination, min_price, max_price } = req.body;

  const query = {};

  if (origin) {
    query.origin = { $regex: `^${origin}`, $options: 'i' };
  }

  if (destination) {
    query.destination = { $regex: `^${destination}`, $options: 'i' };
  }

  if (min_price !== undefined || max_price !== undefined) {
    query.price = {};
    if (min_price !== undefined) query.price.$gte = parseFloat(min_price);
    if (max_price !== undefined) query.price.$lte = parseFloat(max_price);
  }

  try {
    const data = await db_mongo.collection('flights').find(query).toArray();
    res.status(200).json({ data });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Fatal error' });
  }
})

// route to get all flights that have the same origin
router.get('/flights/o/:origin_country?', async (req, res) => {
    const searchValue = req.params.origin_country || false
    let data = (searchValue) ? await db_mongo.collection('flights').find({
        origin: { $regex: `^${searchValue}`, $options: 'i' }
    }).toArray() : await db_mongo.collection('flights').find().toArray()

    res.status(200).json({"data":data})
})

// route to get the country flag
router.get('/country/flag/:code', async (req, res) => {
  const code = req.params.code.toUpperCase();

  try {
    const response = await axios.get(`${urlFlag}${code}`);
    const flagSvg = response.data?.[0]?.flags?.svg;

    if (!flagSvg) {
      return res.status(404).json({ error: 'Bandera no encontrada' });
    }

    res.status(200).json({ svg: flagSvg });
  } catch (error) {
    console.error('Error al obtener la bandera:', error.message);
    res.status(500).json({ error: 'Error al consultar el país' });
  }
});

module.exports = router;