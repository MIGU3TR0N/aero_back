const express = require('express')
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const mongodb = require('mongodb');
const { ObjectId } = require('mongodb');
const axios = require('axios');
const db_postgres = require('../db/postgres');
const db_mongo = require('../db/mongo')
const nodemailer = require('nodemailer')
const urlFlag='https://restcountries.com/v3.1/alpha/'
const SECRET = process.env.SECRET

const router = express.Router();

// send emails
router.post('/send-email', async (req, res) => {
  const { to, subject, text } = req.body;

  // Configurar transporte (puede ser Gmail, SMTP, etc.)
  const transporter = nodemailer.createTransport({
    host: process.env.SERVICE,
    port: process.env.MAIL_PORT,
    secure: false, // debe ser false para usar STARTTLS
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS
    }
  });

  const mailOptions = {
    from: process.env.MAIL_PORT,
    to,
    subject,
    text
  };

  try {
    await transporter.sendMail(mailOptions);
    res.status(200).send({ message: 'Correo enviado correctamente' });
  } catch (error) {
    console.error('Error al enviar correo:', error);
    res.status(500).send({ error: 'Error al enviar correo' });
  }
})

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
  try {
    const flight = req.body.flight;
    const section = req.body.section;

    if (!ObjectId.isValid(flight)) {
      return res.status(400).json({ error: 'ID de vuelo no válido' });
    }

    const flightId = new ObjectId(flight);

    // 1. Obtener vuelo
    const flightDoc = await db_mongo.collection('flights').findOne({ _id: flightId });
    if (!flightDoc) {
      return res.status(404).json({ error: 'Vuelo no encontrado' });
    }

    if (!(section in flightDoc)) {
      return res.status(400).json({ error: `La sección "${section}" no existe en el vuelo` });
    }

    // 2. Contar cuántos tickets ya existen en esta sección de este vuelo
    const currentCount = await db_mongo.collection('tickets').countDocuments({
      flight: flightId,
      section: section
    });

    // 3. Verificar que aún hay asientos disponibles
    if (currentCount >= flightDoc[section]) {
      return res.status(400).json({ error: `No hay más asientos disponibles en la sección "${section}"` });
    }

    const newPlace = currentCount + 1;

    // 4. Decrementar el asiento disponible en la sección
    const updateResult = await db_mongo.collection('flights').updateOne(
      { _id: flightId, [section]: { $gt: 0 } },
      { $inc: { [section]: -1 } }
    );

    if (updateResult.modifiedCount === 0) {
      return res.status(409).json({ error: 'Error al actualizar asientos, intenta de nuevo' });
    }

    // 5. Crear ticket con place autogenerado
    const { user, flight: _, place, ...rest } = req.body;
    const newTicket = {
      ...rest,
      flight: flightId,
      section,
      place: newPlace
    };

    const result = await db_mongo.collection('tickets').insertOne(newTicket);

    res.status(200).json({ message: 'Reserva exitosa', ticketId: result.insertedId, place: newPlace });

  } catch (error) {
    console.error('Error en /reservation:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
})

router.post('/suitcases', async (req, res)=>{
    try{
        const userId = req.user.userId
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'ID de usuario no válido' });
        }
        const newSuitcase = {
            ...req.body,
            owner: new ObjectId(userId)
        }
        const result = await db_mongo.collection('suitcases').insertOne(newSuitcase)
        res.status(200).json(result)
    }catch (error) {
        console.log(error)
        res.status(500).json({"error": error});  
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

  // Si no se encuentra
  if (!user || user.passwordHash !== password) {
    return res.status(401).json({ error: 'Usuario o contraseña inválidos' });
  }

  // Si se encontró, emitir token
  const token = jwt.sign({ userId: user._id, role: "user" }, SECRET, { expiresIn: '2h' });

  res.cookie('token', token, {
    httpOnly: true,
    secure: false,
    sameSite: 'strict',
    maxAge: 2 * 60 * 60 * 1000,
  });

  res.status(200).json({ message: 'Login exitoso' });
})

