#!/usr/bin/env node
/**
 * NFR-016: API response-time validation.
 *
 * Measures the latency of common, read-heavy API endpoints against a running
 * SafeSignal backend and reports the 50th/95th percentile per endpoint. The
 * requirement target (~500 ms at p95 under local development conditions) is
 * validated by measurement, not assumed. The script exits non-zero when any
 * endpoint exceeds the target, so it can run in CI or before a release.
 *
 * Usage:
 *   npm run perf:latency                        # against the dev API
 *   LATENCY_BASE_URL=http://127.0.0.1:8080/api/v1 npm run perf:latency
 *
 * The measured endpoints are read-only, so the run changes no application
 * state. Demo identities are used for authentication (Password123!).
 */

const BASE_URL = process.env.LATENCY_BASE_URL ?? "http://127.0.0.1:4100/api/v1";
const ITERATIONS = Number(process.env.LATENCY_ITERATIONS ?? 40);
const TARGET_P95_MS = 500;
const PASSWORD = "Password123!";

/** Colours kept minimal so logs stay readable in CI output. */
function log(message) {
  console.log(message);
}

function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function cookieFrom(response) {
  const cookies = response.headers.getSetCookie?.() ?? [];
  return cookies
    .map((line) => line.split(";")[0])
    .filter(Boolean)
    .join("; ");
}

async function login(email) {
  const response = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });

  if (!response.ok) {
    throw new Error(`login failed for ${email}: HTTP ${response.status} ${await response.text()}`);
  }

  return cookieFrom(response);
}

async function measure(name, path, cookie) {
  const latencies = [];
  let errors = 0;
  let lastStatus = 0;

  for (let index = 0; index < ITERATIONS; index += 1) {
    const started = performance.now();
    try {
      const response = await fetch(`${BASE_URL}${path}`, {
        headers: cookie ? { cookie } : {},
      });
      lastStatus = response.status;
      await response.text();
      if (response.status >= 500) {
        errors += 1;
      }
    } catch {
      errors += 1;
    }
    latencies.push(performance.now() - started);
  }

  latencies.sort((a, b) => a - b);
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const max = latencies[latencies.length - 1];

  return { name, path, requests: ITERATIONS, errors, lastStatus, p50, p95, max };
}

async function main() {
  log(`SafeSignal latency check (NFR-016) — ${ITERATIONS} requests per endpoint`);
  log(`Target: p95 <= ${TARGET_P95_MS} ms — base URL: ${BASE_URL}`);

  let health;
  try {
    health = await fetch(`${BASE_URL}/health`);
  } catch (error) {
    console.error(`Backend at ${BASE_URL} is not reachable: ${error.message}`);
    console.error("Start it with `npm run dev` (backend) or use the docker stack, then retry.");
    process.exit(1);
  }

  if (!health.ok) {
    console.error(`Health check failed with HTTP ${health.status}; aborting.`);
    process.exit(1);
  }

  const citizenCookie = await login("citizen@safesignal.local");
  const dispatcherCookie = await login("dispatcher@safesignal.local");

  const endpoints = [
    { name: "Health check", path: "/health", cookie: null },
    { name: "Session profile", path: "/auth/me", cookie: citizenCookie },
    { name: "Category list", path: "/categories", cookie: citizenCookie },
    { name: "Citizen incident list", path: "/incidents", cookie: citizenCookie },
    { name: "Dispatcher incident list", path: "/incidents", cookie: dispatcherCookie },
    { name: "Dispatcher statistics", path: "/incidents/stats", cookie: dispatcherCookie },
    { name: "Notification list", path: "/notifications", cookie: citizenCookie },
  ];

  const results = [];
  for (const endpoint of endpoints) {
    results.push(await measure(endpoint.name, endpoint.path, endpoint.cookie));
  }

  log("");
  log(
    "Endpoint".padEnd(26) +
      "p50 (ms)".padStart(10) +
      "p95 (ms)".padStart(10) +
      "max (ms)".padStart(10) +
      "errors".padStart(8) +
      "  result",
  );

  let failed = false;
  for (const result of results) {
    const passed = result.p95 <= TARGET_P95_MS && result.errors === 0;
    if (!passed) {
      failed = true;
    }
    log(
      result.name.padEnd(26) +
        result.p50.toFixed(1).padStart(10) +
        result.p95.toFixed(1).padStart(10) +
        result.max.toFixed(1).padStart(10) +
        String(result.errors).padStart(8) +
        `  ${passed ? "PASS" : "FAIL"}`,
    );
  }

  log("");

  if (failed) {
    console.error("Latency target NOT met — see the FAIL rows above.");
    process.exit(1);
  }

  log(`All measured endpoints meet the ${TARGET_P95_MS} ms p95 target.`);
}

main();
