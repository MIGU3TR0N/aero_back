const jwt = require('jsonwebtoken');
const SECRET = process.env.SECRET;

function authMiddleware(req, res, next) {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ error: 'Access negated' });
  }

  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token invalid or expired' });
  }
}

module.exports = authMiddleware;
