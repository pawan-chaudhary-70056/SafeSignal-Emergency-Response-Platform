#!/usr/bin/env bash
#
# Full-stack CI for SafeSignal.
#
#   bash scripts/ci.sh
#
# Builds the compose images, starts PostgreSQL and Redis, applies migrations,
# starts the application, runs the backend suite, then runs Playwright against
# the nginx frontend. Backend logs are printed when a step fails.
set -euo pipefail

cd "$(dirname "$0")/.."

BASE_URL="${E2E_BASE_URL:-http://127.0.0.1:8080}"

log() {
  printf '\n==> %s\n' "$*"
}

on_exit() {
  status=$?

  if [ "$status" -ne 0 ]; then
    printf '\n==> Pipeline failed (exit %s); recent logs:\n' "$status"
    docker compose logs --tail=150 backend || true
    docker compose logs --tail=80 frontend || true
  elif [ -n "${CI:-}" ]; then
    # The GitHub runner is disposable; stop the stack but keep logs in the job.
    docker compose down --remove-orphans || true
  fi

  exit "$status"
}
trap on_exit EXIT

wait_for_health() {
  local container="$1"
  local attempts="${2:-60}"

  for _ in $(seq 1 "$attempts"); do
    local status
    status="$(docker inspect --format '{{.State.Health.Status}}' "$container" 2>/dev/null || echo missing)"

    if [ "$status" = "healthy" ]; then
      return 0
    fi

    sleep 2
  done

  echo "container $container did not become healthy in time" >&2
  return 1
}

wait_for_url() {
  local url="$1"
  local attempts="${2:-60}"

  for _ in $(seq 1 "$attempts"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi

    sleep 2
  done

  echo "$url did not become reachable in time" >&2
  return 1
}

log "Validating compose configuration"
docker compose config --quiet

log "Building backend and frontend images"
docker compose build

log "Starting PostgreSQL and Redis"
docker compose up -d postgres redis
wait_for_health safesignal-pg
wait_for_health safesignal-redis

log "Applying database migrations"
docker compose --profile tools run --rm -T migrate

log "Starting the application stack"
docker compose up -d
wait_for_health safesignal-backend
wait_for_url "${BASE_URL}/api/v1/health"

log "Installing backend dependencies"
(cd backend && npm ci)

log "Generating the Prisma client"
(cd backend && npx prisma generate)

log "Typechecking the backend"
(cd backend && npm run typecheck)

log "Running backend tests against the isolated test database"
(cd backend && npm test)

log "Checking for Prisma schema drift"
(
  check_schema_drift() {
    cd backend
    set -a
    # shellcheck disable=SC1091
    . ./.env.test
    set +a

    local diff_output
    diff_output="$(npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script)"

    if ! printf '%s' "$diff_output" | grep -q "This is an empty migration"; then
      printf '%s\n\n' "$diff_output"
      echo "Schema drift detected: prisma/schema.prisma does not match the committed migrations." >&2
      exit 1
    fi

    echo "No schema drift detected."
  }

  check_schema_drift
)

log "Installing frontend dependencies"
(cd frontend && npm ci)

log "Building the frontend"
(cd frontend && npm run build)

if [ -n "${CI:-}" ]; then
  log "Installing Playwright browsers"
  (cd frontend && npx playwright install --with-deps chromium)
fi

log "Auditing production dependencies"
(cd backend && npm audit --omit=dev)
(cd frontend && npm audit --omit=dev)

log "Running Playwright E2E against ${BASE_URL}"
(cd frontend && E2E_BASE_URL="$BASE_URL" npx playwright test)

log "Pipeline completed successfully"
