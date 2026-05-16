/**
 * Vehicle Maintenance Scheduler
 * ─────────────────────────────
 * Fetches depots and their maintenance tasks from the evaluation service,
 * then uses a 0/1 Knapsack DP algorithm to select the optimal set of tasks
 * that maximises total operational impact within the daily mechanic-hour budget.
 *
 * API endpoints used:
 *   GET  /evaluation-service/depots
 *   GET  /evaluation-service/depots/:depotId/tasks
 *
 * Logging is done via the shared logging_middleware package.
 */

const { Log } = require("../logging_middleware");

const BASE_URL = "http://4.224.186.213/evaluation-service";

// ─── HTTP helper ─────────────────────────────────────────────────────────────

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
    throw new Error(`API error ${response.status} for ${url}`);
  }

  return response.json();
}

// ─── Knapsack algorithm ───────────────────────────────────────────────────────

/**
 * 0/1 Knapsack — O(n × W) dynamic programming.
 *
 * @param {Array<{id, duration, importance}>} tasks
 * @param {number} capacity  - Total mechanic-hours available
 * @returns {{ selectedTasks: Array, totalImportance: number, totalDuration: number }}
 */
function knapsack(tasks, capacity) {
  const n = tasks.length;
  // Use 1-D DP array (space-optimised)
  const dp = new Array(capacity + 1).fill(0);

  for (let i = 0; i < n; i++) {
    const { duration, importance } = tasks[i];
    // Traverse backwards to avoid using the same item twice
    for (let w = capacity; w >= duration; w--) {
      dp[w] = Math.max(dp[w], dp[w - duration] + importance);
    }
  }

  // Back-track to find selected tasks
  const selected = [];
  let w = capacity;
  for (let i = n - 1; i >= 0; i--) {
    const { duration, importance } = tasks[i];
    if (w >= duration && dp[w] === dp[w - duration] + importance) {
      selected.push(tasks[i]);
      w -= duration;
    }
  }

  return {
    selectedTasks: selected.reverse(),
    totalImportance: dp[capacity],
    totalDuration: selected.reduce((sum, t) => sum + t.duration, 0),
  };
}

// ─── Core scheduler ───────────────────────────────────────────────────────────

async function fetchDepots() {
  await Log("backend", "info", "service", "Fetching depot list from evaluation API");
  try {
    const data = await apiFetch("/depots");
    await Log(
      "backend",
      "info",
      "service",
      `Retrieved ${data.depots.length} depots from the API`
    );
    return data.depots;
  } catch (err) {
    await Log("backend", "error", "service", `Failed to fetch depots: ${err.message}`);
    throw err;
  }
}

async function fetchTasksForDepot(depotId) {
  await Log(
    "backend",
    "debug",
    "repository",
    `Fetching maintenance tasks for depot ID ${depotId}`
  );
  try {
    const data = await apiFetch(`/depots/${depotId}/tasks`);
    const tasks = data.tasks || [];
    await Log(
      "backend",
      "debug",
      "repository",
      `Depot ${depotId}: retrieved ${tasks.length} tasks`
    );
    return tasks;
  } catch (err) {
    await Log(
      "backend",
      "error",
      "repository",
      `Failed to fetch tasks for depot ${depotId}: ${err.message}`
    );
    throw err;
  }
}

async function scheduleDepot(depot) {
  const { ID: depotId, MechanicHours: capacity } = depot;

  await Log(
    "backend",
    "info",
    "domain",
    `Scheduling depot ${depotId} — available hours: ${capacity}`
  );

  const rawTasks = await fetchTasksForDepot(depotId);

  if (rawTasks.length === 0) {
    await Log("backend", "warn", "domain", `Depot ${depotId} has no tasks to schedule`);
    return { depotId, capacity, selectedTasks: [], totalImportance: 0, totalDuration: 0 };
  }

  // Normalise field names from the API response
  const tasks = rawTasks.map((t) => ({
    id: t.ID ?? t.id,
    duration: t.Duration ?? t.duration ?? t.ServiceDuration,
    importance: t.ImportanceScore ?? t.importance ?? t.OperationalImpact,
  }));

  await Log(
    "backend",
    "debug",
    "domain",
    `Depot ${depotId}: running knapsack on ${tasks.length} tasks with capacity ${capacity}h`
  );

  const result = knapsack(tasks, capacity);

  await Log(
    "backend",
    "info",
    "domain",
    `Depot ${depotId}: selected ${result.selectedTasks.length} tasks — ` +
      `importance=${result.totalImportance}, hours used=${result.totalDuration}/${capacity}`
  );

  return { depotId, capacity, ...result };
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function runScheduler() {
  await Log("backend", "info", "service", "Vehicle Maintenance Scheduler started");

  let depots;
  try {
    depots = await fetchDepots();
  } catch {
    await Log("backend", "fatal", "service", "Cannot proceed — depot fetch failed");
    process.exit(1);
  }

  const results = [];

  for (const depot of depots) {
    try {
      const schedule = await scheduleDepot(depot);
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

  // ── Print summary ────────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║        Vehicle Maintenance Scheduler — Results            ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  for (const r of results) {
    console.log(`Depot ${r.depotId}  (Budget: ${r.capacity}h)`);
    console.log(
      `  ✔ Selected tasks : ${r.selectedTasks.map((t) => t.id).join(", ") || "none"}`
    );
    console.log(`  ✔ Hours used     : ${r.totalDuration} / ${r.capacity}`);
    console.log(`  ✔ Total score    : ${r.totalImportance}`);
    console.log();
  }

  const grandTotal = results.reduce((s, r) => s + r.totalImportance, 0);
  console.log(`Grand total importance score across all depots: ${grandTotal}`);

  await Log(
    "backend",
    "info",
    "service",
    `Scheduler completed. Grand total importance score: ${grandTotal}`
  );

  return results;
}

// Run if called directly
if (require.main === module) {
  runScheduler().catch(async (err) => {
    await Log("backend", "fatal", "service", `Unhandled scheduler error: ${err.message}`);
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runScheduler, knapsack };
