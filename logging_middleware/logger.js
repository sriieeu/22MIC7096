// logging_middleware/logger.js
// this file handles logs
// i used axios for this
const axios = require('axios');
require('dotenv').config();

// global variable for token
var tkn = process.env.TOKEN;

// this function sends log to server
async function log(l, m, data) {
    // maybe it works
    try {
        var body = {
            level: l,
            msg: m,
            time: new Date(),
            info: data
        };
        
        console.log("LOGGING: " + m);
        
        // send it
        await axios.post('http://' + process.env.IP + '/evaluation-service/logs', body, {
            headers: {
                'Authorization': 'Bearer ' + tkn
            }
        });
    } catch (e) {
        // if error just print it
        console.log("error happened in logger");
    }
}

// middleware for express
function logStuff(req, res, next) {
    console.log("got a request");
    log("INFO", "req: " + req.url, {});
    next();
}

module.exports = {
    log: log,
    logMiddleware: logStuff
};
