require('dotenv').config();
const MongoClient = require('mongodb').MongoClient
var db = null

try {
  const client = new MongoClient(process.env.MONGO_URI);
  client.connect()
  db = client.db(process.env.DBNAME)
  console.log('Conectado a MongoDB');
} catch (err) {
  console.error('Error al conectarse a MongoDB:', err);
}


module.exports = db;
