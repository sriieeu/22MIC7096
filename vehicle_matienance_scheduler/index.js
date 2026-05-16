// vehicle_matienance_scheduler/index.js
// code for vehicle scheduler
const express = require('express');
const axios = require('axios');
require('dotenv').config();
const l = require('../logging_middleware/logger');

const app = express();
app.use(express.json());

// scheduler api
app.get('/schedule', async (req, res) => {
    // get depots and vehicles
    var url1 = 'http://' + process.env.IP + '/evaluation-service/depots';
    var url2 = 'http://' + process.env.IP + '/evaluation-service/vehicles';
    
    try {
        var d = await axios.get(url1);
        var v = await axios.get(url2);
        
        // just send them together
        var result = {
            depots: d.data,
            vehicles: v.data,
            msg: "here is the data i found"
        };
        
        l.log("INFO", "scheduled things", {});
        res.json(result);
        
    } catch(e) {
        res.send("failed to get data");
    }
});

// listen
app.listen(process.env.PORT2, () => {
    console.log("running on port " + process.env.PORT2);
});
