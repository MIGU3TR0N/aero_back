const express = require('express')
const cookieParser = require('cookie-parser')
const cors = require('cors')
const app = express()
const port = 3050
const session = require('express-session')
const nodemailer = require('nodemailer')
const connectMongo = require('./db/mongo')

require('./db/postgres')

const common_routes = require('./routes/common')
const admin_routes = require('./routes/admin')
const admin_routes_v2 = require('./routes/admin_v2')
const user_routes = require('./routes/user')

const verifyToken = require('./middleware/auth')
const verifyAdmin = require('./middleware/verifyAdmin')

const allowedOrigins = ['http://localhost:3000', 'http://ec2-54-209-72-131.compute-1.amazonaws.com','http://ec2-54-161-202-2.compute-1.amazonaws.com:3000', 'https://admin-port.onrender.com:3000', 'https://admin-port.onrender.com', 'https://proyectofinal-t0xh.onrender.com'];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  credentials: true
}));

app.use(session({
  secret: process.env.SECRET,  // <--- Obligatorio
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }  // en desarrollo debe ser false si no usas HTTPS
}));

app.use(express.json())
app.use(cookieParser())

// routes
app.use('/', common_routes)
app.use('/admin_v2', verifyAdmin, admin_routes_v2)
app.use('/admin', verifyAdmin, admin_routes)
app.use('/user', verifyToken, (req, res, next) => {
  if (req.user.role === 'user' || req.user.role === 'admin') return next()
  return res.status(403).json({ error: 'Acceso denegado' })
}, user_routes)
app.use(express.json())
app.listen(port, '0.0.0.0',() => {
    console.log(`Example app listening on port ${port}!`)
})