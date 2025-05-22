const express = require('express')
const jwt = require('jsonwebtoken');
const mongodb = require('mongodb');
const { ObjectId } = require('mongodb');
const axios = require('axios');
const db_postgres = require('../db/postgres');
const db_mongo = require('../db/mongo')
const urlFlag='https://restcountries.com/v3.1/alpha/'
const SECRET = process.env.SECRET

const router = express.Router();

//envia la coleccion de vuelo
router.get('/flights', async (req, res) => {
  const searchValue = req.params.dept || false
  let result = await db_mongo.collection('flights').find().toArray();

  res.status(200).json({"data":result});
})

//envia la coleccion de paises
router.get('/countries', async (req, res) => {
  try {
    const countriesCollection = db_mongo.collection('countries');
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
    const Country=db_mongo.collection('countries')
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
  const max_price = req.body.max_price
  const countriesCollection = db_mongo.collection('countries');
  const flightsCollection = db_mongo.collection('flights');

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
    const flightsCollection = db_mongo.collection('flights');
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
    const Country = db_mongo.collection('countries');

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
    const Country=db_mongo.collection('countries')
    // Buscar el país en la base de datos
    const country = await Country.findOne({ name: { $regex: `^${countryName}$`, $options: 'i' } });

    if (!country) {
      console.log('País no encontrado');
      return res.status(404).json({ error: 'País no encontrado' });
    }

    // Obtener el ObjectId del país
    const countryId = country._id;

    // Buscar los vuelos en la colección `flights` usando el ObjectId
    
    const flightsCollection = db_mongo.collection('flights');

    const data = await flightsCollection.find({
      origin: new mongodb.Types.ObjectId(countryId),
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

// reservation of flight without login
router.post('/flights/reservation', async (req, res)=>{
  try{
      const flight = req.body.flight
      if (!ObjectId.isValid(flight)) {
        return res.status(400).json({ error: 'ID de usuario no válido' });
      }
      const newTicket = {
        ...req.body,
        flight: new ObjectId(flight)
      }
      const result = await db_mongo.collection('tickets').insertOne(newTicket)
      res.status(200).json(result)
  }catch (error) {
    console.log(error)
    res.status(500).json({"error": error})
  }
})

router.post('/register', async (req, res)=>{
  try{
      const newUser = {
        ...req.body,
        role: 'user'
      }
      const result = await db_mongo.collection('users').insertOne(newTicket)
      res.status(200).json(result)
  }catch (error) {
    console.log(error)
    res.status(500).json({"error": error})
  }
})

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  // Primero buscar en MongoDB
  let user = await db_mongo.collection('users').findOne({ email });

  // Si no está en Mongo, buscar en PostgreSQL
  if (!user) {
    try {
      const result = await pool.query(
        'SELECT id, email, password, role FROM users WHERE email = $1',
        [email]
      );
      if (result.rows.length > 0) {
        const pgUser = result.rows[0];

        // Verificamos la contraseña (plana, sin hash aquí — considera usar bcrypt en prod)
        if (pgUser.password === password) {
          user = {
            _id: pgUser.id,
            role: pgUser.role,
          };
        }
      }
    } catch (err) {
      console.error('Error consultando PostgreSQL:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  }

  // Si no se encuentra en ninguna de las dos
  if (!user) {
    return res.status(401).json({ error: 'Usuario o contraseña inválidos' });
  }

  // Si se encontró, emitir token
  const token = jwt.sign({ userId: user._id, role: user.role }, SECRET, { expiresIn: '2h' });

  res.cookie('token', token, {
    httpOnly: true,
    secure: false,
    sameSite: 'strict',
    maxAge: 2 * 60 * 60 * 1000,
  });

  res.status(200).json({ message: 'Login exitoso' });
})

module.exports = router;