const jwt = require('jsonwebtoken');
require("dotenv").config();
const SECRET = process.env.SECRET;

module.exports = (req, res, next) => {
  const sessionUser = req.session.usuario;

  if (!sessionUser || !sessionUser.token) {
    return res.status(401).json({ error: 'Acceso denegado. Token no presente en sesión.' });
  }

  try {
    const decoded = jwt.verify(sessionUser.token, SECRET);

    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Acceso denegado. Solo administradores.' });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token de sesión inválido o expirado.' });
  }
};