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

app.use(cors({
  origin: 'http://localhost:3000', // el frontend
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
app.use('/admin_v2',admin_routes_v2)
app.use('/admin', verifyAdmin, admin_routes)
app.use('/user', verifyToken, (req, res, next) => {
  if (req.user.role === 'user' || req.user.role === 'admin') return next()
  return res.status(403).json({ error: 'Acceso denegado' })
}, user_routes)
app.use(express.json())
app.listen(port, () => {
    console.log(`Example app listening on port ${port}!`)
})