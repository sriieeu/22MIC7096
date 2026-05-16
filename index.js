const express = require('express');
const { Log } = require('./logging_middleware');

const app = express();
app.use(express.json());

// Express middleware to log all incoming requests
app.use(async (req, res, next) => {
  await Log("backend", "info", "middleware", `Received ${req.method} request at ${req.url}`);
  next();
});

app.get('/', async (req, res) => {
  await Log("backend", "info", "handler", "Handling root endpoint request");
  res.send('Backend Server is Running');
});

app.get('/simulate-db-error', async (req, res) => {
  await Log("backend", "fatal", "db", "Critical database connection failure.");
  res.status(500).send('Database connection failed');
});

app.post('/process', async (req, res) => {
  const { value } = req.body;
  if (typeof value !== 'boolean') {
    // Example from the screenshot: If an error occurs due to data type mismatch
    await Log("backend", "error", "handler", "received string, expected bool");
    return res.status(400).json({ error: "Invalid data type, expected boolean" });
  }
  
  await Log("backend", "info", "handler", "Data processed successfully");
  res.json({ message: "Processed successfully" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);
  await Log("backend", "info", "service", `Server started on port ${PORT}`);
});
