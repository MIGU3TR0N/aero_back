const express = require('express')
const app = express()
const port = 3000
const connectMongo = require('./db/mongo');
connectMongo();
const common_routes = require('./routes/common')
const cors = require('cors')

app.use(cors())
app.use('/common', common_routes)
app.use(express.json());
app.listen(port, () => {
    console.log(`Example app listening on port ${port}!`)
})