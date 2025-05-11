require('dotenv').config();
const mongoose = require('mongoose');

const connectMongo = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
    });
    console.log('Conectado a MongoDB');
  } catch (err) {
    console.error('Error al conectarse a MongoDB:', err);
  }
};


module.exports = connectMongo;
