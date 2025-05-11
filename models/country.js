const mongoose = require('mongoose');

// Definir el esquema de estado
const stateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  state_code: {
    type: String,
    required: true
  }
}, { _id: false });  // No generamos un _id para cada estado, ya que son subdocumentos

// Definir el esquema del país
const countrySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  iso3: {
    type: String,
    required: true
  },
  iso2: {
    type: String,
    required: true
  },
  states: {
    type: [stateSchema],  // Array de subdocumentos para los estados
    required: true
  }
}, {
  timestamps: true,  // Agregar createdAt y updatedAt automáticamente
});

// Crear el modelo a partir del esquema
const Country = mongoose.model('Country', countrySchema);

// Exportar el modelo
module.exports = Country;