const express = require('express')
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;
const axios = require('axios');
const db_postgres = require('../db/postgres');
const db_mongo = require('../db/mongo')
const urlFlag='https://restcountries.com/v3.1/alpha/'
const pool = require('../db/postgres');
const router = express.Router();

router.get('/employees/:id?', async (req, res) => {
  const employeeId = req.params.id;

  try {
    let result;

    if (employeeId) {
      result = await db_postgres.query(
        'SELECT * FROM trabajadores WHERE id = $1',
        [employeeId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      res.status(200).json({ data: result.rows[0] });
    } else {
      result = await db_postgres.query('SELECT * FROM trabajadores');
      res.status(200).json({ data: result.rows });
    }

  } catch (error) {
    console.error(error);
    res.status(500).json({
        error: "Fatal error",
        details: error.message
    });
  }
});

router.get('/exemployees/:id?', async (req, res) => {
  const employeeId = req.params.id;

  try {
    let result;

    if (employeeId) {
      result = await db_postgres.query(
        'SELECT * FROM trabajadores_despedidos WHERE id = $1',
        [employeeId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      res.status(200).json({ data: result.rows[0] });
    } else {
      result = await db_postgres.query('SELECT * FROM trabajadores_despedidos');
      res.status(200).json({ data: result.rows });
    }

  } catch (error) {
    console.error(error);
    res.status(500).json({
        error: "Fatal error",
        details: error.message
    });
  }
});

router.post('/employees', async (req, res) => {
  const {
    nombre,
    apellido_paterno,
    apellido_materno,
    fecha_nacimiento,
    id_pais,
    sexo,
    email,
    rfc,
    telefono,
    direccion,
    id_puesto,
    fecha_inicio,
    fecha_fin = null,
    pago
  } = req.body;

  try {
    // Iniciar transacción
    await pool.query('BEGIN');

    // 1. Insertar en la tabla trabajadores
    const insertTrabajadorQuery = `
      INSERT INTO trabajadores (
        nombre, apellido_paterno, apellido_materno, fecha_nacimiento,
        id_pais, sexo, email, rfc, telefono, direccion
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `;
    const trabajadorValues = [
      nombre, apellido_paterno, apellido_materno, fecha_nacimiento,
      id_pais, sexo, email, rfc, telefono, direccion
    ];

    const trabajadorResult = await pool.query(insertTrabajadorQuery, trabajadorValues);
    const id_trabajador = trabajadorResult.rows[0].id;

    // 2. Insertar en la tabla trabajador_puesto
    const insertPuestoQuery = `
      INSERT INTO trabajador_puesto (
        id_trabajador, id_puesto, fecha_inicio, fecha_fin, pago
      ) VALUES ($1, $2, $3, $4, $5)
    `;
    const puestoValues = [id_trabajador, id_puesto, fecha_inicio, fecha_fin, pago];

    await pool.query(insertPuestoQuery, puestoValues);

    // Confirmar transacción
    await pool.query('COMMIT');

    res.status(201).json({ message: 'Operation was complete successfull', id_trabajador });
  } catch (error) {
    // Revertir si algo falla
    await pool.query('ROLLBACK');
    console.error('Something was wrong:', error);
    res.status(500).json({ error: 'Something was wrong', details: error.message });
  }
});

module.exports = router;