require('dotenv').config();
const mongoose = require('mongoose');

const connectMongo = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Conectado a bd Mongo');

  } catch (err) {
    console.error('Error al conectarse a Mongo:', err);
  }
};


module.exports = connectMongo;
