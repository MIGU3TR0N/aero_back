const mongoose = require('mongoose');

// Definir el esquema
const flightSchema = new mongoose.Schema({
  origin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Country',
    required: true,
  },
  destination: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Country',
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  exit_date: {
    type: Date,
    required: true,
  }
}, {
  timestamps: true,
});


const Flight = mongoose.model('Flight', flightSchema);

module.exports = Flight;