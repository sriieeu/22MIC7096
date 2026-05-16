/**
 * Vehicle Maintenance Scheduler
 * ─────────────────────────────
 * Fetches depots and vehicles from the evaluation service, then uses
 * a 0/1 Knapsack DP algorithm to select the optimal set of tasks that
 * maximises total Impact within each depot's MechanicHours budget.
 *
 * APIs used:
 *   GET /evaluation-service/depots   → { depots: [{ ID, MechanicHours }] }
 *   GET /evaluation-service/vehicles → { vehicles: [{ TaskID, Duration, Impact }] }
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const { Log } = require("../logging_middleware");

const BASE_URL = "http://4.224.186.213/evaluation-service";

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function getAuthHeaders() {
  const token = process.env.LOG_API_TOKEN || process.env.AUTH_TOKEN;
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function apiFetch(path) {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, { headers: getAuthHeaders() });
  if (!response.ok) {
    throw new Error(`API error ${response.status} for GET ${url}`);
  }
  return response.json();
}

// ─── 0/1 Knapsack (space-optimised DP) ───────────────────────────────────────

/**
 * @param {Array<{ taskId, duration, impact }>} tasks
 * @param {number} capacity  - MechanicHours available for this depot
 * @returns {{ selectedTasks, totalImpact, totalDuration }}
 */
function knapsack(tasks, capacity) {
  const n = tasks.length;
  const dp = new Array(capacity + 1).fill(0);

  // Build DP table
  for (let i = 0; i < n; i++) {
    const { duration, impact } = tasks[i];
    for (let w = capacity; w >= duration; w--) {
      dp[w] = Math.max(dp[w], dp[w - duration] + impact);
    }
  }

  // Back-track to find selected items
  const selected = [];
  let w = capacity;
  for (let i = n - 1; i >= 0; i--) {
    const { duration, impact } = tasks[i];
    if (w >= duration && dp[w] === dp[w - duration] + impact) {
      selected.push(tasks[i]);
      w -= duration;
    }
  }

  return {
    selectedTasks: selected.reverse(),
    totalImpact: dp[capacity],
    totalDuration: selected.reduce((sum, t) => sum + t.duration, 0),
  };
}

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchDepots() {
  await Log("backend", "info", "service", "Fetching depot list from evaluation API");
  try {
    const data = await apiFetch("/depots");
    await Log("backend", "info", "service", `Retrieved ${data.depots.length} depots`);
    return data.depots; // [{ ID, MechanicHours }]
  } catch (err) {
    await Log("backend", "error", "service", `Failed to fetch depots: ${err.message}`);
    throw err;
  }
}

async function fetchVehicles() {
  await Log("backend", "info", "repository", "Fetching vehicle task list from evaluation API");
  try {
    const data = await apiFetch("/vehicles");
    await Log(
      "backend",
      "info",
      "repository",
      `Retrieved ${data.vehicles.length} vehicle tasks`
    );
    // Normalise to internal shape
    return data.vehicles.map((v) => ({
      taskId: v.TaskID,
      duration: v.Duration,
      impact: v.Impact,
    }));
  } catch (err) {
    await Log("backend", "error", "repository", `Failed to fetch vehicles: ${err.message}`);
    throw err;
  }
}

// ─── Per-depot scheduling ─────────────────────────────────────────────────────

async function scheduleDepot(depot, vehicles) {
  const { ID: depotId, MechanicHours: capacity } = depot;

  await Log(
    "backend",
    "info",
    "domain",
    `Scheduling depot ${depotId} — budget: ${capacity}h, tasks available: ${vehicles.length}`
  );

  if (vehicles.length === 0) {
    await Log("backend", "warn", "domain", `Depot ${depotId}: no vehicle tasks available`);
    return { depotId, capacity, selectedTasks: [], totalImpact: 0, totalDuration: 0 };
  }

  await Log(
    "backend",
    "debug",
    "domain",
    `Depot ${depotId}: running 0/1 knapsack DP with capacity=${capacity}h`
  );

  const result = knapsack(vehicles, capacity);

  await Log(
    "backend",
    "info",
    "domain",
    `Depot ${depotId}: selected ${result.selectedTasks.length} tasks — ` +
      `impact=${result.totalImpact}, hours used=${result.totalDuration}/${capacity}`
  );

  return { depotId, capacity, ...result };
}

// ─── Main scheduler ───────────────────────────────────────────────────────────

async function runScheduler() {
  await Log("backend", "info", "service", "Vehicle Maintenance Scheduler started");

  // Fetch depots and vehicles in parallel
  let depots, vehicles;
  try {
    [depots, vehicles] = await Promise.all([fetchDepots(), fetchVehicles()]);
  } catch (err) {
    await Log("backend", "fatal", "service", `Cannot proceed — data fetch failed: ${err.message}`);
    throw err;
  }

  await Log(
    "backend",
    "info",
    "service",
    `Processing ${depots.length} depots with ${vehicles.length} vehicle tasks`
  );

  const results = [];

  for (const depot of depots) {
    try {
      const schedule = await scheduleDepot(depot, vehicles);
      results.push(schedule);
    } catch (err) {
      await Log(
        "backend",
        "error",
        "service",
        `Skipping depot ${depot.ID} due to error: ${err.message}`
      );
    }
  }

  // ── Print summary table ──────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║       Vehicle Maintenance Scheduler — Results                 ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  for (const r of results) {
    console.log(`Depot ${r.depotId}  (Budget: ${r.capacity}h)`);
    console.log(`  Selected tasks : ${r.selectedTasks.length}`);
    console.log(`  Task IDs       : ${r.selectedTasks.map((t) => t.taskId).join(", ") || "none"}`);
    console.log(`  Hours used     : ${r.totalDuration} / ${r.capacity}`);
    console.log(`  Total impact   : ${r.totalImpact}`);
    console.log();
  }

  const grandTotal = results.reduce((s, r) => s + r.totalImpact, 0);
  console.log(`Grand total impact score across all depots: ${grandTotal}\n`);

  await Log(
    "backend",
    "info",
    "service",
    `Scheduler completed. Grand total impact: ${grandTotal}`
  );

  return results;
}

// ─── Run directly ─────────────────────────────────────────────────────────────
if (require.main === module) {
  runScheduler().catch(async (err) => {
    await Log("backend", "fatal", "service", `Unhandled error: ${err.message}`);
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runScheduler, knapsack };
