const express = require('express')
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { startOfMonth, subMonths } = require('date-fns');  
require("dotenv").config();

const mongodb = require('mongodb');
const { ObjectId } = require('mongodb');
const axios = require('axios');
const db_postgres = require('../db/postgres');
const db_mongo = require('../db/mongo')
const urlFlag='https://restcountries.com/v3.1/alpha/'
const SECRET = process.env.SECRET

const router = express.Router();

//////////////////////////////////////////////////////////////////////////////
//                              Sesiones
//////////////////////////////////////////////////////////////////////////////

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
      
    const planeId = new ObjectId(flight.plane_id);
      const plane = await db_mongo.collection('plane').findOne({ _id: planeId  });
      if (!plane) {
        return res.status(404).json({ success: false, error: 'Avión no encontrado' });
      }

      flight.normal = plane.asientos.normales;
      flight.premium = plane.asientos.premium;

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

      const planeId = new ObjectId(updatedFlight.plane_id);
      const plane = await db_mongo.collection('plane').findOne({ _id: planeId  });
      if (!plane) {
        return res.status(404).json({ success: false, error: 'Avión no encontrado' });
      }



      updatedFlight.normal = plane.asientos.normales;
      updatedFlight.premium = plane.asientos.premium;
      const result = await db_mongo.collection('flights').updateOne(
        { _id: new ObjectId(flightId) },
        { $set: updatedFlight }
      );
  
  
  
      res.status(200).json({ success: true, message: 'Vuelo actualizado' });
    } catch (error) {
      console.error('Error actualizando vuelo:', error);
      res.status(500).json({ success: false, error: 'Error al actualizar el vuelo' });
    }
  });


  router.get('/flights/ongoing', async (req, res) => {
    const now = new Date();
    const nowStr = now.toISOString().slice(0, 16); 
    const flights = await db_mongo.collection('flights').aggregate([
      // Filtrar por vuelos que están ocurriendo ahora
      {
        $match: {
          departure_datetime: { $lte: nowStr },
          arrival_datetime: { $gte: nowStr }
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
          from: 'plane', // ¡Asegúrate de que sea 'planes', no 'plane'!
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



  router.get('/flightss/report', async (req, res) => {
    try {
      const now = new Date();
      const year = now.getFullYear();

      const start = new Date(`${year}-01-01T00:00:00Z`);
      const end = new Date(`${year}-12-31T23:59:59Z`);
  
      const flightsCollection = db_mongo.collection('flights');
      const planesCollection = db_mongo.collection('plane');
      const workersCollection = db_mongo.collection('workers');
  
      // 1. Cantidad de vuelos en el año

      const cantidadVuelosAgg = await flightsCollection.aggregate([
        {
          $addFields: {
            departure_date: { $toDate: "$departure_datetime" }
          }
        },
        {
          $match: {
            departure_date: { $gte: start, $lte: end }
          }
        },
        {
          $count: "cantidad"
        }
      ]).toArray();
      
  
      const cantidadVuelos = cantidadVuelosAgg.length > 0 ? cantidadVuelosAgg[0].cantidad : 0;
      // 2. Avión con más horas de vuelo
      const avionMasHorasAgg = await flightsCollection.aggregate([
        {
          $addFields: {
            duracion_horas: {
              $divide: [
                { $subtract: [
                  { $toDate: "$arrival_datetime" },
                  { $toDate: "$departure_datetime" }
                ]},
                1000 * 60 * 60
              ]
            }
          }
        },
        {
          $group: {
            _id: "$plane_id",
            total_horas: { $sum: "$duracion_horas" }
          }
        },
        { $sort: { total_horas: -1 } },
        { $limit: 1 }
      ]).toArray();
  
      let avionMasHoras = null;
      if (avionMasHorasAgg[0]) {
        const planeId = new ObjectId(avionMasHorasAgg[0]._id);
        const plane = await planesCollection.findOne({ _id: planeId });
        avionMasHoras = {
          plane_id: plane._id,
          modelo: plane.modelo,
          numero_serie: plane.numero_serie,
          total_horas: avionMasHorasAgg[0].total_horas
        };
      }
  
      // 3. Destino más popular
      const destinoPopularAgg = await flightsCollection.aggregate([
        {
          $group: {
            _id: {
              country: "$destination_country",
              state: "$destination_state"
            },
            total: { $sum: 1 }
          }
        },
        { $sort: { total: -1 } },
        { $limit: 1 },
        {
          $lookup: {
            from: "countries",
            localField: "_id.country",
            foreignField: "iso2",
            as: "country_info"
          }
        },
        {
          $unwind: {
            path: "$country_info",
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $project: {
            country: "$country_info.name",
            country_iso2: "$_id.country",
            state: "$_id.state",
            cantidad: "$total"
          }
        }
      ]).toArray();
  
      const destinoMasPopular = destinoPopularAgg[0]
        ? {
            country: destinoPopularAgg[0].country,
            state: destinoPopularAgg[0]._id.state,
            cantidad: destinoPopularAgg[0].cantidad
          }
        : null;
  
      // 4. Piloto con más horas (sumando pilot1 y pilot2)
      const duracionesPorPiloto = {};
  
      const pilotosAgg = await flightsCollection.aggregate([
        {
          $addFields: {
            duracion_horas: {
              $divide: [
                { $subtract: [
                  { $toDate: "$arrival_datetime" },
                  { $toDate: "$departure_datetime" }
                ]},
                1000 * 60 * 60
              ]
            }
          }
        },
        {
          $project: {
            pilot1_id: 1,
            pilot2_id: 1,
            duracion_horas: 1
          }
        }
      ]).toArray();
  
      for (const vuelo of pilotosAgg) {
        const { pilot1_id, pilot2_id, duracion_horas } = vuelo;
  
        if (pilot1_id) {
          duracionesPorPiloto[pilot1_id] = (duracionesPorPiloto[pilot1_id] || 0) + duracion_horas;
        }
        if (pilot2_id) {
          duracionesPorPiloto[pilot2_id] = (duracionesPorPiloto[pilot2_id] || 0) + duracion_horas;
        }
      }
  
      let pilotoMasHoras = null;
      const pilotoIdConMasHoras = Object.entries(duracionesPorPiloto).sort((a, b) => b[1] - a[1])[0];
  
      if (pilotoIdConMasHoras) {
        const piloto = await workersCollection.findOne({ _id: new ObjectId(pilotoIdConMasHoras[0]) });
        pilotoMasHoras = {
          piloto_id: piloto._id,
          firstName: piloto.firstName,
          lastName: piloto.lastName,
          total_horas: pilotoIdConMasHoras[1]
        };
      }
  
      // 🔄 Resultado final
      res.json({
        cantidad_vuelos_2025: cantidadVuelos,
        avion_mas_horas: avionMasHoras,
        destino_mas_popular: destinoMasPopular,
        piloto_mas_horas: pilotoMasHoras
      });
  
    } catch (error) {
      console.error("Error en /reports/vuelos:", error);
      res.status(500).json({ message: "Error al generar el reporte", error });
    }
  });


  ////////////////////////////////////////////////////////////////////

  ///////////////////////////////////////////////////////////////////
  router.post('/plane', async(req, res) => {
    const plane = req.body;
    const { modelo, numero_serie, asientos, peso_maximo_kg, estado } = plane;
    try {
      if (!modelo || !numero_serie || !asientos || !asientos.normales || !asientos.premium || !peso_maximo_kg || !estado) {
        return res.status(400).json({ message: 'Faltan campos obligatorios' });
      }
      const savedFlight = await db_mongo.collection('plane').insertOne(plane);
      res.status(201).json({ success: true, flight: savedFlight });
    } catch (error) {
      console.error('Error guardando avion:', error);
      res.status(500).json({ success: false, error: 'Error al guardar el avion' });
    }
  });
  router.get('/plane/:id', async (req, res) => {
    const { id } = req.params;
  
    // Validar que el ID sea un ObjectId válido
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'ID no válido' });
    }
  
    try {
      const plane = await db_mongo.collection('plane').findOne({ _id: new ObjectId(id) });
  
      if (!plane) {
        return res.status(404).json({ success: false, message: 'Avión no encontrado' });
      }
  
      res.status(200).json( plane );
    } catch (error) {
      console.error('Error obteniendo el avión:', error);
      res.status(500).json({ success: false, error: 'Error al obtener el avión' });
    }
  });

  router.put('/plane/:id', async (req, res) => {
    const planeId = req.params.id;
    const updatedPlane = req.body;
  
  
    try {
      const result = await db_mongo.collection('plane').updateOne(
        { _id: new ObjectId(planeId) },
        { $set: updatedPlane }
      );
  
      res.status(200).json({ success: true, message: 'Avión actualizado' });
    } catch (error) {
      console.error('Error actualizando avión:', error);
      res.status(500).json({ success: false, error: 'Error al actualizar el avión' });
    }
  });

  router.get('/planes/report-planes', async (req, res) => {
    try {
      const planesCollection = db_mongo.collection('plane');
  
      // 1. Cantidad de aviones por estado
      const cantidadPorEstado = await planesCollection.aggregate([
        {
          $group: {
            _id: "$estado",
            cantidad: { $sum: 1 }
          }
        },
        { $sort: { cantidad: -1 } }
      ]).toArray();
  
      // 2. Suma total de asientos normales y premium (para calcular %)
      const sumaAsientos = await planesCollection.aggregate([
        {
          $group: {
            _id: null,
            total_normales: { $sum: "$asientos.normales" },
            total_premium: { $sum: "$asientos.premium" }
          }
        }
      ]).toArray();
  
      const totalNormales = sumaAsientos[0]?.total_normales || 0;
      const totalPremium = sumaAsientos[0]?.total_premium || 0;
      const totalAsientos = totalNormales + totalPremium;
  
      // Calculamos la distribución en %
      const distribucionAsientos = totalAsientos > 0 ? {
        normales: ((totalNormales / totalAsientos) * 100).toFixed(2) + '%',
        premium: ((totalPremium / totalAsientos) * 100).toFixed(2) + '%'
      } : { normales: '0%', premium: '0%' };
  
      res.json({
        cantidad_por_estado: cantidadPorEstado.map(({ _id, cantidad }) => ({ estado: _id, cantidad })),
        distribucion_asientos: distribucionAsientos
      });
  
    } catch (error) {
      console.error("Error en /planes/reporte-estados-asientos:", error);
      res.status(500).json({ message: "Error al generar reporte", error });
    }
  });

  ////////////////////////////////////////////////////////////////////

  /////////////////////////////////////////////////////////

  router.get('/workers', async (req, res) => {
    try {
      const workers = await db_mongo
        .collection('workers')
        .find({ fired: { $exists: false } })
        .toArray();
  
      res.status(200).json(workers);
    } catch (error) {
      console.error('Error al obtener trabajadores:', error);
      res.status(500).json({ success: false, message: 'Error al obtener trabajadores' });
    }
  });

  router.put('/workers/:id/fire', async (req, res) => {
    const { id } = req.params;
  
    try {
      const workerId = new ObjectId(id);
  
      // Marcar como despedido
      const updateResult = await db_mongo.collection('workers').updateOne(
        { _id: workerId },
        { $set: { fired: true } }
      );
  
      if (updateResult.modifiedCount === 0) {
        return res.status(404).json({ success: false, message: 'Trabajador no encontrado' });
      }
  
      // Eliminar el usuario relacionado
      const deleteResult = await db_mongo.collection('w_user').deleteOne({ workerId });
  
      res.status(200).json({
        success: true,
        message: 'Trabajador despedido y usuario eliminado',
        deletedUser: deleteResult.deletedCount === 1
      });
    } catch (error) {
      console.error('Error al despedir trabajador:', error);
      res.status(500).json({ success: false, message: 'Error al despedir trabajador' });
    }
  });
  

  router.get('/worker/full/:id', async (req, res) => {
    const workerId = req.params.id;
  
    try {
      const workerObjectId = new ObjectId(workerId);
  
      const worker = await db_mongo.collection('workers').findOne({ _id: workerObjectId });
  
      if (!worker) {
        return res.status(404).json({ success: false, message: 'Trabajador no encontrado' });
      }
  
      const user = await db_mongo.collection('w_users').findOne({ workerId: workerObjectId });
      if (user) {
        delete user.passwordHash;
      }
      
      res.status(200).json({
        worker:worker,
        user: user || null
      });

      
  
    } catch (error) {
      console.error('Error al obtener datos del trabajador:', error);
      res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
  });

  router.post('/worker', async (req, res) => {
    const { worker, user } = req.body;
  
    try {
      // 1. Insertar worker
      const resultWorker = await db_mongo.collection('workers').insertOne(worker);
      const workerId = resultWorker.insertedId;
  
      // 2. Preparar usuario con el ID del worker
      const newUser = {
        ...user,
        workerId: workerId,
        passwordHash: hashPassword(user.password), // Asegúrate de definir esta función
      };
  
      delete newUser.password; // Eliminar contraseña en texto plano
  
      // 3. Insertar user
      const resultUser = await db_mongo.collection('w_users').insertOne(newUser);
  
      res.status(201).json({
        success: true,
        message: 'Trabajador y usuario creados correctamente',
        workerId,
        userId: resultUser.insertedId,
      });
    } catch (error) {
      console.error('Error al guardar trabajador/usuario:', error);
      res.status(500).json({ success: false, error: 'Error al guardar los datos' });
    }
  });
  
  router.put('/worker/:id', async (req, res) => {
    const workerId = req.params.id;
    const { worker, user } = req.body;
  
    try {
      // 1. Actualizar datos del trabajador
      await db_mongo.collection('workers').updateOne(
        { _id: new ObjectId(workerId) },
        { $set: worker }
      );
  
      // 2. Buscar al usuario relacionado
      const existingUser = await db_mongo.collection('w_users').findOne({ workerId: new ObjectId(workerId) });
  
      if (!existingUser) {
        return res.status(404).json({ success: false, error: 'Usuario relacionado no encontrado' });
      }
  
      // 3. Preparar los nuevos datos del usuario
      const updatedUser = {
        ...user,
      };
  
      if (user.password) {
        updatedUser.passwordHash = hashPassword(user.password);
      }
  
      delete updatedUser.password;
  
      // 4. Actualizar datos del usuario
      await db_mongo.collection('w_users').updateOne(
        { _id: existingUser._id },
        { $set: updatedUser }
      );
  
      res.status(200).json({
        success: true,
        message: 'Trabajador y usuario actualizados correctamente',
      });
    } catch (error) {
      console.error('Error al actualizar:', error);
      res.status(500).json({ success: false, error: 'Error al actualizar los datos' });
    }
  });

  router.get('/workers/reports', async (req, res) => {
    try {
      const hoy = new Date();
  
      const report = await db_mongo.collection('workers').aggregate([
        {
          $project: {
            gender: 1,
            birthDate: { $toDate: "$birthDate" }, // conversión necesaria
            workStart: {
              $toDate: { $concat: ["1970-01-01T", "$jobInfo.workStartTime", ":00Z"] }
            },
            workEnd: {
              $toDate: { $concat: ["1970-01-01T", "$jobInfo.workEndTime", ":00Z"] }
            }
          }
        },
        {
          $project: {
            gender: 1,
            edad: {
              $dateDiff: {
                startDate: "$birthDate", // ya convertido a Date
                endDate: hoy,
                unit: "year"
              }
            },
            workHours: {
              $divide: [
                { $subtract: ["$workEnd", "$workStart"] },
                1000 * 60 * 60 // milisegundos a horas
              ]
            }
          }
        },
        {
          $group: {
            _id: null,
            total_trabajadores: { $sum: 1 },
            edad_promedio: { $avg: "$edad" },
            suma_horas_trabajo: { $sum: "$workHours" },
            total_mujeres: {
              $sum: {
                $cond: [{ $eq: ["$gender", "female"] }, 1, 0]
              }
            },
            total_hombres: {
              $sum: {
                $cond: [{ $eq: ["$gender", "male"] }, 1, 0]
              }
            },
            total_otro: {
              $sum: {
                $cond: [
                  { $and: [{ $ne: ["$gender", "female"] }, { $ne: ["$gender", "male"] }] },
                  1,
                  0
                ]
              }
            }
          }
        },
        {
          $project: {
            _id: 0,
            total_trabajadores: 1,
            edad_promedio: { $round: ["$edad_promedio", 2] },
            distribucion_genero: {
              male: "$total_hombres",
              female: "$total_mujeres"
            },
            horas_trabajo_promedio: {
              $round: [
                { $divide: ["$suma_horas_trabajo", "$total_trabajadores"] },
                2
              ]
            }
          }
        }
      ]).toArray();
  
      res.json(report[0] || {
        total_trabajadores: 0,
        edad_promedio: 0,
        distribucion_genero: { male: 0, female: 0, other: 0 },
        horas_trabajo_promedio: 0
      });
  
    } catch (err) {
      console.error('Error en reporte de trabajadores:', err);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

/////////////////////////////////////////////////////////////////////////////
//                      nomina
//////////////////////////////////////////////

  router.get('/workers/basic-info', async (req, res) => {
    try {
      const workers = await db_mongo.collection('workers').find(
        { fired: { $exists: false } }, // Excluye a los que tienen el campo `fired`
        {
          projection: {
            firstName: 1,
            lastName: 1,
            'jobInfo.salary': 1
          }
        }
      ).toArray();

      res.json(workers);
    } catch (error) {
      console.error('Error al obtener trabajadores:', error);
      res.status(500).json({ error: 'Error al obtener trabajadores' });
    }
  });

  
  router.post('/payroll', async (req, res) => {
    try {
      const { period, workers } = req.body;
  
      if (!period || !Array.isArray(workers)) {
        return res.status(400).json({ error: "Datos de nómina inválidos" });
      }

      
      // Verificar si ya existe una nómina para el mismo mes y año
      const existing = await db_mongo.collection('payrolls').findOne({
        'period.start_date': period.start_date,
        'period.end_date': period.end_date
      });

      if (existing) {
        console.log("Buscando si existe nómina con:", period.start_date, period.end_date);
        return res.status(200).json({ message: "Ya existe una nómina para este periodo" });
      }
  
      const processedWorkers = workers.map((w) => {
        const base = w.earnings.base_salary || 0;
        const bonus = w.earnings.bonuses || 0;
        const overtime = w.earnings.overtime || 0;
  
        const totalEarnings = base + bonus + overtime;
  
        // Cálculos de deducciones
        const incomeTax = +(totalEarnings * 0.125).toFixed(2);   // 12.5%
        const socialSecurity = +(totalEarnings * 0.05).toFixed(2); // 5%
        const totalDeductions = incomeTax + socialSecurity;
        const netPay = totalEarnings - totalDeductions;
  
        return {
          workerId: new ObjectId(w.workerId),
          earnings: {
            base_salary: base,
            bonuses: bonus,
            overtime: overtime
          },
          deductions: {
            income_tax: incomeTax,
            social_security: socialSecurity
          },
          totals: {
            total_earnings: totalEarnings,
            total_deductions: totalDeductions,
            net_pay: netPay
          }
        };
      });
  
      const payroll = {
        period,
        workers: processedWorkers,
        createdAt: new Date()
      };
  
      await db_mongo.collection('payrolls').insertOne(payroll);
      res.json({ message: "Nómina guardada correctamente" });
    } catch (error) {
      console.error("Error al guardar nómina:", error);
      res.status(500).json({ error: "Error al guardar nómina" });
    }
  });

  router.get("/payrolls/resumen-general", async (req, res) => {
    try {
      const payrolls = await db_mongo.collection("payrolls").find({}).toArray();
  
      let totalEarnings = 0;
      let totalDeductions = 0;
  
      const resumenPorNomina = payrolls.map(payroll => {
        let earningsNomina = 0;
        let deductionsNomina = 0;
  
        payroll.workers.forEach(worker => {
          earningsNomina += worker.totals.total_earnings;
          deductionsNomina += worker.totals.total_deductions;
        });
  
        totalEarnings += earningsNomina;
        totalDeductions += deductionsNomina;
  
        return {
          _id: payroll._id,
          payment_date: payroll.period.payment_date,
          total_earnings: +earningsNomina.toFixed(2),
          total_deductions: +deductionsNomina.toFixed(2),
          net_pay: +(earningsNomina - deductionsNomina).toFixed(2)
        };
      });
  
      res.json({
        total_earnings: +totalEarnings.toFixed(2),
        total_deductions: +totalDeductions.toFixed(2),
        net_pay: +(totalEarnings - totalDeductions).toFixed(2),
        payrolls: resumenPorNomina
      });
    } catch (error) {
      console.error("Error al obtener resumen general:", error);
      res.status(500).json({ error: "Error al obtener resumen general" });
    }
  });

  router.get('/payroll/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const payroll = await db_mongo.collection('payrolls').findOne({ _id: new ObjectId(id) });
  
      if (!payroll) {
        return res.status(404).json({ message: 'Payroll not found' });
      }
  
      // Para cada worker en payroll.workers, buscamos sus datos completos
      const workersWithDetails = await Promise.all(
        payroll.workers.map(async (workerItem) => {
          const worker = await db_mongo.collection('workers').findOne({ _id: new ObjectId(workerItem.workerId) });
          return {
            ...workerItem,
            workerDetails: {
              firstName: worker.firstName,
              lastName: worker.lastName,
              role: worker.jobInfo.position
            } || null
          };
        })
      );
      
  
      // Devolvemos el payroll con el array de workers ya "enriquecido"
      res.json({
        ...payroll,
        workers: workersWithDetails
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  });







  ////////////////////////////////////////////////////////////////////////////////////

  //////////////////////////////////////////////////////////////////////////////////


  router.get('/workers/report-by-area', async (req, res) => {
    try {
      const resultado = await db_mongo
        .collection('workers')
        .aggregate([
          {
            $match: { fired: { $exists: false } }
          },
          {
            $group: {
              _id: '$jobInfo.position',
              cantidad: { $sum: 1 }
            }
          },
          {
            $project: {
              _id: 0,
              area: '$_id',
              cantidad: 1
            }
          },
          {
            $sort: { cantidad: -1 }
          }
        ])
        .toArray();
  
      res.status(200).json({ trabajadores_por_area: resultado });
    } catch (error) {
      console.error('Error en reporte de trabajadores por área:', error);
      res.status(500).json({ success: false, message: 'Error al generar el reporte' });
    }
  });

  router.get('/workers/edad-salario', async (req, res) => {
    try {
      const workers = await db_mongo
        .collection('workers')
        .find({ fired: { $exists: false } })
        .toArray();
  
      const today = new Date();
  
      const edadSalario = workers.map(w => {
        const birthDate = new Date(w.birthDate);
        const age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        const edadFinal = m < 0 || (m === 0 && today.getDate() < birthDate.getDate())
          ? age - 1
          : age;
  
        return {
          nombre: `${w.firstName} ${w.lastName}`,
          edad: edadFinal,
          salario: w.jobInfo?.salary ?? 0
        };
      });
  
      res.status(200).json(edadSalario);
    } catch (error) {
      console.error('Error al obtener edad y salario:', error);
      res.status(500).json({ success: false, message: 'Error al obtener edad y salario' });
    }
  });

  
  router.get('/payrolls/summary-last-year', async (req, res) => {
    try {
      // today → 12 months ago (1st day of that month)
      const today = new Date();
      const oneYearBack = new Date(today);
      oneYearBack.setFullYear(oneYearBack.getFullYear() - 1);

      // Convertir a string ISO formato YYYY-MM-DD para comparar strings
      const todayStr = today.toISOString().slice(0,10);
      const oneYearBackStr = oneYearBack.toISOString().slice(0,10);

      const summary = await db_mongo.collection('payrolls').aggregate([
        {
          $match: {
            "period.payment_date": {
              $gte: oneYearBackStr,
              $lte: todayStr
            }
          }
        },
        {
          $project: {
            monthYear: {
              $dateToString: {
                format: "%Y-%m",
                date: { $dateFromString: { dateString: "$period.payment_date" } }
              }
            },
            workers: 1
          }
        },
        {
          $unwind: "$workers"
        },
        {
          $group: {
            _id: "$monthYear",
            totalNetPay: { $sum: "$workers.totals.net_pay" },
            totalDeductions: { $sum: "$workers.totals.total_deductions" }
          }
        },
        {
          $sort: { _id: 1 }
        },
        {
          $project: {
            _id: 0,
            month_year: "$_id",
            total_net_pay: "$totalNetPay",
            total_deductions: "$totalDeductions"
          }
        }
      ]).toArray();
        
      res.json(summary);
    } catch (err) {
      console.error('Error generating 12-month payroll summary:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  router.get('/flightssss/status-summary', async (req, res) => {
    try {
      const result = await db_mongo.collection('flights').aggregate([
        {
          $group: {
            _id: '$status', // <- este es el campo correcto según tu ejemplo
            count: { $sum: 1 }
          }
        },
        {
          $project: {
            _id: 0,
            status: '$_id',
            count: 1
          }
        }
      ]).toArray();
  
      res.json(result);
    } catch (err) {
      console.error('Error in status-summary:', err.message || err.toString());
      res.status(500).json({ error: 'Server error' });
    }
  });
  


  ////////////////////////////////////////////////////
  //             functions
  ////////////////////////////////////////////////////

  function hashPassword(password) {
    return crypto.createHash('md5').update(password).digest('hex');
  }

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

  // valid weight of plane
  router.post('/add-suitcase', async (req, res) => {
    const { flightId, planeId, suitcaseId, weight } = req.body;

    if (!flightId || !planeId || !suitcaseId || weight == null) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    try {
      const planeObjectId = new ObjectId(planeId);
      const flightObjectId = new ObjectId(flightId);
      const suitcaseObjectId = new ObjectId(suitcaseId);

      // 1. Obtener peso máximo permitido del avión
      const plane = await db.collection('planes').findOne({ _id: planeObjectId });
      if (!plane) {
        return res.status(404).json({ error: 'Avión no encontrado' });
      }

      const maxWeight = plane.peso_maximo_kg;

      // 2. Sumar pesos existentes para ese vuelo y avión
      const aggregate = await db.collection('flight_suitcases').aggregate([
        {
          $match: {
            flightId: flightObjectId,
            planeId: planeObjectId
          }
        },
        {
          $group: {
            _id: null,
            totalWeight: { $sum: '$weight' }
          }
        }
      ]).toArray();

      const currentTotal = aggregate[0]?.totalWeight || 0;
      const newTotal = currentTotal + weight;

      // 3. Verificar si excede el peso máximo
      if (newTotal > maxWeight) {
        return res.status(400).json({
          error: 'Peso excedido',
          detalle: `Peso actual: ${currentTotal}, nuevo: ${weight}, máximo: ${maxWeight}`
        });
      }

      // 4. Insertar el nuevo equipaje
      const result = await db.collection('flight_suitcases').insertOne({
        flightId: flightObjectId,
        planeId: planeObjectId,
        suitcaseId: suitcaseObjectId,
        weight,
        timestamp: new Date()
      });

      res.status(201).json({ message: 'Equipaje registrado', id: result.insertedId });

    } catch (error) {
      console.error('Error al agregar equipaje:', error);
      res.status(500).json({ error: 'Error del servidor' });
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

  router.post('/checkin', async (req, res) => {
    const { suitcaseId, passed, status, description } = req.body;

    if (!suitcaseId || typeof passed !== 'boolean' || !status || !description) {
      return res.status(400).json({ error: 'Faltan campos requeridos o datos inválidos' });
    }

    try {
      const suitcaseObjectId = new ObjectId(suitcaseId);

      // Verificar que la maleta exista
      const suitcaseExists = await db_mongo.collection('suitcases').findOne({ _id: suitcaseObjectId });
      if (!suitcaseExists) {
        return res.status(404).json({ error: 'Maleta no encontrada' });
      }

      // Insertar inspección
      const result = await db_mongo.collection('checkin').insertOne({
        suitcaseId: suitcaseObjectId,
        passed,
        status,
        description,
        inspectedAt: new Date()
      });

      res.status(201).json({ message: 'Inspección registrada', id: result.insertedId });

    } catch (error) {
      console.error('Error al registrar inspección:', error);
      res.status(500).json({ error: 'Error del servidor' });
    }
  });

  router.post('/payments/report', async (req, res) => {
    try {
      const { type, value } = req.body;

      if (!['month', 'year'].includes(type) || !value) {
        return res.status(400).json({ error: 'Parámetros inválidos' });
      }

      let startDate, endDate;

      if (type === 'month') {
        const [year, month] = value.split('-').map(Number);
        if (!year || !month || month < 1 || month > 12) {
          return res.status(400).json({ error: 'Formato de mes inválido. Usa "YYYY-MM"' });
        }

        startDate = new Date(year, month - 1, 1);
        endDate = new Date(year, month, 1); // El primer día del mes siguiente
      } else if (type === 'year') {
        const year = parseInt(value);
        if (!year) {
          return res.status(400).json({ error: 'Año inválido' });
        }

        startDate = new Date(year, 0, 1);
        endDate = new Date(year + 1, 0, 1);
      }

      const payments = await db_mongo.collection('payments').find({
        created_at: { $gte: startDate, $lt: endDate }
      }).toArray();

      const total = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

      res.status(200).json({
        count: payments.length,
        total_amount: total,
        currency: "USD",
        range: { from: startDate, to: endDate },
        payments
      });
    } catch (error) {
      console.error('Error al generar reporte de pagos:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });
  router.post('/payments/monthly-summary', async (req, res) => {
    try {
      const { year } = req.body;

      const parsedYear = parseInt(year);
      if (!parsedYear || parsedYear < 2000 || parsedYear > 2100) {
        return res.status(400).json({ error: 'Año inválido. Usa un formato "YYYY" válido.' });
      }

      const startDate = new Date(parsedYear, 0, 1);
      const endDate = new Date(parsedYear + 1, 0, 1);

      const result = await db_mongo.collection('payments').aggregate([
        {
          $match: {
            created_at: { $gte: startDate, $lt: endDate }
          }
        },
        {
          $group: {
            _id: { month: { $month: "$created_at" } },
            total_amount: { $sum: "$amount" },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { "_id.month": 1 }
        }
      ]).toArray();

      // Formatear resultado a estructura clara
      const monthlyReport = Array.from({ length: 12 }, (_, i) => {
        const found = result.find(r => r._id.month === i + 1);
        return {
          month: i + 1,
          total_amount: found?.total_amount || 0,
          payment_count: found?.count || 0
        };
      });

      res.status(200).json({
        year: parsedYear,
        monthly_summary: monthlyReport,
        currency: "USD"
      });

    } catch (error) {
      console.error('Error al generar resumen mensual de pagos:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });
module.exports = router;