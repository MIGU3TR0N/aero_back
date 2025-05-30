const jwt = require('jsonwebtoken');
require("dotenv").config();
const SECRET = process.env.SECRET; // usa process.env.SECRET en producción

module.exports = (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
  }

  try {
    const decoded = jwt.verify(token, SECRET);

    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Acceso denegado. Solo administradores.' });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido.' });
  }
};