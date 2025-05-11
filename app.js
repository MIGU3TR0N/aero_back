const express = require('express')
const app = express()
const port = 3000
const { ObjectId } = require('mongodb')
const common_routes = require('./routes/common')
const cors = require('cors')

app.use(cors())
app.use('/', common_routes)
app.use(express.json());
app.listen(port, () => {
    console.log(`Example app listening on port ${port}!`)
})