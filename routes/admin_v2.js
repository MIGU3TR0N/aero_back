const express = require('express')
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const mongodb = require('mongodb');
const { ObjectId } = require('mongodb');
const axios = require('axios');
const db_postgres = require('../db/postgres');
const db_mongo = require('../db/mongo')
const urlFlag='https://restcountries.com/v3.1/alpha/'
const SECRET = process.env.SECRET

const router = express.Router();


router.post('/logout', (req, res) => {
    req.session.destroy(err => {
      if (err) {
        return res.status(500).json({ message: 'Error al cerrar sesión' });
      }
      res.clearCookie('connect.sid'); // nombre por defecto de la cookie de sesión
      return res.status(200).json({ message: 'Sesión cerrada correctamente' });
    });
  });
  
  router.get('/get_session', (req, res) => {
    if (req.session && req.session.usuario) {
      res.json({ usuario: req.session.usuario });
    } else {
      res.status(401).json({ error: 'No autorizado' });
    }
  });

  router.get('/api/planes', async (req, res) => {
    try {
      const result = await db_mongo
        .collection('plane')
        .find({}, { projection: { modelo: 1, numero_serie: 1, _id: 1 } }) // solo modelo y número de serie, sin _id
        .sort({ modelo: 1 }) // ordenar alfabéticamente por modelo
        .toArray();
      res.status(200).json(result);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error al obtener los aviones' });
    }
  });

  router.get('/get_planes', async (req, res) => {
    try {
      const result = await db_mongo
        .collection('plane')
        .find() // solo modelo y número de serie, sin _id
        .sort({ modelo: 1 }) // ordenar alfabéticamente por modelo
        .toArray();
      res.status(200).json(result);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error al obtener los aviones' });
    }
  });
  
  

  router.get('/flight/workers', async (req, res) => {
    try {
      const result = await db_mongo
        .collection('workers')
        .find(
          { 'jobInfo.position': { $in: ['pilot', 'flight attendant'] } },
          { projection: { firstName: 1, lastName: 1, 'jobInfo.position': 1 } }
        )
        .sort({ firstName: 1, lastName: 1 })
        .toArray();
  
      const formatted = result.map(w => ({
        _id: w._id,
        nombre: `${w.firstName} ${w.lastName}`,
        tipo: w.jobInfo.position
      }));
  
      res.status(200).json(formatted);
    } catch (error) {
      res.status(500).json({ error: 'Error al obtener trabajadores' });
    }
  });
  
  router.post('/flight/price_time', async (req, res) => {
    try {
      const { originIso2, destinationIso2 } = req.body;
  
      if (!originIso2 || !destinationIso2) {
        return res.status(400).json({ error: 'Faltan parámetros originIso2 y destinationIso2' });
      }
  
      // Caso especial: origen y destino son iguales
      if (originIso2 === destinationIso2) {
        return res.status(200).json({
          distancia_km: 1000,
          tiempo_horas: 1
        });
      }
  
      const origen = await obtenerCoordenadasPorIso2(originIso2);
      const destino = await obtenerCoordenadasPorIso2(destinationIso2);
  
      if (!origen || !destino) {
        return res.status(404).json({ error: 'No se encontraron coordenadas para uno o ambos países' });
      }
  
      const distancia = calcularDistanciaKm(origen.lat, origen.lng, destino.lat, destino.lng);
      const velocidadMedia = 900; // km/h
      const tiempoHoras = distancia / velocidadMedia;
  
      res.status(200).json({
        distancia_km: Math.round(distancia),
        tiempo_horas: parseFloat(tiempoHoras.toFixed(2))
      });
    } catch (error) {
      console.error('Error en /flight/price_time:', error);
      res.status(500).json({ error: 'Error al calcular distancia y tiempo' });
    }
  });

  router.post('/flight', async (req, res) => {
    const flight = req.body;
    try {
      // Guardar en base de datos
      const savedFlight = await db_mongo.collection('flights').insertOne(flight);
      res.status(201).json({ success: true, flight: savedFlight });
    } catch (error) {
      console.error('Error guardando vuelo:', error);
      res.status(500).json({ success: false, error: 'Error al guardar el vuelo' });
    }
  });
  

  router.get('/flights', async (req, res) => {
    const flights = await db_mongo.collection('flights').aggregate([
      // Vincular el avión
      {
        $addFields: {
          pilot1_id: { $convert: { input: '$pilot1_id', to: 'objectId', onError: null, onNull: null } },
          pilot2_id: { $convert: { input: '$pilot2_id', to: 'objectId', onError: null, onNull: null } },
          attendant1_id: { $convert: { input: '$attendant1_id', to: 'objectId', onError: null, onNull: null } },
          attendant2_id: { $convert: { input: '$attendant2_id', to: 'objectId', onError: null, onNull: null } },
          attendant3_id: { $convert: { input: '$attendant3_id', to: 'objectId', onError: null, onNull: null } },
          plane_id: { $convert: { input: '$plane_id', to: 'objectId', onError: null, onNull: null } }
        }
      },
      {
        $lookup: {
          from: 'plane',
          localField: 'plane_id',
          foreignField: '_id',
          as: 'plane'
        }
      },
      {
        $lookup: {
          from: 'workers',
          localField: 'pilot1_id',
          foreignField: '_id',
          as: 'pilot1'
        }
      },
      {
        $lookup: {
          from: 'workers',
          localField: 'pilot2_id',
          foreignField: '_id',
          as: 'pilot2'
        }
      },
      {
        $lookup: {
          from: 'workers',
          localField: 'attendant1_id',
          foreignField: '_id',
          as: 'attendant1'
        }
      },
      {
        $lookup: {
          from: 'workers',
          localField: 'attendant2_id',
          foreignField: '_id',
          as: 'attendant2'
        }
      },
      {
        $lookup: {
          from: 'workers',
          localField: 'attendant3_id',
          foreignField: '_id',
          as: 'attendant3'
        }
      },
      {
        $project: {
          _id: 1,
          origin_country: 1,
          origin_state: 1,
          destination_country: 1,
          destination_state: 1,
          price_per_km: 1,
          distance: 1,
          total_price: 1,
          departure_datetime: 1,
          arrival_datetime: 1,
          plane: { $arrayElemAt: ['$plane.modelo', 0] },
          pilot1: {
            $cond: [
              { $gt: [{ $size: '$pilot1' }, 0] },
              { $concat: [{ $arrayElemAt: ['$pilot1.firstName', 0] }, ' ', { $arrayElemAt: ['$pilot1.lastName', 0] }] },
              null
            ]
          },
          pilot2: {
            $cond: [
              { $gt: [{ $size: '$pilot2' }, 0] },
              { $concat: [{ $arrayElemAt: ['$pilot2.firstName', 0] }, ' ', { $arrayElemAt: ['$pilot2.lastName', 0] }] },
              null
            ]
          },
          attendant1: {
            $cond: [
              { $gt: [{ $size: '$attendant1' }, 0] },
              { $concat: [{ $arrayElemAt: ['$attendant1.firstName', 0] }, ' ', { $arrayElemAt: ['$attendant1.lastName', 0] }] },
              null
            ]
          },
          attendant2: {
            $cond: [
              { $gt: [{ $size: '$attendant2' }, 0] },
              { $concat: [{ $arrayElemAt: ['$attendant2.firstName', 0] }, ' ', { $arrayElemAt: ['$attendant2.lastName', 0] }] },
              null
            ]
          },
          attendant3: {
            $cond: [
              { $gt: [{ $size: '$attendant3' }, 0] },
              { $concat: [{ $arrayElemAt: ['$attendant3.firstName', 0] }, ' ', { $arrayElemAt: ['$attendant3.lastName', 0] }] },
              null
            ]
          }
        }
      }
    ]).toArray();
  
    res.json(flights);
  });

  router.put('/flight/:id', async (req, res) => {
    const flightId = req.params.id;
    const updatedFlight = req.body;
  
  
    try {
      const result = await db_mongo.collection('flights').updateOne(
        { _id: new ObjectId(flightId) },
        { $set: updatedFlight }
      );
  
      if (result.modifiedCount === 0) {
        return res.status(404).json({ success: false, message: 'Vuelo no encontrado o sin cambios' });
      }
  
      res.status(200).json({ success: true, message: 'Vuelo actualizado' });
    } catch (error) {
      console.error('Error actualizando vuelo:', error);
      res.status(500).json({ success: false, error: 'Error al actualizar el vuelo' });
    }
  });


  router.get('/flights/ongoing', async (req, res) => {
    const now = new Date();
  
    const flights = await db_mongo.collection('flights').aggregate([
      // Filtrar por vuelos que están ocurriendo ahora
      {
        $match: {
          departure_datetime: { $lte: now },
          arrival_datetime: { $gte: now }
        }
      },
      // Convertir IDs a ObjectId
      {
        $addFields: {
          pilot1_id: { $convert: { input: '$pilot1_id', to: 'objectId', onError: null, onNull: null } },
          pilot2_id: { $convert: { input: '$pilot2_id', to: 'objectId', onError: null, onNull: null } },
          attendant1_id: { $convert: { input: '$attendant1_id', to: 'objectId', onError: null, onNull: null } },
          attendant2_id: { $convert: { input: '$attendant2_id', to: 'objectId', onError: null, onNull: null } },
          attendant3_id: { $convert: { input: '$attendant3_id', to: 'objectId', onError: null, onNull: null } },
          plane_id: { $convert: { input: '$plane_id', to: 'objectId', onError: null, onNull: null } }
        }
      },
      {
        $lookup: {
          from: 'planes', // ¡Asegúrate de que sea 'planes', no 'plane'!
          localField: 'plane_id',
          foreignField: '_id',
          as: 'plane'
        }
      },
      {
        $lookup: {
          from: 'workers',
          localField: 'pilot1_id',
          foreignField: '_id',
          as: 'pilot1'
        }
      },
      {
        $lookup: {
          from: 'workers',
          localField: 'pilot2_id',
          foreignField: '_id',
          as: 'pilot2'
        }
      },
      {
        $lookup: {
          from: 'workers',
          localField: 'attendant1_id',
          foreignField: '_id',
          as: 'attendant1'
        }
      },
      {
        $lookup: {
          from: 'workers',
          localField: 'attendant2_id',
          foreignField: '_id',
          as: 'attendant2'
        }
      },
      {
        $lookup: {
          from: 'workers',
          localField: 'attendant3_id',
          foreignField: '_id',
          as: 'attendant3'
        }
      },
      {
        $project: {
          _id: 1,
          origin_country: 1,
          origin_state: 1,
          destination_country: 1,
          destination_state: 1,
          price_per_km: 1,
          distance: 1,
          total_price: 1,
          departure_datetime: 1,
          arrival_datetime: 1,
          plane: { $arrayElemAt: ['$plane.modelo', 0] },
          pilot1: {
            $cond: [
              { $gt: [{ $size: '$pilot1' }, 0] },
              { $concat: [{ $arrayElemAt: ['$pilot1.firstName', 0] }, ' ', { $arrayElemAt: ['$pilot1.lastName', 0] }] },
              null
            ]
          },
          pilot2: {
            $cond: [
              { $gt: [{ $size: '$pilot2' }, 0] },
              { $concat: [{ $arrayElemAt: ['$pilot2.firstName', 0] }, ' ', { $arrayElemAt: ['$pilot2.lastName', 0] }] },
              null
            ]
          },
          attendant1: {
            $cond: [
              { $gt: [{ $size: '$attendant1' }, 0] },
              { $concat: [{ $arrayElemAt: ['$attendant1.firstName', 0] }, ' ', { $arrayElemAt: ['$attendant1.lastName', 0] }] },
              null
            ]
          },
          attendant2: {
            $cond: [
              { $gt: [{ $size: '$attendant2' }, 0] },
              { $concat: [{ $arrayElemAt: ['$attendant2.firstName', 0] }, ' ', { $arrayElemAt: ['$attendant2.lastName', 0] }] },
              null
            ]
          },
          attendant3: {
            $cond: [
              { $gt: [{ $size: '$attendant3' }, 0] },
              { $concat: [{ $arrayElemAt: ['$attendant3.firstName', 0] }, ' ', { $arrayElemAt: ['$attendant3.lastName', 0] }] },
              null
            ]
          }
        }
      }
    ]).toArray();
    
    if (!flights || flights.length === 0) {
        return res.json({ message: "No hay vuelos" });
    }
    res.json(flights);
    


  });


  router.get('/flights/:id', async (req, res) => {
    const flightId = req.params.id;
  
    let objectId;
    try {
      objectId = new ObjectId(flightId);
    } catch (err) {
      return res.status(400).json({ message: 'ID no válido' });
    }
  
    const flight = await db_mongo.collection('flights').aggregate([
        { $match: { _id: objectId } }
      ]).toArray();
      
      if (!flight || flight.length === 0) {
        return res.status(404).json({ message: 'Vuelo no encontrado' });
      }
      
      res.json(flight[0]);
  });
  async function obtenerCoordenadasPorIso2(iso2) {
    try {
      const response = await fetch(`https://restcountries.com/v3.1/alpha/${iso2}`);
      const data = await response.json();
      const [lat, lng] = data[0].latlng;
      return { lat, lng };
    } catch (error) {
      console.error(`Error al obtener coordenadas de ${iso2}:`, error);
      return null;
    }
  }
  
  // Función para calcular distancia con la fórmula Haversine
  function calcularDistanciaKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radio de la Tierra en km
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
  
module.exports = router;