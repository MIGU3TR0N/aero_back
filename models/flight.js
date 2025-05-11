const mongoose = require('mongoose');

// Definir el esquema
const flightSchema = new mongoose.Schema({
  origin: {
    type: String,
    required: true,  // Aseguramos que siempre debe estar presente
  },
  destination: {
    type: String,
    required: true,  // Aseguramos que siempre debe estar presente
  },
  price: {
    type: Number,
    required: true,  // Aseguramos que siempre debe estar presente
  },
}, {
  timestamps: true,  // Esto agrega los campos createdAt y updatedAt automáticamente
});

// Crear el modelo a partir del esquema
const Flight = mongoose.model('flights', flightSchema);

// Exportar el modelo
module.exports = Flight;
