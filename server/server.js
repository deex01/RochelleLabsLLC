const express = require('express');
const config = require('./config');
const cors = require('cors');
const cron = require('node-cron');
const routes = require('./routes.js');
const https = require('https');
const fs = require('fs');

const key = fs.readFileSync('./key.pem');
const cert = fs.readFileSync('./cert.pem');

const app = express();
app.use(cors());
app.use(express.json());

// Schedule the task to run at midnight every day
cron.schedule('0 0 * * *', () => {
  routes.resetFreq();
  console.log('Generation limits reset');
});

// We use express to define our various API endpoints and
// provide their handlers that we implemented in routes.js
app.get('/creator/', routes.home);
app.get('/creator/generate_image', routes.generate_image);
app.post('/creator/checkout', routes.checkout);

const server = https.createServer({key: key, cert: cert }, app);

app.listen(config.server_port, () => {
  console.log(`Server running! ${config.server_port}`)
});

module.exports = app;