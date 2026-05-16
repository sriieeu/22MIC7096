// notification_app_be/index.js
// made by 22MIC7096
const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();
const logger = require('../logging_middleware/logger');

const app = express();
app.use(cors());
app.use(express.json());
app.use(logger.logMiddleware);

// api for notifications
app.get('/notifications', async (req, res) => {
    // call the big server
    var url = 'http://' + process.env.IP + '/evaluation-service/notifications';
    
    try {
        var r = await axios.get(url);
        var data = r.data;
        
        // stage 6 logic here
        // placement is 3, result is 2, event is 1
        for(var i=0; i<data.length; i++) {
            if(data[i].notificationType == 'Placement') data[i].p = 3;
            else if(data[i].notificationType == 'Result') data[i].p = 2;
            else if(data[i].notificationType == 'Event') data[i].p = 1;
            else data[i].p = 0;
        }
        
        // sort them manually
        data.sort(function(a, b) {
            if(a.p > b.p) return -1;
            if(a.p < b.p) return 1;
            // if same priority check date
            if(a.createdAt > b.createdAt) return -1;
            return 1;
        });
        
        // only take 10
        var top10 = [];
        for(var j=0; j<10; j++) {
            if(data[j]) {
                top10.push(data[j]);
            }
        }
        
        // send back
        res.send({
            status: "ok",
            notifications: top10,
            all_count: data.length
        });
        
    } catch(err) {
        console.log("something went wrong");
        res.status(500).send("error");
    }
});

// start it
app.listen(process.env.PORT1, function() {
    console.log("server is on port " + process.env.PORT1);
});
