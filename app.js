const express = require('express')
const app = express()
const port = 3000
const connectMongo = require('./db/mongo');
connectMongo();
require('./db/postgres')
const common_routes = require('./routes/common')
const admin_routes = require('./routes/admin')
const cors = require('cors')
app.use(express.json())

app.use(cors())
app.use('/', common_routes)
app.use('/admin', admin_routes)
app.use(express.json());
app.listen(port, () => {
    console.log(`Example app listening on port ${port}!`)
})