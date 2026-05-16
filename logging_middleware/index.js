/**
 * Logging Middleware
 * A reusable package that sends structured logs to the evaluation service.
 * Usage: Log(stack, level, package, message)
 */

const LOG_API_URL = "http://4.224.186.213/evaluation-service/logs";

const ALLOWED_STACKS = ["backend", "frontend"];

const ALLOWED_LEVELS = ["debug", "info", "warn", "error", "fatal"];

const ALLOWED_PACKAGES = [
  // Backend only
  "cache",
  "controller",
  "cron_job",
  "db",
  "domain",
  "handler",
  "repository",
  "route",
  "service",
  // Frontend only
  "api",
  "component",
  "hook",
  "page",
  "state",
  "style",
  // Both
  "auth",
  "config",
  "middleware",
  "utils",
];

/**
 * Sends a structured log entry to the evaluation service.
 *
 * @param {string} stack   - The stack: "backend" | "frontend"
 * @param {string} level   - The log level: "debug" | "info" | "warn" | "error" | "fatal"
 * @param {string} pkg     - The package (e.g. "handler", "db", "service", ...)
 * @param {string} message - A descriptive log message
 * @returns {Promise<object|undefined>} The API response body, or undefined on failure
 *
 * @example
 * await Log("backend", "error", "handler", "received string, expected bool");
 * await Log("backend", "fatal", "db", "Critical database connection failure.");
 */
async function Log(stack, level, pkg, message) {
  // ── Validation ────────────────────────────────────────────────────────────
  if (!ALLOWED_STACKS.includes(stack)) {
    console.error(
      `[LogMiddleware] Invalid stack "${stack}". Allowed: ${ALLOWED_STACKS.join(", ")}`
    );
    return;
  }
  if (!ALLOWED_LEVELS.includes(level)) {
    console.error(
      `[LogMiddleware] Invalid level "${level}". Allowed: ${ALLOWED_LEVELS.join(", ")}`
    );
    return;
  }
  if (!ALLOWED_PACKAGES.includes(pkg)) {
    console.error(
      `[LogMiddleware] Invalid package "${pkg}". Allowed: ${ALLOWED_PACKAGES.join(", ")}`
    );
    return;
  }
  if (!message || typeof message !== "string") {
    console.error(`[LogMiddleware] Message must be a non-empty string.`);
    return;
  }

  // ── Build request ─────────────────────────────────────────────────────────
  const payload = {
    stack,
    level,
    package: pkg,
    message,
  };

  const headers = {
    "Content-Type": "application/json",
  };

  // The API is a protected route — token read from environment variable
  const token = process.env.LOG_API_TOKEN || process.env.AUTH_TOKEN;
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // ── Send log ──────────────────────────────────────────────────────────────
  try {
    const response = await fetch(LOG_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(
        `[LogMiddleware] API returned ${response.status} for [${level}] ${stack}/${pkg}: "${message}"`
      );
      return;
    }

    const data = await response.json();
    // Optional: uncomment to see logID in console
    // console.log(`[LogMiddleware] Log created — ID: ${data.logID}`);
    return data;
  } catch (err) {
    console.error(`[LogMiddleware] Network error while sending log: ${err.message}`);
  }
}

module.exports = { Log };
