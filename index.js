/**
 * Backend Server — 22MIC7096 Afford
 * ───────────────────────────────────
 * Express backend integrating:
 *  - Logging Middleware  (logging_middleware/)
 *  - Vehicle Maintenance Scheduler (vehicle_matienance/)
 */

const express = require("express");
const { Log } = require("./logging_middleware");
const { runScheduler } = require("./vehicle_matienance/scheduler");

const app = express();
app.use(express.json());

// ─── Global request logger ────────────────────────────────────────────────────
app.use(async (req, res, next) => {
  await Log(
    "backend",
    "info",
    "middleware",
    `${req.method} ${req.url} — request received`
  );
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check
app.get("/", async (req, res) => {
  await Log("backend", "info", "route", "Health check endpoint hit");
  res.json({ status: "ok", message: "Backend server is running" });
});

// Run the vehicle maintenance scheduler
app.get("/schedule", async (req, res) => {
  await Log("backend", "info", "route", "Vehicle scheduling endpoint triggered via HTTP");
  try {
    const results = await runScheduler();
    await Log(
      "backend",
      "info",
      "service",
      `Scheduling complete — ${results.length} depots processed`
    );
    res.json({ success: true, results });
  } catch (err) {
    await Log("backend", "error", "route", `Scheduling failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Simulate a handler type-mismatch error (per task spec example)
app.post("/process", async (req, res) => {
  const { value } = req.body;
  await Log("backend", "debug", "handler", `Processing request with value: ${JSON.stringify(value)}`);

  if (typeof value !== "boolean") {
    await Log("backend", "error", "handler", "received string, expected bool");
    return res.status(400).json({ error: "Invalid data type — expected boolean" });
  }

  await Log("backend", "info", "handler", "Request processed successfully");
  res.json({ success: true, received: value });
});

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use(async (req, res) => {
  await Log("backend", "warn", "route", `404 — Route not found: ${req.method} ${req.url}`);
  res.status(404).json({ error: "Route not found" });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use(async (err, req, res, _next) => {
  await Log("backend", "fatal", "middleware", `Unhandled server error: ${err.message}`);
  res.status(500).json({ error: "Internal Server Error" });
});

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`\n✔ Server running on http://localhost:${PORT}`);
  console.log(`  GET  /          → health check`);
  console.log(`  GET  /schedule  → run vehicle maintenance scheduler`);
  console.log(`  POST /process   → handler type demo\n`);
  await Log("backend", "info", "service", `Server started on port ${PORT}`);
});