router.post('/login_admin', async (req, res) => {
  try {
    const { email, password } = req.body;
    const users  = await db_mongo.collection('w_users').aggregate([
      { $match: { email } }, 
      {
        $lookup: {
          from: 'workers',          
          localField: 'workerId',   
          foreignField: '_id',      
          as: 'workerInfo'          
        }
      },
      {
        $unwind: {
          path: '$workerInfo',
          preserveNullAndEmptyArrays: true 
        }
      },
      
      { $limit: 1 }
    ]).toArray();
    const user = users[0];
    if (!user) {
      return res.status(401).json({ error: 'El correo o la contraseña no son correctos. Intenta nuevamente.' });
    }
    const hashedPassword = crypto.createHash('md5').update(password).digest('hex');
    if (user.passwordHash !== hashedPassword) {
      return res.status(401).json({
        error: 'El correo o la contraseña no son correctos. Intenta nuevamente.',user
      });
    }

    // Crear sesión
    req.session.usuario = {
      _id: user._id,
      workerId: user.workerId,
      role: user.role,
      email: user.email, // este es el correo de inicio de sesión
      firstName: user.workerInfo?.firstName,
      lastName: user.workerInfo?.lastName,
      birthDate: user.workerInfo?.birthDate,
      gender: user.workerInfo?.gender,
      rfc: user.workerInfo?.rfc,
      personalEmail: user.workerInfo?.contact?.email,
      phone: user.workerInfo?.contact?.phone
    };
    res.json({ message: 'Login exitoso', usuario: req.session.usuario  });
  } catch (error) {
    console.log(error)
    res.status(500).json({"error": error})
  }
});


router.get('/api/countries', async (req, res) => {
  try {
    const result = await db_mongo
      .collection('countries')
      .find({}, { projection: { name: 1, iso2: 1, _id: 0 } }) // solo name e iso2, sin _id
      .sort({ name: 1 }) // ordenar por nombre ascendente
      .toArray();
    res.status(200).json(result)
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener países' });
  }
});


router.get('/api/get/states/:iso2', async (req, res) => {
  try {
    const iso2 = req.params.iso2.toUpperCase();

    const country = await db_mongo
      .collection('countries')
      .findOne(
        { iso2: iso2 },
        { projection: { states: 1, _id: 0 } } // solo states
      );

    if (!country) {
      return res.status(404).json({ error: 'País no encontrado' });
    }

    const states = Array.isArray(country.states) ? country.states : [];

    res.status(200).json(states);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener estados' });
  }
});

// PAYPAL LOGIC

// Obtener token de acceso
async function getAccessToken() {
  const response = await axios({
    url: `${process.env.PAYPAL_API}/v1/oauth2/token`,
    method: "post",
    auth: {
      username: process.env.CLIENT_ID,
      password: process.env.PAYPAL_KEY
    },
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    data: "grant_type=client_credentials"
  });

  return response.data.access_token;
}

// Crear orden
router.post("/create-order", async (req, res) => {
  const { amount, currency, description, user, flight } = req.body;

  try {
    const accessToken = await getAccessToken();

    const response = await axios({
      url: `${process.env.PAYPAL_API}/v2/checkout/orders`,
      method: "post",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      data: {
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: currency || "USD",
              value: amount
            },
            description
          }
        ]
      }
    });
    const paypalOrderId = response.data.id;

    // Guardar en MongoDB
    await db_mongo.collection("payments").insertOne({
      user: new ObjectId(user),
      flight: new ObjectId(flight),
      paypal_order_id: paypalOrderId,
      amount: parseFloat(amount),
      currency: currency || "USD",
      description,
      created_at: new Date()
    });

    res.json({ id: paypalOrderId }); // Este ID se usa en el frontend para completar el pago
  } catch (error) {
    console.error("Error creando orden:", error.response?.data || error.message);
    res.status(500).send("Error al crear la orden de PayPal");
  }
})

module.exports = router;
