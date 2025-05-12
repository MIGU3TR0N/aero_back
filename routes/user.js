const express = require('express')
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;
const axios = require('axios');
const db_postgres = require('../db/postgres');
const db_mongo = require('../db/mongo')

const router = express.Router();