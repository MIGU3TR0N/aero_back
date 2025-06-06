const express = require('express')
const mongodb = require('mongodb');
const { ObjectId } = require('mongodb');
const axios = require('axios');
const db_postgres = require('../db/postgres');
const db_mongo = require('../db/mongo')
require("dotenv").config();

const router = express.Router();

// get payments
router.get("/payments/:id", async (req, res) => {
  const userId = req.params.id;

  try {
    const payments = await db.collection("payments")
      .find({ user: new ObjectId(userId) })
      .sort({ created_at: -1 }) // ordena por fecha descendente
      .toArray();

    res.json({ success: true, count: payments.length, payments });
  } catch (error) {
    console.error("Error al recuperar pagos:", error);
    res.status(500).json({ success: false, message: "Error al recuperar los pagos del usuario." });
  }
})

// reservation of flight by the login user
router.post('/reservation', async (req, res) => {
  try {
    const userId = req.body.user;
    const flight = req.body.flight;
    const section = req.body.section;

    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'ID de usuario no válido' });
    }

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
      user: new ObjectId(userId),
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

router.delete('/reservation/:id', async (req, res) => {
    try {
        const ticketId = req.params.id;

        if (!ObjectId.isValid(ticketId)) {
            return res.status(400).json({ error: 'ID de reserva no válido' });
        }

        const result = await db_mongo.collection('tickets').deleteOne({ _id: new ObjectId(ticketId) });

        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Reserva no encontrada' });
        }

        res.status(200).json({ message: 'Reserva eliminada correctamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al eliminar la reserva' });
    }
})

router.post('/reservation/update', async (req, res) => {
    try {
        const { id, ...updateFields } = req.body;

        if (!id || !ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'ID de reserva no válido o faltante' });
        }

        const result = await db_mongo.collection('tickets').updateOne(
            { _id: new ObjectId(id) },
            { $set: updateFields }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'Reserva no encontrada' });
        }

        res.status(200).json({ message: 'Reserva actualizada correctamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al actualizar la reserva' });
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

router.delete('/suitcases/:id', async (req, res) => {
    try {
        const suitcaseId = req.params.id;

        if (!ObjectId.isValid(suitcaseId)) {
            return res.status(400).json({ error: 'ID de maleta no válido' });
        }

        const result = await db_mongo.collection('suitcases').deleteOne({ _id: new ObjectId(suitcaseId) });

        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Maleta no encontrada' });
        }

        res.status(200).json({ message: 'Maleta eliminada correctamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al eliminar la maleta' });
    }
})

router.post('/suitcases/update', async (req, res) => {
    try {
        const { id, ...updateFields } = req.body;

        if (!id || !ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'ID de maleta no válido o faltante' });
        }

        const result = await db_mongo.collection('suitcases').updateOne(
            { _id: new ObjectId(id) },
            { $set: updateFields }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'Maleta no encontrada' });
        }

        res.status(200).json({ message: 'Maleta actualizada correctamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al actualizar la maleta' });
    }
})

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

router.post("/refund-payment", async (req, res) => {
  const { captureId, amount, currency } = req.body;

  try {
    const accessToken = await getAccessToken();

    const response = await axios({
      url: `${process.env.PAYPAL_API}/v2/payments/captures/${captureId}/refund`,
      method: "post",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      data: {
        amount: {
          value: amount,
          currency_code: currency || "USD"
        }
      }
    });

    // Puedes registrar este reembolso en MongoDB si quieres
    res.json({
      refund_id: response.data.id,
      status: response.data.status
    });

  } catch (error) {
    console.error("Error al hacer reembolso:", error.response?.data || error.message);
    res.status(500).send("Error al procesar el reembolso");
  }
})

module.exports = router;