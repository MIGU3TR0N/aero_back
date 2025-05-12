const express = require('express')
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;
const axios = require('axios');
const db_postgres = require('../db/postgres');
const db_mongo = require('../db/mongo')
const urlFlag='https://restcountries.com/v3.1/alpha/'

const router = express.Router();

//envia la coleccion de vuelo
router.get('/flights', async (req, res) => {
  try {
    const db = mongoose.connection.useDb('airport');
    const flightsCollection = db.collection('flights');
    const flights = await flightsCollection.find({}).toArray();
    res.status(200).json({ data: flights });
  } catch (err) {
    console.error('Error en la consulta:', err);
    res.status(500).json({ error: 'Error en la consulta', details: err.message });
  }
});

//envia la coleccion de paises
router.get('/contries', async (req, res) => {
  try {
    const db = mongoose.connection.useDb('airport');
    const countriesCollection = db.collection('countries');
    const countries = await countriesCollection.find({}).toArray();
    res.status(200).json({ data: countries });
  } catch (err) {
    console.error('Error en la consulta:', err);
    res.status(500).json({ error: 'Error en la consulta', details: err.message });
  }
});

//envia la coleccion de estados filtrando por pais
router.get('/states/:origin_country?', async (req, res) => {
  const countryName = req.params.origin_country;
  console.log('Buscando país con nombre:', countryName);

  try {
    const db = mongoose.connection.useDb('airport');
    const Country=db.collection('countries')
    const country = await Country.findOne({ name: { $regex: `^${countryName}$`, $options: 'i' } });
    if (!country) {
      console.log('País no encontrado');
      return res.status(404).json({ error: 'País no encontrado' });
    }
  
    res.status(200).json({ data: country.states || [] });

  } catch (err) {
    console.error('Error en la consulta:', err);
    res.status(500).json({ error: 'Error en la consulta', details: err.message });
  }
});



// precio, origen y destino 
router.post('/flights/filter', async (req, res) => {
  //const { origin, destination, min_price, max_price } = req.body;
  const origin = req.body.origin;
  const destination = req.body.destination;
  const min_price = req.body.min_price;
  const max_price = req.body.max_price;
  const db = mongoose.connection.useDb('airport');
  const countriesCollection = db.collection('countries');
  const flightsCollection = db.collection('flights');

  const query = {};
  /*
  if (origin) {
    query.origin = { $regex: `^${origin}`};
  }

  if (destination) {
    query.destination = { $regex: `^${destination}`};
  }
  
  if (min_price !== undefined || max_price !== undefined) {
    query.price = {};
    if (min_price !== undefined) query.price.$gte = parseFloat(min_price);
    if (max_price !== undefined) query.price.$lte = parseFloat(max_price);
  }*/

  try {
    const db = mongoose.connection.useDb('airport');
    const flightsCollection = db.collection('flights');
    const data = await flightsCollection.find(query).toArray();
    res.status(200).json({ data });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Fatal error' });
  }
})


router.post('/flight/find', async (req, res) => {
  
  const { name } = req.body;

  const { origin, destination, min_price, max_price } = req.body;

  console.log('Buscando país:', name);

  try {
    const db = mongoose.connection.useDb('airport');
    const Country = db.collection('countries');

    const country = await Country.findOne({
      name: { $regex: `^${name}$`, $options: 'i' }
    });

    if (!country) {
      return res.status(404).json({ error: 'País no encontrado' });
    }

    res.status(200).json({ data: country });
  } catch (err) {
    console.error('Error al buscar el país:', err);
    res.status(500).json({ error: 'Error interno', details: err.message });
  }
});





// route to get all flights that have the same origin
router.get('/flights/o/:origin_country?', async (req, res) => {
  const countryName = req.params.origin_country;
  console.log('Buscando país con nombre:', countryName);

  try {
    const db = mongoose.connection.useDb('airport');
    const Country=db.collection('countries')
    // Buscar el país en la base de datos
    const country = await Country.findOne({ name: { $regex: `^${countryName}$`, $options: 'i' } });

    if (!country) {
      console.log('País no encontrado');
      return res.status(404).json({ error: 'País no encontrado' });
    }

    // Obtener el ObjectId del país
    const countryId = country._id;

    // Buscar los vuelos en la colección `flights` usando el ObjectId
    
    const flightsCollection = db.collection('flights');

    const data = await flightsCollection.find({
      origin: new mongoose.Types.ObjectId(countryId),
    }).toArray();

    res.status(200).json({ data });

  } catch (err) {
    console.error('Error en la consulta:', err);
    res.status(500).json({ error: 'Error en la consulta', details: err.message });
  }
});

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