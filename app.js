const express = require('express')
const cookieParser = require('cookie-parser')
const cors = require('cors')
const app = express()
const port = 3000
const connectMongo = require('./db/mongo');
require('./db/postgres')
const common_routes = require('./routes/common')
const admin_routes = require('./routes/admin')
const user_routes = require('./routes/user')
app.use(cors({
  origin: 'http://localhost:3001', // modificar a la url de next
  credentials: true
}))
app.use(express.json())

app.use(cors())
app.use('/', common_routes)
app.use('/admin', admin_routes)
const verifyToken = require('./middleware/auth')
app.use('/user', verifyToken, user_routes)
app.use(express.json());
app.listen(port, () => {
    console.log(`Example app listening on port ${port}!`)
})