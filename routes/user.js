const express = require('express')
const mongodb = require('mongodb');
const { ObjectId } = require('mongodb');
const axios = require('axios');
const db_postgres = require('../db/postgres');
const db_mongo = require('../db/mongo')

const router = express.Router();


// reservation of flight by the login user
router.post('/reservation', async (req, res)=>{
    try{
        const userId = req.user.userId
        const flight = req.body.flight
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'ID de usuario no válido' });
        }
        if (!ObjectId.isValid(flight)) {
            return res.status(400).json({ error: 'ID de usuario no válido' });
        }
        const newTicket = {
            ...req.body,
            user: new ObjectId(userId),
            flight: new ObjectId(flight)
        }
        const result = await db_mongo.collection('tickets').insertOne(newTicket)
        res.status(200).json(result)
    }catch (error) {
        console.log(error)
        res.status(500).json({"error": error});  
    }
})

router.post('/suitcases', async (req, res)=>{
    try{
        const userId = req.user.userId
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'ID de usuario no válido' });
        }
        if (!ObjectId.isValid(flight)) {
            return res.status(400).json({ error: 'ID de usuario no válido' });
        }
        const newSuitcase = {
            ...req.body,
            owner: new ObjectId(userId)
        }
        const result = await db_mongo.collection('suitcases').insertOne(newSuitcase)
        res.status(200).json(result)
    }catch (error) {
        console.log(error)
        res.status(500).json({"error": error});  
    }
})

module.exports = router;